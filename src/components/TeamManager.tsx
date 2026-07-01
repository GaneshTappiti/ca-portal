import { useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useTeamStore } from "../lib/store";
import { inviteSchema, parseErrors } from "../lib/schemas";
import type { AuthRole } from "../lib/auth";

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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

const MemberRow = memo(function MemberRow({
  email,
  name,
  domain,
  joinedAt,
  canRemove,
  onRemove,
}: {
  email: string;
  name: string;
  domain?: string;
  joinedAt: number;
  canRemove: boolean;
  onRemove: (email: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.02] border border-[#1A1A1A]/50"
    >
      <div className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center text-xs font-bold text-[#999]">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{name}</p>
        <p className="text-[10px] text-[#555] truncate">{domain || email}</p>
      </div>
      <span className="text-[10px] text-[#555] hidden sm:block whitespace-nowrap">
        {t("team.joinedAt", { date: new Date(joinedAt).toLocaleDateString() })}
      </span>
      {canRemove && (
        <button
          onClick={() => onRemove(email)}
          aria-label={`Remove ${name} from team`}
          className="p-1.5 rounded-lg hover:bg-[#FF6A00]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/50"
        >
          <TrashIcon />
        </button>
      )}
    </motion.div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

interface TeamManagerProps {
  role: AuthRole;
  userEmail: string;
  leadEmail: string;
}

const DOMAINS = ["Clubs & Events", "Placement & Career", "Community", "Growth & Outreach", "CollabHub"];

export default function TeamManager({ role, userEmail, leadEmail }: TeamManagerProps) {
  const { t } = useTranslation();
  const { members, invites, generateInvite, acceptInvite, removeMember } = useTeamStore();

  const [codeInput, setCodeInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [selectedDomain, setSelectedDomain] = useState(DOMAINS[0]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const latestInvite = invites.find((i) => !i.usedBy);

  const handleGenerateInvite = useCallback(() => {
    generateInvite(userEmail, selectedDomain);
  }, [generateInvite, userEmail, selectedDomain]);

  const handleCopy = useCallback(() => {
    if (!latestInvite) return;
    navigator.clipboard.writeText(latestInvite.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [latestInvite]);

  const handleJoin = useCallback(() => {
    setJoinError(null);
    setJoinSuccess(false);

    const validation = inviteSchema.safeParse({ code: codeInput });
    if (!validation.success) {
      const errs = parseErrors(validation);
      setJoinError(errs["code"] ?? t("errors.genericError"));
      return;
    }

    const result = acceptInvite(
      codeInput.trim(),
      userEmail,
      nameInput.trim() || userEmail,
      leadEmail
    );

    if (result.success) {
      setJoinSuccess(true);
      setCodeInput("");
      setNameInput("");
    } else {
      setJoinError(result.error ?? t("errors.genericError"));
    }
  }, [codeInput, nameInput, userEmail, leadEmail, acceptInvite, t]);

  const handleRemove = useCallback(
    (email: string) => removeMember(email),
    [removeMember]
  );

  const currentUserDomain = members.find(m => m.email === userEmail)?.domain || "Unknown";

  // MEMBER view
  if (role === "MEMBER") {
    const isInTeam = members.some((m) => m.email === userEmail);
    return (
      <section
        aria-labelledby="team-section-heading"
        className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 shadow-[0_0_40px_rgba(255,255,255,0.03)]"
      >
        <h2 id="team-section-heading" className="text-sm font-bold text-white mb-4">
          {t("team.title")}
        </h2>

        {isInTeam ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#CCFF00]/5 border border-[#CCFF00]/15">
            <div className="w-8 h-8 rounded-lg bg-[#CCFF00]/10 flex items-center justify-center">
              <UserIcon />
            </div>
            <p className="text-sm text-[#999]">
              You are a member of the <span className="text-[#CCFF00] font-semibold">clstr.raghuinstitute</span> team.<br/>
              Assigned Domain: <span className="text-white font-semibold">{currentUserDomain}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="join-name" className="text-xs font-semibold text-[#999] uppercase tracking-wider">
                Your Name
              </label>
              <input
                id="join-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your full name"
                className="w-full px-4 py-2.5 rounded-xl bg-[#000] border border-[#1A1A1A] text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#CCFF00]/40 focus:ring-1 focus:ring-[#CCFF00]/20 transition-all"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="join-code" className="text-xs font-semibold text-[#999] uppercase tracking-wider">
                {t("team.inviteCode")}
              </label>
              <input
                id="join-code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder={t("team.enterCode")}
                aria-describedby={joinError ? "join-error" : undefined}
                className="w-full px-4 py-2.5 rounded-xl bg-[#000] border border-[#1A1A1A] text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#CCFF00]/40 focus:ring-1 focus:ring-[#CCFF00]/20 transition-all font-mono uppercase tracking-widest"
              />
            </div>

            <AnimatePresence>
              {joinError && (
                <motion.p
                  id="join-error"
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-[#FF6A00] font-medium"
                >
                  {joinError}
                </motion.p>
              )}
              {joinSuccess && (
                <motion.p
                  role="status"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-[#CCFF00] font-medium"
                >
                  Successfully joined the team!
                </motion.p>
              )}
            </AnimatePresence>

            <button
              onClick={handleJoin}
              className="w-full px-4 py-2.5 rounded-xl bg-[#CCFF00] text-[#000] text-sm font-bold hover:opacity-90 active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
            >
              {t("team.joinButton")}
            </button>
          </div>
        )}

        {/* Restricted notice */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FF6A00]/5 border border-[#FF6A00]/15 mt-4">
          <div className="w-8 h-8 rounded-lg bg-[#FF6A00]/10 flex items-center justify-center shrink-0">
            <LockIcon />
          </div>
          <p className="text-sm text-[#999]">
            {t("team.restrictedMsg")}{" "}
            <span className="text-[#FF6A00] font-semibold">Campus Captain</span>.
          </p>
        </div>
      </section>
    );
  }

  // LEAD / SUPER_ADMIN view
  return (
    <section
      aria-labelledby="team-section-heading"
      className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 shadow-[0_0_40px_rgba(255,255,255,0.03)] space-y-5"
    >
      <div className="flex items-center justify-between">
        <h2 id="team-section-heading" className="text-sm font-bold text-white">
          {t("team.title")}
        </h2>
      </div>

      {/* Invite code generator */}
      <div className="rounded-xl bg-[#000]/40 border border-[#1A1A1A]/30 p-4 space-y-3">
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wider">{t("team.inviteCode")}</p>

        <div className="flex flex-col gap-1 mb-2">
          <label htmlFor="domain-select" className="text-[10px] text-[#666] uppercase">Select Domain Role</label>
          <select 
            id="domain-select"
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#0A0A0A] border border-[#1A1A1A] text-sm text-white focus:outline-none focus:border-[#CCFF00]/40"
          >
            {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {latestInvite ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-[#0A0A0A] border border-[#1A1A1A] text-sm font-mono text-[#CCFF00] tracking-widest">
                {latestInvite.code}
              </code>
              <button
                onClick={handleCopy}
                aria-label="Copy invite code"
                className="px-3 py-2 rounded-lg border border-[#1A1A1A] hover:border-[#333] text-[#666] hover:text-white transition-colors flex items-center gap-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
              >
                <CopyIcon />
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-[10px] text-[#CCFF00]">
              This code will assign the user to: <span className="font-bold">{latestInvite.domain}</span>
            </p>
          </div>
        ) : (
          <p className="text-xs text-[#555]">No active invite code. Generate one below.</p>
        )}

        <button
          onClick={handleGenerateInvite}
          className="w-full px-4 py-2.5 rounded-xl bg-[#CCFF00] text-[#000] text-sm font-bold hover:opacity-90 active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
        >
          {t("team.generateInvite")}
        </button>
      </div>

      {/* Member list */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[#999] uppercase tracking-wider">{t("team.members")}</p>
        {members.length === 0 ? (
          <p className="text-xs text-[#555] py-4 text-center">{t("team.noMembers")}</p>
        ) : (
          <AnimatePresence>
            {members.map((m) => (
              <MemberRow
                key={m.email}
                email={m.email}
                name={m.name}
                domain={m.domain}
                joinedAt={m.joinedAt}
                canRemove={true}
                onRemove={handleRemove}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
