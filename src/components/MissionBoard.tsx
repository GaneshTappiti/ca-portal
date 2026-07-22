/**
 * MissionBoard — unified task board with task-specific forms & live status indicators
 * Design language: Sharp edges, bg-[#111] border border-[#222], h-[2px] top accent bars.
 * Preserves exact color scheme (#CCFF00, #FF5500, #4488FF, #A855F7, #111).
 */

import {
  memo,
  useState,
  useCallback,
  useRef,
  useId,
  useMemo,
  useEffect,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import FocusTrap from "focus-trap-react";
import {
  useTaskStore,
  usePlanStore,
  useMetrics,
  broadcastEvent,
} from "../lib/store";
import { useAuth } from "../lib/auth";
import DropZone from "./DropZone";
import type { Task } from "../lib/store";

// ─── Types ─────────────────────────────────────────────────────────────────────

type BoardFilter = "all" | "reel" | "report" | "club" | "milestone" | "task";
type ToastState = { message: string; type: "success" | "info" | "error"; id: number } | null;

interface MissionItem {
  id: string;
  type: "reel" | "report" | "club" | "milestone" | "task";
  title: string;
  description: string;
  points: number;
  maxPoints: number;
  status: "open" | "pending" | "done" | "locked";
  week?: number;
  meta?: Record<string, unknown>;
  raw?: Task;
}

// ─── Design tokens ─────────────────────────────────────────────────────────────
const TYPE_ACCENT: Record<MissionItem["type"], string> = {
  reel:      "#4488FF",
  report:    "#C8FF00",
  club:      "#FF5500",
  milestone: "#A855F7",
  task:      "#C8FF00",
};

const TYPE_LABEL: Record<MissionItem["type"], string> = {
  reel:      "Reel",
  report:    "Report",
  club:      "Club",
  milestone: "Milestone",
  task:      "Task",
};

function statusAccent(status: MissionItem["status"]): string {
  if (status === "done")    return "#C8FF00";
  if (status === "pending") return "#FF5500";
  if (status === "locked")  return "#2E2E2E";
  return "#C8FF00";
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PointsIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Toast Component ──────────────────────────────────────────────────────────

const ToastNotification = memo(function ToastNotification({
  toast,
  onDismiss,
  prefersReduced,
}: {
  toast: NonNullable<ToastState>;
  onDismiss: () => void;
  prefersReduced: boolean | null;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  const border = toast.type === "error" ? "#FF5500" : "#C8FF00";

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReduced ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: prefersReduced ? 0 : 16 }}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 bg-[#111] border p-4 shadow-xl"
      style={{ borderColor: border }}
      role="status"
    >
      <div className="w-2 h-2 shrink-0" style={{ background: border }} aria-hidden="true" />
      <span className="text-xs font-semibold text-[#F0F0F0] font-mono">{toast.message}</span>
      <button onClick={onDismiss} className="ml-2 text-[#555] hover:text-[#FFF]">
        <CloseIcon />
      </button>
    </motion.div>
  );
});

// ─── Task-Specific Submission Form Modal ──────────────────────────────────────

const SubmissionModal = memo(function SubmissionModal({
  item,
  onClose,
  onSubmit,
  triggerRef,
  prefersReduced,
}: {
  item: MissionItem;
  onClose: () => void;
  onSubmit: (payload: {
    proofUrl: string;
    notes: string;
    reelUrl?: string;
    postedDate?: string;
    signups?: number;
    reelsPosted?: number;
    clubsActive?: number;
    win?: string;
    blocker?: string;
    clubName?: string;
    clubDomain?: string;
    presidentName?: string;
    eventDetails?: string;
  }) => Promise<void>;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
  prefersReduced: boolean | null;
}) {
  const { user } = useAuth();
  const titleId = useId();
  const accent = TYPE_ACCENT[item.type];
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Common inputs
  const [proofUrl, setProofUrl] = useState("");
  const [notes, setNotes] = useState("");

  // Reel-specific inputs
  const [reelUrl, setReelUrl] = useState("");
  const [postedDate, setPostedDate] = useState(new Date().toISOString().split("T")[0]);

  // Report-specific inputs
  const [signups, setSignups] = useState(0);
  const [reelsPostedCount, setReelsPostedCount] = useState(3);
  const [clubsActiveCount, setClubsActiveCount] = useState(1);
  const [win, setWin] = useState("");
  const [blocker, setBlocker] = useState("");

  // Club-specific inputs
  const [clubName, setClubName] = useState("");
  const [clubDomain, setClubDomain] = useState("Technical & Coding");
  const [presidentName, setPresidentName] = useState("");
  const [eventDetails, setEventDetails] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); triggerRef.current?.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, triggerRef]);

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    // Validation per task type
    if (item.type === "reel") {
      if (!reelUrl.trim() && !proofUrl) {
        setFormError("Platform Reel URL or screenshot proof is required.");
        return;
      }
    } else if (item.type === "report") {
      if (!win.trim()) {
        setFormError("Please state your major win for the week.");
        return;
      }
    } else if (item.type === "club") {
      if (!clubName.trim()) {
        setFormError("Club name is required.");
        return;
      }
    } else if (item.type === "task") {
      if (!proofUrl && !notes.trim()) {
        setFormError("Proof URL or screenshot file is required.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        proofUrl: proofUrl || reelUrl,
        notes: notes.trim(),
        reelUrl: reelUrl.trim(),
        postedDate,
        signups,
        reelsPosted: reelsPostedCount,
        clubsActive: clubsActiveCount,
        win: win.trim(),
        blocker: blocker.trim(),
        clubName: clubName.trim(),
        clubDomain,
        presidentName: presidentName.trim(),
        eventDetails: eventDetails.trim(),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Submission failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [item.type, proofUrl, notes, reelUrl, postedDate, signups, reelsPostedCount, clubsActiveCount, win, blocker, clubName, clubDomain, presidentName, eventDetails, onSubmit]);

  return (
    <FocusTrap
      focusTrapOptions={{
        onDeactivate: () => { onClose(); triggerRef.current?.focus(); },
        allowOutsideClick: true,
        initialFocus: false,
      }}
    >
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <motion.div
          className="absolute inset-0 bg-[#000]/75 backdrop-blur-sm"
          onClick={() => { onClose(); triggerRef.current?.focus(); }}
          aria-hidden="true"
        />

        <motion.div
          initial={{ opacity: 0, scale: prefersReduced ? 1 : 0.97, y: prefersReduced ? 0 : 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: prefersReduced ? 1 : 0.97, y: prefersReduced ? 0 : 24 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="relative w-full max-w-lg bg-[#111] border border-[#2E2E2E] p-6 sm:p-8 max-h-[90vh] overflow-y-auto"
        >
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accent }} aria-hidden="true" />

          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#888]">
                {TYPE_LABEL[item.type]} Submission Form
              </span>
              <h2 id={titleId} className="text-base font-bold text-[#F0F0F0] tracking-tight">{item.title}</h2>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="flex items-center gap-1 px-2 py-1 border text-[11px] font-black tabular-nums"
                style={{ borderColor: `${accent}30`, backgroundColor: `${accent}08`, color: accent }}
              >
                <PointsIcon color={accent} />
                +{item.maxPoints}
              </span>
              <button
                onClick={() => { onClose(); triggerRef.current?.focus(); }}
                aria-label="Close modal"
                className="p-1.5 hover:bg-[#1A1A1A] transition-colors text-[#444] hover:text-[#F0F0F0]"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Reel Submission Form */}
            {item.type === "reel" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">
                    Reel Link (Instagram / TikTok URL)
                  </label>
                  <input
                    type="url"
                    value={reelUrl}
                    onChange={(e) => setReelUrl(e.target.value)}
                    placeholder="https://instagram.com/reel/..."
                    className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono focus:outline-none focus:border-[#4488FF]/50"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">Posted Date</label>
                  <input
                    type="date"
                    value={postedDate}
                    onChange={(e) => setPostedDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono focus:outline-none focus:border-[#4488FF]/50"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">
                    Optional Screenshot Proof
                  </label>
                  <DropZone
                    onFileAccepted={(url) => { setProofUrl(url); setFormError(null); }}
                    onError={(msg) => setFormError(msg)}
                    userId={user?.id ?? ""}
                    taskDefId={item.id}
                  />
                </div>
              </>
            )}

            {/* Weekly Report Form */}
            {item.type === "report" && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#888] uppercase">New Signups</label>
                    <input
                      type="number"
                      min={0}
                      value={signups}
                      onChange={(e) => setSignups(Number(e.target.value))}
                      className="px-2.5 py-1.5 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#888] uppercase">Reels Posted</label>
                    <input
                      type="number"
                      min={0}
                      value={reelsPostedCount}
                      onChange={(e) => setReelsPostedCount(Number(e.target.value))}
                      className="px-2.5 py-1.5 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#888] uppercase">Active Clubs</label>
                    <input
                      type="number"
                      min={0}
                      value={clubsActiveCount}
                      onChange={(e) => setClubsActiveCount(Number(e.target.value))}
                      className="px-2.5 py-1.5 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">Major Win</label>
                  <textarea
                    value={win}
                    onChange={(e) => setWin(e.target.value)}
                    placeholder="Key win or achievement this week..."
                    rows={2}
                    className="w-full p-2.5 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">Blocker / Help Needed</label>
                  <textarea
                    value={blocker}
                    onChange={(e) => setBlocker(e.target.value)}
                    placeholder="Any blockers or support required..."
                    rows={2}
                    className="w-full p-2.5 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                  />
                </div>
              </>
            )}

            {/* Club Onboarding Form */}
            {item.type === "club" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">Club Name</label>
                  <input
                    type="text"
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    placeholder="e.g. ACM Student Chapter"
                    className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">Category / Domain</label>
                    <select
                      value={clubDomain}
                      onChange={(e) => setClubDomain(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                    >
                      <option>Technical & Coding</option>
                      <option>Cultural & Arts</option>
                      <option>Sports & Gaming</option>
                      <option>Entrepreneurship & E-Cell</option>
                      <option>Literary & Debating</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">President / Lead</label>
                    <input
                      type="text"
                      value={presidentName}
                      onChange={(e) => setPresidentName(e.target.value)}
                      placeholder="President Full Name"
                      className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">First Event Details</label>
                  <textarea
                    value={eventDetails}
                    onChange={(e) => setEventDetails(e.target.value)}
                    placeholder="Details on their first event posted on Clstr..."
                    rows={2}
                    className="w-full p-2.5 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">Proof Asset / Link</label>
                  <DropZone
                    onFileAccepted={(url) => { setProofUrl(url); setFormError(null); }}
                    onError={(msg) => setFormError(msg)}
                    userId={user?.id ?? ""}
                    taskDefId={item.id}
                  />
                </div>
              </>
            )}

            {/* Standard Task Form */}
            {item.type === "task" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">Proof File or Link</label>
                  <DropZone
                    onFileAccepted={(url) => { setProofUrl(url); setFormError(null); }}
                    onError={(msg) => setFormError(msg)}
                    userId={user?.id ?? ""}
                    taskDefId={item.raw?.taskDefId ?? item.id}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="mission-notes" className="text-xs font-semibold text-[#888] uppercase tracking-wider">
                    Execution Notes
                  </label>
                  <textarea
                    id="mission-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add context, details, or direct links..."
                    rows={3}
                    className="w-full p-3 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono resize-none"
                  />
                </div>
              </>
            )}

            {formError && (
              <p role="alert" className="text-xs text-[#FF5500] font-bold">{formError}</p>
            )}
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => { onClose(); triggerRef.current?.focus(); }}
              className="flex-1 px-4 py-2.5 rounded border border-[#222] text-xs font-semibold text-[#888] hover:text-[#FFF]"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded text-xs font-bold text-black flex items-center justify-center gap-2"
              style={{ background: accent }}
            >
              {submitting ? "Submitting…" : "Submit Task"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </FocusTrap>
  );
});

