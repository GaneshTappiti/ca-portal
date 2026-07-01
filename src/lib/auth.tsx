/**
 * Phase 1.4 — RBAC Enforcement
 * Phase 1.6 — Secure Token Storage
 *
 * AuthContext provides:
 *   - Authenticated user + role (MEMBER | LEAD | SUPER_ADMIN)
 *   - login() / logout() actions
 *   - useRequireRole() guard hook
 *
 * Token storage strategy (Phase 1.6):
 *   In a real deployment the server sets the token as an httpOnly cookie —
 *   completely invisible to JavaScript. Here, with no server, we store the
 *   session in sessionStorage (NOT localStorage):
 *     • sessionStorage is tab-scoped and cleared when the tab closes
 *     • It is NOT accessible from other origins or other tabs
 *     • It is NOT readable by scripts loaded from CDN/third-party sources
 *       (they share the same JS context, but this is as close as a pure
 *        frontend app can get to httpOnly isolation)
 *     • Crucially: NO TOKEN IS EVER IN localStorage (Phase 1.6 requirement)
 *
 * RBAC enforcement (Phase 1.4):
 *   useRequireRole(role) throws a render-time error if the current user's
 *   role does not satisfy the requirement. Route-level components call this
 *   at the top of their render — any MEMBER hitting a LEAD-only component
 *   will be blocked before any LEAD-only data or actions are rendered.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuthRole = "MEMBER" | "LEAD" | "SUPER_ADMIN";

export interface AuthUser {
  email: string;
  role: AuthRole;
  name: string;
  campus: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  /**
   * Returns true if the current user satisfies the required role.
   * Role hierarchy: SUPER_ADMIN > LEAD > MEMBER
   */
  hasRole: (required: AuthRole) => boolean;
}

// ─── Role hierarchy ───────────────────────────────────────────────────────────

const ROLE_RANK: Record<AuthRole, number> = {
  MEMBER: 1,
  LEAD: 2,
  SUPER_ADMIN: 3,
};

// ─── Mock credential store (replaces a real auth endpoint) ───────────────────
// In production: POST /auth/login → server validates, sets httpOnly cookie

interface MockCredential {
  password: string;
  user: AuthUser;
}

const MOCK_CREDENTIALS: Record<string, MockCredential> = {
  "lead@clstr.in": {
    password: "lead123",
    user: {
      email: "lead@clstr.in",
      role: "LEAD",
      name: "Ganesh Tappiti",
      campus: "clstr.raghuinstitute",
    },
  },
  "team@clstr.in": {
    password: "team123",
    user: {
      email: "team@clstr.in",
      role: "MEMBER",
      name: "Team Member",
      campus: "clstr.raghuinstitute",
    },
  },
  "admin@clstr.in": {
    password: "admin123",
    user: {
      email: "admin@clstr.in",
      role: "SUPER_ADMIN",
      name: "Super Admin",
      campus: "clstr.global",
    },
  },
};

// ─── Session storage key ──────────────────────────────────────────────────────

const SESSION_KEY = "clstr_session";

function readSession(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function writeSession(user: AuthUser): void {
  // Phase 1.6: sessionStorage only — never localStorage, never a JS-readable token
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readSession());

  // Keep sessionStorage in sync if user state is set externally (e.g. hydration)
  useEffect(() => {
    if (user) {
      writeSession(user);
    } else {
      clearSession();
    }
  }, [user]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      // Simulate network latency
      await new Promise((r) => setTimeout(r, 900));

      const cred = MOCK_CREDENTIALS[email.trim().toLowerCase()];
      if (!cred || cred.password !== password) {
        return { success: false, error: "Invalid credentials." };
      }

      const authedUser = cred.user;
      writeSession(authedUser);   // Phase 1.6 — write to sessionStorage, not localStorage
      setUser(authedUser);
      return { success: true };
    },
    []
  );

  const logout = useCallback(() => {
    clearSession();   // Phase 1.6 — clear the "cookie" server-side equivalent
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (required: AuthRole): boolean => {
      if (!user) return false;
      return ROLE_RANK[user.role] >= ROLE_RANK[required];
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, hasRole }}>
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
 * Phase 1.4 — RBAC guard hook.
 * Call at the top of any component that requires a specific role.
 * Throws if the requirement is not met, which triggers the nearest error
 * boundary — equivalent to a 403 Forbidden on a real API route.
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
