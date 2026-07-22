/**
 * ClstrAuthGateway.tsx — Real auth UI
 *
 * Phase 2:
 *   - Login tab: email/password → supabase.auth.signInWithPassword()
 *   - Sign Up tab: email/password/name/college/invite → supabase.auth.signUp()
 *   - Forgot Password: email → supabase.auth.resetPasswordForEmail()
 *   - Rate limiting: UX-level (Supabase Auth handles real enforcement)
 *   - ARIA + reduced motion + i18n preserved from original
 */

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./lib/auth";
import { checkRateLimit, peekRateLimit, resetRateLimit } from "./lib/rateLimiter";
import { loginSchema, parseErrors } from "./lib/schemas";
import { z } from "zod";

// ─── Signup schema ────────────────────────────────────────────────────────────

const signupSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email.").max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  fullName: z.string().min(2, "Full name is required.").max(100),
  college: z.string().min(2, "College name is required.").max(200),
  inviteCode: z.string().optional(),
});

// ─── Motion helpers ───────────────────────────────────────────────────────────

function useVariants(prefersReduced: boolean | null) {
  const skip = !!prefersReduced;
  return {
    containerVariants: {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: skip ? {} : { staggerChildren: 0.12 } },
    },
    leftSlideIn: {
      hidden: { opacity: 0, x: skip ? 0 : -40 },
      visible: { opacity: 1, x: 0, transition: skip ? { duration: 0 } : { type: "spring", stiffness: 250, damping: 25 } },
    },
    rightSlideUp: {
      hidden: { opacity: 0, y: skip ? 0 : 30 },
      visible: { opacity: 1, y: 0, transition: skip ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28, delay: 0.15 } },
    },
    formItem: {
      hidden: { opacity: 0, y: skip ? 0 : 12 },
      visible: { opacity: 1, y: 0, transition: skip ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 } },
    },
  };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CheckBadgeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

