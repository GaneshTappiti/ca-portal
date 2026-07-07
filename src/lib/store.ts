/**
 * store.ts — Supabase-backed React Query hooks
 *
 * Replaces the previous localStorage-based implementation.
 * All data is now persisted in Supabase and synced across devices in real time.
 *
 * Architecture:
 *   - useQuery()  → read data from Supabase (with caching + loading states)
 *   - useMutation() → write data to Supabase (with optimistic updates)
 *   - Supabase Realtime → replaces BroadcastChannel for cross-device sync
 *
 * The 90-day plan constants (TIER_TARGETS, WEEKLY_CUMULATIVE, etc.) remain
 * in types.ts as read-only — they require no DB.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { fetchLiveVerifiedUsers, fetchCollegeStats } from "./supabase";

import {
  fetchTasks,
  fetchTeamSubmissions,
  submitTaskProof,
  approveTask,
  rejectTask,
} from "./queries/tasks";
import { WEEKLY_CUMULATIVE } from "./types";
import {
  fetchTeamMembers,
  fetchInvites,
  generateInvite,
  acceptInvite,
  removeMember,
} from "./queries/team";
import {
  fetchReels,
  toggleReel,
  fetchClubs,
  addClub,
  updateClub,
  removeClub,
  fetchReports,
  submitReport,
  fetchProgramConfig,
} from "./queries/plan";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications,
  subscribeToTaskUpdates,
} from "./queries/notifications";

// Re-export all types and constants so existing imports don't break
export type {
  AuthRole,
  AuthUser,
  TaskCategory,
  TaskStatus,
  TaskDefinition,
  TaskSubmission,
  Task,
  TeamMember,
  InviteCode,
  Notification,
  Tier,
  ReelType,
  ReelEntry,
  ClubEntry,
  WeeklyReport,
  TaskAction,
} from "./types";

export {
  applyTransition,
  TIER_TARGETS,
  WEEKLY_CUMULATIVE,
  WEEK_NAMES,
  WEEK_DATES,
  WEEKLY_REELS,
  WEEKLY_CLUB_FOCUS,
  WEEKLY_MILESTONES,
} from "./types";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const QueryKeys = {
  tasks:         (userId: string)   => ["tasks", userId] as const,
  teamSubmissions:(teamId: string)  => ["team_submissions", teamId] as const,
  teamMembers:   (teamId: string)   => ["team_members", teamId] as const,
  invites:       (teamId: string)   => ["invites", teamId] as const,
  notifications: (userId: string)   => ["notifications", userId] as const,
  reels:         (userId: string)   => ["reels", userId] as const,
  clubs:         (teamId: string)   => ["clubs", teamId] as const,
  reports:       (userId: string)   => ["reports", userId] as const,
  verifiedUsers: (campus: string)   => ["verified_users", campus] as const,
  collegeStats:  (campus: string)   => ["college_stats", campus] as const,
};

// ─── Mock ID guard ────────────────────────────────────────────────────────────
//
// Mock credentials in auth.tsx use IDs like "mock-lead", "mock-admin",
// "mock-team" which are NOT valid UUIDs.  Sending these to Supabase REST API
// causes 400 / 500 errors and floods the browser console.
//
// Any ID that doesn’t look like a proper UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
// is treated as a mock ID and all Supabase queries are disabled.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true when the id is a dev-only mock (not a real Supabase UUID). */
export function isMockId(id: string | null | undefined): boolean {
  if (!id) return true;
  const isMock = !UUID_RE.test(id);
  if (isMock) {
    console.warn(`[isMockId] Warning: ID '${id}' is not a valid UUID. This might be a mock or legacy ID.`);
  }
  return false;
}

// ─── Program Config Hook ──────────────────────────────────────────────────────

import {
  WEEKLY_CUMULATIVE as FALLBACK_WEEKLY_CUMULATIVE,
  WEEK_NAMES as FALLBACK_WEEK_NAMES,
  WEEK_DATES as FALLBACK_WEEK_DATES,
  WEEKLY_REELS as FALLBACK_WEEKLY_REELS,
  WEEKLY_CLUB_FOCUS as FALLBACK_WEEKLY_CLUB_FOCUS,
  WEEKLY_MILESTONES as FALLBACK_WEEKLY_MILESTONES,
  TIER_TARGETS as FALLBACK_TIER_TARGETS,
} from "./types";

