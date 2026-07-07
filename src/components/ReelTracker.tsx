import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { usePlanStore } from "../lib/store";
import { useAuth } from "../lib/auth";
import type { ReelType } from "../lib/store";

const REEL_TYPE_META: Record<ReelType, { label: string; color: string; icon: string }> = {
  meme: { label: "Meme", color: "#0066FF", icon: "🎭" },
  campus_culture: { label: "Culture/Story", color: "#FF6A00", icon: "📸" },
  student_conversation: { label: "Conversation/Branding", color: "#CCFF00", icon: "🎙" },
};

export default function ReelTracker() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    currentWeek,
    reels,
    toggleReelPosted,
    getWeekReels,
    tier,
    weeklyCumulative,
    weeklyReels,
    weekNames,
    weekDates,
  } = usePlanStore(
    user?.id ?? "",
    user?.teamId ?? "",
    user?.tier ?? 4
  );
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);

  const weekReels = useMemo(() => getWeekReels(selectedWeek), [getWeekReels, selectedWeek]);
  const weekData = weeklyReels[selectedWeek - 1] ?? { meme: "", culture: "", conversation: "" };
  const postedCount = weekReels.filter((r) => r.posted).length;

  const weeks = useMemo(() => Array.from({ length: 13 }, (_, i) => i + 1), []);

  const allReelTypes: ReelType[] = ["meme", "campus_culture", "student_conversation"];

  const targets = weeklyCumulative[tier as 1 | 2 | 3 | 4] ?? weeklyCumulative[4] ?? [];
  const cumTarget = targets[selectedWeek - 1] ?? 0;

  return (
    <section className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 shadow-[0_0_40px_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white">Reel Tracker</h2>
        <span className="px-3 py-1.5 rounded-lg bg-[#CCFF00]/10 border border-[#CCFF00]/20 text-xs font-bold text-[#CCFF00]">
          {postedCount}/3 posted
        </span>
      </div>

      {/* Week selector */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {weeks.map((wk) => (
          <button
            key={wk}
            onClick={() => setSelectedWeek(wk)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              wk === selectedWeek
                ? "bg-[#CCFF00] text-black"
                : wk === currentWeek
                ? "bg-[#CCFF00]/10 text-[#CCFF00]"
                : "bg-[#1A1A1A]/50 text-[#666] hover:text-white"
            }`}
          >
            W{wk}
          </button>
        ))}
      </div>

      {/* Week header */}
      <div className="mb-4 px-3 py-2 rounded-lg bg-[#000]/40 border border-[#1A1A1A]/30">
        <p className="text-sm font-bold text-white">{weekNames[selectedWeek - 1]}</p>
        <p className="text-xs text-[#555]">{weekDates[selectedWeek - 1]} · Target: {cumTarget.toLocaleString()} cumulative users</p>
      </div>

      {/* Reel cards */}
      <div className="space-y-3">
        {allReelTypes.map((type) => {
          const meta = REEL_TYPE_META[type];
          const reelEntry = weekReels.find((r) => r.type === type);
          const posted = reelEntry?.posted ?? false;
          const desc = type === "meme" ? weekData.meme : type === "campus_culture" ? weekData.culture : weekData.conversation;

          return (
            <div
              key={type}
              className={`rounded-xl border p-4 transition-all ${
                posted ? "bg-[#CCFF00]/5 border-[#CCFF00]/20" : "bg-[#000]/40 border-[#1A1A1A]/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                    style={{ backgroundColor: `${meta.color}18`, border: `1px solid ${meta.color}30` }}
                  >
                    {meta.icon}
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white">{meta.label}</span>
                    <p className="text-[10px] text-[#555]">{desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleReelPosted({ userId: user?.id ?? "", week: selectedWeek, type })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    posted
                      ? "bg-[#CCFF00] text-black hover:opacity-80"
                      : "border border-[#333] text-[#666] hover:border-[#CCFF00]/40 hover:text-[#CCFF00]"
                  }`}
                >
                  {posted ? "Posted ✓" : "Mark Posted"}
                </button>
              </div>

              {reelEntry?.posted && (
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="url"
                    placeholder="Reel URL (optional)"
                    defaultValue={reelEntry.url ?? ""}
                    onChange={(e) => toggleReelPosted({ userId: user?.id ?? "", week: selectedWeek, type, url: e.target.value })}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#000] border border-[#1A1A1A] text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#CCFF00]/40"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div className="mt-4 px-4 py-3 rounded-xl bg-[#000]/40 border border-[#1A1A1A]/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#999]">Weekly Reel Progress</span>
          <span className="text-xs text-[#666]">{postedCount}/3</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[#1A1A1A] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#CCFF00] transition-all"
            style={{ width: `${(postedCount / 3) * 100}%` }}
          />
        </div>
      </div>
    </section>
  );
}
