/**
 * App.tsx — Root orchestrator
 *
 * Mission Ledger redesign:
 *   - Full-width landmark header with rule-based structure
 *   - Week ticker strip below header
 *   - No sidebar, no rounded pill nav
 */

import { Suspense, lazy, useState, useCallback, memo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

const ClstrDashboard = lazy(() => import("./ClstrDashboard"));
const SuperAdminDashboard = lazy(() => import("./components/SuperAdminDashboard"));

import ClstrAuthGateway from "./ClstrAuthGateway";
import NotificationCenter from "./components/NotificationCenter";
import TeamManager from "./components/TeamManager";
import { AuthProvider, useAuth } from "./lib/auth";
import { usePlanStore } from "./lib/store";
import "./lib/i18n";

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonLoader() {
  return (
    <div className="w-full space-y-4 animate-pulse">
      <div className="h-20 bg-[#111111] border border-[#222]" />
      <div className="grid grid-cols-4 gap-px">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-[#111111]" />
        ))}
      </div>
      <div className="h-64 bg-[#111111] border border-[#222]" />
    </div>
  );
}

// ─── Language selector ────────────────────────────────────────────────────────

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
      className="h-7 px-2.5 border border-[#2E2E2E] bg-[#111] hover:border-[#444] hover:bg-[#181818] transition-colors text-[11px] font-semibold text-[#666] hover:text-[#F0F0F0] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
    >
      {lang === "en" ? "EN" : "हि"}
    </button>
  );
});

// ─── Week ticker (signature element) ─────────────────────────────────────────

function WeekTicker({ userId, teamId, tier }: { userId: string; teamId: string; tier: number }) {
  const { currentWeek, weeklyCumulative } = usePlanStore(userId, teamId, tier as 1|2|3|4);
  const targets = weeklyCumulative[tier as 1|2|3|4] ?? weeklyCumulative[4];
  const totalWeeks = 13;
  const pct = Math.min((currentWeek / totalWeeks) * 100, 100);

  return (
    <div
      className="w-full border-b border-[#222] bg-[#0A0A0A] flex items-center"
      style={{ height: "28px" }}
      aria-label={`Campaign week ${currentWeek} of ${totalWeeks}`}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-6 md:px-8 w-full flex items-center gap-4">
        {/* Week label */}
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#444] shrink-0">
          Campaign
        </span>
        {/* Progress track */}
        <div className="flex-1 h-[2px] bg-[#1A1A1A] relative">
          <div
            className="h-full bg-[#C8FF00] transition-all duration-700"
            style={{ width: `${pct}%` }}
            aria-hidden="true"
          />
          {/* Week markers */}
          {Array.from({ length: 13 }, (_, i) => (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-[#1A1A1A]"
              style={{ left: `${((i + 1) / totalWeeks) * 100}%` }}
              aria-hidden="true"
            />
          ))}
        </div>
        {/* Week number */}
        <span className="text-[10px] font-bold tabular-nums text-[#C8FF00] shrink-0 ticker-pulse">
          WK {currentWeek}
        </span>
        {/* Target */}
        <span className="hidden sm:block text-[10px] text-[#3A3A3A] shrink-0 tabular-nums">
          {targets[currentWeek - 1]?.toLocaleString()} target
        </span>
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

const AppHeader = memo(function AppHeader({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <>
      <header
        className="sticky top-0 z-40 w-full border-b border-[#222] bg-[#0A0A0A]"
        role="banner"
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-6 md:px-8 h-12 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-6 h-6 bg-[#C8FF00] flex items-center justify-center text-[#000] font-black text-[11px] tracking-tight shrink-0"
              aria-hidden="true"
            >
              C
            </div>
            <span className="text-sm font-bold text-[#F0F0F0] tracking-tight">CLSTR</span>
            <span className="hidden sm:block text-[10px] text-[#3A3A3A] font-mono uppercase tracking-widest border-l border-[#222] pl-3">
              {user.campus}
            </span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            <LanguageSelector />
            <NotificationCenter userEmail={user.email} />
            <button
              id="logout-button"
              onClick={onLogout}
              aria-label={t("nav.logout")}
              className="h-7 px-2.5 border border-[#2E2E2E] bg-[#111] hover:border-[#444] hover:bg-[#181818] text-[11px] font-semibold text-[#666] hover:text-[#F0F0F0] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C8FF00] flex items-center gap-1.5"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="hidden sm:block">{t("nav.logout")}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Week Ticker — signature element */}
      <div className="sticky top-12 z-30">
        <WeekTicker
          userId={user.id ?? ""}
          teamId={user.teamId ?? ""}
          tier={user.tier ?? 4}
        />
      </div>
    </>
  );
});

// ─── Inner app ─────────────────────────────────────────────────────────────────

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  if (!user) return null;

  const isSuperAdmin = user.role === "SUPER_ADMIN";

  return (
    <div className="w-full min-h-screen bg-[#0A0A0A] text-[#F0F0F0] font-['Space_Grotesk',sans-serif]">
      <AppHeader onLogout={onLogout} />

      <main
        id="main-content"
        className="w-full max-w-6xl mx-auto px-5 sm:px-6 md:px-8 py-8 space-y-12"
        role="main"
      >
        <Suspense fallback={<SkeletonLoader />}>
          {isSuperAdmin ? (
            <SuperAdminDashboard />
          ) : (
            <>
              <ClstrDashboard />
              <div className="border-t border-[#1A1A1A]" />
              <TeamManager
                role={user.role}
                userEmail={user.email}
                leadEmail={user.role === "LEAD" ? user.email : (user.teamId ? "" : "lead@clstr.in")}
              />
            </>
          )}
        </Suspense>
      </main>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

function AppInner() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [manualAuthed, setManualAuthed] = useState(false);

  useEffect(() => {
    if (isAuthenticated) setManualAuthed(true);
    if (!isAuthenticated && !isLoading) setManualAuthed(false);
  }, [isAuthenticated, isLoading]);

  const showApp = isAuthenticated || manualAuthed;

  if (isLoading) {
    return (
      <div className="w-full min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 bg-[#C8FF00] flex items-center justify-center text-[#000] font-black text-[10px]">C</div>
          <div className="w-5 h-5 border-2 border-[#C8FF00] border-t-transparent rounded-full animate-spin" aria-label="Loading" />
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!showApp ? (
        <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <ClstrAuthGateway onAuthenticated={() => setManualAuthed(true)} />
        </motion.div>
      ) : (
        <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <AuthenticatedApp onLogout={async () => { await logout(); setManualAuthed(false); }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <>
      <style>{`
        :root {
          --background: #0A0A0A;
          --foreground: #F0F0F0;
          --card: #111111;
          --border: #222222;
          --lime: #C8FF00;
          --blue: #4488FF;
          --orange: #FF5500;
          --text-muted: #A0A0A0;
          --text-faint: #666666;
        }
        :focus-visible {
          outline: 2px solid #C8FF00;
          outline-offset: 2px;
          border-radius: 2px;
        }
        :focus:not(:focus-visible) {
          outline: none;
        }
        .skip-link {
          position: absolute;
          top: -40px;
          left: 0;
          background: #C8FF00;
          color: #000;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 700;
          z-index: 9999;
          transition: top 0.2s;
        }
        .skip-link:focus { top: 0; }
      `}</style>

      <a href="#main-content" className="skip-link">Skip to main content</a>

      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </>
  );
}
