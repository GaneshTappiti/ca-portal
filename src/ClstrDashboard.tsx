/**
 * ClstrDashboard — Fully dynamic, Supabase-backed
 *
 * Data sources:
 *  - useAuth()      → user identity, tier, campus
 *  - useMetrics()   → verifiedUsers (live from secondary DB), totalPoints, pendingCount, verifiedCount
 *  - usePlanStore() → currentWeek, clubs, reels, reports
 *  - useTaskStore() → task counts for pending/verified badge
 *  - ReviewQueue    → Captain review workflow for LEAD users
 */

import { memo, lazy, Suspense, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMetrics, usePlanStore, useTaskStore } from "./lib/store";
import { useAuth } from "./lib/auth";
import { fetchDailyChecklist, saveDailyChecklist } from "./lib/queries/dailyChecklist";
import ReviewQueue from "./components/ReviewQueue";

const MissionBoard = lazy(() => import("./components/MissionBoard"));
const WeekPlan = lazy(() => import("./components/WeekPlan"));
const ReelTracker = lazy(() => import("./components/ReelTracker"));
const ClubOnboardingTracker = lazy(() => import("./components/ClubOnboardingTracker"));
const WeeklyReportPanel = lazy(() => import("./components/WeeklyReportPanel"));
const MilestoneTracker = lazy(() => import("./components/MilestoneTracker"));

function Skeleton({ w = "w-full", h = "h-4", className = "" }: { w?: string; h?: string; className?: string }) {
  return (
    <div className={`${w} ${h} bg-[#1A1A1A] rounded animate-pulse ${className}`} aria-hidden="true" />
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={copy}
      aria-label={`Copy ${label ?? text}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-[#2E2E2E] rounded text-[9px] font-bold text-[#666] hover:text-[#C8FF00] hover:border-[#C8FF00]/30 transition-colors uppercase tracking-wide focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
    >
      {copied ? (
        <>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          copied
        </>
      ) : (
        <>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          copy
        </>
      )}
    </button>
  );
}

function IdentityCard({
  caId, name, campus, tier, role, isLoading,
}: {
  caId: string; name: string; campus?: string; tier: number;
  role: string; isLoading?: boolean;
}) {
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-0 border border-[#222] bg-[#111] rounded-2xl overflow-hidden">
      <div
        className="w-12 h-12 shrink-0 flex items-center justify-center text-[#000] font-black text-sm border-r border-[#222]"
        style={{ background: "#C8FF00" }}
        aria-hidden="true"
      >
        {initials}
      </div>

      <div className="flex flex-col gap-0.5 px-4 py-3 flex-1 min-w-0 border-r border-[#222]">
        {isLoading ? (
          <><Skeleton w="w-32" h="h-3.5" /><Skeleton w="w-24" h="h-2.5" className="mt-1" /></>
        ) : (
          <>
            <p className="text-sm font-bold text-[#F0F0F0] tracking-tight truncate">{name}</p>
            {campus && <p className="text-[10px] text-[#555] font-mono uppercase tracking-widest truncate">{campus}</p>}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-r border-[#222]">
        <span className="text-[9px] font-mono text-[#555] uppercase tracking-wider">ID</span>
        {isLoading ? (
          <Skeleton w="w-24" h="h-3" />
        ) : (
          <>
            <span className="text-[11px] font-black font-mono text-[#C8FF00] tracking-wider select-all">{caId}</span>
            <CopyButton text={caId} label="CA ID" />
          </>
        )}
      </div>

      <div className="hidden sm:flex flex-col gap-0.5 px-4 py-3">
        <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#F0F0F0]">
          Tier {tier}
        </span>
        <span className="flex items-center gap-1 text-[9px] font-mono text-[#C8FF00] uppercase tracking-wider">
          <span className="w-1.5 h-1.5 bg-[#C8FF00] rounded-full animate-pulse" aria-hidden="true" />
          {role === "LEAD" ? "Campus Captain" : role === "SUPER_ADMIN" ? "Super Admin" : "Team Member"}
        </span>
      </div>
    </div>
  );
}

const MetricCell = memo(function MetricCell({
  id, value, label, sub, color, progress, isLoading, isLive,
}: {
  id: string; value: string; label: string; sub?: string; color: string;
  progress?: { current: number; target: number };
  isLoading?: boolean; isLive?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4" aria-label={`${label}: ${value}`}>
      {isLoading ? (
        <Skeleton w="w-16" h="h-9" />
      ) : (
        <div className="flex items-end gap-2">
          <span
            id={id}
            className="text-[36px] sm:text-[44px] font-black leading-none tracking-tighter tabular-nums"
            style={{ color }}
          >
            {value}
          </span>
          {isLive !== undefined && (
            <span
              className={`w-2 h-2 rounded-full mb-2 shrink-0 ${isLive ? "bg-[#C8FF00]" : "bg-[#FF5500]"}`}
              title={isLive ? "Live from main Clstr DB" : "Fallback static target"}
              aria-label={isLive ? "Live data connected" : "Static fallback data"}
            />
          )}
        </div>
      )}

      <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#F0F0F0] mt-0.5">
        {label}
      </span>

      {isLoading ? (
        <Skeleton w="w-24" h="h-2.5" className="mt-1" />
      ) : sub ? (
        <span className="text-[10px] font-mono text-[#555] truncate">{sub}</span>
      ) : null}

      {progress && !isLoading && (
        <div className="w-full h-1 bg-[#1A1A1A] rounded-full mt-2 overflow-hidden" aria-hidden="true">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min((progress.current / progress.target) * 100, 100)}%`,
              backgroundColor: color,
            }}
          />
        </div>
      )}
    </div>
  );
});

