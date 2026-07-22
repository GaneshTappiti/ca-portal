import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { usePlanStore } from "../lib/store";
import { useAuth } from "../lib/auth";

export default function WeeklyReportPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    currentWeek,
    tier,
    reports,
    submitReport,
    getWeekReport,
    reels,
    clubs,
    weeklyCumulative,
    weeklyMilestones,
    weekNames,
    weekDates,
  } = usePlanStore(
    user?.id ?? "",
    user?.teamId ?? "",
    user?.tier ?? 4
  );

  const [week, setWeek] = useState(currentWeek);
  const [formData, setFormData] = useState({ signups: 0, win: "", blocker: "" });
  const [submitted, setSubmitted] = useState(false);

  const existing = getWeekReport(week);
  const targets = weeklyCumulative[tier] ?? weeklyCumulative[4] ?? [];
  const cumTarget = targets[week - 1] ?? 0;
  const prevCum = week > 1 ? (targets[week - 2] ?? 0) : 0;
  const weekTarget = cumTarget - prevCum;

  const weekReels = reels.filter((r) => r.week === week);
  const postedReels = weekReels.filter((r) => r.posted).length;
  const activeClubs = clubs.filter((c) => c.active).length;

  const milestone = weeklyMilestones.find((m) => m.week === week);

  const handleSubmit = async () => {
    await submitReport({
      userId: user?.id ?? "",
      week,
      signups: formData.signups,
      reelsPosted: postedReels,
      clubsActive: activeClubs,
      win: formData.win,
      blocker: formData.blocker,
    });
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  const weeks = useMemo(() => Array.from({ length: 13 }, (_, i) => i + 1), []);

  return (
    <section className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 shadow-[0_0_40px_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white">Weekly Report</h2>
        <span className="text-[10px] text-[#555]">Due: Monday 10am</span>
      </div>

      {/* Week selector */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {weeks.map((wk) => {
          const rpt = getWeekReport(wk);
          return (
            <button
              key={wk}
              onClick={() => { setWeek(wk); setFormData({ signups: rpt?.signups ?? 0, win: rpt?.win ?? "", blocker: rpt?.blocker ?? "" }); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1 ${
                wk === week
                  ? "bg-[#CCFF00] text-black"
                  : rpt?.submitted
                  ? "bg-[#CCFF00]/10 text-[#CCFF00]"
                  : wk < currentWeek
                  ? "bg-[#FF6A00]/10 text-[#FF6A00]"
                  : "bg-[#1A1A1A]/50 text-[#666]"
              }`}
            >
              W{wk}
              {rpt?.submitted && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
            </button>
          );
        })}
      </div>

      <div className="mb-4 px-3 py-2 rounded-lg bg-[#000]/40 border border-[#1A1A1A]/30">
        <p className="text-sm font-bold text-white">{weekNames[week - 1]}</p>
        <p className="text-xs text-[#555]">{weekDates[week - 1]} · Target this week: <span className="text-[#CCFF00] font-semibold">+{weekTarget}</span> · Cumulative: <span className="text-[#0066FF] font-semibold">{cumTarget.toLocaleString()}</span></p>
      </div>

      {existing?.submitted ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Sign-ups (week)", value: existing.signups, color: "#0066FF" },
              { label: "Reels Posted", value: `${existing.reelsPosted}/3`, color: "#FF6A00" },
              { label: "Active Clubs", value: existing.clubsActive, color: "#CCFF00" },
            ].map((s) => (
              <div key={s.label} className="px-3 py-2 rounded-lg bg-[#000]/40 border border-[#1A1A1A]/30 text-center">
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-[#555]">{s.label}</p>
              </div>
            ))}
          </div>
          {existing.win && (
            <div className="px-3 py-2 rounded-lg bg-[#CCFF00]/5 border border-[#CCFF00]/10">
              <p className="text-[10px] font-semibold text-[#CCFF00] uppercase">Win</p>
              <p className="text-xs text-[#999]">{existing.win}</p>
            </div>
          )}
          {existing.blocker && (
            <div className="px-3 py-2 rounded-lg bg-[#FF6A00]/5 border border-[#FF6A00]/10">
              <p className="text-[10px] font-semibold text-[#FF6A00] uppercase">Blocker</p>
              <p className="text-xs text-[#999]">{existing.blocker}</p>
            </div>
          )}
          {milestone && (
            <div className="px-3 py-2 rounded-lg bg-[#CCFF00]/5 border border-[#CCFF00]/15">
              <p className="text-[10px] font-semibold text-[#CCFF00] uppercase">Milestone {milestone.label} — {milestone.reward}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#999] uppercase tracking-wider">New sign-ups this week</label>
            <input
              type="number"
              min={0}
              value={formData.signups}
              onChange={(e) => setFormData((f) => ({ ...f, signups: parseInt(e.target.value) || 0 }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[#000] border border-[#1A1A1A] text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#CCFF00]/40 focus:ring-1 focus:ring-[#CCFF00]/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-[#666]">
            <div className="px-3 py-2 rounded-lg bg-[#000]/40 border border-[#1A1A1A]/30 text-center">
              <span className="text-[#FF6A00] font-bold">{postedReels}</span> / 3 reels posted
            </div>
            <div className="px-3 py-2 rounded-lg bg-[#000]/40 border border-[#1A1A1A]/30 text-center">
              <span className="text-[#0066FF] font-bold">{activeClubs}</span> active clubs
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#999] uppercase tracking-wider">One Win</label>
            <textarea
              value={formData.win}
              onChange={(e) => setFormData((f) => ({ ...f, win: e.target.value }))}
              placeholder="What went well this week?"
              rows={2}
              maxLength={500}
              className="w-full px-4 py-2.5 rounded-xl bg-[#000] border border-[#1A1A1A] text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#CCFF00]/40 focus:ring-1 focus:ring-[#CCFF00]/20 resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#999] uppercase tracking-wider">One Blocker</label>
            <textarea
              value={formData.blocker}
              onChange={(e) => setFormData((f) => ({ ...f, blocker: e.target.value }))}
              placeholder="What's blocking you?"
              rows={2}
              maxLength={500}
              className="w-full px-4 py-2.5 rounded-xl bg-[#000] border border-[#1A1A1A] text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#CCFF00]/40 focus:ring-1 focus:ring-[#CCFF00]/20 resize-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!formData.signups && !formData.win}
            className="w-full px-4 py-3 rounded-xl bg-[#CCFF00] text-black text-sm font-bold hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Submit Week {week} Report
          </button>
        </div>
      )}

      <AnimatePresence>
        {submitted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 px-4 py-2 rounded-lg bg-[#CCFF00]/10 border border-[#CCFF00]/20 text-center"
          >
            <span className="text-xs font-bold text-[#CCFF00]">✓ Report submitted for Week {week}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