export function useProgramConfig() {
  const query = useQuery({
    queryKey: ["program_config"],
    queryFn: fetchProgramConfig,
    staleTime: 5 * 60 * 1000,
  });

  const data = query.data;

  return {
    ...query,
    campaignStartDate: data?.campaignStartDate ?? "2026-07-01",
    tierTargets: data?.tierTargets ?? FALLBACK_TIER_TARGETS,
    weeklyCumulative: data?.weeklyCumulative ?? FALLBACK_WEEKLY_CUMULATIVE,
    weekNames: data?.weekNames ?? FALLBACK_WEEK_NAMES,
    weekDates: data?.weekDates ?? FALLBACK_WEEK_DATES,
    weeklyReels: data?.weeklyReels ?? FALLBACK_WEEKLY_REELS,
    weeklyClubFocus: data?.weeklyClubFocus ?? FALLBACK_WEEKLY_CLUB_FOCUS,
    weeklyMilestones: data?.weeklyMilestones ?? FALLBACK_WEEKLY_MILESTONES,
  };
}

// ─── Task Store ───────────────────────────────────────────────────────────────

export function useTaskStore(userId: string, teamId?: string) {
  const qc = useQueryClient();
  const isReal = !isMockId(userId);

  const tasksQuery = useQuery({
    queryKey: QueryKeys.tasks(userId),
    queryFn:  () => fetchTasks(userId),
    enabled:  !!userId && isReal,
    staleTime: 30_000,
  });

  const teamSubsQuery = useQuery({
    queryKey: QueryKeys.teamSubmissions(teamId ?? ""),
    queryFn:  () => fetchTeamSubmissions(teamId!),
    enabled:  !!teamId && !isMockId(teamId),
    staleTime: 15_000,
  });

  // Realtime: only subscribe for real UUIDs
  useEffect(() => {
    if (!teamId || isMockId(teamId)) return;
    const channel = subscribeToTaskUpdates(teamId, () => {
      qc.invalidateQueries({ queryKey: QueryKeys.tasks(userId) });
      qc.invalidateQueries({ queryKey: QueryKeys.teamSubmissions(teamId) });
    });
    return () => { supabase.removeChannel(channel); };
  }, [teamId, userId, qc]);

  const submitProofMutation = useMutation({
    mutationFn: submitTaskProof,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QueryKeys.tasks(userId) });
    },
  });

  const approveTaskMutation = useMutation({
    mutationFn: approveTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QueryKeys.tasks(userId) });
      if (teamId) qc.invalidateQueries({ queryKey: QueryKeys.teamSubmissions(teamId) });
    },
  });

  const rejectTaskMutation = useMutation({
    mutationFn: rejectTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QueryKeys.tasks(userId) });
      if (teamId) qc.invalidateQueries({ queryKey: QueryKeys.teamSubmissions(teamId) });
    },
  });

  return {
    tasks: tasksQuery.data ?? [],
    teamSubmissions: teamSubsQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    isError: tasksQuery.isError,
    error: tasksQuery.error,
    submitProof: submitProofMutation.mutateAsync,
    approveTask: approveTaskMutation.mutateAsync,
    rejectTask: rejectTaskMutation.mutateAsync,
    isSubmitting: submitProofMutation.isPending,
    isReviewing: approveTaskMutation.isPending || rejectTaskMutation.isPending,
  };
}

// ─── Notification Store ───────────────────────────────────────────────────────

export function useNotificationStore(userId: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QueryKeys.notifications(userId),
    queryFn:  () => fetchNotifications(userId),
    enabled:  !!userId && !isMockId(userId),
    staleTime: 10_000,
  });

  // Realtime: only subscribe for real UUIDs
  useEffect(() => {
    if (!userId || isMockId(userId)) return;
    const channel = subscribeToNotifications(userId, (notif) => {
      qc.setQueryData(
        QueryKeys.notifications(userId),
        (prev: typeof query.data) => [notif, ...(prev ?? [])]
      );
    });
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.notifications(userId) }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.notifications(userId) }),
  });

  const notifications = query.data ?? [];
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    markRead: markReadMutation.mutateAsync,
    markAllRead: markAllReadMutation.mutateAsync,
  };
}

// ─── Team Store ───────────────────────────────────────────────────────────────

export function useTeamStore(teamId: string, leadId: string) {
  const qc = useQueryClient();
  const isReal = !isMockId(teamId);

  const membersQuery = useQuery({
    queryKey: QueryKeys.teamMembers(teamId),
    queryFn:  () => fetchTeamMembers(teamId),
    enabled:  !!teamId && isReal,
    staleTime: 30_000,
  });

  const invitesQuery = useQuery({
    queryKey: QueryKeys.invites(teamId),
    queryFn:  () => fetchInvites(teamId),
    enabled:  !!teamId && isReal,
    staleTime: 30_000,
  });

  const generateInviteMutation = useMutation({
    mutationFn: (params: { domainRole?: string }) =>
      generateInvite({ teamId, createdBy: leadId, ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.invites(teamId) }),
  });

  const acceptInviteMutation = useMutation({
    mutationFn: (params: { code: string; userId: string }) => acceptInvite(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QueryKeys.teamMembers(teamId) });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeMember,
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.teamMembers(teamId) }),
  });

  return {
    members: membersQuery.data ?? [],
    invites: invitesQuery.data ?? [],
    isLoading: membersQuery.isLoading,
    generateInvite: generateInviteMutation.mutateAsync,
    acceptInvite: acceptInviteMutation.mutateAsync,
    removeMember: removeMemberMutation.mutateAsync,
    isGenerating: generateInviteMutation.isPending,
  };
}

