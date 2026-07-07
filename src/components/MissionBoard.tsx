/**
 * MissionBoard — unified task board
 * Design language: matches ClstrTaskPanel exactly.
 * Sharp edges, bg-[#111] border border-[#222], h-[2px] top accent bars.
 * No rounded-2xl, no gradients, no glassmorphism.
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

// ─── Design tokens (same as TaskCard in ClstrTaskPanel) ───────────────────────
// Type → accent color for the h-[2px] top bar + points display
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

// Status → accent color (same pattern as TaskCard statusColor)
function statusAccent(status: MissionItem["status"]): string {
  if (status === "done")    return "#C8FF00";
  if (status === "pending") return "#FF5500";
  if (status === "locked")  return "#2E2E2E";
  return "#C8FF00"; // open
}

// ─── Icons (matching ClstrTaskPanel icon style) ────────────────────────────────

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

function CheckCircleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF5500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

// ─── Toast (identical pattern to ClstrTaskPanel ToastNotification) ─────────────

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
  }, [onDismiss]);

  const accent = toast.type === "success" ? "#C8FF00" : toast.type === "error" ? "#FF5500" : "#4488FF";

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReduced ? 0 : -20, scale: prefersReduced ? 1 : 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: prefersReduced ? 0 : -20, scale: prefersReduced ? 1 : 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onClick={onDismiss}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className="fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3 bg-[#111] border border-[#2E2E2E] shadow-[0_0_60px_rgba(0,0,0,0.5)] cursor-pointer max-w-sm"
    >
      <div
        className="w-7 h-7 flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}11`, border: `1px solid ${accent}22` }}
        aria-hidden="true"
      >
        {toast.type === "success" ? <CheckCircleIcon /> : <XCircleIcon />}
      </div>
      <span className="text-sm font-semibold text-[#F0F0F0] pr-2 flex-1">{toast.message}</span>
      <motion.div
        className="absolute bottom-0 left-3 right-3 h-[1px]"
        style={{ backgroundColor: accent }}
        initial={{ scaleX: 1, transformOrigin: "left" }}
        animate={{ scaleX: 0, transformOrigin: "left" }}
        transition={{ duration: 4, ease: "linear" }}
        aria-hidden="true"
      />
    </motion.div>
  );
});

// ─── Submission Modal (same layout as ClstrTaskPanel SubmissionModal) ──────────

const SubmissionModal = memo(function SubmissionModal({
  item,
  onClose,
  onSubmit,
  triggerRef,
  prefersReduced,
}: {
  item: MissionItem;
  onClose: () => void;
  onSubmit: (proofUrl: string, notes: string) => Promise<void>;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
  prefersReduced: boolean | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [proofUrl, setProofUrl] = useState("");
  const [proofError, setProofError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const accent = TYPE_ACCENT[item.type];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); triggerRef.current?.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, triggerRef]);

  const handleSubmit = useCallback(async () => {
    if (!proofUrl) { setProofError("Proof file is required."); return; }
    setSubmitting(true);
    try { await onSubmit(proofUrl, notes.trim()); }
    catch { setProofError("Submission failed. Try again."); }
    finally { setSubmitting(false); }
  }, [proofUrl, notes, onSubmit]);

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
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-[#000]/75 backdrop-blur-sm"
          onClick={() => { onClose(); triggerRef.current?.focus(); }}
          aria-hidden="true"
        />

        {/* Panel — matches ClstrTaskPanel modal: sharp, #111, border #2E2E2E */}
        <motion.div
          initial={{ opacity: 0, scale: prefersReduced ? 1 : 0.97, y: prefersReduced ? 0 : 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: prefersReduced ? 1 : 0.97, y: prefersReduced ? 0 : 24 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="relative w-full max-w-lg bg-[#111] border border-[#2E2E2E] p-6 sm:p-8"
        >
          {/* Top accent bar — type color */}
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accent }} aria-hidden="true" />

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-base font-bold text-[#F0F0F0] tracking-tight">Submit Task</h2>
              <p className="text-[11px] text-[#555] font-mono mt-0.5">{item.title}</p>
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
                className="p-1.5 hover:bg-[#1A1A1A] transition-colors text-[#444] hover:text-[#F0F0F0] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Drop zone */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#666] uppercase tracking-wider">Proof / Screenshot</label>
              <DropZone
                onFileAccepted={(url) => { setProofUrl(url); setProofError(null); }}
                onError={(msg) => setProofError(msg)}
                userId={user?.id ?? ""}
                taskDefId={item.raw?.taskDefId ?? item.id}
              />
              {proofError && (
                <p role="alert" className="text-xs text-[#FF5500] font-medium">{proofError}</p>
              )}
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mission-notes" className="text-xs font-semibold text-[#666] uppercase tracking-wider">
                Notes <span className="text-[#333] normal-case font-normal">(optional)</span>
              </label>
              <textarea
                id="mission-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add context, links, or details..."
                rows={3}
                maxLength={1000}
                className="w-full px-4 py-2.5 bg-[#0A0A0A] border border-[#222] text-sm text-[#F0F0F0] placeholder-[#2E2E2E] focus:outline-none focus:border-[#C8FF00]/40 focus:ring-1 focus:ring-[#C8FF00]/20 transition-all resize-none"
              />
              <p className="text-[10px] text-[#444] text-right">{notes.length}/1000</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => { onClose(); triggerRef.current?.focus(); }}
              className="flex-1 px-4 py-2.5 rounded-md border border-[#222] text-sm font-semibold text-[#555] transition-all hover:text-[#F0F0F0] hover:border-[#444] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#444]"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!proofUrl || submitting}
              className="flex-1 px-4 py-2.5 rounded-md text-sm font-black tracking-tight transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-1"
              style={{ background: accent, color: accent === "#C8FF00" || accent === "#A855F7" ? "#000" : "#000", outline: `1px solid ${accent}` }}
            >
              {submitting ? (
                <>
                  <motion.span
                    className="inline-block w-4 h-4 border-2 border-[#000] border-t-transparent rounded-full"
                    animate={prefersReduced ? {} : { rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    aria-hidden="true"
                  />
                  Submitting…
                </>
              ) : "Submit Task"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </FocusTrap>
  );
});

