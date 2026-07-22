import { useMemo } from "react";
import { motion } from "framer-motion";
import { useMetrics, usePlanStore } from "../lib/store";
import { useAuth } from "../lib/auth";
import type { Tier } from "../lib/store";

const MILESTONE_COLORS = [
  { primary: "#0066FF", bg: "#0066FF11", border: "#0066FF22" },
  { primary: "#FF6A00", bg: "#FF6A0011", border: "#FF6A0022" },
  { primary: "#CCFF00", bg: "#CCFF0011", border: "#CCFF0022" },
  { primary: "#CCFF00", bg: "#CCFF0011", border: "#CCFF0022" },
  { primary: "#CCFF00", bg: "#CCFF0011", border: "#CCFF0022" },
];

const TIER_HEADCOUNTS: Record<Tier, string> = {
  1: "15,000+ students",
  2: "8,000–15,000 students",
  3: "4,000–8,000 students",
  4: "Under 4,000 students",
};

export default function MilestoneTracker() {
  const { user } = useAuth();
  const { tier, currentWeek, clubs, weeklyCumulative, weeklyMilestones } = usePlanStore(
    user?.id ?? "",
    user?.teamId ?? "",
    user?.tier ?? 4
  );
  const metrics = useMetrics(user?.id, user?.campus ?? "raghuinstitute");

  const targets = weeklyCumulative[tier as 1 | 2 | 3 | 4] ?? weeklyCumulative[4] ?? [];
  const totalTarget = targets[12] ?? 0;

  const milestones = useMemo(() => {
    return weeklyMilestones.map((m, idx) => {
      const userTarget = Math.round(totalTarget * (m.pctTarget / 100));
      const isCompleted = metrics.verifiedUsers >= userTarget;
      const pct = Math.min((metrics.verifiedUsers / (userTarget || 1)) * 100, 100);

      return { ...m, userTarget, isCompleted, pct, color: MILESTONE_COLORS[idx % MILESTONE_COLORS.length] };
    });
  }, [metrics.verifiedUsers, totalTarget, weeklyMilestones]);

  return (
    <section className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 shadow-[0_0_40px_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-white">Milestone Ladder</h2>
      </div>
      <p className="text-xs text-[#666] mb-5">
        Tier {tier} campus ({TIER_HEADCOUNTS[tier as 1 | 2 | 3 | 4] ?? TIER_HEADCOUNTS[4]}) · Target: {totalTarget.toLocaleString()} users · Current: <span className="text-[#CCFF00] font-semibold">{metrics.verifiedUsers.toLocaleString()}</span>
      </p>

      <div className="space-y-3">
        {milestones.map((m, idx) => {
          return (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.06 }}
              className={`p-4 rounded-xl border transition-all ${
                m.isCompleted
                  ? "bg-[#CCFF00]/5 border-[#CCFF00]/20"
                  : "bg-[#000]/40 border-[#1A1A1A]/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                    m.isCompleted ? "bg-[#CCFF00] text-black" : "bg-[#1A1A1A] text-[#666]"
                  }`}>
                    {m.isCompleted ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg> : m.label}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">{m.name}</h3>
                    <p className="text-xs text-[#999]">Reward: <span className="text-[#CCFF00]">{m.reward}</span></p>
                  </div>
                </div>
                {m.isCompleted && (
                  <span className="px-2.5 py-1 rounded-full bg-[#CCFF00]/20 text-[#CCFF00] text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
                    Unlocked
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#666]">Target: {m.userTarget.toLocaleString()} users ({m.pctTarget}% of {totalTarget.toLocaleString()})</span>
                  <span className="text-[#999]">{metrics.verifiedUsers.toLocaleString()} / {m.userTarget.toLocaleString()}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#1A1A1A] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${m.pct}%`, background: m.color.primary }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[#555]">
                  <span>Week {m.week}{m.isBonus ? "+" : ""}</span>
                  <span>{Math.round(m.pct)}%</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
