/**
 * Phase 2.2 — Persistent tasks + state machine transitions
 * Phase 2.3 — Real proof upload (DropZone → base64)
 * Phase 2.5 — LEAD verification workflow (approve/reject)
 * Phase 2.6 — Notifications from transition hooks
 * Phase 4.1 — Focus trap in SubmissionModal
 * Phase 4.2 — Keyboard navigation for task grid (roving tabindex)
 * Phase 4.3 — ARIA attributes throughout
 * Phase 4.4 — Reduced motion
 * Phase 4.6 — Semantic table for Pending section
 * Phase 4.7 — Toast: role="alert", aria-live="polite"
 * Phase 5.3 — TaskCard wrapped in React.memo
 * Phase 5.4 — List virtualization with @tanstack/react-virtual
 * Phase 7.5 — BroadcastChannel real-time sync
 * Phase 7.6 — i18n strings
 */

import {
  memo,
  useState,
  useEffect,
  useCallback,
  useRef,
  useId,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import FocusTrap from "focus-trap-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTaskStore, useTeamStore, broadcastEvent, useRealtimeSync } from "./lib/store";
import { useAuth } from "./lib/auth";
import DropZone from "./components/DropZone";
import type { Task } from "./lib/store";
import type { RealtimeEvent } from "./lib/store";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastState = { message: string; type: "success" | "info" | "error"; id: number } | null;

// ─── Icons ────────────────────────────────────────────────────────────────────

function PointsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── CategoryChip ─────────────────────────────────────────────────────────────

type TaskCategory = "Community" | "Marketing" | "Events";
const CATEGORY_COLORS: Record<TaskCategory, string> = {
  Community: "#CCFF00",
  Marketing: "#0066FF",
  Events: "#FF6A00",
};

function CategoryChip({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category as TaskCategory] ?? "#999";
  return (
    <span
      className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
      style={{ color, backgroundColor: `${color}11`, border: `1px solid ${color}22` }}
    >
      {category}
    </span>
  );
}

// ─── Phase 4.7 — Accessible Toast ────────────────────────────────────────────

function ToastNotification({
  toast,
  onDismiss,
  prefersReduced,
}: {
  toast: NonNullable<ToastState>;
  onDismiss: () => void;
  prefersReduced: boolean | null;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const accent = toast.type === "success" ? "#CCFF00" : toast.type === "error" ? "#FF6A00" : "#0066FF";

  return (
    /* Phase 4.7 — role="alert" + aria-live="polite" */
    <motion.div
      initial={{ opacity: 0, y: prefersReduced ? 0 : -20, scale: prefersReduced ? 1 : 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: prefersReduced ? 0 : -20, scale: prefersReduced ? 1 : 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onClick={onDismiss}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className="fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3 rounded-xl bg-[#0A0A0A]/90 backdrop-blur-xl border border-[#1A1A1A]/50 shadow-[0_0_60px_rgba(0,0,0,0.5)] cursor-pointer max-w-sm"
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}11`, border: `1px solid ${accent}22` }}
        aria-hidden="true"
      >
        {toast.type === "success" ? <CheckCircleIcon /> : <XCircleIcon />}
      </div>
      <span className="text-sm font-semibold text-white pr-2 flex-1">{toast.message}</span>
      <motion.div
        className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
        style={{ backgroundColor: accent }}
        initial={{ scaleX: 1, transformOrigin: "left" }}
        animate={{ scaleX: 0, transformOrigin: "left" }}
        transition={{ duration: 4, ease: "linear" }}
        aria-hidden="true"
      />
    </motion.div>
  );
}

// ─── Phase 4.1 — Submission Modal with focus trap ─────────────────────────────

function SubmissionModal({
  task,
  onClose,
  onSubmit,
  triggerRef,
  prefersReduced,
}: {
  task: Task;
  onClose: () => void;
  onSubmit: (proofUrl: string, notes: string) => void;
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

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        triggerRef.current?.focus(); // Phase 4.1 — return focus to trigger
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, triggerRef]);

  const handleSubmit = useCallback(async () => {
    if (!proofUrl) {
      setProofError(t("errors.proofRequired", "Proof file is required."));
      return;
    }
    setSubmitting(true);
    await onSubmit(proofUrl, notes.trim());
    setSubmitting(false);
  }, [proofUrl, notes, onSubmit, t]);

  return (
    // Phase 4.1 — FocusTrap keeps Tab/Shift+Tab inside the modal
    <FocusTrap
      focusTrapOptions={{
        onDeactivate: () => {
          onClose();
          triggerRef.current?.focus();
        },
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
          className="absolute inset-0 bg-[#000000]/75 backdrop-blur-sm"
          onClick={() => { onClose(); triggerRef.current?.focus(); }}
          aria-hidden="true"
        />

        {/* Panel */}
        <motion.div
          initial={{ opacity: 0, scale: prefersReduced ? 1 : 0.97, y: prefersReduced ? 0 : 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: prefersReduced ? 1 : 0.97, y: prefersReduced ? 0 : 24 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="relative w-full max-w-lg bg-[#111] border border-[#2E2E2E] p-6 sm:p-8"
        >
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#C8FF00]" aria-hidden="true" />

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-base font-bold text-[#F0F0F0] tracking-tight">{t("tasks.submitProof")}</h2>
              <p className="text-[11px] text-[#666] font-mono mt-0.5">{task.title}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 px-2 py-1 border border-[#C8FF00]/20 bg-[#C8FF00]/[0.06]">
                <PointsIcon />
                <span className="text-[11px] font-black text-[#C8FF00] tabular-nums">+{task.points}</span>
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
            {/* Phase 2.3 + 7.3 — DropZone file upload */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#999] uppercase tracking-wider">{t("tasks.proofFileLabel")}</label>
              <DropZone
                onFileAccepted={(url) => { setProofUrl(url); setProofError(null); }}
                onError={(msg) => setProofError(msg)}
                userId={user?.id ?? ""}
                taskDefId={task.taskDefId}
                currentFileName={proofUrl && !proofUrl.startsWith("data:") ? "Previously uploaded" : undefined}
              />
              {proofError && (
                <p role="alert" className="text-xs text-[#FF6A00] font-medium">{proofError}</p>
              )}
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="submission-notes" className="text-xs font-semibold text-[#999] uppercase tracking-wider">{t("tasks.notesLabel")}</label>
              <textarea
                id="submission-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("tasks.notesPlaceholder")}
                rows={3}
                maxLength={1000}
                className="w-full px-4 py-2.5 bg-[#0A0A0A] border border-[#222] text-sm text-[#F0F0F0] placeholder-[#2E2E2E] focus:outline-none focus:border-[#C8FF00]/40 focus:ring-1 focus:ring-[#C8FF00]/20 transition-all duration-200 resize-none"
              />
              <p className="text-[10px] text-[#555] text-right">{notes.length}/1000</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => { onClose(); triggerRef.current?.focus(); }}
              className="flex-1 px-4 py-2.5 border border-[#222] text-sm font-semibold text-[#666] transition-all duration-200 hover:text-[#F0F0F0] hover:border-[#444] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#444]"
            >
              {t("tasks.cancel")}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!proofUrl || submitting}
              className="flex-1 px-4 py-2.5 bg-[#C8FF00] text-[#000] text-sm font-black tracking-tight transition-all duration-200 hover:opacity-90 active:scale-[0.97] disabled:opacity-25 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
            >
              {submitting ? (
                <>
                  <motion.span
                    className="inline-block w-4 h-4 border-2 border-[#000000] border-t-transparent rounded-full"
                    animate={prefersReduced ? {} : { rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    aria-hidden="true"
                  />
                  {t("tasks.submitting")}
                </>
              ) : t("tasks.submitProof")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </FocusTrap>
  );
}

// ─── Phase 5.3 — TaskCard: React.memo ────────────────────────────────────────

const TaskCard = memo(function TaskCard({
  task,
  onExecute,
  triggerRef,
  prefersReduced,
  userDomain,
  isLead,
  style,
}: {
  task: Task;
  onExecute: (task: Task, ref: React.MutableRefObject<HTMLButtonElement | null>) => void;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
  prefersReduced: boolean | null;
  userDomain?: string;
  isLead: boolean;
  style?: React.CSSProperties;
}) {
  const { t } = useTranslation();
  
  const isDomainMatch = isLead || task.category === userDomain || task.category === "General";
  const isDisabled = !isDomainMatch || (task.status !== "open" && task.status !== "rejected");

  const statusColor =
    task.status === "verified" ? "#CCFF00" :
    task.status === "pending" ? "#FF6A00" :
    task.status === "rejected" ? "#FF4040" : "#CCFF00";

  return (
    <div
      className="bg-[#111] border border-[#222] flex flex-col gap-0 relative overflow-hidden group"
      style={style}
      aria-label={`${task.title}, ${task.points} points, status: ${task.status}`}
    >
      {/* Status accent — top border, not blurred glow */}
      <div className="h-[2px] w-full" style={{ background: statusColor }} aria-hidden="true" />
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-bold text-[#F0F0F0] leading-snug flex-1">{task.title}</h3>
          <CategoryChip category={task.category} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-0.5 border border-[#C8FF00]/20 bg-[#C8FF00]/[0.06]">
            <PointsIcon />
            <span className="text-[11px] font-black text-[#C8FF00] tabular-nums">+{task.points}</span>
          </div>
          {task.status !== "open" && (
            <span
              className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em]"
              style={{ color: statusColor, border: `1px solid ${statusColor}30` }}
            >
              {task.status}
            </span>
          )}
        </div>
        <button
          ref={triggerRef}
          onClick={(e) => { e.stopPropagation(); onExecute(task, triggerRef); }}
          disabled={isDisabled}
          className="w-full px-4 py-2 bg-[#C8FF00] text-[#000] text-[11px] font-black tracking-tight transition-all duration-200 hover:opacity-90 active:scale-[0.97] disabled:opacity-20 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
          aria-label={`Execute task: ${task.title}`}
        >
          {!isDomainMatch ? "Not Your Domain" : isDisabled ? task.status : t("tasks.executeTask")}
        </button>
      </div>
    </div>
  );
});

// ─── Review Panel (Phase 2.5) ─────────────────────────────────────────────────

function ReviewPanel({
  tasks,
  userEmail,
  prefersReduced,
  showToast,
}: {
  tasks: Task[];
  userEmail: string;
  prefersReduced: boolean | null;
  showToast: (msg: string, type: "success" | "info" | "error") => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { approveTask, rejectTask } = useTaskStore(user?.id ?? "", user?.teamId);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);

  if (pendingTasks.length === 0) return null;

  const handleApprove = async (task: Task) => {
    if (!user) return;
    try {
      await approveTask({
        submissionId: task.submissionId!,
        reviewerId: user.id,
        submitterId: task.submittedBy ?? "",
        points: task.points,
      });
      broadcastEvent({ type: "TASK_APPROVED", taskId: task.id });
      showToast(`"${task.title}" approved! Points credited.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Approval failed", "error");
    }
  };

  const handleReject = async (task: Task) => {
    if (!user) return;
    const reason = rejectReason[task.id] ?? "";
    try {
      await rejectTask({
        submissionId: task.submissionId!,
        reviewerId: user.id,
        submitterId: task.submittedBy ?? "",
        reason,
      });
      broadcastEvent({ type: "TASK_REJECTED", taskId: task.id });
      showToast(`"${task.title}" rejected.`, "info");
      setRejecting(null);
      setRejectReason((prev) => { const n = { ...prev }; delete n[task.id]; return n; });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Rejection failed", "error");
    }
  };

  return (
    <section aria-labelledby="review-queue-heading" className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 shadow-[0_0_40px_rgba(255,255,255,0.03)]">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-[#FF6A00] animate-pulse" aria-hidden="true" />
        <h3 id="review-queue-heading" className="text-sm font-bold text-white">{t("tasks.reviewQueue")}</h3>
        <span className="text-xs text-[#666]">({pendingTasks.length})</span>
      </div>

      {/* Phase 4.6 — Semantic table on desktop, cards on mobile */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full" aria-label="Tasks pending review">
          <thead>
            <tr className="border-b border-[#1A1A1A]">
              {["Task", "Category", "Points", "Proof", "Actions"].map((col) => (
                <th key={col} scope="col" className="py-2 px-3 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pendingTasks.map((task) => (
              <tr key={task.id} className="border-b border-[#1A1A1A]/50 hover:bg-white/[0.01]">
                <td className="py-3 px-3">
                  <p className="text-sm font-semibold text-white">{task.title}</p>
                  {task.notes && <p className="text-[10px] text-[#555] mt-0.5 max-w-[200px] truncate">{task.notes}</p>}
                </td>
                <td className="py-3 px-3"><CategoryChip category={task.category} /></td>
                <td className="py-3 px-3 text-sm font-bold text-[#CCFF00] tabular-nums">+{task.points}</td>
                <td className="py-3 px-3">
                  {task.proofUrl ? (
                    task.proofUrl.startsWith("data:image") ? (
                      <img
                        src={task.proofUrl}
                        alt={`Proof for ${task.title}`}
                        className="w-12 h-12 rounded-lg object-cover border border-[#1A1A1A]"
                      />
                    ) : task.proofUrl.startsWith("data:video") ? (
                      <video
                        src={task.proofUrl}
                        className="w-12 h-12 rounded-lg object-cover border border-[#1A1A1A]"
                        aria-label={`Video proof for ${task.title}`}
                      />
                    ) : (
                      // Storage path — show a link icon
                      <div className="w-12 h-12 rounded-lg border border-[#1A1A1A] flex items-center justify-center bg-[#CCFF00]/5" title="File uploaded">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </div>
                    )
                  ) : (
                    <span className="text-xs text-[#555]">{t("tasks.noProof")}</span>
                  )}
                </td>
                <td className="py-3 px-3">
                  {rejecting === task.id ? (
                    <div className="flex flex-col gap-2 min-w-[200px]">
                      <input
                        type="text"
                        value={rejectReason[task.id] ?? ""}
                        onChange={(e) => setRejectReason((prev) => ({ ...prev, [task.id]: e.target.value }))}
                        placeholder={t("tasks.rejectionReason")}
                        aria-label="Rejection reason"
                        className="px-3 py-1.5 rounded-lg bg-[#000] border border-[#1A1A1A] text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#FF6A00]/40 transition-all"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleReject(task)} className="flex-1 px-3 py-1.5 rounded-lg bg-[#FF6A00] text-white text-xs font-bold hover:opacity-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/50">
                          Confirm
                        </button>
                        <button onClick={() => setRejecting(null)} className="px-3 py-1.5 rounded-lg border border-[#1A1A1A] text-xs text-[#666] hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#333]">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(task)}
                        aria-label={`Approve ${task.title}`}
                        className="px-3 py-1.5 rounded-lg bg-[#CCFF00] text-[#000] text-xs font-bold hover:opacity-90 active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
                      >
                        {t("tasks.approve")}
                      </button>
                      <button
                        onClick={() => setRejecting(task.id)}
                        aria-label={`Reject ${task.title}`}
                        className="px-3 py-1.5 rounded-lg border border-[#FF6A00]/30 text-[#FF6A00] text-xs font-semibold hover:bg-[#FF6A00]/10 active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/50"
                      >
                        {t("tasks.reject")}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card fallback (Phase 4.6) */}
      <div className="sm:hidden space-y-3">
        {pendingTasks.map((task) => (
          <div key={task.id} className="rounded-xl bg-[#000]/40 border border-[#1A1A1A]/30 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-white">{task.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <CategoryChip category={task.category} />
                  <span className="text-xs font-bold text-[#CCFF00]">+{task.points}</span>
                </div>
              </div>
              {task.proofUrl && task.proofUrl.startsWith("data:image") && (
                <img src={task.proofUrl} alt="Proof" className="w-14 h-14 rounded-lg object-cover border border-[#1A1A1A] shrink-0" />
              )}
            </div>
            {task.notes && <p className="text-xs text-[#555]">{task.notes}</p>}
            <div className="flex gap-2">
              <button onClick={() => handleApprove(task)} className="flex-1 px-3 py-2 rounded-xl bg-[#CCFF00] text-[#000] text-xs font-bold hover:opacity-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50">
                {t("tasks.approve")}
              </button>
              <button onClick={() => setRejecting(task.id)} className="flex-1 px-3 py-2 rounded-xl border border-[#FF6A00]/30 text-[#FF6A00] text-xs font-semibold hover:bg-[#FF6A00]/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/50">
                {t("tasks.reject")}
              </button>
            </div>
            {rejecting === task.id && (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={rejectReason[task.id] ?? ""}
                  onChange={(e) => setRejectReason((prev) => ({ ...prev, [task.id]: e.target.value }))}
                  placeholder={t("tasks.rejectionReason")}
                  className="px-3 py-2 rounded-xl bg-[#000] border border-[#1A1A1A] text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#FF6A00]/40"
                />
                <button onClick={() => handleReject(task)} className="px-3 py-2 rounded-xl bg-[#FF6A00] text-white text-xs font-bold hover:opacity-90">
                  Confirm Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Virtualized Task Grid (Phase 5.4) ────────────────────────────────────────

function VirtualTaskGrid({
  tasks,
  onExecute,
  prefersReduced,
  userDomain,
  isLead,
}: {
  tasks: Task[];
  onExecute: (task: Task, ref: React.MutableRefObject<HTMLButtonElement | null>) => void;
  prefersReduced: boolean | null;
  userDomain?: string;
  isLead: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Phase 5.4 — virtualize only if >20 items, otherwise render normally
  const shouldVirtualize = tasks.length > 20;

  // Phase 4.2 — roving tabindex for keyboard navigation
  const [focusedIdx, setFocusedIdx] = useState(0);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const triggerRefs = useRef<Array<React.RefObject<HTMLButtonElement | null>>>([]);

  // Ensure triggerRefs are allocated
  tasks.forEach((_, i) => {
  triggerRefs.current[i] = { current: null } as React.MutableRefObject<HTMLButtonElement | null>;
  });

  const COLS = 3; // approx column count at lg breakpoint
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      let next = idx;
      if (e.key === "ArrowRight") next = Math.min(idx + 1, tasks.length - 1);
      else if (e.key === "ArrowLeft") next = Math.max(idx - 1, 0);
      else if (e.key === "ArrowDown") next = Math.min(idx + COLS, tasks.length - 1);
      else if (e.key === "ArrowUp") next = Math.max(idx - COLS, 0);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tasks.length - 1;
      else return;
      e.preventDefault();
      setFocusedIdx(next);
      cardRefs.current[next]?.focus();
    },
    [tasks.length]
  );

  // Virtual row implementation
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? Math.ceil(tasks.length / COLS) : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 3,
  });

  if (!shouldVirtualize) {
    // Normal grid for ≤20 tasks
    return (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        role="grid"
        aria-label="Available tasks"
      >
        {tasks.map((task, i) => (
          <div key={task.id} role="gridcell">
            <TaskCard
              task={task}
              onExecute={onExecute}
              triggerRef={triggerRefs.current[i]}
              prefersReduced={prefersReduced}
              userDomain={userDomain}
              isLead={isLead}
            />
          </div>
        ))}
      </div>
    );
  }

  // Phase 5.4 — Virtual grid for large datasets
  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      style={{ height: 560 }}
      role="grid"
      aria-label="Available tasks"
      onKeyDown={(e) => handleGridKeyDown(e, focusedIdx)}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vRow) => {
          const rowStart = vRow.index * COLS;
          const rowTasks = tasks.slice(rowStart, rowStart + COLS);
          return (
            <div
              key={vRow.key}
              style={{ position: "absolute", top: vRow.start, left: 0, right: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4"
            >
              {rowTasks.map((task, colIdx) => {
                const absIdx = rowStart + colIdx;
                return (
                  <div key={task.id} role="gridcell">
                    <TaskCard
                      task={task}
                      onExecute={onExecute}
                      triggerRef={triggerRefs.current[absIdx]}
                      prefersReduced={prefersReduced}
                      userDomain={userDomain}
                      isLead={isLead}
                      style={{}}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pending list (Phase 4.6 — shown below task grid for MEMBER view) ─────────

function PendingList({ tasks, prefersReduced }: { tasks: Task[]; prefersReduced: boolean | null }) {
  const { t } = useTranslation();
  const pendingTasks = useMemo(() => tasks.filter((task) => task.status === "pending"), [tasks]);

  if (pendingTasks.length === 0) return null;

  return (
    <section aria-labelledby="pending-heading" className="rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-[#1A1A1A]/50 p-5 sm:p-6 shadow-[0_0_40px_rgba(255,255,255,0.03)]">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-[#FF6A00] animate-pulse" aria-hidden="true" />
        <h3 id="pending-heading" className="text-sm font-bold text-white">{t("tasks.pendingVerification")}</h3>
        <span className="text-xs text-[#666]">({pendingTasks.length})</span>
      </div>

      {/* Phase 4.6 — semantic table on desktop */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full" aria-label="Your pending tasks">
          <thead>
            <tr className="border-b border-[#1A1A1A]">
              <th scope="col" className="py-2 px-3 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider">Task</th>
              <th scope="col" className="py-2 px-3 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider">Category</th>
              <th scope="col" className="py-2 px-3 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider">Points</th>
              <th scope="col" className="py-2 px-3 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {pendingTasks.map((task) => (
                <motion.tr
                  key={task.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={prefersReduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
                  className="border-b border-[#1A1A1A]/50"
                >
                  <td className="py-3 px-3 text-sm font-semibold text-white">{task.title}</td>
                  <td className="py-3 px-3"><CategoryChip category={task.category} /></td>
                  <td className="py-3 px-3 text-sm font-bold text-[#CCFF00] tabular-nums">+{task.points}</td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-1 rounded-lg bg-[#FF6A00]/10 border border-[#FF6A00]/20 text-[10px] font-bold text-[#FF6A00] uppercase tracking-wider">
                      {t("tasks.underReview")}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Mobile card fallback (Phase 4.6) */}
      <div className="sm:hidden space-y-2">
        {pendingTasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#000]/40 border border-[#1A1A1A]/30">
            <motion.div
              animate={prefersReduced ? {} : { rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-4 h-4 border-2 border-[#FF6A00] border-t-transparent rounded-full shrink-0"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{task.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <CategoryChip category={task.category} />
                <span className="text-xs text-[#CCFF00] font-bold tabular-nums">+{task.points}</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-[#FF6A00]/10 border border-[#FF6A00]/20 text-[10px] font-bold text-[#FF6A00] uppercase tracking-wider whitespace-nowrap">
              {t("tasks.underReview")}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClstrTaskPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tasks, submitProof: submitProofMutation, isSubmitting } = useTaskStore(
    user?.id ?? "",
    user?.teamId
  );
  const { members } = useTeamStore(user?.teamId ?? "", user?.id ?? "");
  const prefersReduced = useReducedMotion();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [triggerRef, setTriggerRef] = useState<React.MutableRefObject<HTMLButtonElement | null> | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [toastKey, setToastKey] = useState(0);

  const isLead = user?.role === "LEAD" || user?.role === "SUPER_ADMIN";
  const currentUserDomain = undefined;

  const openTasks = useMemo(() => tasks.filter((t) => t.status === "open" || t.status === "rejected"), [tasks]);
  const pendingCount = useMemo(() => tasks.filter((t) => t.status === "pending").length, [tasks]);
  const verifiedCount = useMemo(() => tasks.filter((t) => t.status === "verified").length, [tasks]);

  const showToast = useCallback((message: string, type: "success" | "info" | "error") => {
    setToastKey((k) => k + 1);
    setToast({ message, type, id: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const handleExecute = useCallback(
    (task: Task, ref: React.MutableRefObject<HTMLButtonElement | null>) => {
      setSelectedTask(task);
      setTriggerRef(ref);
    },
    []
  );

  const handleSubmitProof = useCallback(
    async (proofUrl: string, notes: string) => {
      if (!selectedTask || !user) return;
      try {
        await submitProofMutation({
          taskDefId: selectedTask.taskDefId,
          userId: user.id,
          currentStatus: selectedTask.status,
          proofUrl,
          notes,
        });
        broadcastEvent({ type: "TASK_SUBMITTED", taskId: selectedTask.id });
        showToast(`"${selectedTask.title}" submitted for review`, "success");
        setSelectedTask(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("errors.genericError");
        showToast(msg, "error");
      }
    },
    [selectedTask, user, submitProofMutation, showToast, t]
  );

  // Phase 7.5 — BroadcastChannel real-time sync
  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    if (event.type === "TASK_SUBMITTED") {
      showToast("New task submission received!", "info");
    } else if (event.type === "TASK_APPROVED") {
      showToast("A task was approved!", "success");
    } else if (event.type === "TASK_REJECTED") {
      showToast("A task was rejected.", "info");
    }
  }, [showToast]);

  useRealtimeSync(handleRealtimeEvent);

  return (
    <div className="w-full space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border border-[#222] bg-[#111]">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-bold tracking-tight text-[#F0F0F0]">{t("tasks.boardTitle")}</h2>
          <p className="text-[10px] text-[#444] font-mono">
            {t("tasks.boardSubtitle", { open: openTasks.length, pending: pendingCount })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 border border-[#C8FF00]/20 bg-[#C8FF00]/[0.05] px-2 py-0.5 text-[10px] font-black text-[#C8FF00] tabular-nums">
            {t("tasks.openCount", { count: openTasks.length })}
          </span>
          <span className="flex items-center gap-1 border border-[#FF5500]/20 bg-[#FF5500]/[0.05] px-2 py-0.5 text-[10px] font-black text-[#FF5500] tabular-nums">
            {t("tasks.pendingCount", { count: pendingCount })}
          </span>
          {verifiedCount > 0 && (
            <span className="border border-[#C8FF00]/10 px-2 py-0.5 text-[10px] font-black text-[#444] tabular-nums">
              {verifiedCount} ✓
            </span>
          )}
        </div>
      </div>

      {/* Task grid or empty state */}
      <AnimatePresence mode="wait">
        {openTasks.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="border border-dashed border-[#222] p-8 text-center bg-[#0A0A0A]"
          >
            <p className="text-[11px] font-mono text-[#3A3A3A] uppercase tracking-[0.1em]">{t("tasks.allDone")}</p>
          </motion.div>
        ) : (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <VirtualTaskGrid
              tasks={openTasks}
              onExecute={handleExecute}
              prefersReduced={prefersReduced}
              userDomain={currentUserDomain}
              isLead={isLead}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEAD: Review queue (Phase 2.5) */}
      {isLead && user && (
        <ReviewPanel
          tasks={tasks}
          userEmail={user.email}
          prefersReduced={prefersReduced}
          showToast={showToast}
        />
      )}

      {/* MEMBER: Pending list (Phase 4.6 semantic table) */}
      {!isLead && <PendingList tasks={tasks} prefersReduced={prefersReduced} />}

      {/* Phase 4.1 — Submission Modal with focus trap */}
      <AnimatePresence>
        {selectedTask && triggerRef && (
          <SubmissionModal
            key={selectedTask.id}
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onSubmit={handleSubmitProof}
            triggerRef={triggerRef}
            prefersReduced={prefersReduced}
          />
        )}
      </AnimatePresence>

      {/* Phase 4.7 — Accessible toast */}
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
