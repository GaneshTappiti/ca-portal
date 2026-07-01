import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlanStore } from "../lib/store";

const CLUB_DOMAINS = [
  "Cultural", "Technical", "Sports", "Literary",
  "Social", "Entrepreneurship", "Music/Arts", "Academic",
];

export default function ClubOnboardingTracker() {
  const { clubs, addClub, updateClub, removeClub, activeClubsCount, totalOnboardedClubs } = usePlanStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newClub, setNewClub] = useState({ name: "", domain: CLUB_DOMAINS[0], presidentName: "" });

  const handleAdd = () => {
    if (!newClub.name.trim()) return;
    addClub({
      id: `club-${Date.now()}`,
      name: newClub.name.trim(),
      domain: newClub.domain,
      presidentName: newClub.presidentName.trim() || undefined,
      onboarded: true,
      onboardedAt: Date.now(),
      eventCount: 0,
      active: true,
    });
    setNewClub({ name: "", domain: CLUB_DOMAINS[0], presidentName: "" });
    setShowAdd(false);
  };

  return (
    <section className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 shadow-[0_0_40px_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-white">Club Onboarding</h2>
          <p className="text-xs text-[#666]">{activeClubsCount} active · {totalOnboardedClubs} total onboarded · Target: 8+</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-1.5 rounded-lg bg-[#CCFF00] text-black text-xs font-bold hover:opacity-90 transition-all"
        >
          + Add Club
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-4 px-4 py-3 rounded-xl bg-[#000]/40 border border-[#1A1A1A]/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#999]">Onboarding Progress</span>
          <span className="text-xs text-[#666]">{Math.min(activeClubsCount, 8)}/8</span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-[#1A1A1A] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#FF6A00] to-[#CCFF00] transition-all"
            style={{ width: `${Math.min((activeClubsCount / 8) * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div
              key={n}
              className={`w-2 h-2 rounded-full ${activeClubsCount >= n ? "bg-[#CCFF00]" : "bg-[#333]"}`}
            />
          ))}
        </div>
      </div>

      {/* Add club form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="p-4 rounded-xl bg-[#000]/40 border border-[#1A1A1A]/30 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#999] uppercase">Club Name</label>
                <input
                  value={newClub.name}
                  onChange={(e) => setNewClub((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Coding Club"
                  className="w-full px-3 py-2 rounded-lg bg-[#000] border border-[#1A1A1A] text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#CCFF00]/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#999] uppercase">Domain</label>
                <select
                  value={newClub.domain}
                  onChange={(e) => setNewClub((f) => ({ ...f, domain: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#000] border border-[#1A1A1A] text-sm text-white focus:outline-none focus:border-[#CCFF00]/40"
                >
                  {CLUB_DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#999] uppercase">President Name</label>
                <input
                  value={newClub.presidentName}
                  onChange={(e) => setNewClub((f) => ({ ...f, presidentName: e.target.value }))}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-lg bg-[#000] border border-[#1A1A1A] text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#CCFF00]/40"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={!newClub.name.trim()}
                className="w-full px-4 py-2 rounded-xl bg-[#CCFF00] text-black text-sm font-bold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Onboard Club
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Club list */}
      <div className="space-y-2 max-h-[320px] overflow-y-auto">
        <AnimatePresence>
          {clubs.map((club) => (
            <motion.div
              key={club.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                club.active
                  ? "bg-[#CCFF00]/5 border-[#CCFF00]/15"
                  : "bg-[#000]/40 border-[#1A1A1A]/30 opacity-60"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                club.active ? "bg-[#CCFF00]/20 text-[#CCFF00]" : "bg-[#1A1A1A] text-[#666]"
              }`}>
                {club.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{club.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-[#555]">
                  {club.presidentName && <span>{club.presidentName}</span>}
                  {club.eventCount > 0 && <span>{club.eventCount} events</span>}
                  {club.onboardedAt && <span>Onboarded {new Date(club.onboardedAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => updateClub(club.id, { active: !club.active })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                    club.active
                      ? "bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/20"
                      : "bg-[#1A1A1A]/50 text-[#666] border border-[#333]"
                  }`}
                >
                  {club.active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => removeClub(club.id)}
                  className="p-1.5 rounded-lg hover:bg-[#FF6A00]/10 text-[#555] hover:text-[#FF6A00] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {clubs.length === 0 && (
          <p className="text-xs text-[#555] text-center py-8">No clubs onboarded yet. Add your first club above.</p>
        )}
      </div>
    </section>
  );
}