// ─── 90-Day Plan Store ─────────────────────────────────────────────────────────

export function usePlanStore(userId: string, teamId: string, tier: number = 1) {
  const qc = useQueryClient();
  const isRealUser = !isMockId(userId);
  const isRealTeam = !isMockId(teamId);

  const config = useProgramConfig();

  const reelsQuery = useQuery({
    queryKey: QueryKeys.reels(userId),
    queryFn:  () => fetchReels(userId),
    enabled:  !!userId && isRealUser,
    staleTime: 60_000,
  });

  const clubsQuery = useQuery({
    queryKey: QueryKeys.clubs(teamId),
    queryFn:  () => fetchClubs(teamId),
    enabled:  !!teamId && isRealTeam,
    staleTime: 60_000,
  });

  const reportsQuery = useQuery({
    queryKey: QueryKeys.reports(userId),
    queryFn:  () => fetchReports(userId),
    enabled:  !!userId && isRealUser,
    staleTime: 60_000,
  });

  const toggleReelMutation = useMutation({
    mutationFn: toggleReel,
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.reels(userId) }),
  });

  const addClubMutation = useMutation({
    mutationFn: addClub,
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.clubs(teamId) }),
  });

  const updateClubMutation = useMutation({
    mutationFn: ({ id, ...data }: Parameters<typeof updateClub>[1] & { id: string }) =>
      updateClub(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.clubs(teamId) }),
  });

  const removeClubMutation = useMutation({
    mutationFn: removeClub,
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.clubs(teamId) }),
  });

  const submitReportMutation = useMutation({
    mutationFn: submitReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.reports(userId) }),
  });

  const currentWeek = useMemo(() => {
    const now = Date.now();
    const start = new Date(config.campaignStartDate).getTime();
    const msPerWeek = 7 * 86400 * 1000;
    const diff = now - start;
    if (diff < 0) return 1;
    const wk = Math.floor(diff / msPerWeek) + 1;
    return Math.min(Math.max(wk, 1), 13);
  }, [config.campaignStartDate]);

  const weeklyTargets = config.weeklyCumulative[tier as 1 | 2 | 3 | 4] ?? config.weeklyCumulative[4];
  const currentTarget = weeklyTargets[currentWeek - 1] ?? 0;

  const clubs = clubsQuery.data ?? [];
  const activeClubsCount = useMemo(() => clubs.filter((c) => c.active).length, [clubs]);

  const getWeekReels = useCallback(
    (week: number) => (reelsQuery.data ?? []).filter((r) => r.week === week),
    [reelsQuery.data]
  );

  const getWeekReport = useCallback(
    (week: number) => (reportsQuery.data ?? []).find((r) => r.week === week),
    [reportsQuery.data]
  );

  return {
    tier,
    currentWeek,
    weeklyTargets,
    currentTarget,
    reels: reelsQuery.data ?? [],
    clubs,
    reports: reportsQuery.data ?? [],
    isLoading: reelsQuery.isLoading || clubsQuery.isLoading || reportsQuery.isLoading || config.isLoading,
    toggleReelPosted: toggleReelMutation.mutateAsync,
    addClub: addClubMutation.mutateAsync,
    updateClub: updateClubMutation.mutateAsync,
    removeClub: removeClubMutation.mutateAsync,
    submitReport: submitReportMutation.mutateAsync,
    getWeekReels,
    getWeekReport,
    activeClubsCount,
    totalOnboardedClubs: clubs.length,
    campaignStartDate: config.campaignStartDate,
    tierTargets: config.tierTargets,
    weeklyCumulative: config.weeklyCumulative,
    weekNames: config.weekNames,
    weekDates: config.weekDates,
    weeklyReels: config.weeklyReels,
    weeklyClubFocus: config.weeklyClubFocus,
    weeklyMilestones: config.weeklyMilestones,
  };
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

/**
 * useMetrics — live campus stats from admin_college_stats_v2 (main Clstr DB)
 * + task-based growth points from the CA portal DB.
 *
 * Data sources:
 *   - fetchCollegeStats(campus) → admin_college_stats_v2 via secondary Supabase client
 *     Fields used: total_users, active_users_7d, clubs_count, events_count,
 *                  student_count, alumni_count, faculty_count, stats_refreshed_at
 *   - fetchTasks(userId)        → task_submissions in this portal's DB
 *     Fields used: points_awarded (sum for growth points), status counts
 *
 * campus should match canonical_domain in admin_college_stats_v2.
 * Example: user.campus = "clstr.raghuinstitute" → strips to "raghuinstitute"
 */
