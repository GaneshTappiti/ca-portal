/**
 * App.tsx — Root orchestrator
 *
 * Phase 1.4 — AuthProvider wraps everything; role flows from context
 * Phase 4.5 — CSS custom property focus ring + contrast tokens in :root
 * Phase 5.1 — React.lazy + Suspense code splitting for Dashboard/TaskPanel
 * Phase 7.4 — Super-admin view rendered when role === SUPER_ADMIN
 * Phase 7.6 — Language selector in header
 */

import { Suspense, lazy, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

// Phase 5.1 — lazy-loaded route chunks (separate JS bundles)
const ClstrDashboard = lazy(() => import("./ClstrDashboard"));
const ClstrTaskPanel = lazy(() => import("./ClstrTaskPanel"));
const SuperAdminDashboard = lazy(() => import("./components/SuperAdminDashboard"));

import ClstrAuthGateway from "./ClstrAuthGateway";
import NotificationCenter from "./components/NotificationCenter";
import TeamManager from "./components/TeamManager";
import { AuthProvider, useAuth } from "./lib/auth";
import "./lib/i18n"; // Phase 7.6 — initialise i18n before any component renders

// ─── On-brand skeleton loader (Phase 5.1 Suspense fallback) ─────────────────

function SkeletonLoader() {
  return (
    <div className="w-full space-y-6 animate-pulse">
      <div className="rounded-2xl bg-[#0A0A0A] border border-[#1A1A1A] h-32" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-[#0A0A0A] border border-[#1A1A1A] h-32" />
        ))}
      </div>
    </div>
  );
}

// ─── Language selector (Phase 7.6) ───────────────────────────────────────────

const LanguageSelector = memo(function LanguageSelector() {
  const { i18n } = useTranslation();
  const [lang, setLang] = useState(i18n.language.startsWith("hi") ? "hi" : "en");

  const toggle = useCallback(() => {
    const next = lang === "en" ? "hi" : "en";
    setLang(next);
    i18n.changeLanguage(next);
  }, [lang, i18n]);

  return (
    <button
      id="language-toggle"
      onClick={toggle}
      aria-label={`Switch language. Current: ${lang === "en" ? "English" : "हिंदी"}`}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1A1A1A] bg-[#0A0A0A] hover:border-[#333] transition-colors text-xs font-semibold text-[#666] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
      {lang === "en" ? "EN" : "हि"}
    </button>
  );
});

// ─── Header ───────────────────────────────────────────────────────────────────

const AppHeader = memo(function AppHeader({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-[#1A1A1A]/50 bg-[#000000]/80 backdrop-blur-xl"
      role="banner"
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-6 md:px-8 py-3 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#CCFF00] to-[#CCFF00]/60 flex items-center justify-center text-[#000] font-bold text-xs" aria-hidden="true">C</div>
          <span className="text-sm font-bold text-white">Clstr</span>
          <span className="hidden sm:block text-xs text-[#444] font-medium">/ {user.campus}</span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <NotificationCenter userEmail={user.email} />
          <button
            id="logout-button"
            onClick={onLogout}
            aria-label={t("nav.logout")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1A1A1A] bg-[#0A0A0A] hover:border-[#333] text-xs font-semibold text-[#666] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="hidden sm:block">{t("nav.logout")}</span>
          </button>
        </div>
      </div>
    </header>
  );
});

// ─── Inner app (rendered when authenticated) ──────────────────────────────────

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  if (!user) return null;

  const isSuperAdmin = user.role === "SUPER_ADMIN";

  return (
    <div className="w-full min-h-screen bg-[#000000] text-white font-['Space_Grotesk',sans-serif]">
      <AppHeader onLogout={onLogout} />

      <main
        id="main-content"
        className="w-full max-w-6xl mx-auto px-5 sm:px-6 md:px-8 py-8 space-y-10"
        role="main"
      >
        {/* Phase 5.1 — lazy-loaded chunks in Suspense */}
        <Suspense fallback={<SkeletonLoader />}>
          {isSuperAdmin ? (
            <SuperAdminDashboard />
          ) : (
            <>
              <ClstrDashboard />
              <hr className="border-[#1A1A1A]/50" />
              <ClstrTaskPanel />
              <hr className="border-[#1A1A1A]/50" />
              <TeamManager
                role={user.role}
                userEmail={user.email}
                leadEmail={user.role === "LEAD" ? user.email : "lead@clstr.in"}
              />
            </>
          )}
        </Suspense>
      </main>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [authed, setAuthed] = useState(false);

  return (
    <>
      {/* Phase 4.5 — CSS tokens with WCAG AA-compliant contrast values */}
      <style>{`
        :root {
          --background: #000000;
          --foreground: #FFFFFF;
          --card: #0A0A0A;
          --border: #1A1A1A;
          --lime: #CCFF00;
          --blue: #0066FF;
          --orange: #FF6A00;
          /* Phase 4.5 — contrast fix: muted text is at least #999 on #000 (≥7:1) */
          --text-muted: #999999;
          --text-faint: #666666;
        }

        /* Phase 4.2 — Visible focus ring (not deleted, replaced) */
        :focus-visible {
          outline: 2px solid #CCFF00;
          outline-offset: 2px;
          border-radius: 6px;
        }

        /* Remove default focus for mouse users only */
        :focus:not(:focus-visible) {
          outline: none;
        }

        /* Phase 4.4 — Skip link for keyboard users */
        .skip-link {
          position: absolute;
          top: -40px;
          left: 0;
          background: #CCFF00;
          color: #000;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 700;
          border-radius: 0 0 8px 0;
          z-index: 9999;
          transition: top 0.2s;
        }
        .skip-link:focus {
          top: 0;
        }
      `}</style>

      {/* Skip-to-main link for keyboard users */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Phase 1.4 — AuthProvider wraps the entire tree */}
      <AuthProvider>
        <AnimatePresence mode="wait">
          {!authed ? (
            <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ClstrAuthGateway onAuthenticated={() => setAuthed(true)} />
            </motion.div>
          ) : (
            <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <AuthenticatedApp onLogout={() => setAuthed(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </AuthProvider>
    </>
  );
}
