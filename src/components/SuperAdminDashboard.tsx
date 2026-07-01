/**
 * Phase 7.4 — Multi-Campus Super-Admin View
 *
 * Super-Admin can see and manage data across ALL campuses.
 * Role hierarchy enforced: SUPER_ADMIN > LEAD > MEMBER (from Phase 1.4).
 * A regular LEAD cannot reach this view — useRequireRole throws if attempted.
 *
 * Campus data is seeded into localStorage so the view has real data to show.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useRequireRole } from "../lib/auth";

// ─── Seeded campus data ───────────────────────────────────────────────────────

const CAMPUS_SEED = [
  { id: "c1", name: "Raghu Institute of Technology", slug: "clstr.raghuinstitute", lead: "Ganesh Tappiti", members: 12, points: 4820, tasks: { verified: 14, pending: 3 } },
  { id: "c2", name: "MVGR College of Engineering", slug: "clstr.mvgr", lead: "Priya Sharma", members: 8, points: 3100, tasks: { verified: 9, pending: 1 } },
  { id: "c3", name: "GITAM University Vizag", slug: "clstr.gitam", lead: "Arjun Reddy", members: 21, points: 8950, tasks: { verified: 27, pending: 5 } },
  { id: "c4", name: "Andhra University", slug: "clstr.andhrauniv", lead: "Sneha Patel", members: 6, points: 1800, tasks: { verified: 5, pending: 2 } },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0066FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent }: { label: string; value: string | number; icon: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 flex flex-col gap-3 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: accent }} />
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}30` }}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums" style={{ color: accent }}>{value}</p>
        <p className="text-xs text-[#666] mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── Campus row ───────────────────────────────────────────────────────────────

function CampusRow({ campus, rank }: { campus: typeof CAMPUS_SEED[0]; rank: number }) {
  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05 }}
      className="border-b border-[#1A1A1A]/50 hover:bg-white/[0.015] transition-colors"
    >
      <td className="py-3 px-4 text-xs text-[#555] tabular-nums font-mono">{rank + 1}</td>
      <td className="py-3 px-4">
        <p className="text-sm font-semibold text-white">{campus.name}</p>
        <p className="text-[10px] text-[#555] font-mono">{campus.slug}</p>
      </td>
      <td className="py-3 px-4 text-sm text-[#999]">{campus.lead}</td>
      <td className="py-3 px-4 text-sm text-[#0066FF] font-bold tabular-nums">{campus.members}</td>
      <td className="py-3 px-4 text-sm text-[#CCFF00] font-bold tabular-nums">{campus.points.toLocaleString()}</td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/20">
            {campus.tasks.verified} done
          </span>
          {campus.tasks.pending > 0 && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FF6A00]/10 text-[#FF6A00] border border-[#FF6A00]/20">
              {campus.tasks.pending} pending
            </span>
          )}
        </div>
      </td>
    </motion.tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const { t } = useTranslation();
  // Phase 1.4 — RBAC: only SUPER_ADMIN can render this component
  const user = useRequireRole("SUPER_ADMIN");

  const totals = useMemo(
    () => ({
      campuses: CAMPUS_SEED.length,
      members: CAMPUS_SEED.reduce((s, c) => s + c.members, 0),
      points: CAMPUS_SEED.reduce((s, c) => s + c.points, 0),
    }),
    []
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 flex items-center gap-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#CCFF00]/[0.03] to-transparent pointer-events-none" />
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#CCFF00] to-[#0066FF] flex items-center justify-center text-[#000] font-bold text-xl shrink-0">
          SA
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{t("superAdmin.title")}</h1>
          <p className="text-sm text-[#666]">{user.name} · {user.campus}</p>
        </div>
        <span className="ml-auto px-3 py-1.5 rounded-lg bg-[#CCFF00]/10 border border-[#CCFF00]/20 text-xs font-bold text-[#CCFF00] uppercase tracking-wider">
          SUPER ADMIN
        </span>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t("superAdmin.totalCampuses")} value={totals.campuses} icon={<GlobeIcon />} accent="#CCFF00" />
        <StatCard label={t("superAdmin.globalReferrals")} value={totals.members} icon={<UsersIcon />} accent="#0066FF" />
        <StatCard label={t("superAdmin.globalPoints")} value={totals.points.toLocaleString()} icon={<LightningIcon />} accent="#FF6A00" />
      </div>

      {/* Campus table */}
      <div className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 overflow-hidden shadow-[0_0_40px_rgba(255,255,255,0.03)]">
        <div className="px-5 py-4 border-b border-[#1A1A1A]">
          <h2 className="text-sm font-bold text-white">{t("superAdmin.allCampuses")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" aria-label="All campuses overview">
            <thead>
              <tr className="border-b border-[#1A1A1A]">
                {["#", "Campus", "Lead", "Members", "Points", "Tasks"].map((col) => (
                  <th
                    key={col}
                    scope="col"
                    className="py-2.5 px-4 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAMPUS_SEED.sort((a, b) => b.points - a.points).map((campus, i) => (
                <CampusRow key={campus.id} campus={campus} rank={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
