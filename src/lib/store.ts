/**
 * store.ts — Supabase-backed React Query hooks & Realtime helper exports
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { fetchCollegeStats } from "./supabase";

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

// ─── Realtime Event Exports ───────────────────────────────────────────────────

export type RealtimeEvent = { type: string; taskId?: string; submissionId?: string };

export function broadcastEvent(event: RealtimeEvent) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("clstr_realtime", { detail: event }));
  }
}

export function useRealtimeSync(onEvent?: (e: RealtimeEvent) => void) {
  useEffect(() => {
    if (!onEvent) return;
    const handler = (e: Event) => {
      const custom = e as CustomEvent<RealtimeEvent>;
      onEvent(custom.detail);
    };
    window.addEventListener("clstr_realtime", handler);
    return () => window.removeEventListener("clstr_realtime", handler);
  }, [onEvent]);
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const QueryKeys = {
  tasks:          (userId: string)   => ["tasks", userId] as const,
  teamSubmissions:(teamId: string)   => ["team_submissions", teamId] as const,
  teamMembers:    (teamId: string)   => ["team_members", teamId] as const,
  invites:        (teamId: string)   => ["invites", teamId] as const,
  notifications:  (userId: string)   => ["notifications", userId] as const,
  reels:          (userId: string)   => ["reels", userId] as const,
  clubs:          (teamId: string)   => ["clubs", teamId] as const,
  reports:        (userId: string)   => ["reports", userId] as const,
  collegeStats:   (domain: string)   => ["college_stats", domain] as const,
  programConfig:  ["program_config"] as const,
};

function isMockId(id?: string): boolean {
  if (!id) return true;
  return id.startsWith("MOCK") || id.startsWith("user-") || id.startsWith("lead-") || id.startsWith("superadmin-");
}

// ─── Program Config Store ─────────────────────────────────────────────────────

export function useProgramConfig() {
  return useQuery({
    queryKey: QueryKeys.programConfig,
    queryFn: fetchProgramConfig,
    staleTime: 10 * 60_000,
  });
}

// ─── Task Store ───────────────────────────────────────────────────────────────

export function useTaskStore(userId: string, teamId?: string) {
  const qc = useQueryClient();
  const isRealUser = !isMockId(userId);

  const tasksQuery = useQuery({
    queryKey: QueryKeys.tasks(userId),
    queryFn:  () => fetchTasks(userId),
    enabled:  !!userId && isRealUser,
    staleTime: 30_000,
  });

  const teamSubmissionsQuery = useQuery({
    queryKey: QueryKeys.teamSubmissions(teamId ?? ""),
    queryFn:  () => fetchTeamSubmissions(teamId!),
    enabled:  !!teamId && isMockId(teamId) === false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!userId || isMockId(userId)) return;
    const channel = subscribeToTaskUpdates(userId, () => {
      qc.invalidateQueries({ queryKey: QueryKeys.tasks(userId) });
      if (teamId) qc.invalidateQueries({ queryKey: QueryKeys.teamSubmissions(teamId) });
    });
    return () => { supabase.removeChannel(channel); };
  }, [userId, teamId, qc]);

  const submitProofMutation = useMutation({
    mutationFn: submitTaskProof,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QueryKeys.tasks(userId) });
      if (teamId) qc.invalidateQueries({ queryKey: QueryKeys.teamSubmissions(teamId) });
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
    teamSubmissions: teamSubmissionsQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    isError: tasksQuery.isError,
    submitProof: submitProofMutation.mutateAsync,
    approveTask: approveTaskMutation.mutateAsync,
    rejectTask: rejectTaskMutation.mutateAsync,
    isSubmitting: submitProofMutation.isPending,
  };
}

// ─── Notification Store ───────────────────────────────────────────────────────

export function useNotificationStore(userId: string) {
  const qc = useQueryClient();
  const isRealUser = !isMockId(userId);

  const notificationsQuery = useQuery({
    queryKey: QueryKeys.notifications(userId),
    queryFn:  () => fetchNotifications(userId),
    enabled:  !!userId && isRealUser,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!userId || isMockId(userId)) return;
    const channel = subscribeToNotifications(userId, (_notification) => {
      qc.invalidateQueries({ queryKey: QueryKeys.notifications(userId) });
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

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  return {
    notifications,
    unreadCount,
    isLoading: notificationsQuery.isLoading,
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
    mutationFn: (params: { domainRole?: string; expiryDays?: number }) =>
      generateInvite({ teamId, createdBy: leadId, ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.invites(teamId) }),
  });

  const acceptInviteMutation = useMutation({
    mutationFn: (params: { code: string; userId: string }) => acceptInvite(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QueryKeys.teamMembers(teamId) });
      qc.invalidateQueries({ queryKey: QueryKeys.invites(teamId) });
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

export function usePlanStore(userId: string, teamId: string, tier: number = 4) {
  // Clamp tier to valid range 1-4
  const safeTier = ([1, 2, 3, 4].includes(tier) ? tier : 4) as 1 | 2 | 3 | 4;
  const qc = useQueryClient();
  const isRealUser = !isMockId(userId);
  const isRealTeam = !isMockId(teamId);

  const configQuery = useProgramConfig();

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
    mutationFn: ({ id, ...data }: { id: string; name?: string; domain?: string; presidentName?: string; active?: boolean; eventDetails?: string }) =>
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

  const configData = configQuery.data;

  const campaignStartDate = configData?.campaignStartDate ?? "2026-07-01T00:00:00Z";

  const currentWeek = useMemo(() => {
    const now = Date.now();
    const start = new Date(campaignStartDate).getTime();
    const msPerWeek = 7 * 86400 * 1000;
    const diff = now - start;
    if (diff < 0) return 1;
    const wk = Math.floor(diff / msPerWeek) + 1;
    return Math.min(Math.max(wk, 1), 13);
  }, [campaignStartDate]);

  const weeklyCumulativeMap = configData?.weeklyCumulative ?? WEEKLY_CUMULATIVE;
  const weeklyTargets = weeklyCumulativeMap[safeTier] ?? weeklyCumulativeMap[4] ?? [];
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
    tier: safeTier,
    currentWeek,
    weeklyTargets,
    currentTarget,
    reels: reelsQuery.data ?? [],
    clubs,
    reports: reportsQuery.data ?? [],
    isLoading: reelsQuery.isLoading || clubsQuery.isLoading || reportsQuery.isLoading || configQuery.isLoading,
    toggleReelPosted: toggleReelMutation.mutateAsync,
    addClub: addClubMutation.mutateAsync,
    updateClub: updateClubMutation.mutateAsync,
    removeClub: removeClubMutation.mutateAsync,
    submitReport: submitReportMutation.mutateAsync,
    getWeekReels,
    getWeekReport,
    activeClubsCount,
    totalOnboardedClubs: clubs.length,
    campaignStartDate,
    tierTargets: configData?.tierTargets ?? {},
    weeklyCumulative: weeklyCumulativeMap,
    weekNames: configData?.weekNames ?? [],
    weekDates: configData?.weekDates ?? [],
    weeklyReels: configData?.weeklyReels ?? [],
    weeklyClubFocus: configData?.weeklyClubFocus ?? [],
    weeklyMilestones: configData?.weeklyMilestones ?? [],
  };
}

// ─── Metrics Hook ──────────────────────────────────────────────────────────────

export function useMetrics(userId?: string, campus: string = "raghuinstitute") {
  const canonicalDomain = campus.replace(/^clstr\./, "");

  const tasksQuery = useQuery({
    queryKey: QueryKeys.tasks(userId ?? ""),
    queryFn:  () => fetchTasks(userId!),
    enabled:  !!userId,
    staleTime: 30_000,
  });

  const collegeStatsQuery = useQuery({
    queryKey: QueryKeys.collegeStats(canonicalDomain),
    queryFn:  () => fetchCollegeStats(canonicalDomain),
    staleTime: 5 * 60_000,
    placeholderData: null,
    retry: 2,
  });

  const tasks = tasksQuery.data ?? [];
  const stats = collegeStatsQuery.data;

  return useMemo(() => {
    const verifiedTasks  = tasks.filter(t => t.status === "verified");
    const totalPoints    = verifiedTasks.reduce((sum, t) => sum + (t.pointsAwarded ?? 0), 0);
    const pendingCount   = tasks.filter(t => t.status === "pending").length;
    const verifiedCount  = verifiedTasks.length;

    const isLive = !!stats && stats.isLive === true;

    return {
      verifiedUsers:     stats?.totalUsers     ?? 0,
      activeUsers7d:     stats?.activeUsers7d  ?? 0,
      studentCount:      stats?.studentCount   ?? 0,
      alumniCount:       stats?.alumniCount    ?? 0,
      facultyCount:      stats?.facultyCount   ?? 0,
      liveClubsCount:    stats?.clubsCount     ?? 0,
      eventsCount:       stats?.eventsCount    ?? 0,
      postsCount:        stats?.postsCount     ?? 0,
      collegeName:       stats?.name           ?? "",
      statsRefreshedAt:  stats?.statsRefreshedAt ?? null,
      isLive,
      isVerifiedUsersLive: isLive,
      verifiedUsersLastUpdated: collegeStatsQuery.dataUpdatedAt,
      error: stats?.error,

      totalPoints,
      pendingCount,
      verifiedCount,
      taskBreakdown: {
        open:     tasks.filter(t => t.status === "open").length,
        pending:  pendingCount,
        verified: verifiedCount,
        rejected: tasks.filter(t => t.status === "rejected").length,
      },
      isLoadingStats: collegeStatsQuery.isLoading,
      isLoadingTasks: tasksQuery.isLoading,
    };
  }, [tasks, stats, collegeStatsQuery.dataUpdatedAt, collegeStatsQuery.isLoading, tasksQuery.isLoading]);
}
