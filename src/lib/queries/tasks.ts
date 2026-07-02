/**
 * queries/tasks.ts — Supabase query functions for tasks
 *
 * All task data operations go through these functions.
 * RLS on the server enforces role-based access — these functions
 * simply call Supabase and handle errors; they do not enforce security.
 */

import { supabase } from "../supabaseClient";
import { applyTransition } from "../types";
import type { Task, TaskStatus } from "../types";

// ─── Fetch tasks for the current user ────────────────────────────────────────
// Returns a merged view: task_definitions + this user's submission (if any)
export async function fetchTasks(userId: string): Promise<Task[]> {
  // 1. Get all active task definitions
  const { data: defs, error: defsError } = await supabase
    .from("task_definitions")
    .select("*")
    .eq("active", true)
    .order("created_at");

  if (defsError) throw defsError;
  if (!defs) return [];

  // 2. Get this user's submissions
  const { data: subs, error: subsError } = await supabase
    .from("task_submissions")
    .select("*")
    .eq("user_id", userId);

  if (subsError) throw subsError;

  const subMap = new Map((subs ?? []).map((s) => [s.task_id, s]));

  // 3. Merge into unified Task objects
  return defs.map((def) => {
    const sub = subMap.get(def.id);
    return {
      id: sub ? sub.id : def.id,
      taskDefId: def.id,
      submissionId: sub?.id,
      title: def.title,
      description: def.description,
      points: def.points,
      category: def.category,
      status: (sub?.status ?? "open") as TaskStatus,
      proofUrl: sub?.proof_url,
      notes: sub?.notes,
      submittedAt: sub?.submitted_at,
      reviewedAt: sub?.reviewed_at,
      reviewedBy: sub?.reviewed_by,
      rejectionReason: sub?.rejection_reason,
      pointsAwarded: sub?.points_awarded ?? 0,
      submittedBy: userId,
    };
  });
}

// ─── Fetch ALL team submissions (for LEAD review view) ────────────────────────
export async function fetchTeamSubmissions(teamId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("task_submissions")
    .select(`
      *,
      task_definitions (id, title, description, points, category),
      profiles (id, full_name, email)
    `)
    .eq("status", "pending")
    .order("submitted_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    taskDefId: row.task_id,
    submissionId: row.id,
    title: (row.task_definitions as { title: string }).title,
    description: (row.task_definitions as { description?: string }).description,
    points: (row.task_definitions as { points: number }).points,
    category: (row.task_definitions as { category: string }).category as Task["category"],
    status: row.status as TaskStatus,
    proofUrl: row.proof_url,
    notes: row.notes,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    rejectionReason: row.rejection_reason,
    pointsAwarded: row.points_awarded ?? 0,
    submittedBy: (row.profiles as { id: string }).id,
  }));
}

// ─── Submit proof (MEMBER action: open/rejected → pending) ────────────────────
export async function submitTaskProof(params: {
  taskDefId: string;
  userId: string;
  currentStatus: TaskStatus;
  proofUrl: string;
  notes?: string;
}): Promise<void> {
  // Validate state machine transition
  applyTransition(params.currentStatus, "submit");

  const { error } = await supabase
    .from("task_submissions")
    .upsert({
      task_id: params.taskDefId,
      user_id: params.userId,
      proof_url: params.proofUrl,
      notes: params.notes ?? "",
      status: "pending",
      submitted_at: new Date().toISOString(),
      // Reset review fields on re-submission
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
      points_awarded: 0,
    }, {
      onConflict: "task_id,user_id",
    });

  if (error) throw error;

  // Insert notification for the team LEAD
  await supabase.from("notifications").insert({
    user_id: params.userId, // Will be overridden by trigger in production
    type: "task_submitted",
    payload: { task_def_id: params.taskDefId, submitter_id: params.userId },
  });
}

// ─── Approve task (LEAD action: pending → verified) ───────────────────────────
export async function approveTask(params: {
  submissionId: string;
  reviewerId: string;
  submitterId: string;
  points: number;
}): Promise<void> {
  const { error } = await supabase
    .from("task_submissions")
    .update({
      status: "verified",
      reviewed_by: params.reviewerId,
      reviewed_at: new Date().toISOString(),
      points_awarded: params.points,
      rejection_reason: null,
    })
    .eq("id", params.submissionId)
    .eq("status", "pending");  // server-side state guard

  if (error) throw error;

  // Notify the submitter
  await supabase.from("notifications").insert({
    user_id: params.submitterId,
    type: "task_approved",
    payload: { submission_id: params.submissionId, points: params.points },
  });
}

// ─── Reject task (LEAD action: pending → rejected) ────────────────────────────
export async function rejectTask(params: {
  submissionId: string;
  reviewerId: string;
  submitterId: string;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase
    .from("task_submissions")
    .update({
      status: "rejected",
      reviewed_by: params.reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: params.reason ?? null,
    })
    .eq("id", params.submissionId)
    .eq("status", "pending");  // server-side state guard

  if (error) throw error;

  // Notify the submitter
  await supabase.from("notifications").insert({
    user_id: params.submitterId,
    type: "task_rejected",
    payload: { submission_id: params.submissionId, reason: params.reason },
  });
}