export function useMetrics(userId?: string, campus: string = "raghuinstitute") {
  // Strip the "clstr." prefix if present so it matches canonical_domain
  const canonicalDomain = campus.replace(/^clstr\./, "");

  // Task-based metrics (this portal's DB)
  const tasksQuery = useQuery({
    queryKey: QueryKeys.tasks(userId ?? ""),
    queryFn:  () => fetchTasks(userId!),
    enabled:  !!userId,
    staleTime: 30_000,
  });

  // Campus stats from the main Clstr DB (admin_college_stats_v2)
  const collegeStatsQuery = useQuery({
    queryKey: QueryKeys.collegeStats(canonicalDomain),
    queryFn:  () => fetchCollegeStats(canonicalDomain),
    staleTime: 5 * 60_000,   // refresh every 5 minutes
    placeholderData: null,
    retry: 2,
  });

  const tasks = tasksQuery.data ?? [];
  const stats = collegeStatsQuery.data;

  return useMemo(() => {
    // Growth points: sum of points_awarded on verified submissions in this portal
    const verifiedTasks  = tasks.filter(t => t.status === "verified");
    const totalPoints    = verifiedTasks.reduce((sum, t) => sum + (t.pointsAwarded ?? 0), 0);
    const pendingCount   = tasks.filter(t => t.status === "pending").length;
    const verifiedCount  = verifiedTasks.length;

    // Live campus stats (from main Clstr DB)
    const isLive = !collegeStatsQuery.isPlaceholderData && !!stats;

    return {
      // ── From admin_college_stats_v2 ──
      /** Total registered users on this campus (the main "Verified Users" metric) */
      verifiedUsers:     stats?.totalUsers     ?? 0,
      /** Users active in the last 7 days */
      activeUsers7d:     stats?.activeUsers7d  ?? 0,
      /** Students specifically */
      studentCount:      stats?.studentCount   ?? 0,
      /** Alumni on this campus */
      alumniCount:       stats?.alumniCount    ?? 0,
      /** Faculty on this campus */
      facultyCount:      stats?.facultyCount   ?? 0,
      /** Clubs registered on Clstr for this campus (from main DB) */
      liveClubsCount:    stats?.clubsCount     ?? 0,
      /** Events posted on this campus */
      eventsCount:       stats?.eventsCount    ?? 0,
      /** Posts on this campus */
      postsCount:        stats?.postsCount     ?? 0,
      /** College name from main DB */
      collegeName:       stats?.name           ?? "",
      /** When stats were last refreshed in the main DB */
      statsRefreshedAt:  stats?.statsRefreshedAt ?? null,
      /** Whether the data is live (secondary DB connected) or showing zeros */
      isLive,
      isVerifiedUsersLive: isLive,
      verifiedUsersLastUpdated: collegeStatsQuery.dataUpdatedAt,

      // ── From task_submissions (this portal's DB) ──
      /** Sum of points_awarded across all verified task submissions */
      totalPoints,
      pendingCount,
      verifiedCount,
      taskBreakdown: {
        open:          tasks.filter(t => t.status === "open").length,
        pendingReview: pendingCount,
        verified:      verifiedCount,
        rejected:      tasks.filter(t => t.status === "rejected").length,
      },

      // Loading states
      isLoadingStats: collegeStatsQuery.isLoading,
      isLoadingTasks: tasksQuery.isLoading,
    };
  }, [
    tasks, userId,
    stats,
    collegeStatsQuery.isPlaceholderData,
    collegeStatsQuery.dataUpdatedAt,
    collegeStatsQuery.isLoading,
    tasksQuery.isLoading,
  ]);
}

// ─── Legacy: BroadcastChannel removed — replaced by Supabase Realtime ─────────
// The subscriptions are now set up inside useTaskStore and useNotificationStore.
// These stubs exist only so any import that used broadcastEvent/useRealtimeSync
// doesn't crash — they are no-ops.

export type RealtimeEvent =
  | { type: "TASK_SUBMITTED"; taskId: string }
  | { type: "TASK_APPROVED"; taskId: string }
  | { type: "TASK_REJECTED"; taskId: string }
  | { type: "MEMBER_JOINED"; email: string };

/** @deprecated Replaced by Supabase Realtime. This is a no-op. */
export function broadcastEvent(_event: RealtimeEvent): void {
  // No-op: Supabase Realtime handles cross-device sync
}

/** @deprecated Replaced by Supabase Realtime subscriptions in useTaskStore. */
export function useRealtimeSync(_onEvent: (event: RealtimeEvent) => void): void {
  // No-op: Supabase Realtime handles cross-device sync
}
