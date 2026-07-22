/**
 * auth.tsx — Real Supabase Auth (replaces mock credentials)
 *
 * Phase 2:
 *   - login()        → supabase.auth.signInWithPassword()
 *   - signup()       → supabase.auth.signUp() with invite code validation
 *   - logout()       → supabase.auth.signOut()
 *   - resetPassword()→ supabase.auth.resetPasswordForEmail()
 *   - AuthProvider   → listens to supabase.auth.onAuthStateChange()
 *
 * Role assignment (MEMBER/LEAD/SUPER_ADMIN) is read from the `profiles` table
 * which is populated by a server-side Postgres trigger on auth.users insert.
 * Roles are NEVER accepted from client-supplied signup data.
 *
 * Session management: Supabase Auth's own JWT/session management handles
 * persistence and refresh automatically (persistSession: true in client).
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { supabase } from "./supabaseClient";
import type { AuthUser, AuthRole } from "./types";

// ─── Role hierarchy ───────────────────────────────────────────────────────────

const ROLE_RANK: Record<AuthRole, number> = {
  MEMBER: 1,
  LEAD: 2,
  SUPER_ADMIN: 3,
};

// ─── Context types ────────────────────────────────────────────────────────────

export type { AuthRole, AuthUser };

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (params: {
    email: string;
    password: string;
    fullName: string;
    college: string;
    inviteCode?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  hasRole: (required: AuthRole) => boolean;
}



// ─── Helper: load profile for authenticated user ──────────────────────────────

async function loadProfile(userId: string): Promise<AuthUser | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, college, role, team_id, total_points, tier")
    .eq("id", userId)
    .single();

  if (error || !data) return null;

  // Get email from auth session (not stored in profiles for privacy)
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData?.session?.user?.email ?? "";

  return {
    id: data.id,
    email,
    role: data.role as AuthRole,
    name: data.full_name,
    campus: data.college || "clstr.campus",
    teamId: data.team_id,
    totalPoints: data.total_points,
    tier: data.tier ?? 4,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize: check for existing session on mount
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user && mounted) {
        const profile = await loadProfile(session.user.id);
        if (mounted) setUser(profile);
      }
      if (mounted) setIsLoading(false);
    }

    initAuth();

    // Listen to auth state changes (login, logout, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === "SIGNED_IN" && session?.user) {
          const profile = await loadProfile(session.user.id);
          setUser(profile);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          // Silently refresh — no state change needed unless profile changed
          const profile = await loadProfile(session.user.id);
          setUser(profile);
        } else if (event === "PASSWORD_RECOVERY") {
          // User clicked reset link — they are now signed in with a reset token
          // Redirect to password change UI is handled in ClstrAuthGateway
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ─── Login ──────────────────────────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      const normalizedEmail = email.trim().toLowerCase();

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        // Map Supabase error codes to user-friendly messages
        if (error.message.includes("Invalid login credentials")) {
          return { success: false, error: "Incorrect email or password. Please try again." };
        }
        if (error.message.includes("Email not confirmed")) {
          return { success: false, error: "Please verify your email before logging in." };
        }
        if (error.message.includes("Too many requests")) {
          return { success: false, error: "Too many attempts. Please wait a few minutes and try again." };
        }
        return { success: false, error: error.message };
      }

      return { success: true };
    },
    []
  );

  // ─── Signup ─────────────────────────────────────────────────────────────────

  const signup = useCallback(
    async (params: {
      email: string;
      password: string;
      fullName: string;
      college: string;
      inviteCode?: string;
    }): Promise<{ success: boolean; error?: string }> => {
      // 1. Validate invite code via RPC (no unauthenticated table access needed)
      if (params.inviteCode) {
        const { data: validation, error: validationError } = await supabase.rpc(
          "validate_invite_code",
          { p_code: params.inviteCode.trim().toUpperCase() }
        );

        if (validationError || !validation?.valid) {
          const reason = !validation?.valid
            ? validation?.reason === "expired"
              ? "This invite code has expired."
              : "Invalid or already-used invite code."
            : "Could not validate invite code.";
          return { success: false, error: reason };
        }
      }

      // 2. Create the auth account
      const { data, error } = await supabase.auth.signUp({
        email: params.email.trim().toLowerCase(),
        password: params.password,
        options: {
          data: {
            full_name: params.fullName,
            college: params.college,
          },
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          return { success: false, error: "An account with this email already exists." };
        }
        return { success: false, error: error.message };
      }

      // 3. Redeem invite code via SECURITY DEFINER RPC (bypasses RLS)
      if (params.inviteCode && data.user) {
        const { error: rpcError } = await supabase.rpc("redeem_team_invite", {
          p_code: params.inviteCode.trim().toUpperCase(),
        });

        if (rpcError) {
          console.error("Failed to redeem invite code via RPC:", rpcError);
        }
      }

      return { success: true };
    },
    []
  );

  // ─── Logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  // ─── Password reset ─────────────────────────────────────────────────────────

  const resetPassword = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string }> => {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    },
    []
  );

  // ─── Role check ─────────────────────────────────────────────────────────────

  const hasRole = useCallback(
    (required: AuthRole): boolean => {
      if (!user) return false;
      return ROLE_RANK[user.role] >= ROLE_RANK[required];
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, signup, logout, resetPassword, hasRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/**
 * RBAC guard hook.
 * Throws if the current user's role does not satisfy the requirement.
 * Route-level components call this at the top of their render.
 */
export function useRequireRole(required: AuthRole): AuthUser {
  const { user, hasRole } = useAuth();
  if (!user || !hasRole(required)) {
    throw new Error(
      `Access denied: requires ${required} role. Current role: ${user?.role ?? "none"}.`
    );
  }
  return user;
}