function DailyChecklist({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const todayStr = new Date().toISOString().split("T")[0];

  const { data: checks = {}, isLoading } = useQuery({
    queryKey: ["daily_checklist", userId, todayStr],
    queryFn: () => fetchDailyChecklist(userId, todayStr),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (updated: Record<string, boolean>) => saveDailyChecklist(userId, todayStr, updated),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily_checklist", userId, todayStr] }),
  });

  const items = [
    { key: "group_post", label: "Post campus update in main group" },
    { key: "club_outreach", label: "Contact 1 active club president" },
    { key: "reel_review", label: "Review weekly reel draft with team" },
    { key: "signup_check", label: "Check daily campus signup count" },
  ];

  const toggle = (key: string) => {
    const updated = { ...checks, [key]: !checks[key] };
    mutation.mutate(updated);
  };

  const doneCount = items.filter(i => checks[i.key]).length;

  return (
    <div className="border border-[#222] bg-[#111] rounded-2xl p-5 flex flex-col justify-between h-full space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#555]">Daily Focus</span>
        <span className="text-[10px] font-mono text-[#C8FF00]">{doneCount}/4 done</span>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const checked = !!checks[item.key];
          return (
            <button
              key={item.key}
              onClick={() => toggle(item.key)}
              disabled={isLoading || mutation.isPending}
              className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                checked
                  ? "bg-[#C8FF00]/5 border-[#C8FF00]/20 text-[#F0F0F0]"
                  : "bg-[#0A0A0A] border-[#1A1A1A] text-[#888] hover:border-[#333]"
              }`}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                checked ? "bg-[#C8FF00] border-[#C8FF00] text-black" : "border-[#333]"
              }`}>
                {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <span className="text-xs font-mono">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AtAGlance({
  currentWeek, progressPct, activeClubs, pendingCount, isLoading,
}: {
  currentWeek: number; progressPct: number; activeClubs: number; pendingCount: number; isLoading: boolean;
}) {
  const stats = [
    { label: "Current Week", value: `Wk ${currentWeek}`, color: "#C8FF00" },
    { label: "Target Achieved", value: `${Math.round(progressPct)}%`, color: "#4488FF" },
    { label: "Active Clubs", value: `${activeClubs}/8`, color: "#FF5500" },
    { label: "Pending Reviews", value: `${pendingCount}`, color: "#C8FF00" },
  ];

  return (
    <div className="lg:col-span-2 border border-[#222] bg-[#111] rounded-2xl overflow-hidden h-full">
      <div className="px-5 py-3 border-b border-[#222] flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#555]">At a Glance</span>
        <span className="text-[10px] font-mono text-[#555]">Sprint Progress</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#1A1A1A] h-[calc(100%-41px)]">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center justify-center py-6 gap-1.5">
            {isLoading ? (
              <Skeleton w="w-12" h="h-7" />
            ) : (
              <motion.p
                key={s.value}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-black tabular-nums"
                style={{ color: s.color }}
              >
                {s.value}
              </motion.p>
            )}
            <p className="text-[9px] uppercase tracking-[0.1em] text-[#555] font-bold text-center">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function ClstrDashboard() {
  const { user } = useAuth();
  const prefersReduced = useReducedMotion();
  const [activeView, setActiveView] = useState<"missions" | "review" | "sprint">("missions");
  const [sprintTab, setSprintTab] = useState<"weekplan" | "reels" | "clubs" | "report" | "milestones">("weekplan");

  const metrics = useMetrics(user?.id, user?.campus ?? "raghuinstitute");

  const { currentWeek, tier, clubs, weeklyCumulative, isLoading: planLoading } = usePlanStore(
    user?.id ?? "",
    user?.teamId ?? "",
    user?.tier ?? 4
  );

  const { tasks, isLoading: tasksLoading } = useTaskStore(
    user?.id ?? "",
    user?.teamId
  );

  const caId = useMemo(() => {
    if (user?.caId) return user.caId;
    if (user?.id) return `CA-${user.id.replace(/-/g, "").toUpperCase().slice(0, 8)}`;
    return "CA-00000000";
  }, [user?.caId, user?.id]);
  const targets = weeklyCumulative[tier] ?? weeklyCumulative[4] ?? [];
  const totalTarget = targets[12] ?? 0;

  const localActiveClubs = useMemo(() => clubs.filter(c => c.active).length, [clubs]);
  const displayClubs = metrics.liveClubsCount > 0 ? metrics.liveClubsCount : localActiveClubs;

  const userPct = totalTarget > 0 ? Math.min((metrics.verifiedUsers / totalTarget) * 100, 100) : 0;
  const pendingCount = useMemo(() => tasks.filter(t => t.status === "pending").length, [tasks]);
  const totalPoints = metrics.totalPoints;
  const verifiedCount = metrics.verifiedCount;

  const refreshedLabel = useMemo(() => {
    if (!metrics.statsRefreshedAt) return null;
    const d = new Date(metrics.statsRefreshedAt);
    const diff = Math.round((Date.now() - d.getTime()) / 60_000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    return `${Math.round(diff / 60)}h ago`;
  }, [metrics.statsRefreshedAt]);

  const isMetricsLoading = metrics.isLoadingStats || metrics.isLoadingTasks || planLoading;

  if (!user) return null;

  const isLeadOrAdmin = user.role === "LEAD" || user.role === "SUPER_ADMIN";

  const skip = !!prefersReduced;
  const container = {
    hidden:  { opacity: 0 },
    visible: { opacity: 1, transition: skip ? {} : { staggerChildren: 0.06 } },
  };
  const itemV = {
    hidden:  { opacity: 0, y: skip ? 0 : 10 },
    visible: { opacity: 1, y: 0, transition: skip ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 32 } },
  };

  return (
    <motion.div
      className="w-full space-y-4"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemV}>
        <IdentityCard
          caId={caId}
          name={user.name}
          campus={user.campus}
          tier={tier}
          role={user.role}
        />
      </motion.div>

      <motion.div variants={itemV}>
        <div
          className="grid grid-cols-2 lg:grid-cols-4 border border-[#222] bg-[#111] divide-x divide-[#1A1A1A] rounded-2xl overflow-hidden"
          role="region"
          aria-label="Key metrics"
        >
          <MetricCell
            id="stat-users"
            value={metrics.verifiedUsers.toLocaleString()}
            label="Verified Users"
            sub={
              metrics.activeUsers7d > 0
                ? `${metrics.activeUsers7d.toLocaleString()} active 7d · Target ${totalTarget.toLocaleString()}${
                    refreshedLabel ? ` · refreshed ${refreshedLabel}` : ""
                  }`
                : `Target ${totalTarget.toLocaleString()}`
            }
            color="#4488FF"
            progress={{ current: metrics.verifiedUsers, target: totalTarget }}
            isLoading={isMetricsLoading}
            isLive={metrics.isLive}
          />
          <MetricCell
            id="stat-clubs"
            value={displayClubs.toLocaleString()}
            label="Active Clubs"
            sub={
              metrics.isLive
                ? `${metrics.eventsCount} events · ${metrics.postsCount} posts`
                : `${localActiveClubs}/8 onboarded`
            }
            color="#FF5500"
            progress={{ current: displayClubs, target: 8 }}
            isLoading={planLoading}
            isLive={metrics.isLive}
          />
          <MetricCell
            id="stat-points"
            value={totalPoints.toLocaleString()}
            label="Growth Points"
            sub={`${verifiedCount} verified task${verifiedCount !== 1 ? "s" : ""}`}
            color="#C8FF00"
            isLoading={tasksLoading}
          />
          <MetricCell
            id="stat-progress"
            value={`${Math.round(userPct)}%`}
            label="Campaign"
            sub={`Wk ${currentWeek} of 13`}
            color="#C8FF00"
            progress={{ current: metrics.verifiedUsers, target: totalTarget }}
            isLoading={isMetricsLoading}
          />
        </div>
      </motion.div>

      <motion.div variants={itemV} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DailyChecklist userId={user.id ?? "guest"} />
        <AtAGlance
          currentWeek={currentWeek}
          progressPct={userPct}
          activeClubs={displayClubs}
          pendingCount={pendingCount}
          isLoading={isMetricsLoading}
        />
      </motion.div>

      {/* Tab Navigation — all users see Mission Board + Sprint Hub; LEAD/ADMIN also see Review Queue */}
      <motion.div variants={itemV} className="flex gap-2 flex-wrap border-b border-[#222] pb-2">
        <button
          onClick={() => setActiveView("missions")}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors border ${
            activeView === "missions"
              ? "bg-[#C8FF00] text-black border-[#C8FF00]"
              : "bg-[#111] text-[#888] border-[#222] hover:text-[#FFF]"
          }`}
        >
          Mission Board
        </button>
        <button
          onClick={() => setActiveView("sprint")}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors border ${
            activeView === "sprint"
              ? "bg-[#C8FF00] text-black border-[#C8FF00]"
              : "bg-[#111] text-[#888] border-[#222] hover:text-[#FFF]"
          }`}
        >
          Sprint Hub
        </button>
        {isLeadOrAdmin && (
          <button
            onClick={() => setActiveView("review")}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors border ${
              activeView === "review"
                ? "bg-[#C8FF00] text-[#000] border-[#C8FF00]"
                : "bg-[#111] text-[#888] border-[#222] hover:text-[#FFF]"
            }`}
          >
            Team Queue
          </button>
        )}
      </motion.div>

      {/* Main View Area */}
      <motion.div variants={itemV}>
        {activeView === "review" && isLeadOrAdmin ? (
          <ReviewQueue />
        ) : activeView === "sprint" ? (
          <div className="space-y-4">
            {/* Sprint Hub sub-tabs */}
            <div className="flex gap-1.5 flex-wrap">
              {(
                [
                  { id: "weekplan",   label: "Week Plan" },
                  { id: "reels",      label: "Reels" },
                  { id: "clubs",      label: "Clubs" },
                  { id: "report",     label: "Report" },
                  { id: "milestones", label: "Milestones" },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setSprintTab(id)}
                  className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.08em] transition-colors border ${
                    sprintTab === id
                      ? "bg-[#C8FF00]/10 text-[#C8FF00] border-[#C8FF00]/30"
                      : "bg-[#111] text-[#555] border-[#1A1A1A] hover:text-[#F0F0F0]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Sprint Hub panel */}
            <Suspense
              fallback={
                <div className="border border-dashed border-[#222] p-8 text-center bg-[#0A0A0A]">
                  <p className="text-[11px] font-mono text-[#555] uppercase tracking-[0.1em]">Loading…</p>
                </div>
              }
            >
              <div className="border border-[#1A1A1A] bg-[#111] rounded-none overflow-hidden">
                {sprintTab === "weekplan"   && <WeekPlan />}
                {sprintTab === "reels"      && <ReelTracker />}
                {sprintTab === "clubs"      && <ClubOnboardingTracker />}
                {sprintTab === "report"     && <WeeklyReportPanel />}
                {sprintTab === "milestones" && <MilestoneTracker />}
              </div>
            </Suspense>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="rounded-2xl border border-dashed border-[#222] p-8 text-center bg-[#0A0A0A]">
                <p className="text-[11px] font-mono text-[#555] uppercase tracking-[0.1em]">Loading board…</p>
              </div>
            }
          >
            <MissionBoard />
          </Suspense>
        )}
      </motion.div>
    </motion.div>
  );
}

