/**
 * Phase 1.3 — Rate Limiting: checkRateLimit() called before auth attempt
 * Phase 1.4 — RBAC: role written to AuthContext (sessionStorage-backed)
 * Phase 1.5 — Zod Validation: loginSchema applied on submit, field errors shown
 * Phase 1.6 — Secure Token Storage: useAuth().login() writes to sessionStorage only
 * Phase 4.3 — ARIA: aria-label, aria-describedby, aria-live, role="alert"
 * Phase 4.4 — Reduced motion: useReducedMotion() wraps all animations
 * Phase 7.6 — i18n strings via useTranslation()
 */

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./lib/auth";
import { checkRateLimit, peekRateLimit, resetRateLimit } from "./lib/rateLimiter";
import { loginSchema, parseErrors } from "./lib/schemas";

// ─── Motion helpers (Phase 4.4 — reduced motion) ─────────────────────────────

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

// ─── Role preview (shown after successful auth) ───────────────────────────────

function AuthSuccessScreen({ onContinue }: { onContinue: () => void }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const prefersReduced = useReducedMotion();

  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: prefersReduced ? 0 : 0.4 }}
      className="flex items-center justify-center min-h-screen bg-[#000000] p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: prefersReduced ? 1 : 0.95, y: prefersReduced ? 0 : 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={prefersReduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
        className="w-full max-w-lg rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-6 sm:p-8 shadow-[0_0_60px_rgba(255,255,255,0.03)] relative"
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#CCFF00] via-[#0066FF] to-[#FF6A00] opacity-60" />

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center">
            <CheckBadgeIcon />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white">
              {t("auth.authenticatedAs", {
                role: user.role === "LEAD" ? t("auth.campusLead") : user.role === "SUPER_ADMIN" ? "Super Admin" : t("auth.teamMember"),
              })}
            </span>
            <span className="text-xs text-[#666]">{user.email}</span>
          </div>
          <span className={`ml-auto px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
            user.role === "LEAD"
              ? "text-[#CCFF00] bg-[#CCFF00]/[0.07] border-[#CCFF00]/[0.13]"
              : user.role === "SUPER_ADMIN"
              ? "text-[#FF6A00] bg-[#FF6A00]/[0.07] border-[#FF6A00]/[0.13]"
              : "text-[#0066FF] bg-[#0066FF]/[0.07] border-[#0066FF]/[0.13]"
          }`}>
            {user.role}
          </span>
        </div>

        {/* Role permissions */}
        <div className="rounded-xl bg-[#000000]/40 border border-[#1A1A1A]/30 p-4 mb-6">
          <p className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-3">Role Permissions</p>
          <div className="space-y-2" role="list" aria-label="Role permissions">
            {[
              { label: "View Dashboard", allowed: true },
              { label: "Execute Tasks", allowed: true },
              { label: "Submit Proof", allowed: true },
              { label: "Manage Team", allowed: user.role === "LEAD" || user.role === "SUPER_ADMIN" },
              { label: "Review Submissions", allowed: user.role === "LEAD" || user.role === "SUPER_ADMIN" },
              { label: "Multi-Campus View", allowed: user.role === "SUPER_ADMIN" },
            ].map((perm) => (
              <div key={perm.label} className="flex items-center gap-2" role="listitem">
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${perm.allowed ? "border-[#CCFF00]/30 bg-[#CCFF00]/10" : "border-[#FF6A00]/30 bg-[#FF6A00]/10"}`}>
                  {perm.allowed ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  )}
                </div>
                <span className={`text-xs ${perm.allowed ? "text-[#ccc]" : "text-[#666]"}`} aria-label={`${perm.label}: ${perm.allowed ? "allowed" : "not allowed"}`}>
                  {perm.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          id="continue-to-dashboard"
          onClick={onContinue}
          className="w-full px-4 py-3 rounded-xl bg-[#CCFF00] text-[#000000] text-sm font-bold transition-all duration-200 hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
        >
          {t("auth.continueButton")}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Main auth form ───────────────────────────────────────────────────────────

export default function ClstrAuthGateway({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const prefersReduced = useReducedMotion();
  const { containerVariants, leftSlideIn, rightSlideUp, formItem } = useVariants(prefersReduced);

  const [step, setStep] = useState<"login" | "success">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Phase 1.3 — cooldown countdown
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setTimeout(() => setCooldownSec((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSec]);

  const handleAuth = useCallback(async () => {
    setFieldErrors({});
    setGlobalError(null);

    // Phase 1.5 — Zod validation FIRST
    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setFieldErrors(parseErrors(parsed));
      return;
    }

    // Phase 1.3 — Rate limit check (before making the auth call)
    const identity = email.trim().toLowerCase();
    const rateResult = checkRateLimit(identity);

    if (!rateResult.allowed) {
      setCooldownSec(rateResult.retryAfterSeconds);
      setGlobalError(t("auth.rateLimited", { seconds: rateResult.retryAfterSeconds }));
      return;
    }

    setLoading(true);

    // Phase 1.6 — login() writes to sessionStorage, not localStorage
    const result = await login(identity, password);
    setLoading(false);

    if (result.success) {
      resetRateLimit(identity); // clear on success
      setStep("success");
    } else {
      setGlobalError(result.error ?? t("errors.genericError"));
    }
  }, [email, password, login, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading && cooldownSec === 0) handleAuth();
  };

  if (step === "success") {
    return <AuthSuccessScreen onContinue={onAuthenticated} />;
  }

  const isBlocked = cooldownSec > 0;

  return (
    <div
      className="w-full min-h-screen bg-[#000000] text-white font-['Space_Grotesk',sans-serif] flex flex-col lg:flex-row"
      onKeyDown={handleKeyDown}
    >
      {/* Left — branding */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 flex flex-col justify-center items-center p-6 sm:p-8 lg:p-12 relative overflow-hidden"
      >
        <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full bg-[#0066FF]/10 blur-[120px] pointer-events-none" aria-hidden="true" />
        <div className="absolute bottom-[-150px] left-[-150px] w-[400px] h-[400px] rounded-full bg-[#FF6A00]/8 blur-[100px] pointer-events-none" aria-hidden="true" />
        <div className="absolute inset-0 opacity-[0.015] pointer-events-none" style={{ backgroundImage: `radial-gradient(circle at 20px 20px, #ffffff 1px, transparent 1px)`, backgroundSize: "40px 40px" }} aria-hidden="true" />

        <motion.div variants={leftSlideIn} className="relative z-10 max-w-md w-full">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#CCFF00] to-[#CCFF00]/60 flex items-center justify-center text-[#000000] font-bold text-xs" aria-hidden="true">C</div>
            <span className="text-sm font-bold text-white">Clstr</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight text-white mb-4">
            {t("auth.title").split(" ")[0]}
            <br />
            <span className="bg-gradient-to-r from-[#CCFF00] to-[#0066FF] bg-clip-text text-transparent">
              {t("auth.title").split(" ").slice(1).join(" ") || "Ops"}
            </span>
          </h1>

          <p className="text-sm text-[#666] leading-relaxed max-w-sm mb-8">{t("auth.subtitle")}</p>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#CCFF00]/5 border border-[#CCFF00]/10 w-fit">
            <ShieldIcon />
            <span className="text-[10px] font-semibold text-[#CCFF00]/70 uppercase tracking-wider">{t("auth.badge")}</span>
          </div>
        </motion.div>
      </motion.div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 relative">
        <div className="absolute top-[-100px] right-[-100px] w-[300px] h-[300px] rounded-full bg-[#CCFF00]/5 blur-[80px] pointer-events-none" aria-hidden="true" />

        <motion.div
          variants={rightSlideUp}
          initial="hidden"
          animate="visible"
          className="relative z-10 w-full max-w-md rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-6 sm:p-8 shadow-[0_0_60px_rgba(255,255,255,0.03)]"
          role="main"
        >
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#FF6A00] via-[#CCFF00] to-[#0066FF] opacity-60" />

          <motion.div variants={formItem} className="flex flex-col gap-1 mb-6">
            <h2 className="text-xl font-bold text-white">{t("auth.portalTitle")}</h2>
            <p className="text-sm text-[#666]">{t("auth.portalSubtitle")}</p>
            <p className="text-[10px] text-[#444] mt-1">
              Demo: <code className="text-[#CCFF00]/60">lead@clstr.in</code> / <code className="text-[#CCFF00]/60">lead123</code> or <code className="text-[#0066FF]/60">team@clstr.in</code> / <code className="text-[#0066FF]/60">team123</code>
            </p>
          </motion.div>

          <div className="space-y-4">
            {/* Email field */}
            <motion.div variants={formItem} className="flex flex-col gap-1.5">
              <label htmlFor="auth-email" className="text-xs font-semibold text-[#999] uppercase tracking-wider">
                {t("auth.emailLabel")}
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                autoComplete="email"
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                aria-invalid={!!fieldErrors.email}
                className={`w-full px-4 py-3 rounded-xl bg-[#000000] border text-sm text-white placeholder-[#444] focus:outline-none focus:ring-1 transition-all duration-200 ${
                  fieldErrors.email ? "border-[#FF6A00]/60 focus:border-[#FF6A00]/60 focus:ring-[#FF6A00]/20" : "border-[#1A1A1A] focus:border-[#CCFF00]/40 focus:ring-[#CCFF00]/20"
                }`}
              />
              {fieldErrors.email && (
                <p id="email-error" role="alert" className="text-xs text-[#FF6A00] font-medium">{fieldErrors.email}</p>
              )}
            </motion.div>

            {/* Password field */}
            <motion.div variants={formItem} className="flex flex-col gap-1.5">
              <label htmlFor="auth-password" className="text-xs font-semibold text-[#999] uppercase tracking-wider">
                {t("auth.passwordLabel")}
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                autoComplete="current-password"
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                aria-invalid={!!fieldErrors.password}
                className={`w-full px-4 py-3 rounded-xl bg-[#000000] border text-sm text-white placeholder-[#444] focus:outline-none focus:ring-1 transition-all duration-200 ${
                  fieldErrors.password ? "border-[#FF6A00]/60 focus:border-[#FF6A00]/60 focus:ring-[#FF6A00]/20" : "border-[#1A1A1A] focus:border-[#CCFF00]/40 focus:ring-[#CCFF00]/20"
                }`}
              />
              {fieldErrors.password && (
                <p id="password-error" role="alert" className="text-xs text-[#FF6A00] font-medium">{fieldErrors.password}</p>
              )}
            </motion.div>

            {/* Global error / rate limit message */}
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

            {/* Submit button — Phase 1.3: disabled during cooldown */}
            <motion.div variants={formItem}>
              <button
                id="auth-submit"
                onClick={handleAuth}
                disabled={loading || isBlocked}
                aria-disabled={loading || isBlocked}
                className="w-full px-4 py-3 rounded-xl bg-[#CCFF00] text-[#000000] text-sm font-bold transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
              >
                {loading ? (
                  <>
                    <motion.span
                      className="inline-block w-4 h-4 border-2 border-[#000000] border-t-transparent rounded-full"
                      animate={prefersReduced ? {} : { rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      aria-hidden="true"
                    />
                    {t("auth.submitting")}
                  </>
                ) : isBlocked ? (
                  `${t("auth.rateLimited", { seconds: cooldownSec })}`
                ) : (
                  t("auth.submitButton")
                )}
              </button>
            </motion.div>

            <motion.div variants={formItem} className="flex items-center justify-center gap-1.5 pt-2">
              <LockIcon />
              <span className="text-[10px] text-[#444] font-medium">{t("auth.secureNotice")}</span>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