// ─── Mission Card Component ────────────────────────────────────────────────────

const MissionCard = memo(function MissionCard({
  item,
  onExecute,
  triggerRef,
}: {
  item: MissionItem;
  onExecute: (item: MissionItem, ref: React.MutableRefObject<HTMLButtonElement | null>) => void;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
}) {
  const accent = TYPE_ACCENT[item.type];
  const sc = statusAccent(item.status);
  const isActionable = item.status === "open";
  const label = TYPE_LABEL[item.type];

  return (
    <div className="bg-[#111] border border-[#222] flex flex-col justify-between relative overflow-hidden p-4 space-y-3">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accent }} aria-hidden="true" />

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-[#F0F0F0] leading-snug flex-1">{item.title}</h3>
          <span
            className="text-[9px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 shrink-0"
            style={{ color: accent, border: `1px solid ${accent}30`, background: `${accent}08` }}
          >
            {label}
          </span>
        </div>

        {item.description && (
          <p className="text-[11px] text-[#666] leading-relaxed line-clamp-2">{item.description}</p>
        )}
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-1 px-2 py-0.5 border text-[11px] font-black tabular-nums"
            style={{ borderColor: `${accent}25`, background: `${accent}06`, color: accent }}
          >
            <PointsIcon color={accent} />
            +{item.maxPoints}
          </div>

          <span
            className="px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] border"
            style={{ color: sc, borderColor: `${sc}30` }}
          >
            {item.status}
          </span>
        </div>

        <button
          ref={triggerRef}
          onClick={(e) => { e.stopPropagation(); onExecute(item, triggerRef); }}
          disabled={!isActionable}
          className="w-full px-4 py-2 bg-[#C8FF00] hover:bg-[#b5e600] text-black text-[11px] font-black tracking-tight transition-all disabled:opacity-20 disabled:cursor-not-allowed"
        >
          {item.status === "done"    ? "Scored ✓" :
           item.status === "pending" ? "Under Review" :
           item.status === "locked"  ? "Locked" :
           "Submit Task"}
        </button>
      </div>
    </div>
  );
});

