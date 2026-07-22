/**
 * ReviewQueue.tsx — Dedicated Captain Review Workflow for LEAD users
 *
 * Design language: Sharp edges, bg-[#111], border border-[#222], h-[2px] accent bar.
 * Preserves exact color scheme (#CCFF00, #FF5500, #4488FF, #111, #0A0A0A).
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { fetchTeamSubmissions, approveTask, rejectTask } from "../lib/queries/tasks";
import type { Task } from "../lib/types";

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

export default function ReviewQueue() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [rejectingItem, setRejectingItem] = useState<Task | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Query team submissions pending approval
  const { data: submissions = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["team_submissions", user?.teamId],
    queryFn: () => fetchTeamSubmissions(user?.teamId ?? ""),
    enabled: !!user?.teamId && (user.role === "LEAD" || user.role === "SUPER_ADMIN"),
    staleTime: 15_000,
  });

  const approveMutation = useMutation({
    mutationFn: async (task: Task) => {
      if (!user) throw new Error("Not authenticated");
      await approveTask({
        submissionId: task.submissionId!,
        reviewerId: user.id,
        submitterId: task.submittedBy!,
        points: task.points,
      });
    },
    onSuccess: (_, task) => {
      setToastMessage(`Approved task "${task.title}" (+${task.points} pts awarded)`);
      qc.invalidateQueries({ queryKey: ["team_submissions", user?.teamId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["team_members"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ task, reason }: { task: Task; reason: string }) => {
      if (!user) throw new Error("Not authenticated");
      await rejectTask({
        submissionId: task.submissionId!,
        reviewerId: user.id,
        submitterId: task.submittedBy!,
        reason,
      });
    },
    onSuccess: (_, variables) => {
      setToastMessage(`Rejected submission for "${variables.task.title}"`);
      setRejectingItem(null);
      setRejectReason("");
      setRejectError(null);
      qc.invalidateQueries({ queryKey: ["team_submissions", user?.teamId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: Error) => {
      setRejectError(err.message);
    },
  });

  const handleApprove = useCallback(
    (task: Task) => {
      approveMutation.mutate(task);
    },
    [approveMutation]
  );

  const handleOpenRejectModal = (task: Task) => {
    setRejectingItem(task);
    setRejectReason("");
    setRejectError(null);
  };

  const handleConfirmReject = () => {
    if (!rejectReason.trim()) {
      setRejectError("Rejection reason is required.");
      return;
    }
    if (rejectingItem) {
      rejectMutation.mutate({ task: rejectingItem, reason: rejectReason.trim() });
    }
  };

  if (!user || (user.role !== "LEAD" && user.role !== "SUPER_ADMIN")) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1A1A1A]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#F0F0F0] tracking-tight">Team Submissions Queue</h2>
            <span className="px-2 py-0.5 text-[10px] font-black bg-[#FF5500]/10 text-[#FF5500] border border-[#FF5500]/20 rounded uppercase">
              {submissions.length} Pending
            </span>
          </div>
          <p className="text-xs text-[#555] font-mono mt-1">
            Review proof from your team members. Points are awarded upon verification.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="self-start sm:self-auto px-3 py-1.5 bg-[#111] hover:bg-[#1A1A1A] border border-[#222] text-xs font-mono text-[#888] hover:text-[#F0F0F0] transition-colors focus-visible:outline-none"
        >
          {isRefetching ? "Refreshing…" : "Refresh Queue"}
        </button>
      </div>

      {/* Toast Feedback */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-[#111] border border-[#C8FF00]/30 text-xs font-semibold text-[#C8FF00] flex items-center justify-between"
          >
            <span>{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="text-[#555] hover:text-white">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading state */}
      {isLoading && (
        <div className="p-8 text-center bg-[#111] border border-[#222]">
          <p className="text-xs text-[#666] font-mono animate-pulse">Loading pending team submissions...</p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="p-4 bg-[#FF5500]/10 border border-[#FF5500]/30 text-xs text-[#FF5500]">
          Failed to load team submissions: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && submissions.length === 0 && (
        <div className="p-12 text-center bg-[#111] border border-[#222] relative">
          <div className="w-10 h-10 bg-[#1A1A1A] text-[#555] flex items-center justify-center mx-auto mb-3">
            <FileTextIcon />
          </div>
          <h3 className="text-sm font-bold text-[#F0F0F0]">No pending reviews</h3>
          <p className="text-xs text-[#555] font-mono mt-1 max-w-sm mx-auto">
            All team task submissions have been reviewed! New submissions will appear here automatically.
          </p>
        </div>
      )}

      {/* Queue items list */}
      {!isLoading && submissions.length > 0 && (
        <div className="space-y-4">
          {submissions.map((task) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-[#111] border border-[#222] relative p-5 space-y-4"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#FF5500]" aria-hidden="true" />

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#888] uppercase tracking-wider">{task.category}</span>
                    <span className="text-xs font-mono text-[#444]">·</span>
                    <span className="text-xs font-bold text-[#C8FF00] font-mono">+{task.points} PTS</span>
                  </div>
                  <h3 className="text-base font-bold text-[#F0F0F0] mt-1">{task.title}</h3>
                  {task.description && (
                    <p className="text-xs text-[#666] mt-0.5 leading-relaxed">{task.description}</p>
                  )}
                </div>

                <div className="text-right sm:text-right shrink-0">
                  <span className="text-[11px] font-mono text-[#888] block">
                    Submitter ID: {task.submittedBy?.slice(0, 8)}
                  </span>
                  {task.submittedAt && (
                    <span className="text-[10px] text-[#444] font-mono block">
                      Submitted: {new Date(task.submittedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Submitter Notes & Proof */}
              <div className="p-3 bg-[#0A0A0A] border border-[#1A1A1A] space-y-2">
                {task.notes && (
                  <div>
                    <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider block mb-0.5">
                      Notes
                    </span>
                    <p className="text-xs text-[#D0D0D0] font-mono leading-normal whitespace-pre-wrap">
                      {task.notes}
                    </p>
                  </div>
                )}

                {task.proofUrl ? (
                  <div className="pt-2 border-t border-[#1A1A1A] flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider">Proof Asset</span>
                    <a
                      href={task.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1A1A1A] hover:bg-[#222] border border-[#333] text-xs font-mono text-[#C8FF00] transition-colors"
                    >
                      View Proof →
                    </a>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#555] italic">No URL proof attached</p>
                )}
              </div>

              {/* Approval Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => handleOpenRejectModal(task)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className="px-4 py-2 bg-[#FF5500]/10 hover:bg-[#FF5500]/20 border border-[#FF5500]/30 text-xs font-bold text-[#FF5500] flex items-center gap-1.5 transition-colors focus-visible:outline-none"
                >
                  <XIcon />
                  Reject
                </button>

                <button
                  onClick={() => handleApprove(task)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className="px-4 py-2 bg-[#C8FF00] hover:bg-[#b5e600] text-black text-xs font-bold flex items-center gap-1.5 transition-colors focus-visible:outline-none"
                >
                  <CheckIcon />
                  {approveMutation.isPending ? "Approving…" : "Approve & Award Points"}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal for Rejection Reason */}
      <AnimatePresence>
        {rejectingItem && (
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

              <h3 className="text-base font-bold text-[#F0F0F0]">Reject Submission</h3>
              <p className="text-xs text-[#666] font-mono">
                Provide a clear reason for rejecting "{rejectingItem.title}". The member will see this note and can re-submit proof.
              </p>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#555] uppercase tracking-wider">
                  Rejection Reason (Required)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Proof link is broken / Screenshot does not show date"
                  rows={3}
                  className="w-full p-3 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono focus:outline-none focus:border-[#FF5500]/50"
                />
              </div>

              {rejectError && (
                <p className="text-xs text-[#FF5500] font-bold">{rejectError}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setRejectingItem(null)}
                  className="px-3 py-1.5 text-xs text-[#888] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReject}
                  disabled={rejectMutation.isPending}
                  className="px-4 py-2 bg-[#FF5500] text-black text-xs font-bold hover:bg-[#e04b00] transition-colors"
                >
                  {rejectMutation.isPending ? "Rejecting…" : "Confirm Rejection"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
