import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { usePlanStore, WEEK_NAMES, WEEK_DATES, WEEKLY_REELS, WEEKLY_CLUB_FOCUS, WEEKLY_MILESTONES, WEEKLY_CUMULATIVE } from "../lib/store";
import type { Tier } from "../lib/store";

const TIER_LABELS: Record<Tier, string> = { 1: "T1", 2: "T2", 3: "T3", 4: "T4" };

export default function WeekPlan() {
  const { t } = useTranslation();
  const { tier, currentWeek, getWeekReels, getWeekReport } = usePlanStore();
  const [expandedWeek, setExpandedWeek] = useState<number | null>(currentWeek);

  const weeks = useMemo(() => Array.from({ length: 13 }, (_, i) => i + 1), []);

  return (
    <section className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 shadow-[0_0_40px_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white">90-Day Execution Plan</h2>
        <span className="px-3 py-1.5 rounded-lg bg-[#CCFF00]/10 border border-[#CCFF00]/20 text-xs font-bold text-[#CCFF00]">
          {TIER_LABELS[tier]} · Wk {currentWeek}
        </span>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
        {weeks.map((week) => {
          const reels = getWeekReels(week);
          const report = getWeekReport(week);
          const postedCount = reels.filter((r) => r.posted).length;
          const isCurrent = week === currentWeek;
          const isPast = week < currentWeek;
          const isExpanded = expandedWeek === week;
          const milestone = WEEKLY_MILESTONES.find((m) => m.week === week);
          const targets = WEEKLY_CUMULATIVE[tier];
          const cumTarget = targets[week - 1];

          return (
            <div key={week} className="rounded-xl overflow-hidden border border-[#1A1A1A]/50">
              <button
                onClick={() => setExpandedWeek(isExpanded ? null : week)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  isCurrent ? "bg-[#CCFF00]/5" : "bg-[#000]/40 hover:bg-white/[0.02]"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                  isCurrent ? "bg-[#CCFF00] text-black" : "bg-[#1A1A1A] text-[#666]"
                }`}>
                  {week}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{WEEK_NAMES[week - 1]}</span>
                    <span className="text-[10px] text-[#555]">{WEEK_DATES[week - 1]}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[#0066FF] font-semibold">{cumTarget.toLocaleString()} cum.</span>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] ${postedCount >= 3 ? "text-[#CCFF00]" : postedCount > 0 ? "text-[#FF6A00]" : "text-[#555]"}`}>
                        {postedCount}/3 reels
                      </span>
                    </div>
                    {report?.submitted && (
                      <span className="text-[10px] text-[#CCFF00]">✓ reported</span>
                    )}
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-1 space-y-3 border-t border-[#1A1A1A]/30">
                      {/* Reel topics for this week */}
                      <div>
                        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-2">3 Reels This Week</p>
                        <div className="space-y-1.5">
                          {[
                            { type: "meme" as const, label: "Meme", desc: WEEKLY_REELS[week - 1].meme },
                            { type: "campus_culture" as const, label: "Culture/Story", desc: WEEKLY_REELS[week - 1].culture },
                            { type: "student_conversation" as const, label: "Conversation/Branding", desc: WEEKLY_REELS[week - 1].conversation },
                          ].map((r) => {
                            const reelEntry = reels.find((re) => re.type === r.type);
                            const done = reelEntry?.posted;
                            return (
                              <div key={r.type} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#000]/40">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 ${
                                  done ? "bg-[#CCFF00] border-[#CCFF00]" : "border-[#333]"
                                }`}>
                                  {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className={`text-xs font-semibold ${done ? "text-[#CCFF00]" : "text-[#999]"}`}>{r.label}</span>
                                  <p className="text-[10px] text-[#555] leading-relaxed">{r.desc}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Club focus */}
                      <div className="px-3 py-2 rounded-lg bg-[#FF6A00]/5 border border-[#FF6A00]/10">
                        <p className="text-[10px] font-semibold text-[#FF6A00] uppercase tracking-wider mb-1">Club & Domain Focus</p>
                        <p className="text-xs text-[#999]">{WEEKLY_CLUB_FOCUS[week - 1].focus}</p>
                      </div>

                      {/* Milestone */}
                      {milestone && (
                        <div className="px-3 py-2 rounded-lg bg-[#CCFF00]/5 border border-[#CCFF00]/15">
                          <p className="text-[10px] font-semibold text-[#CCFF00] uppercase tracking-wider mb-1">
                            {milestone.isBonus ? "BONUS MILESTONE" : "MILESTONE"} {milestone.label}
                          </p>
                          <p className="text-xs text-[#999]">{milestone.name} — <span className="text-[#CCFF00]">{milestone.reward}</span></p>
                          <p className="text-[10px] text-[#555]">Trigger: {milestone.pctTarget}% of tier target ({targets[week - 1].toLocaleString()} users)</p>
                        </div>
                      )}

                      {/* Report status */}
                      {report?.submitted && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#CCFF00]/5 border border-[#CCFF00]/10">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                          <span className="text-[10px] text-[#CCFF00] font-semibold">Monday report submitted</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
