/**
 * queries/team.ts — Supabase query functions for team management
 */

import { supabase } from "../supabaseClient";
import type { TeamMember, InviteCode } from "../types";

// ─── Fetch team members ───────────────────────────────────────────────────────
export async function fetchTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, team_id, total_points, created_at")
    .eq("team_id", teamId)
    .order("created_at");

  if (error) throw error;

  // Fetch auth emails separately (auth.users not directly queryable via client)
  return (data ?? []).map((p) => ({
    id: p.id,
    email: "", // populated from auth session; not stored in profiles for privacy
    name: p.full_name,
    role: p.role,
    teamId: p.team_id,
    totalPoints: p.total_points,
    createdAt: p.created_at,
  }));
}

// ─── Fetch invites for a team ─────────────────────────────────────────────────
export async function fetchInvites(teamId: string): Promise<InviteCode[]> {
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("team_id", teamId)
    .is("used_by", null)  // only unused invites
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((i) => ({
    code: i.code,
    teamId: i.team_id,
    domainRole: i.domain_role,
    expiresAt: i.expires_at,
    usedBy: i.used_by,
    usedAt: i.used_at,
    createdAt: i.created_at,
  }));
}

// ─── Generate an invite code ──────────────────────────────────────────────────
export async function generateInvite(params: {
  teamId: string;
  createdBy: string;
  domainRole?: string;
  expiryDays?: number;
}): Promise<string> {
  const code = `CLSTR-${Math.random().toString(36).toUpperCase().slice(2, 8)}`;
  const expiresAt = params.expiryDays
    ? new Date(Date.now() + params.expiryDays * 86400 * 1000).toISOString()
    : null;

  const { error } = await supabase.from("invites").insert({
    code,
    team_id: params.teamId,
    created_by: params.createdBy,
    domain_role: params.domainRole ?? null,
    expires_at: expiresAt,
  });

  if (error) throw error;
  return code;
}

// ─── Accept an invite code ────────────────────────────────────────────────────
// Called during signup after the user's account is created
export async function acceptInvite(params: {
  code: string;
  userId: string;
}): Promise<{ teamId: string; domainRole?: string }> {
  const { data: invite, error: fetchErr } = await supabase
    .from("invites")
    .select("*")
    .eq("code", params.code.toUpperCase())
    .is("used_by", null)
    .single();

  if (fetchErr || !invite) {
    throw new Error("Invalid or already-used invite code.");
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error("This invite code has expired.");
  }

  // Mark invite as used
  const { error: updateErr } = await supabase
    .from("invites")
    .update({ used_by: params.userId, used_at: new Date().toISOString() })
    .eq("code", invite.code);

  if (updateErr) throw updateErr;

  // Update the new member's profile with the team
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ team_id: invite.team_id })
    .eq("id", params.userId);

  if (profileErr) throw profileErr;

  // Notify the team lead
  await supabase.from("notifications").insert({
    user_id: invite.created_by,
    type: "invite_accepted",
    payload: { invitee_id: params.userId, code: invite.code },
  });

  return { teamId: invite.team_id, domainRole: invite.domain_role };
}

// ─── Remove a member from team (LEAD action) ─────────────────────────────────
export async function removeMember(userId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ team_id: null })
    .eq("id", userId);

  if (error) throw error;
}

// ─── Fetch leaderboard for a team ────────────────────────────────────────────
export async function fetchLeaderboard(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, total_points, created_at")
    .eq("team_id", teamId)
    .order("total_points", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    email: "",
    name: p.full_name,
    role: p.role,
    teamId,
    totalPoints: p.total_points,
    createdAt: p.created_at,
  }));
}