// ─── Mission Card ──────────────────────────────────────────────────────────────
// Design matches TaskCard in ClstrTaskPanel exactly:
// - bg-[#111] border border-[#222]
// - h-[2px] top accent bar (type color, not status)
// - sharp corners throughout
// - lime CTA button matching TaskCard execute button

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
    <div
      className="bg-[#111] border border-[#222] rounded-2xl flex flex-col gap-0 relative overflow-hidden"
      aria-label={`${item.title}, ${item.maxPoints} points, ${item.status}`}
    >

      <div className="p-4 flex flex-col gap-3">
        {/* Row 1: title + type chip */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-[#F0F0F0] leading-snug flex-1">{item.title}</h3>
          <span
            className="text-[9px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 shrink-0"
            style={{ color: accent, border: `1px solid ${accent}25`, background: `${accent}08` }}
          >
            {label}
          </span>
        </div>

        {/* Description — muted, matches task.description pattern */}
        {item.description && (
          <p className="text-[10px] text-[#555] leading-relaxed line-clamp-2">{item.description}</p>
        )}

        {/* Row 2: points + status */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 px-2 py-0.5 border"
            style={{ borderColor: `${accent}25`, background: `${accent}06` }}
          >
            <PointsIcon color={accent} />
            <span className="text-[11px] font-black tabular-nums" style={{ color: accent }}>
              +{item.maxPoints}
            </span>
          </div>
          {item.week && (
            <span className="text-[9px] font-mono text-[#3A3A3A] uppercase tracking-wider">
              Wk {item.week}
            </span>
          )}
          {item.status !== "open" && (
            <span
              className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em]"
              style={{ color: sc, border: `1px solid ${sc}30` }}
            >
              {item.status}
            </span>
          )}
          {item.status === "done" && item.points > 0 && (
            <span className="text-[9px] font-mono text-[#C8FF00] tabular-nums ml-auto">
              {item.points}/{item.maxPoints}
            </span>
          )}
        </div>

        {/* CTA — small curve (rounded-md) */}
        <button
          ref={triggerRef}
          onClick={(e) => { e.stopPropagation(); onExecute(item, triggerRef); }}
          disabled={!isActionable}
          className="w-full px-4 py-2 rounded-md bg-[#C8FF00] text-[#000] text-[11px] font-black tracking-tight transition-all duration-200 hover:opacity-90 active:scale-[0.97] disabled:opacity-20 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
          aria-label={`Submit task: ${item.title}`}
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

// ScoreStrip removed per user request

// ─── Filter bar ────────────────────────────────────────────────────────────────

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
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.08em] transition-colors whitespace-nowrap border ${
            active === f
              ? "border-[#C8FF00] text-[#000] bg-[#C8FF00]"
              : "border-[#222] text-[#444] hover:text-[#888] hover:border-[#333] bg-[#111]"
          }`}
        >
          {FILTER_LABELS[f]}
          <span className={`tabular-nums ml-0.5 ${active === f ? "text-[#000]" : "text-[#2E2E2E]"}`}>
            {counts[f]}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Main MissionBoard ─────────────────────────────────────────────────────────

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
  const metrics = useMetrics(user?.email ?? "");

  const [filter, setFilter]           = useState<BoardFilter>("all");
  const [selectedItem, setSelectedItem] = useState<MissionItem | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [toast, setToast]             = useState<ToastState>(null);
  const [toastKey, setToastKey]       = useState(0);

  const showToast = useCallback((message: string, type: "success" | "info" | "error") => {
    setToastKey(k => k + 1);
    setToast({ message, type, id: Date.now() });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // Allocate per-card trigger refs
  const cardTriggerRefs = useRef<Record<string, React.MutableRefObject<HTMLButtonElement | null>>>({});
  const getTriggerRef = (id: string) => {
    if (!cardTriggerRefs.current[id]) {
      cardTriggerRefs.current[id] = { current: null };
    }
    return cardTriggerRefs.current[id];
  };

  // ── Build all mission items ─────────────────────────────────────────────────
  const allItems = useMemo((): MissionItem[] => {
    const items: MissionItem[] = [];
    const targets = weeklyCumulative[tier as 1|2|3|4] ?? weeklyCumulative[4] ?? [];

    // 1. Reel tasks — current week
    const weekReels = getWeekReels(currentWeek);
    const reelDefs: Array<{ type: "meme"|"campus_culture"|"student_conversation"; title: string }> = [
      { type: "meme",               title: "Meme Reel" },
      { type: "campus_culture",     title: "Culture / Story Reel" },
      { type: "student_conversation", title: "Conversation / Branding Reel" },
    ];
    reelDefs.forEach(({ type, title }) => {
      const entry = weekReels.find(r => r.type === type);
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
      description: `Submit your Monday progress report for Week ${currentWeek}. Target: ${targets[currentWeek - 1]?.toLocaleString()} users.`,
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
        description: `${club.domain} club${club.presidentName ? ` — ${club.presidentName}` : ""}. Submit onboarding proof.`,
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
    const totalTarget = targets[12];
    weeklyMilestones.forEach((m) => {
      const userTarget = Math.round(totalTarget * (m.pctTarget / 100));
      const isCompleted = metrics.verifiedUsers >= userTarget;
      const halfway = metrics.verifiedUsers >= userTarget * 0.5;
      items.push({
        id: `milestone-${m.label}`,
        type: "milestone",
        title: (m.isBonus ? "[BONUS] " : "") + m.name,
        description: `${m.reward} — Reach ${userTarget.toLocaleString()} users (${m.pctTarget}% of target). Now: ${metrics.verifiedUsers.toLocaleString()}/${userTarget.toLocaleString()}.`,
        points: isCompleted ? 200 : 0,
        maxPoints: 200,
        status: isCompleted ? "done" : halfway ? "open" : "locked",
        week: m.week,
        meta: { milestone: m, userTarget, isCompleted },
      });
    });

    // 5. Regular tasks from useTaskStore — these come in as Task objects
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
  }, [tasks, currentWeek, tier, clubs, metrics.verifiedUsers, getWeekReels, getWeekReport, activeClubsCount]);

  // Filter
  const filtered = useMemo(() => {
    if (filter === "all") return allItems;
    return allItems.filter(i => i.type === filter);
  }, [allItems, filter]);

  const counts = useMemo(() => ({
    all:       allItems.length,
    reel:      allItems.filter(i => i.type === "reel").length,
    report:    allItems.filter(i => i.type === "report").length,
    club:      allItems.filter(i => i.type === "club").length,
    milestone: allItems.filter(i => i.type === "milestone").length,
    task:      allItems.filter(i => i.type === "task").length,
  } as Record<BoardFilter, number>), [allItems]);

  // Handle execute
  const handleExecute = useCallback((item: MissionItem, ref: React.MutableRefObject<HTMLButtonElement | null>) => {
    triggerRef.current = ref.current;
    setSelectedItem(item);
  }, []);

  // Submit
  const handleSubmit = useCallback(async (proofUrl: string, notes: string) => {
    if (!selectedItem || !user) return;
    try {
      const item = selectedItem;
      if (item.type === "task" && item.raw) {
        await submitProofMutation({
          taskDefId: item.raw.taskDefId,
          userId: user.id,
          currentStatus: item.raw.status,
          proofUrl,
          notes,
        });
        broadcastEvent({ type: "TASK_SUBMITTED", taskId: item.raw.id });
        showToast(`"${item.title}" submitted for review`, "success");
      } else if (item.type === "reel") {
        const reelType = item.meta?.reelType as "meme" | "campus_culture" | "student_conversation";
        await toggleReelPosted({ userId: user.id, week: item.week ?? currentWeek, type: reelType, url: proofUrl });
        showToast("Reel marked as posted!", "success");
      } else if (item.type === "report") {
        await submitReport({
          userId: user.id,
          week: item.week ?? currentWeek,
          signups: 0,
          reelsPosted: 0,
          clubsActive: activeClubsCount,
          win: notes || proofUrl || "Weekly Report Submitted",
          blocker: "",
        });
        showToast(`Week ${item.week} report submitted!`, "success");
      } else if (item.type === "club") {
        if (item.meta?.club) {
          await updateClub({ id: (item.meta.club as { id: string }).id, active: true });
          showToast("Club marked as active!", "success");
        } else {
          await addClub({ teamId: user.teamId ?? "", userId: user.id, name: notes || "New Club", domain: "General" });
          showToast("Club onboarded!", "success");
        }
      } else {
        showToast("Submitted!", "success");
      }
      setSelectedItem(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed.";
      showToast(msg, "error");
    }
  }, [selectedItem, user, submitProofMutation, toggleReelPosted, submitReport, addClub, updateClub, currentWeek, showToast]);

  return (
    <div className="w-full space-y-4" aria-label="Mission Board">
      {/* Filter chips */}
      <FilterBar active={filter} onChange={setFilter} counts={counts} />

      {/* Task grid */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-dashed border-[#222] p-8 text-center bg-[#0A0A0A]"
          >
            <p className="text-[11px] font-mono text-[#3A3A3A] uppercase tracking-[0.1em]">No tasks</p>
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

      {/* Submission Modal */}
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

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <ToastNotification
            key={toastKey}
            toast={toast}
            onDismiss={dismissToast}
            prefersReduced={prefersReduced}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