// ─── Filter Bar Component ──────────────────────────────────────────────────────

const FILTER_LABELS: Record<BoardFilter, string> = {
  all: "All", reel: "Reels", report: "Reports",
  club: "Clubs", milestone: "Milestones", task: "Tasks",
};

function FilterBar({
  active, onChange, counts,
}: {
  active: BoardFilter;
  onChange: (f: BoardFilter) => void;
  counts: Record<BoardFilter, number>;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {(Object.keys(FILTER_LABELS) as BoardFilter[]).map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] transition-colors border ${
            active === f
              ? "border-[#C8FF00] text-[#000] bg-[#C8FF00]"
              : "border-[#222] text-[#666] hover:text-[#F0F0F0] bg-[#111]"
          }`}
        >
          {FILTER_LABELS[f]}
          <span className={`tabular-nums ml-0.5 ${active === f ? "text-[#000]" : "text-[#444]"}`}>
            {counts[f]}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Main MissionBoard Component ──────────────────────────────────────────────

export default function MissionBoard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const prefersReduced = useReducedMotion();

  const { tasks, submitProof: submitProofMutation } = useTaskStore(user?.id ?? "", user?.teamId);
  const {
    currentWeek, tier, clubs,
    getWeekReels, getWeekReport,
    toggleReelPosted, addClub, updateClub, submitReport,
    activeClubsCount,
    weeklyCumulative,
    weeklyReels,
    weeklyMilestones,
  } = usePlanStore(user?.id ?? "", user?.teamId ?? "", user?.tier ?? 4);

  // FIX: Pass user.id (UUID) as first param, user.campus as second param
  const metrics = useMetrics(user?.id, user?.campus ?? "raghuinstitute");

  const [filter, setFilter] = useState<BoardFilter>("all");
  const [selectedItem, setSelectedItem] = useState<MissionItem | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [toastKey, setToastKey] = useState(0);

  const showToast = useCallback((message: string, type: "success" | "info" | "error") => {
    setToastKey((k) => k + 1);
    setToast({ message, type, id: Date.now() });
  }, []);

  const cardTriggerRefs = useRef<Record<string, React.MutableRefObject<HTMLButtonElement | null>>>({});
  const getTriggerRef = (id: string) => {
    if (!cardTriggerRefs.current[id]) {
      cardTriggerRefs.current[id] = { current: null };
    }
    return cardTriggerRefs.current[id];
  };

  const allItems = useMemo((): MissionItem[] => {
    const items: MissionItem[] = [];
    const targets = weeklyCumulative[tier as 1 | 2 | 3 | 4] ?? weeklyCumulative[4] ?? [];

    // 1. Reel tasks
    const weekReels = getWeekReels(currentWeek);
    const reelDefs: Array<{ type: "meme" | "campus_culture" | "student_conversation"; title: string }> = [
      { type: "meme", title: "Meme Reel" },
      { type: "campus_culture", title: "Culture / Story Reel" },
      { type: "student_conversation", title: "Conversation Reel" },
    ];
    reelDefs.forEach(({ type, title }) => {
      const entry = weekReels.find((r) => r.type === type);
      const desc = type === "meme"
        ? weeklyReels[currentWeek - 1]?.meme
        : type === "campus_culture"
          ? weeklyReels[currentWeek - 1]?.culture
          : weeklyReels[currentWeek - 1]?.conversation;
      items.push({
        id: `reel-${currentWeek}-${type}`,
        type: "reel",
        title,
        description: desc || `Post your ${title} for Week ${currentWeek}.`,
        points: entry?.posted ? 50 : 0,
        maxPoints: 50,
        status: entry?.posted ? "done" : "open",
        week: currentWeek,
        meta: { reelType: type, entry },
      });
    });

    // 2. Weekly report
    const weekReport = getWeekReport(currentWeek);
    items.push({
      id: `report-${currentWeek}`,
      type: "report",
      title: `Week ${currentWeek} — Monday Report`,
      description: `Submit your Monday progress report for Week ${currentWeek}. Target: ${targets[currentWeek - 1]?.toLocaleString()} signups.`,
      points: weekReport?.submitted ? 100 : 0,
      maxPoints: 100,
      status: weekReport?.submitted ? "done" : "open",
      week: currentWeek,
      meta: { report: weekReport },
    });

    // 3. Club onboarding
    clubs.forEach((club) => {
      items.push({
        id: `club-${club.id}`,
        type: "club",
        title: `Club: ${club.name}`,
        description: `${club.domain} club${club.presidentName ? ` — ${club.presidentName}` : ""}.`,
        points: club.active ? 75 : 0,
        maxPoints: 75,
        status: club.active ? "done" : "open",
        meta: { club },
      });
    });
    if (clubs.length < 8) {
      items.push({
        id: "club-onboard-new",
        type: "club",
        title: "Onboard a New Club",
        description: `${activeClubsCount}/8 clubs active. Onboard a club president onto Clstr and submit proof.`,
        points: 0,
        maxPoints: 75,
        status: "open",
      });
    }

    // 4. Milestones
    const totalTarget = targets[12] ?? 1000;
    weeklyMilestones.forEach((m) => {
      const userTarget = Math.round(totalTarget * (m.pctTarget / 100));
      const isCompleted = metrics.verifiedUsers >= userTarget;
      const halfway = metrics.verifiedUsers >= userTarget * 0.5;
      items.push({
        id: `milestone-${m.label}`,
        type: "milestone",
        title: (m.isBonus ? "[BONUS] " : "") + m.name,
        description: `${m.reward} — Target: ${userTarget.toLocaleString()} users. Current: ${metrics.verifiedUsers.toLocaleString()}.`,
        points: isCompleted ? 200 : 0,
        maxPoints: 200,
        status: isCompleted ? "done" : halfway ? "open" : "locked",
        week: m.week,
        meta: { milestone: m, userTarget, isCompleted },
      });
    });

    // 5. Standard tasks
    tasks.forEach((task) => {
      items.push({
        id: `task-${task.id}`,
        type: "task",
        title: task.title,
        description: task.description ?? `Category: ${task.category}.`,
        points: task.pointsAwarded,
        maxPoints: task.points,
        status:
          task.status === "verified" ? "done" :
          task.status === "pending"  ? "pending" :
          "open",
        raw: task,
      });
    });

    return items;
  }, [tasks, currentWeek, tier, clubs, metrics.verifiedUsers, getWeekReels, getWeekReport, activeClubsCount, weeklyCumulative, weeklyReels, weeklyMilestones]);

  const filtered = useMemo(() => {
    if (filter === "all") return allItems;
    return allItems.filter((i) => i.type === filter);
  }, [allItems, filter]);

  const counts = useMemo(() => ({
    all:       allItems.length,
    reel:      allItems.filter((i) => i.type === "reel").length,
    report:    allItems.filter((i) => i.type === "report").length,
    club:      allItems.filter((i) => i.type === "club").length,
    milestone: allItems.filter((i) => i.type === "milestone").length,
    task:      allItems.filter((i) => i.type === "task").length,
  } as Record<BoardFilter, number>), [allItems]);

  const handleExecute = useCallback((item: MissionItem, ref: React.MutableRefObject<HTMLButtonElement | null>) => {
    triggerRef.current = ref.current;
    setSelectedItem(item);
  }, []);

  const handleSubmit = useCallback(async (payload: {
    proofUrl: string;
    notes: string;
    reelUrl?: string;
    postedDate?: string;
    signups?: number;
    reelsPosted?: number;
    clubsActive?: number;
    win?: string;
    blocker?: string;
    clubName?: string;
    clubDomain?: string;
    presidentName?: string;
    eventDetails?: string;
  }) => {
    if (!selectedItem || !user) return;
    const item = selectedItem;

    if (item.type === "task" && item.raw) {
      await submitProofMutation({
        taskDefId: item.raw.taskDefId,
        userId: user.id,
        currentStatus: item.raw.status,
        proofUrl: payload.proofUrl,
        notes: payload.notes,
      });
      broadcastEvent({ type: "TASK_SUBMITTED", taskId: item.raw.id });
      showToast(`"${item.title}" submitted for review`, "success");
    } else if (item.type === "reel") {
      const reelType = item.meta?.reelType as "meme" | "campus_culture" | "student_conversation";
      await toggleReelPosted({
        userId: user.id,
        week: item.week ?? currentWeek,
        type: reelType,
        url: payload.reelUrl || payload.proofUrl,
      });
      showToast("Reel marked as posted!", "success");
    } else if (item.type === "report") {
      await submitReport({
        userId: user.id,
        week: item.week ?? currentWeek,
        signups: payload.signups ?? 0,
        reelsPosted: payload.reelsPosted ?? 3,
        clubsActive: payload.clubsActive ?? activeClubsCount,
        win: payload.win || payload.notes || "Weekly Report Submitted",
        blocker: payload.blocker || "",
      });
      showToast(`Week ${item.week} Monday report submitted!`, "success");
    } else if (item.type === "club") {
      if (item.meta?.club) {
        await updateClub({ id: (item.meta.club as { id: string }).id, active: true });
        showToast("Club marked as active!", "success");
      } else {
        await addClub({
          teamId: user.teamId ?? "",
          userId: user.id,
          name: payload.clubName || payload.notes || "New Club",
          domain: payload.clubDomain || "General",
          presidentName: payload.presidentName,
        });
        showToast("Club onboarded!", "success");
      }
    }

    setSelectedItem(null);
  }, [selectedItem, user, submitProofMutation, toggleReelPosted, submitReport, addClub, updateClub, currentWeek, activeClubsCount, showToast]);

  return (
    <div className="w-full space-y-4" aria-label="Mission Board">
      {/* Live Data & Refresh Indicator */}
      <div className="flex items-center justify-between text-[10px] font-mono text-[#555] px-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${metrics.isLive ? "bg-[#C8FF00]" : "bg-[#FF5500]"}`} />
          <span>{metrics.isLive ? "Live Stats Connected" : "Live Stats Unavailable"}</span>
        </div>
        {metrics.verifiedUsersLastUpdated && (
          <span>Last synced: {new Date(metrics.verifiedUsersLastUpdated).toLocaleTimeString()}</span>
        )}
      </div>

      <FilterBar active={filter} onChange={setFilter} counts={counts} />

      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="border border-dashed border-[#222] p-8 text-center bg-[#0A0A0A]"
          >
            <p className="text-[11px] font-mono text-[#555] uppercase tracking-[0.1em]">No tasks found for filter</p>
          </motion.div>
        ) : (
          <motion.div
            key={filter}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {filtered.map((item) => (
              <MissionCard
                key={item.id}
                item={item}
                onExecute={handleExecute}
                triggerRef={getTriggerRef(item.id)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedItem && (
          <SubmissionModal
            key={selectedItem.id}
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSubmit={handleSubmit}
            triggerRef={triggerRef as React.MutableRefObject<HTMLButtonElement | null>}
            prefersReduced={prefersReduced}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <ToastNotification
            key={toastKey}
            toast={toast}
            onDismiss={() => setToast(null)}
            prefersReduced={prefersReduced}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
