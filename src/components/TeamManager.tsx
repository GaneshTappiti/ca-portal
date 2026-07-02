import { useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useTeamStore } from "../lib/store";
import { useAuth } from "../lib/auth";
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
      className="flex items-center gap-3 px-3 py-3 rounded-xl bg-[#111] border border-[#222]"
    >
      <div className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center text-xs font-bold text-[#666]">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#F0F0F0] truncate">{name}</p>
        <p className="text-[10px] text-[#555] truncate">{domain || email}</p>
      </div>
      <span className="text-[10px] text-[#444] hidden sm:block whitespace-nowrap font-mono">
        {t("team.joinedAt", { date: new Date(joinedAt).toLocaleDateString() })}
      </span>
      {canRemove && (
        <button
          onClick={() => onRemove(email)}
          aria-label={`Remove ${name} from team`}
          className="p-1.5 rounded-lg hover:bg-[#FF5500]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5500]/50"
        >
          <TrashIcon />
        </button>
      )}
    </motion.div>
  );
});

// ─── Derive CA ID (same as dashboard) ─────────────────────────────────────────

function deriveCAId(id: string): string {
  return "CA-" + id.replace(/-/g, "").toUpperCase().slice(0, 8);
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TeamManagerProps {
  role: AuthRole;
  userEmail: string;
  leadEmail: string;
}

export default function TeamManager({ role, userEmail, leadEmail }: TeamManagerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { members, acceptInvite, removeMember } = useTeamStore(
    user?.teamId ?? "",
    user?.id ?? ""
  );

  const [codeInput, setCodeInput]     = useState("");
  const [joinError, setJoinError]     = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [copied, setCopied]           = useState(false);

  const caId = deriveCAId(user?.id ?? "MOCK0001");

  const handleCopyCAId = useCallback(() => {
    navigator.clipboard.writeText(caId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [caId]);

  const handleJoin = useCallback(async () => {
    setJoinError(null);
    setJoinSuccess(false);
    if (!codeInput.trim()) { setJoinError("Please enter your CA invite code."); return; }
    try {
      await acceptInvite({ code: codeInput.trim(), userId: user?.id ?? "" });
      setJoinSuccess(true);
      setCodeInput("");
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : t("errors.genericError"));
    }
  }, [codeInput, user, acceptInvite, t]);

  const handleRemove = useCallback(
    (id: string) => removeMember(id),
    [removeMember]
  );

  const currentUserDomain = "";

  // MEMBER view
  if (role === "MEMBER") {
    const isInTeam = members.some((m) => m.email === userEmail);
    return (
      <section
        aria-labelledby="team-section-heading"
        className="rounded-2xl bg-[#111] border border-[#222] p-5 sm:p-6 space-y-4"
      >
        <h2 id="team-section-heading" className="text-sm font-bold text-[#F0F0F0]">
          {t("team.title")}
        </h2>

        {isInTeam ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#C8FF00]/[0.04] border border-[#C8FF00]/15">
            <div className="w-8 h-8 rounded-lg bg-[#C8FF00]/10 flex items-center justify-center">
              <UserIcon />
            </div>
            <p className="text-sm text-[#A0A0A0]">
              Member of <span className="text-[#C8FF00] font-semibold">clstr.raghuinstitute</span><br/>
              Domain: <span className="text-[#F0F0F0] font-semibold">{currentUserDomain || "General"}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="join-code" className="text-[10px] font-bold text-[#555] uppercase tracking-wider">
                Enter CA Invite Code
              </label>
              <input
                id="join-code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="CA-XXXXXXXX"
                aria-describedby={joinError ? "join-error" : undefined}
                className="w-full px-4 py-2.5 bg-[#0A0A0A] border border-[#222] text-sm text-[#F0F0F0] placeholder-[#2E2E2E] focus:outline-none focus:border-[#C8FF00]/40 focus:ring-1 focus:ring-[#C8FF00]/20 transition-all font-mono uppercase tracking-widest"
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
                  className="text-xs text-[#FF5500] font-medium"
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
                  className="text-xs text-[#C8FF00] font-medium"
                >
                  Successfully joined the team!
                </motion.p>
              )}
            </AnimatePresence>

            <button
              onClick={handleJoin}
              className="w-full px-4 py-2.5 bg-[#C8FF00] text-[#000] text-sm font-black hover:opacity-90 active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8FF00]/50"
            >
              Join Team
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FF5500]/[0.04] border border-[#FF5500]/15">
          <div className="w-8 h-8 rounded-lg bg-[#FF5500]/10 flex items-center justify-center shrink-0">
            <LockIcon />
          </div>
          <p className="text-sm text-[#666]">
            {t("team.restrictedMsg")}{" "}
            <span className="text-[#FF5500] font-semibold">Campus Captain</span>.
          </p>
        </div>
      </section>
    );
  }

  // LEAD / SUPER_ADMIN view
  return (
    <section
      aria-labelledby="team-section-heading"
      className="rounded-2xl bg-[#111] border border-[#222] p-5 sm:p-6 space-y-5"
    >
      <div className="flex items-center justify-between">
        <h2 id="team-section-heading" className="text-sm font-bold text-[#F0F0F0]">
          {t("team.title")}
        </h2>
      </div>

      {/* CA ID = Invite Code */}
      <div className="rounded-xl bg-[#0A0A0A] border border-[#222] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-[#555] uppercase tracking-wider">Your Invite Code</p>
          <span className="text-[9px] font-mono text-[#3A3A3A] uppercase tracking-wider">= your CA ID</span>
        </div>

        {/* Static CA ID display */}
        <div className="flex items-center gap-2">
          <code className="flex-1 px-4 py-2.5 bg-[#000] border border-[#C8FF00]/20 text-sm font-mono font-black text-[#C8FF00] tracking-[0.2em] select-all">
            {caId}
          </code>
          <button
            onClick={handleCopyCAId}
            aria-label="Copy invite code"
            className="px-3 py-2.5 border border-[#222] hover:border-[#C8FF00]/30 text-[#555] hover:text-[#C8FF00] transition-colors flex items-center gap-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C8FF00]/50"
          >
            <CopyIcon />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <p className="text-[10px] text-[#444] leading-relaxed">
          Share this code with students joining your team. It's permanently tied to your CA profile — no need to generate a new one.
        </p>

        {/* Supabase SQL reference */}
        <details className="group">
          <summary className="text-[9px] font-bold text-[#333] uppercase tracking-wider cursor-pointer hover:text-[#555] transition-colors list-none flex items-center gap-1">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-open:rotate-90 transition-transform" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            Supabase SQL Setup
          </summary>
          <pre className="mt-2 p-3 bg-[#000] border border-[#1A1A1A] text-[10px] font-mono text-[#4488FF] overflow-x-auto leading-relaxed whitespace-pre">{`-- team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     TEXT NOT NULL,
  user_id     UUID REFERENCES auth.users(id),
  invite_code TEXT NOT NULL,   -- = CA-XXXXXXXX
  domain_role TEXT,
  joined_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Validate invite code (= CA ID) on join
CREATE OR REPLACE FUNCTION accept_ca_invite(
  p_invite_code TEXT,
  p_user_id     UUID
) RETURNS VOID AS $$
DECLARE
  v_team_id TEXT;
BEGIN
  SELECT team_id INTO v_team_id
    FROM ca_profiles
   WHERE ca_id = p_invite_code
   LIMIT 1;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid CA invite code';
  END IF;
  INSERT INTO team_members (team_id, user_id, invite_code)
    VALUES (v_team_id, p_user_id, p_invite_code)
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`}</pre>
        </details>
      </div>

      {/* Member list */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-[#555] uppercase tracking-wider">{t("team.members")}</p>
        {members.length === 0 ? (
          <p className="text-xs text-[#444] py-4 text-center font-mono">No teammates yet. Share your CA ID above to invite members.</p>
        ) : (
          <AnimatePresence>
            {members.map((m) => (
              <MemberRow
                key={m.id}
                email={m.email}
                name={m.name}
                domain={""}
                joinedAt={new Date(m.createdAt).getTime()}
                canRemove={true}
                onRemove={() => handleRemove(m.id)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
