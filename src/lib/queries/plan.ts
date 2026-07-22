/**
 * queries/plan.ts — Supabase query functions for the 90-Day Plan
 * (reels, clubs, weekly reports)
 */

import { supabase } from "../supabaseClient";
import type { ReelEntry, ClubEntry, WeeklyReport, ReelType, Tier } from "../types";
import {
  WEEKLY_CUMULATIVE,
  WEEK_NAMES,
  WEEK_DATES,
  WEEKLY_REELS,
  WEEKLY_CLUB_FOCUS,
  WEEKLY_MILESTONES,
} from "../types";

// ─── Reels ────────────────────────────────────────────────────────────────────

export async function fetchReels(userId: string): Promise<ReelEntry[]> {
  const { data, error } = await supabase
    .from("reels")
    .select("*")
    .eq("user_id", userId)
    .order("week");

  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    week: r.week,
    type: r.reel_type as ReelType,
    posted: r.posted,
    url: r.url,
    postedAt: r.posted_at ?? r.posted_date,
  }));
}

export async function toggleReel(params: {
  userId: string;
  week: number;
  type: ReelType;
  url?: string;
}): Promise<void> {
  const { data: existing } = await supabase
    .from("reels")
    .select("id, posted")
    .eq("user_id", params.userId)
    .eq("week", params.week)
    .eq("reel_type", params.type)
    .maybeSingle();

  if (existing) {
    const nowPosted = !existing.posted;
    const { error } = await supabase
      .from("reels")
      .update({
        posted: nowPosted,
        url: params.url ?? null,
        posted_at: nowPosted ? new Date().toISOString() : null,
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("reels").insert({
      user_id: params.userId,
      week: params.week,
      reel_type: params.type,
      posted: true,
      url: params.url ?? null,
      posted_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

// ─── Clubs ────────────────────────────────────────────────────────────────────

export async function fetchClubs(teamId: string): Promise<ClubEntry[]> {
  const { data, error } = await supabase
    .from("clubs")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at");

  if (error) throw error;

  return (data ?? []).map((c) => ({
    id: c.id,
    teamId: c.team_id,
    userId: c.user_id,
    name: c.name,
    domain: c.domain ?? c.category,
    presidentName: c.president_name,
    eventCount: c.event_count ?? 0,
    active: c.active,
    onboardedAt: c.onboarded_at ?? c.created_at,
    lastPostAt: c.last_post_at,
    createdAt: c.created_at,
  }));
}

export async function addClub(params: {
  teamId: string;
  userId: string;
  name: string;
  domain?: string;
  presidentName?: string;
}): Promise<ClubEntry> {
  const { data, error } = await supabase
    .from("clubs")
    .insert({
      team_id: params.teamId,
      user_id: params.userId,
      name: params.name,
      category: params.domain ?? 'General',
      domain: params.domain ?? null,
      president_name: params.presidentName ?? null,
      onboarded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    teamId: data.team_id,
    userId: data.user_id,
    name: data.name,
    domain: data.domain ?? data.category,
    presidentName: data.president_name,
    eventCount: data.event_count ?? 0,
    active: data.active,
    onboardedAt: data.onboarded_at ?? data.created_at,
    lastPostAt: data.last_post_at,
    createdAt: data.created_at,
  };
}

export async function updateClub(
  clubId: string,
  updates: Partial<{
    name: string;
    domain: string;
    presidentName: string;
    eventCount: number;
    active: boolean;
    lastPostAt: string;
  }>
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.domain !== undefined) { dbUpdates.domain = updates.domain; dbUpdates.category = updates.domain; }
  if (updates.presidentName !== undefined) dbUpdates.president_name = updates.presidentName;
  if (updates.eventCount !== undefined) dbUpdates.event_count = updates.eventCount;
  if (updates.active !== undefined) dbUpdates.active = updates.active;
  if (updates.lastPostAt !== undefined) dbUpdates.last_post_at = updates.lastPostAt;

  const { error } = await supabase.from("clubs").update(dbUpdates).eq("id", clubId);
  if (error) throw error;
}

export async function removeClub(clubId: string): Promise<void> {
  const { error } = await supabase.from("clubs").delete().eq("id", clubId);
  if (error) throw error;
}

// ─── Weekly Reports ───────────────────────────────────────────────────────────

export async function fetchReports(userId: string): Promise<WeeklyReport[]> {
  const { data, error } = await supabase
    .from("weekly_reports")
    .select("*")
    .eq("user_id", userId)
    .order("week");

  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    week: r.week,
    submitted: true,
    submittedAt: r.submitted_at,
    signups: r.signups_count,
    reelsPosted: r.reels_posted,
    clubsActive: r.active_clubs,
    win: r.big_win ?? "",
    blocker: r.blocker ?? "",
  }));
}

export async function submitReport(params: {
  userId: string;
  week: number;
  signups: number;
  reelsPosted: number;
  clubsActive: number;
  win: string;
  blocker: string;
}): Promise<void> {
  const { error } = await supabase.from("weekly_reports").upsert({
    user_id: params.userId,
    week: params.week,
    signups_count: params.signups,
    reels_posted: params.reelsPosted,
    active_clubs: params.clubsActive,
    big_win: params.win,
    blocker: params.blocker,
    submitted_at: new Date().toISOString(),
  }, {
    onConflict: "user_id,week",
  });

  if (error) throw error;
}

// ─── Program Configuration ───────────────────────────────────────────────────

export interface ProgramConfig {
  campaignStartDate: string;
  tierTargets: Record<Tier, string>;
  weeklyCumulative: Record<Tier, number[]>;
  weekNames: string[];
  weekDates: string[];
  weeklyReels: { week: number; meme: string; culture: string; conversation: string }[];
  weeklyClubFocus: { week: number; focus: string }[];
  weeklyMilestones: { week: number; label: string; name: string; pctTarget: number; reward: string; isBonus?: boolean }[];
}

export async function fetchProgramConfig(): Promise<ProgramConfig> {
  const { data, error } = await supabase
    .from("program_config")
    .select("*")
    .eq("id", "active")
    .single();

  // If the table doesn't exist, no row matches, or any other DB error → fall back
  // to static constants so the rest of the app continues to work.
  if (error || !data) {
    console.warn("[fetchProgramConfig] Falling back to static config:", error?.message ?? "no row");
    return {
      campaignStartDate: "2026-07-01T00:00:00Z",
      tierTargets: {} as Record<Tier, string>,
      weeklyCumulative: WEEKLY_CUMULATIVE,
      weekNames: WEEK_NAMES,
      weekDates: WEEK_DATES,
      weeklyReels: WEEKLY_REELS,
      weeklyClubFocus: WEEKLY_CLUB_FOCUS,
      weeklyMilestones: WEEKLY_MILESTONES,
    };
  }

  const tierTargets = {} as Record<Tier, string>;
  if (data.tier_targets) {
    Object.entries(data.tier_targets).forEach(([k, v]) => {
      tierTargets[Number(k) as Tier] = v as string;
    });
  }

  const weeklyCumulative = {} as Record<Tier, number[]>;
  if (data.weekly_cumulative) {
    Object.entries(data.weekly_cumulative).forEach(([k, v]) => {
      weeklyCumulative[Number(k) as Tier] = v as number[];
    });
  }

  return {
    campaignStartDate: data.campaign_start_date ?? "2026-07-01T00:00:00Z",
    tierTargets,
    weeklyCumulative: Object.keys(weeklyCumulative).length > 0 ? weeklyCumulative : WEEKLY_CUMULATIVE,
    weekNames: data.week_names ?? WEEK_NAMES,
    weekDates: data.week_dates ?? WEEK_DATES,
    weeklyReels: data.weekly_reels ?? WEEKLY_REELS,
    weeklyClubFocus: data.weekly_club_focus ?? WEEKLY_CLUB_FOCUS,
    weeklyMilestones: data.weekly_milestones ?? WEEKLY_MILESTONES,
  };
}