// ─── Shared field component ───────────────────────────────────────────────────

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[10px] font-bold text-[#666] uppercase tracking-[0.1em]">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        aria-invalid={!!error}
        className={`w-full px-4 py-3 bg-[#0A0A0A] border text-sm text-[#F0F0F0] placeholder-[#2E2E2E] focus:outline-none focus:ring-1 transition-all duration-150 ${
          error
            ? "border-[#FF5500]/60 focus:border-[#FF5500]/60 focus:ring-[#FF5500]/20"
            : "border-[#222] focus:border-[#C8FF00]/40 focus:ring-[#C8FF00]/20"
        }`}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[10px] text-[#3A3A3A] font-mono">{hint}</p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-[#FF5500] font-bold">{error}</p>
      )}
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function AuthSuccessScreen({ onContinue }: { onContinue: () => void }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const prefersReduced = useReducedMotion();

  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: prefersReduced ? 0 : 0.3 }}
      className="flex items-center justify-center min-h-screen bg-[#0A0A0A] p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: prefersReduced ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={prefersReduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
        className="w-full max-w-md bg-[#111] border border-[#2E2E2E] relative"
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#C8FF00]" />

        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#1A1A1A]">
          <div className="w-5 h-5 bg-[#C8FF00] flex items-center justify-center text-[#000] font-black text-[10px]">
            C
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-[#F0F0F0] tracking-tight">
              Authenticated
            </span>
            <span className="text-[10px] text-[#444] font-mono">{user.email}</span>
          </div>
          <span className={`ml-auto px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] border ${
            user.role === "LEAD"
              ? "text-[#C8FF00] border-[#C8FF00]/20"
              : user.role === "SUPER_ADMIN"
              ? "text-[#FF5500] border-[#FF5500]/20"
              : "text-[#4488FF] border-[#4488FF]/20"
          }`}>
            {user.role}
          </span>
        </div>

        <div className="px-6 py-4 border-b border-[#1A1A1A]">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#444] mb-3">Permissions</p>
          <div className="divide-y divide-[#1A1A1A]" role="list" aria-label="Role permissions">
            {[
              { label: "View Dashboard", allowed: true },
              { label: "Execute Tasks", allowed: true },
              { label: "Submit Proof", allowed: true },
              { label: "Manage Team", allowed: user.role === "LEAD" || user.role === "SUPER_ADMIN" },
              { label: "Review Submissions", allowed: user.role === "LEAD" || user.role === "SUPER_ADMIN" },
              { label: "Multi-Campus View", allowed: user.role === "SUPER_ADMIN" },
            ].map((perm) => (
              <div key={perm.label} className="flex items-center gap-3 py-2" role="listitem">
                <div className={`w-1.5 h-1.5 shrink-0 ${
                  perm.allowed ? "bg-[#C8FF00]" : "bg-[#2E2E2E]"
                }`} aria-hidden="true" />
                <span className={`text-[11px] ${perm.allowed ? "text-[#888]" : "text-[#333]"}`}
                  aria-label={`${perm.label}: ${perm.allowed ? "allowed" : "not allowed"}`}
                >
                  {perm.label}
                </span>
                {perm.allowed && (
                  <span className="ml-auto text-[9px] font-bold text-[#C8FF00] uppercase tracking-[0.1em]">OK</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4">
          <button
            id="continue-to-dashboard"
            onClick={onContinue}
            className="w-full px-4 py-3 bg-[#C8FF00] text-[#000] text-sm font-black tracking-tight transition-all duration-150 hover:opacity-90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
          >
            {t("auth.continueButton")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Forgot password screen ───────────────────────────────────────────────────

function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const { resetPassword } = useAuth();
  const prefersReduced = useReducedMotion();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    const result = await resetPassword(email);
    setLoading(false);
    if (result.success) {
      setSent(true);
    } else {
      setError(result.error ?? "Something went wrong. Please try again.");
    }
  }, [email, resetPassword]);

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReduced ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
      className="w-full max-w-md"
    >
      <div className="relative rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-6 sm:p-8 shadow-[0_0_60px_rgba(255,255,255,0.03)]">
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#CCFF00]" />

        {!sent ? (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white mb-1">Reset Password</h2>
              <p className="text-sm text-[#666]">We'll email you a link to reset your password.</p>
            </div>

            <div className="space-y-4">
              <Field
                id="reset-email"
                label="Email Address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="your@email.com"
                autoComplete="email"
                error={error ?? undefined}
              />

              <button
                id="reset-submit"
                onClick={handleSubmit}
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl bg-[#CCFF00] text-[#000000] text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
              >
                {loading ? "Sending…" : "Send Reset Link"}
              </button>

              <button
                onClick={onBack}
                className="w-full text-xs text-[#666] hover:text-white transition-colors py-2"
              >
                ← Back to login
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 flex items-center justify-center mx-auto mb-4">
              <MailIcon />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Check your email</h3>
            <p className="text-sm text-[#666] mb-6">
              We've sent a password reset link to <strong className="text-[#ccc]">{email}</strong>.
              Check your inbox (and spam folder).
            </p>
            <button
              onClick={onBack}
              className="w-full px-4 py-3 rounded-xl bg-[#1A1A1A] text-white text-sm font-semibold hover:bg-[#222] transition-colors"
            >
              Back to login
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Sign Up form ─────────────────────────────────────────────────────────────

function SignUpForm({ onSuccess }: { onSuccess: () => void }) {
  const { signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [college, setCollege] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setErrors({});
    setGlobalError(null);

    const parsed = signupSchema.safeParse({ email: email.trim(), password, fullName: fullName.trim(), college: college.trim(), inviteCode: inviteCode.trim() || undefined });
    if (!parsed.success) {
      setErrors(parseErrors(parsed));
      return;
    }

    setLoading(true);
    const result = await signup({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      college: college.trim(),
      inviteCode: inviteCode.trim() || undefined,
    });
    setLoading(false);

    if (result.success) {
      onSuccess();
    } else {
      setGlobalError(result.error ?? "Something went wrong. Please try again.");
    }
  }, [email, password, fullName, college, inviteCode, signup, onSuccess]);

  return (
    <div className="space-y-4">
      <Field id="signup-name" label="Full Name" value={fullName} onChange={setFullName} placeholder="Ganesh Tappiti" autoComplete="name" error={errors.fullName} />
      <Field id="signup-email" label="Email Address" type="email" value={email} onChange={setEmail} placeholder="you@college.edu" autoComplete="email" error={errors.email} />
      <Field id="signup-college" label="College Name" value={college} onChange={setCollege} placeholder="Raghu Institute of Technology" error={errors.college} />
      <Field id="signup-password" label="Password" type="password" value={password} onChange={setPassword} placeholder="Minimum 8 characters" autoComplete="new-password" error={errors.password} hint="Min. 8 characters" />
      <Field
        id="signup-invite"
        label="Invite Code (optional)"
        value={inviteCode}
        onChange={setInviteCode}
        placeholder="CLSTR-XXXXXX"
        hint="Required to join an existing team. Leave blank to create a new account."
        error={errors.inviteCode}
      />

      <AnimatePresence>
        {globalError && (
          <motion.p
            key="signup-error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            aria-live="assertive"
            className="text-xs text-[#FF6A00] font-medium"
          >
            {globalError}
          </motion.p>
        )}
      </AnimatePresence>

      <button
        id="signup-submit"
        onClick={handleSubmit}
        disabled={loading}
        className="w-full px-4 py-3 rounded-xl bg-[#CCFF00] text-[#000000] text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
      >
        {loading ? "Creating account…" : "Create Account"}
      </button>
    </div>
  );
}

// ─── Main login form ──────────────────────────────────────────────────────────

function LoginForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const { t } = useTranslation();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setTimeout(() => setCooldownSec((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSec]);

  const handleAuth = useCallback(async () => {
    setFieldErrors({});
    setGlobalError(null);

    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setFieldErrors(parseErrors(parsed));
      return;
    }

    const identity = email.trim().toLowerCase();
    const rateResult = checkRateLimit(identity);
    if (!rateResult.allowed) {
      setCooldownSec(rateResult.retryAfterSeconds);
      setGlobalError(t("auth.rateLimited", { seconds: rateResult.retryAfterSeconds }));
      return;
    }

    setLoading(true);
    const result = await login(identity, password);
    setLoading(false);

    if (result.success) {
      resetRateLimit(identity);
    } else {
      setGlobalError(result.error ?? t("errors.genericError"));
    }
  }, [email, password, login, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading && cooldownSec === 0) handleAuth();
  };

  const isBlocked = cooldownSec > 0;

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown}>
      <Field
        id="auth-email"
        label={t("auth.emailLabel")}
        type="email"
        value={email}
        onChange={setEmail}
        placeholder={t("auth.emailPlaceholder")}
        autoComplete="email"
        error={fieldErrors.email}
      />
      <Field
        id="auth-password"
        label={t("auth.passwordLabel")}
        type="password"
        value={password}
        onChange={setPassword}
        placeholder={t("auth.passwordPlaceholder")}
        autoComplete="current-password"
        error={fieldErrors.password}
      />

      <button
        onClick={onForgotPassword}
        className="text-xs text-[#555] hover:text-[#CCFF00] transition-colors"
      >
        Forgot password?
      </button>

      <AnimatePresence>
        {globalError && (
          <motion.p
            key="global-error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            role="alert"
            aria-live="assertive"
            className="text-xs text-[#FF6A00] font-medium"
          >
            {isBlocked ? t("auth.rateLimited", { seconds: cooldownSec }) : globalError}
          </motion.p>
        )}
      </AnimatePresence>

      <button
        id="auth-submit"
        onClick={handleAuth}
        disabled={loading || isBlocked}
        aria-disabled={loading || isBlocked}
        className="w-full px-4 py-3 rounded-xl bg-[#CCFF00] text-[#000000] text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
      >
        {loading ? (
          <>
            <motion.span
              className="inline-block w-4 h-4 border-2 border-[#000000] border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              aria-hidden="true"
            />
            {t("auth.submitting")}
          </>
        ) : isBlocked ? (
          `Wait ${cooldownSec}s`
        ) : (
          t("auth.submitButton")
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 pt-2">
        <LockIcon />
        <span className="text-[10px] text-[#444] font-medium">{t("auth.secureNotice")}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Screen = "auth" | "success" | "forgot";
type Tab = "login" | "signup";

export default function ClstrAuthGateway({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const prefersReduced = useReducedMotion();
  const { containerVariants, leftSlideIn, rightSlideUp, formItem } = useVariants(prefersReduced);

  const [screen, setScreen] = useState<Screen>("auth");
  const [tab, setTab] = useState<Tab>("login");

  // If already authenticated (session exists), jump straight to success
  useEffect(() => {
    if (user && screen === "auth") {
      setScreen("success");
    }
  }, [user, screen]);

  if (screen === "success") {
    return <AuthSuccessScreen onContinue={onAuthenticated} />;
  }

  if (screen === "forgot") {
    return (
      <div className="w-full min-h-screen bg-[#000000] flex items-center justify-center p-6">
        <ForgotPasswordScreen onBack={() => setScreen("auth")} />
      </div>
    );
  }

  return (
    <div
      className="w-full min-h-screen bg-[#0A0A0A] text-[#F0F0F0] font-['Space_Grotesk',sans-serif] flex flex-col lg:flex-row"
    >
      {/* Left — branding */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 flex flex-col justify-center items-center p-6 sm:p-8 lg:p-12 relative overflow-hidden"
      >



        <motion.div variants={leftSlideIn} className="relative z-10 max-w-md w-full">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-10">
            <div className="w-6 h-6 bg-[#C8FF00] flex items-center justify-center text-[#000] font-black text-[10px]" aria-hidden="true">
              C
            </div>
            <span className="text-sm font-black text-[#F0F0F0] tracking-tight uppercase">CLSTR</span>
            <span className="text-[10px] font-mono text-[#2E2E2E] ml-1">/ CA Portal</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-black leading-[1.0] tracking-[-0.03em] text-[#F0F0F0] mb-4">
            {t("auth.title").split(" ")[0]}<br />
            <span className="text-[#C8FF00]">
              {t("auth.title").split(" ").slice(1).join(" ") || "Ops"}
            </span>
          </h1>

          <p className="text-[13px] text-[#444] leading-relaxed max-w-sm mb-10 font-mono">{t("auth.subtitle")}</p>

          <div className="border-l-2 border-[#C8FF00] pl-4">
            <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#C8FF00] mb-2">Mission</p>
            <div className="space-y-1.5">
              {[
                "Verified campus user growth",
                "Cross-device real-time sync",
                "Role-gated secure access",
              ].map((f) => (
                <p key={f} className="text-[11px] text-[#3A3A3A] font-mono">{f}</p>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Right — auth form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 relative">


        <motion.div
          variants={rightSlideUp}
          initial="hidden"
          animate="visible"
          className="relative z-10 w-full max-w-md bg-[#111] border border-[#2E2E2E]"
          role="main"
        >
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#C8FF00]" />

          {/* Tab switcher */}
          <div className="flex border-b border-[#222]">
            <button
              id="tab-login"
              onClick={() => setTab("login")}
              className={`flex-1 py-3 text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                tab === "login"
                  ? "text-[#C8FF00] border-b-2 border-[#C8FF00] -mb-px bg-[#111]"
                  : "text-[#555] hover:text-[#F0F0F0]"
              }`}
            >
              Login
            </button>
            <button
              id="tab-signup"
              onClick={() => setTab("signup")}
              className={`flex-1 py-3 text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                tab === "signup"
                  ? "text-[#C8FF00] border-b-2 border-[#C8FF00] -mb-px bg-[#111]"
                  : "text-[#555] hover:text-[#F0F0F0]"
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="p-6 sm:p-8">
            <AnimatePresence mode="wait">
              {tab === "login" ? (
                <motion.div
                  key="login-form"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: prefersReduced ? 0 : 0.15 }}
                >
                  <div className="mb-6">
                    <h2 className="text-xl font-black text-[#F0F0F0] tracking-tight">
                      {t("auth.portalTitle")}
                    </h2>
                    <p className="text-[11px] text-[#444] font-mono mt-1">
                      {t("auth.portalSubtitle")}
                    </p>
                  </div>
                  <LoginForm onForgotPassword={() => setScreen("forgot")} />
                  <div className="mt-5 pt-4 border-t border-[#1A1A1A] text-center">
                    <p className="text-[10px] text-[#3A3A3A] font-mono leading-relaxed">
                      Access by invitation only · Credentials issued by your admin
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="signup-form"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: prefersReduced ? 0 : 0.15 }}
                >
                  <div className="mb-6">
                    <h2 className="text-xl font-black text-[#F0F0F0] tracking-tight">
                      Create Account
                    </h2>
                    <p className="text-[11px] text-[#444] font-mono mt-1">
                      Have an invite code? Join your team now.
                    </p>
                  </div>
                  <SignUpForm onSuccess={() => setScreen("success")} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
