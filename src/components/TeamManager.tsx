/**
 * TeamManager.tsx — Team Management and Real Invites
 * Design language: Sharp edges, bg-[#111], border border-[#222], h-[2px] top accent bar.
 * Preserves exact color scheme (#CCFF00, #FF5500, #4488FF, #111, #0A0A0A).
 */

import { useState, useCallback, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useTeamStore } from "../lib/store";
import { useAuth } from "../lib/auth";
import type { AuthRole, InviteCode, TeamMember } from "../lib/types";

// ─── Icons ────────────────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF5500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ─── Member row component ─────────────────────────────────────────────────────

const MemberRow = memo(function MemberRow({
  member,
  canRemove,
  onRemove,
}: {
  member: TeamMember;
  canRemove: boolean;
  onRemove: (member: TeamMember) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-3 px-3 py-3 bg-[#0A0A0A] border border-[#1A1A1A]"
    >
      <div className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center text-xs font-bold text-[#C8FF00] shrink-0">
        {member.name ? member.name.charAt(0).toUpperCase() : "M"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-[#F0F0F0] truncate">{member.name}</p>
          <span className={`px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider border ${
            member.role === "LEAD" ? "text-[#C8FF00] border-[#C8FF00]/30" : "text-[#4488FF] border-[#4488FF]/30"
          }`}>
            {member.role}
          </span>
        </div>
        <p className="text-[10px] text-[#555] truncate font-mono">{member.email}</p>
      </div>
      <div className="text-right shrink-0">
        <span className="text-[11px] font-bold text-[#C8FF00] font-mono block">
          {member.totalPoints} pts
        </span>
        <span className="text-[9px] text-[#444] font-mono block">
          Joined {new Date(member.createdAt).toLocaleDateString()}
        </span>
      </div>
      {canRemove && member.role !== "LEAD" && (
        <button
          onClick={() => onRemove(member)}
          aria-label={`Remove ${member.name} from team`}
          className="p-1.5 hover:bg-[#FF5500]/10 transition-colors focus-visible:outline-none"
        >
          <TrashIcon />
        </button>
      )}
    </motion.div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

interface TeamManagerProps {
  role: AuthRole;
  userEmail: string;
  leadEmail: string;
}

export default function TeamManager({ role }: TeamManagerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { members, invites, generateInvite, acceptInvite, removeMember, isLoading } = useTeamStore(
    user?.teamId ?? "",
    user?.id ?? ""
  );

  const [codeInput, setCodeInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);

  // Invite generation form state
  const [domainRole, setDomainRole] = useState("Growth & Outreach Lead");
  const [expiryDays, setExpiryDays] = useState(7);
  const [generating, setGenerating] = useState(false);
  const [newlyGeneratedCode, setNewlyGeneratedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Member removal modal state
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleCopyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }, []);

  const handleGenerateInvite = useCallback(async () => {
    if (!user?.teamId || !user?.id) return;
    setGenerating(true);
    try {
      const code = await generateInvite({
        domainRole,
        expiryDays,
      });
      setNewlyGeneratedCode(code);
    } catch (err) {
      console.error("Failed to generate invite:", err);
    } finally {
      setGenerating(false);
    }
  }, [user, domainRole, expiryDays, generateInvite]);

  const handleJoin = useCallback(async () => {
    setJoinError(null);
    setJoinSuccess(false);
    if (!codeInput.trim()) {
      setJoinError("Please enter an invite code.");
      return;
    }
    try {
      await acceptInvite({ code: codeInput.trim(), userId: user?.id ?? "" });
      setJoinSuccess(true);
      setCodeInput("");
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : t("errors.genericError"));
    }
  }, [codeInput, user, acceptInvite, t]);

  const handleConfirmRemove = useCallback(async () => {
    if (!memberToRemove) return;
    setRemoving(true);
    try {
      await removeMember(memberToRemove.id);
      setMemberToRemove(null);
    } catch (err) {
      console.error("Failed to remove member:", err);
    } finally {
      setRemoving(false);
    }
  }, [memberToRemove, removeMember]);

  // MEMBER view
  if (role === "MEMBER") {
    const isInTeam = !!user?.teamId;
    return (
      <section
        aria-labelledby="team-section-heading"
        className="bg-[#111] border border-[#222] p-5 sm:p-6 space-y-4 relative"
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#C8FF00]" aria-hidden="true" />
        <h2 id="team-section-heading" className="text-base font-bold text-[#F0F0F0]">
          Team Portal
        </h2>

        {isInTeam ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-[#C8FF00]/5 border border-[#C8FF00]/20">
            <div className="w-8 h-8 rounded bg-[#C8FF00]/10 flex items-center justify-center">
              <UserIcon />
            </div>
            <div>
              <p className="text-xs text-[#A0A0A0]">
                Active member of campus team: <span className="text-[#C8FF00] font-mono font-bold">{user?.campus}</span>
              </p>
              <p className="text-[10px] text-[#555] font-mono mt-0.5">
                Total Earned Points: <span className="text-[#C8FF00] font-bold">{user?.totalPoints ?? 0} PTS</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="join-code" className="text-[10px] font-bold text-[#555] uppercase tracking-wider">
                Enter Team Invite Code
              </label>
              <input
                id="join-code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="CLSTR-XXXXXX"
                className="w-full px-4 py-2.5 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono uppercase tracking-widest focus:outline-none focus:border-[#C8FF00]/40"
              />
            </div>

            <AnimatePresence>
              {joinError && (
                <p role="alert" className="text-xs text-[#FF5500] font-bold">{joinError}</p>
              )}
              {joinSuccess && (
                <p role="status" className="text-xs text-[#C8FF00] font-bold">Successfully joined team!</p>
              )}
            </AnimatePresence>

            <button
              onClick={handleJoin}
              className="w-full px-4 py-2.5 bg-[#C8FF00] text-black text-xs font-bold hover:bg-[#b5e600] transition-colors"
            >
              Redeem Code & Join Team
            </button>
          </div>
        )}
      </section>
    );
  }

  // LEAD / SUPER_ADMIN view
  return (
    <section
      aria-labelledby="team-section-heading"
      className="bg-[#111] border border-[#222] p-5 sm:p-6 space-y-6 relative"
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#C8FF00]" aria-hidden="true" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 id="team-section-heading" className="text-base font-bold text-[#F0F0F0]">
            Team & Invites Control
          </h2>
          <p className="text-xs text-[#555] font-mono mt-0.5">
            Manage your campus CAs, domain leads, and active team invite codes.
          </p>
        </div>
      </div>

      {/* Generate New Invite Code Panel */}
      <div className="bg-[#0A0A0A] border border-[#222] p-4 space-y-4">
        <h3 className="text-xs font-bold text-[#F0F0F0] uppercase tracking-wider">Generate Team Invite</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-[#555] uppercase">Target Domain Role</label>
            <select
              value={domainRole}
              onChange={(e) => setDomainRole(e.target.value)}
              className="px-3 py-2 bg-[#111] border border-[#222] text-xs text-[#F0F0F0] font-mono"
            >
              <option>Growth & Outreach Lead</option>
              <option>Community Lead</option>
              <option>Clubs & Events Lead</option>
              <option>Foot Soldier</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-[#555] uppercase">Expiration</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="px-3 py-2 bg-[#111] border border-[#222] text-xs text-[#F0F0F0] font-mono"
            >
              <option value={3}>3 Days</option>
              <option value={7}>7 Days</option>
              <option value={14}>14 Days</option>
              <option value={30}>30 Days</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerateInvite}
          disabled={generating}
          className="px-4 py-2 bg-[#C8FF00] hover:bg-[#b5e600] text-black text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          <PlusIcon />
          {generating ? "Generating Code…" : "Generate Invite Code"}
        </button>

        {newlyGeneratedCode && (
          <div className="p-3 bg-[#C8FF00]/10 border border-[#C8FF00]/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-[#C8FF00] block uppercase">New Invite Generated</span>
              <code className="text-sm font-mono font-black text-white">{newlyGeneratedCode}</code>
            </div>
            <button
              onClick={() => handleCopyCode(newlyGeneratedCode)}
              className="px-3 py-1.5 bg-[#C8FF00] text-black text-xs font-bold flex items-center gap-1"
            >
              <CopyIcon />
              {copiedCode === newlyGeneratedCode ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
      </div>

      {/* Active Invites Table */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#555] uppercase tracking-wider">Active Team Invites</h3>
        {invites.length === 0 ? (
          <p className="text-xs text-[#444] font-mono py-2 italic">No active unused invite codes.</p>
        ) : (
          <div className="divide-y divide-[#1A1A1A] border border-[#1A1A1A] bg-[#0A0A0A]">
            {invites.map((inv) => (
              <div key={inv.code} className="p-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono font-bold text-[#C8FF00]">{inv.code}</code>
                    {inv.domainRole && (
                      <span className="text-[9px] font-mono text-[#888] bg-[#1A1A1A] px-1.5 py-0.5">
                        {inv.domainRole}
                      </span>
                    )}
                  </div>
                  {inv.expiresAt && (
                    <span className="text-[9px] text-[#555] font-mono block mt-0.5">
                      Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleCopyCode(inv.code)}
                  className="px-2.5 py-1 bg-[#1A1A1A] hover:bg-[#222] border border-[#333] text-xs font-mono text-[#D0D0D0]"
                >
                  {copiedCode === inv.code ? "Copied" : "Copy"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Roster */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[#555] uppercase tracking-wider">{t("team.members")}</h3>
          <span className="text-xs font-mono text-[#888]">{members.length} Members</span>
        </div>

        {members.length === 0 ? (
          <p className="text-xs text-[#444] py-4 text-center font-mono">No teammates in this team yet.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                canRemove={role === "LEAD" || role === "SUPER_ADMIN"}
                onRemove={(mem) => setMemberToRemove(mem)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Member Removal Confirmation Modal */}
      <AnimatePresence>
        {memberToRemove && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-[#111] border border-[#2E2E2E] p-6 space-y-4 relative"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#FF5500]" />

              <h3 className="text-base font-bold text-[#F0F0F0]">Confirm Member Removal</h3>
              <p className="text-xs text-[#888] font-mono leading-relaxed">
                Are you sure you want to remove <strong className="text-white">{memberToRemove.name}</strong> from your team? They will be un-linked from this campus squad.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setMemberToRemove(null)}
                  className="px-3 py-1.5 text-xs text-[#888] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRemove}
                  disabled={removing}
                  className="px-4 py-2 bg-[#FF5500] text-black text-xs font-bold hover:bg-[#e04b00]"
                >
                  {removing ? "Removing…" : "Confirm Removal"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
