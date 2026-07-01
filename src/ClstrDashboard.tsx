import { memo, useState, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useMetrics, usePlanStore, WEEKLY_CUMULATIVE } from "./lib/store";
import { useAuth } from "./lib/auth";

const WeekPlan = lazy(() => import("./components/WeekPlan"));
const ReelTracker = lazy(() => import("./components/ReelTracker"));
const WeeklyReportPanel = lazy(() => import("./components/WeeklyReportPanel"));
const ClubOnboardingTracker = lazy(() => import("./components/ClubOnboardingTracker"));
const MilestoneTracker = lazy(() => import("./components/MilestoneTracker"));

function useAnimVariants(prefersReduced: boolean | null) {
  const skip = !!prefersReduced;
  return {
    containerVariants: {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: skip ? {} : { staggerChildren: 0.08 } },
    },
    itemVariants: {
      hidden: { opacity: 0, y: skip ? 0 : 24 },
      visible: { opacity: 1, y: 0, transition: skip ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 } },
    },
  };
}

function LightningIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0066FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
    </svg>
  );
}

function UsersCheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

const MetricCard = memo(function MetricCard({
  id, icon, value, label, sublabel, accentColor, progress, prefersReduced,
}: {
  id: string; icon: React.ReactNode; value: string; label: string; sublabel?: string;
  accentColor: string; progress?: { current: number; target: number }; prefersReduced: boolean | null;
}) {
  const pct = progress ? Math.min((progress.current / progress.target) * 100, 100) : 0;

  return (
    <div className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 shadow-[0_0_40px_rgba(255,255,255,0.03)] flex flex-col gap-3 group relative overflow-hidden"
      aria-label={`${label}: ${value}`}>
      <div className="absolute top-0 left-0 right-0 h-0.5 opacity-80" style={{ background: accentColor }} aria-hidden="true" />
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center border transition-colors duration-200"
          style={{ borderColor: `${accentColor}33`, backgroundColor: `${accentColor}11` }}>
          {icon}
        </div>
        {progress && (
          <span className="text-xs font-medium text-[#666] tabular-nums" aria-hidden="true">
            {progress.current} / {progress.target}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span id={id} className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums" style={{ color: accentColor }}
          aria-live="polite" aria-atomic="true">{value}</span>
        <span className="text-sm font-medium text-[#999]">{label}</span>
        {sublabel && <span className="text-xs text-[#666] mt-0.5">{sublabel}</span>}
      </div>
      {progress && (
        <div className="w-full h-1.5 rounded-full bg-[#1A1A1A] overflow-hidden mt-1" role="progressbar"
          aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} progress`}>
          <motion.div className="h-full rounded-full" style={{ background: accentColor }}
            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
            transition={prefersReduced ? { duration: 0 } : { duration: 1, ease: "easeOut", delay: 0.4 }} />
        </div>
      )}
    </div>
  );
});

function DailyRhythm() {
  const { t } = useTranslation();
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const today = new Date().toDateString();
    try { return JSON.parse(localStorage.getItem(`clstr_daily_${today}`) ?? "{}"); } catch { return {}; }
  });

  const toggle = (key: string) => {
    const next = { ...checks, [key]: !checks[key] };
    setChecks(next);
    localStorage.setItem(`clstr_daily_${new Date().toDateString()}`, JSON.stringify(next));
  };

  const items = [
    { key: "post", label: t("plan.postFeed") },
    { key: "check", label: t("plan.checkSignups") },
    { key: "clear", label: t("plan.clearTask") },
    { key: "respond", label: t("plan.respondBlockers") },
    { key: "call", label: t("plan.teamCall") },
  ];

  const doneCount = Object.values(checks).filter(Boolean).length;

  return (
    <div className="px-4 py-3 rounded-xl bg-[#000]/40 border border-[#1A1A1A]/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#999] uppercase tracking-wider">{t("plan.dailyRhythm")}</span>
        <span className="text-[10px] text-[#555]">{doneCount}/{items.length}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <button key={item.key} onClick={() => toggle(item.key)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/[0.02] transition-colors text-left">
            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
              checks[item.key] ? "bg-[#CCFF00] border-[#CCFF00]" : "border-[#333]"
            }`}>
              {checks[item.key] && <CheckCircleIcon />}
            </div>
            <span className={`text-xs ${checks[item.key] ? "text-[#555] line-through" : "text-[#999]"}`}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-4">
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            active === tab.id
              ? "bg-[#CCFF00] text-black"
              : "bg-[#1A1A1A]/50 text-[#666] hover:text-white hover:bg-[#1A1A1A]"
          }`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default function ClstrDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const prefersReduced = useReducedMotion();
  const { containerVariants, itemVariants } = useAnimVariants(prefersReduced);
  const metrics = useMetrics(user?.email);
  const { currentWeek, tier, weeklyTargets, clubs } = usePlanStore();
  const [view, setView] = useState("plan");

  if (!user) return null;

  const totalTarget = weeklyTargets[12];
  const userPct = Math.min((metrics.verifiedUsers / totalTarget) * 100, 100);
  const activeClubCount = clubs.filter((c) => c.active).length;

  const tabs = [
    { id: "plan", label: `${t("plan.weekPlan")}` },
    { id: "reels", label: t("plan.reelTracker") },
    { id: "report", label: t("plan.weeklyReport") },
    { id: "clubs", label: t("plan.clubOnboarding") },
    { id: "milestones", label: t("plan.milestones") },
  ];

  return (
    <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">
      {/* Hero card */}
      <motion.div variants={itemVariants}
        className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 md:p-8 shadow-[0_0_40px_rgba(255,255,255,0.03)] flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#CCFF00]/[0.03] to-transparent pointer-events-none" aria-hidden="true" />
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#CCFF00] to-[#CCFF00]/60 flex items-center justify-center text-[#000000] font-bold text-2xl sm:text-3xl shrink-0" aria-hidden="true">
          {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 w-full relative">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{user.name}</h1>
            <p className="text-sm text-[#666] font-medium">{user.campus}</p>
          </div>
          <div className="sm:ml-auto flex items-center gap-3">
            <span className="px-3 py-1.5 rounded-lg bg-[#CCFF00]/10 border border-[#CCFF00]/20 text-xs font-semibold text-[#CCFF00] whitespace-nowrap flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse" aria-hidden="true" />
              Campus Captain · Tier {tier} · Wk {currentWeek}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Metric cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <MetricCard id="metric-users" icon={<UsersIcon />} value={metrics.verifiedUsers.toLocaleString()}
          label="Verified Users" sublabel={`Target: ${totalTarget.toLocaleString()}`}
          progress={{ current: metrics.verifiedUsers, target: totalTarget }} accentColor="#0066FF" prefersReduced={prefersReduced} />
        <MetricCard id="metric-clubs" icon={<BuildingIcon />} value={activeClubCount.toString()}
          label="Active Clubs" sublabel="Target: 8+ clubs"
          progress={{ current: activeClubCount, target: 8 }} accentColor="#FF6A00" prefersReduced={prefersReduced} />
        <MetricCard id="metric-points" icon={<LightningIcon />} value={metrics.totalPoints.toLocaleString()}
          label="Growth Points" sublabel={`${metrics.verifiedCount} tasks verified`}
          accentColor="#CCFF00" prefersReduced={prefersReduced} />
        <MetricCard id="metric-progress" icon={<UsersCheckIcon />} value={`${Math.round(userPct)}%`}
          label="Target Progress" sublabel={`${metrics.verifiedUsers.toLocaleString()} / ${totalTarget.toLocaleString()}`}
          progress={{ current: metrics.verifiedUsers, target: totalTarget }} accentColor="#CCFF00" prefersReduced={prefersReduced} />
      </motion.div>

      {/* Daily Rhythm + Quick Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <DailyRhythm />
        <div className="lg:col-span-2 px-4 py-3 rounded-xl bg-[#000]/40 border border-[#1A1A1A]/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#999] uppercase tracking-wider">Quick Stats</span>
            <span className="text-[10px] text-[#555]">Jul 1 – Sep 30, 2026</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Current Week", value: `Week ${currentWeek}`, color: "#CCFF00" },
              { label: "Overall Progress", value: `${Math.round(userPct)}%`, color: "#0066FF" },
              { label: "Active Clubs", value: `${activeClubCount}/8`, color: "#FF6A00" },
              { label: "Pending Tasks", value: metrics.pendingCount.toString(), color: "#FF6A00" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-[#555]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Tab Navigation */}
      <motion.div variants={itemVariants}>
        <TabBar tabs={tabs} active={view} onChange={setView} />

        <div className="mt-4">
          <Suspense fallback={<div className="rounded-2xl bg-[#0A0A0A]/40 border border-[#1A1A1A]/50 p-8 text-center"><p className="text-sm text-[#555]">Loading...</p></div>}>
            {view === "plan" && <WeekPlan />}
            {view === "reels" && <ReelTracker />}
            {view === "report" && <WeeklyReportPanel />}
            {view === "clubs" && <ClubOnboardingTracker />}
            {view === "milestones" && <MilestoneTracker />}
          </Suspense>
        </div>
      </motion.div>
    </motion.div>
  );
}
