import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { usePlanStore, WEEK_NAMES, WEEK_DATES, WEEKLY_REELS, WEEKLY_CLUB_FOCUS, WEEKLY_MILESTONES, WEEKLY_CUMULATIVE } from "../lib/store";
import { useAuth } from "../lib/auth";
import type { Tier } from "../lib/store";

const TIER_LABELS: Record<Tier, string> = { 1: "T1", 2: "T2", 3: "T3", 4: "T4" };

export default function WeekPlan() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tier, currentWeek, getWeekReels, getWeekReport } = usePlanStore(
    user?.id ?? "",
    user?.teamId ?? "",
    user?.tier ?? 4
  );
  const [expandedWeek, setExpandedWeek] = useState<number | null>(currentWeek);

  const weeks = useMemo(() => Array.from({ length: 13 }, (_, i) => i + 1), []);

  return (
    <section aria-label="Campaign Tasks — 13-Week Execution Plan">
      {/* Section header */}
      <div className="px-5 py-3 border-b border-[#1A1A1A] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#666]">
            Campaign Tasks
          </span>
          <span className="text-[10px] font-mono text-[#3A3A3A]">13 Weeks</span>
        </div>
        <span className="text-[10px] font-bold font-mono text-[#C8FF00]">
          {TIER_LABELS[tier as 1 | 2 | 3 | 4] ?? "T4"} · Wk {currentWeek}
        </span>
      </div>

      {/* Week rows */}
      <div className="divide-y divide-[#1A1A1A] max-h-[640px] overflow-y-auto">
        {weeks.map((week) => {
          const reels = getWeekReels(week);
          const report = getWeekReport(week);
          const postedCount = reels.filter((r) => r.posted).length;
          const isCurrent = week === currentWeek;
          const isPast = week < currentWeek;
          const isExpanded = expandedWeek === week;
          const milestone = WEEKLY_MILESTONES.find((m) => m.week === week);
          const targets = WEEKLY_CUMULATIVE[tier as 1 | 2 | 3 | 4] ?? WEEKLY_CUMULATIVE[4];
          const cumTarget = targets[week - 1];

          return (
            <div key={week}>
              <button
                onClick={() => setExpandedWeek(isExpanded ? null : week)}
                aria-expanded={isExpanded}
                aria-controls={`week-${week}-detail`}
                className={`w-full flex items-center gap-0 text-left transition-colors ${
                  isCurrent ? "bg-[#C8FF00]/[0.04]" : "hover:bg-[#181818]"
                }`}
              >
                {/* Week number column */}
                <div
                  className={`w-14 shrink-0 flex items-center justify-center self-stretch border-r ${
                    isCurrent
                      ? "bg-[#C8FF00] border-[#C8FF00] text-[#000]"
                      : isPast
                      ? "bg-[#181818] border-[#1A1A1A] text-[#444]"
                      : "bg-[#0A0A0A] border-[#1A1A1A] text-[#3A3A3A]"
                  }`}
                >
                  <span className="text-[11px] font-black tabular-nums">{week}</span>
                </div>

                {/* Row content */}
                <div className="flex-1 px-4 py-3 flex items-center gap-4 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-bold ${
                          isCurrent ? "text-[#F0F0F0]" : isPast ? "text-[#555]" : "text-[#888]"
                        }`}
                      >
                        {WEEK_NAMES[week - 1]}
                      </span>
                      <span className="text-[10px] text-[#2E2E2E] font-mono">{WEEK_DATES[week - 1]}</span>
                      {milestone && (
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#C8FF00] border border-[#C8FF00]/20 px-1.5 py-0.5">
                          {milestone.isBonus ? "BONUS" : "MILESTONE"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] font-mono text-[#4488FF] tabular-nums">
                        {cumTarget.toLocaleString()} users
                      </span>
                      <span
                        className={`text-[10px] font-mono tabular-nums ${
                          postedCount >= 3
                            ? "text-[#C8FF00]"
                            : postedCount > 0
                            ? "text-[#FF5500]"
                            : "text-[#3A3A3A]"
                        }`}
                      >
                        {postedCount}/3 reels
                      </span>
                      {report?.submitted && (
                        <span className="text-[10px] font-mono text-[#C8FF00]">✓ reported</span>
                      )}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#3A3A3A"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {/* Expanded detail */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    id={`week-${week}-detail`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="ml-14 border-t border-[#1A1A1A] bg-[#0D0D0D]">
                      {/* Reels checklist */}
                      <div className="border-b border-[#1A1A1A]">
                        <div className="px-4 py-2 border-b border-[#1A1A1A]">
                          <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-[#444]">
                            3 Reels This Week
                          </span>
                        </div>
                        {[
                          { type: "meme" as const, label: "Meme", desc: WEEKLY_REELS[week - 1].meme },
                          { type: "campus_culture" as const, label: "Culture / Story", desc: WEEKLY_REELS[week - 1].culture },
                          { type: "student_conversation" as const, label: "Conversation / Brand", desc: WEEKLY_REELS[week - 1].conversation },
                        ].map((r) => {
                          const reelEntry = reels.find((re) => re.type === r.type);
                          const done = reelEntry?.posted;
                          return (
                            <div
                              key={r.type}
                              className="flex items-start gap-3 px-4 py-2.5 border-b border-[#1A1A1A] last:border-0"
                            >
                              <div
                                className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 mt-0.5 ${
                                  done ? "bg-[#C8FF00] border-[#C8FF00]" : "border-[#2E2E2E]"
                                }`}
                              >
                                {done && (
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" aria-hidden="true">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className={`text-[11px] font-bold ${done ? "text-[#C8FF00]" : "text-[#666]"}`}>
                                  {r.label}
                                </span>
                                <p className="text-[10px] text-[#3A3A3A] leading-relaxed mt-0.5">{r.desc}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Club focus */}
                      <div className="px-4 py-3 border-b border-[#1A1A1A] flex items-start gap-3">
                        <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-[#FF5500] shrink-0 mt-0.5 w-14">
                          Focus
                        </span>
                        <p className="text-[11px] text-[#666] leading-relaxed">
                          {WEEKLY_CLUB_FOCUS[week - 1].focus}
                        </p>
                      </div>

                      {/* Milestone */}
                      {milestone && (
                        <div className="px-4 py-3 border-b border-[#1A1A1A] flex items-start gap-3">
                          <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-[#C8FF00] shrink-0 mt-0.5 w-14">
                            {milestone.isBonus ? "Bonus" : "Target"}
                          </span>
                          <div>
                            <p className="text-[11px] font-bold text-[#F0F0F0]">
                              {milestone.name}{" "}
                              <span className="text-[#C8FF00]">{milestone.reward}</span>
                            </p>
                            <p className="text-[10px] text-[#3A3A3A] mt-0.5">
                              {milestone.pctTarget}% of tier target → {targets[week - 1].toLocaleString()} users
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Report status */}
                      {report?.submitted && (
                        <div className="px-4 py-2.5 flex items-center gap-2">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth="3" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span className="text-[10px] font-bold text-[#C8FF00] uppercase tracking-[0.1em]">
                            Monday report submitted
                          </span>
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
