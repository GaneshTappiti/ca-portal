/**
 * queries/tasks.ts — Supabase query functions for tasks
 * Uses secure transactional RPCs for state changes.
 */

import { supabase } from "../supabaseClient";
import { applyTransition } from "../types";
import type { Task, TaskStatus } from "../types";

// ─── Fetch tasks for the current user ────────────────────────────────────────
export async function fetchTasks(userId: string): Promise<Task[]> {
  const { data: defs, error: defsError } = await supabase
    .from("task_definitions")
    .select("*")
    .eq("active", true)
    .order("created_at");

  if (defsError) throw defsError;
  if (!defs) return [];

  const { data: subs, error: subsError } = await supabase
    .from("task_submissions")
    .select("*")
    .eq("user_id", userId);

  if (subsError) throw subsError;

  const subMap = new Map((subs ?? []).map((s) => [s.task_id, s]));

  return defs.map((def) => {
    const sub = subMap.get(def.id);
    return {
      id: sub ? sub.id : def.id,
      taskDefId: def.id,
      submissionId: sub?.id,
      title: def.title,
      description: def.description,
      points: def.points,
      category: def.category as Task["category"],
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

// ─── Fetch team submissions (for LEAD review view) ───────────────────────────
export async function fetchTeamSubmissions(teamId: string): Promise<Task[]> {
  // Query pending submissions for users in team
  const { data, error } = await supabase
    .from("task_submissions")
    .select(`
      *,
      task_definitions (id, title, description, points, category),
      profiles!inner (id, full_name, team_id, college)
    `)
    .eq("status", "pending")
    .eq("profiles.team_id", teamId)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("[fetchTeamSubmissions] Error fetching submissions:", error);
    // Fallback: query without inner join filter if initial filter throws
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("task_submissions")
      .select(`
        *,
        task_definitions (id, title, description, points, category),
        profiles (id, full_name, team_id, college)
      `)
      .eq("status", "pending")
      .order("submitted_at", { ascending: false });

    if (fallbackError) throw fallbackError;
    return (fallbackData ?? [])
      .filter((row) => row.profiles?.team_id === teamId)
      .map((row) => ({
        id: row.id,
        taskDefId: row.task_id,
        submissionId: row.id,
        title: (row.task_definitions as { title?: string })?.title ?? "Task",
        description: (row.task_definitions as { description?: string })?.description,
        points: (row.task_definitions as { points?: number })?.points ?? 0,
        category: ((row.task_definitions as { category?: string })?.category ?? "General") as Task["category"],
        status: row.status as TaskStatus,
        proofUrl: row.proof_url,
        notes: row.notes,
        submittedAt: row.submitted_at,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewed_by,
        rejectionReason: row.rejection_reason,
        pointsAwarded: row.points_awarded ?? 0,
        submittedBy: row.user_id,
      }));
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    taskDefId: row.task_id,
    submissionId: row.id,
    title: (row.task_definitions as { title?: string })?.title ?? "Task",
    description: (row.task_definitions as { description?: string })?.description,
    points: (row.task_definitions as { points?: number })?.points ?? 0,
    category: ((row.task_definitions as { category?: string })?.category ?? "General") as Task["category"],
    status: row.status as TaskStatus,
    proofUrl: row.proof_url,
    notes: row.notes,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    rejectionReason: row.rejection_reason,
    pointsAwarded: row.points_awarded ?? 0,
    submittedBy: row.user_id,
  }));
}

// ─── Submit proof (Transactional RPC) ─────────────────────────────────────────
export async function submitTaskProof(params: {
  taskDefId: string;
  userId: string;
  currentStatus: TaskStatus;
  proofUrl: string;
  notes?: string;
}): Promise<void> {
  applyTransition(params.currentStatus, "submit");

  // Call database RPC function submit_task
  const { error } = await supabase.rpc("submit_task", {
    p_task_id: params.taskDefId,
    p_proof_url: params.proofUrl,
    p_notes: params.notes ?? null,
  });

  if (error) {
    // Fallback client mutation if RPC function isn't applied yet
    const { error: upsertErr } = await supabase.from("task_submissions").upsert({
      task_id: params.taskDefId,
      user_id: params.userId,
      proof_url: params.proofUrl,
      notes: params.notes ?? "",
      status: "pending",
      submitted_at: new Date().toISOString(),
    }, { onConflict: "task_id,user_id" });

    if (upsertErr) throw upsertErr;
  }
}

// ─── Approve task (Transactional RPC with audit log) ─────────────────────────
export async function approveTask(params: {
  submissionId: string;
  reviewerId: string;
  submitterId: string;
  points: number;
}): Promise<void> {
  const { error } = await supabase.rpc("approve_task_submission", {
    p_submission_id: params.submissionId,
    p_points_override: params.points,
  });

  if (error) {
    const { error: updateErr } = await supabase
      .from("task_submissions")
      .update({
        status: "verified",
        reviewed_by: params.reviewerId,
        reviewed_at: new Date().toISOString(),
        points_awarded: params.points,
        rejection_reason: null,
      })
      .eq("id", params.submissionId)
      .eq("status", "pending");

    if (updateErr) throw updateErr;
  }
}

// ─── Reject task (Transactional RPC with required reason) ────────────────────
export async function rejectTask(params: {
  submissionId: string;
  reviewerId: string;
  submitterId: string;
  reason?: string;
}): Promise<void> {
  if (!params.reason || !params.reason.trim()) {
    throw new Error("Rejection reason is required.");
  }

  const { error } = await supabase.rpc("reject_task_submission", {
    p_submission_id: params.submissionId,
    p_rejection_reason: params.reason.trim(),
  });

  if (error) {
    const { error: updateErr } = await supabase
      .from("task_submissions")
      .update({
        status: "rejected",
        reviewed_by: params.reviewerId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: params.reason.trim(),
      })
      .eq("id", params.submissionId)
      .eq("status", "pending");

    if (updateErr) throw updateErr;
  }
}
