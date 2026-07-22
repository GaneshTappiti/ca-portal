/**
 * queries/team.ts — Supabase query functions for team management
 */

import { supabase } from "../supabaseClient";
import type { TeamMember, InviteCode } from "../types";

// ─── Fetch team members ───────────────────────────────────────────────────────
export async function fetchTeamMembers(teamId: string): Promise<TeamMember[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, team_id, total_points, ca_id, created_at")
    .eq("team_id", teamId)
    .order("created_at");

  if (error) throw error;

  // Get current user session to match email if caller is viewing themselves
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = sessionData?.session?.user?.id;
  const currentUserEmail = sessionData?.session?.user?.email ?? "";

  return (data ?? []).map((p) => {
    // If profile belongs to current user, use real session email, otherwise use CA ID display identity
    const emailDisplay = p.id === currentUserId
      ? currentUserEmail
      : `${(p.ca_id || p.id.slice(0, 8)).toLowerCase()}@clstr.campus`;

    return {
      id: p.id,
      email: emailDisplay,
      name: p.full_name,
      role: p.role,
      teamId: p.team_id,
      totalPoints: p.total_points,
      createdAt: p.created_at,
    };
  });
}

// ─── Fetch invites for a team ─────────────────────────────────────────────────
export async function fetchInvites(teamId: string): Promise<InviteCode[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("team_id", teamId)
    .is("used_by", null)
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

// ─── Generate an invite code (Transactional RPC) ──────────────────────────────
export async function generateInvite(params: {
  teamId: string;
  createdBy: string;
  domainRole?: string;
  expiryDays?: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("generate_team_invite", {
    p_domain_role: params.domainRole ?? null,
    p_expiry_days: params.expiryDays ?? null,
  });

  if (!error && data?.code) {
    return data.code;
  }

  // Fallback client insertion
  const code = `CLSTR-${Math.random().toString(36).toUpperCase().slice(2, 8)}`;
  const expiresAt = params.expiryDays
    ? new Date(Date.now() + params.expiryDays * 86400 * 1000).toISOString()
    : null;

  const { error: insertErr } = await supabase.from("invites").insert({
    code,
    team_id: params.teamId,
    created_by: params.createdBy,
    domain_role: params.domainRole ?? null,
    expires_at: expiresAt,
  });

  if (insertErr) throw insertErr;
  return code;
}

// ─── Accept an invite code (Transactional RPC) ────────────────────────────────
export async function acceptInvite(params: {
  code: string;
  userId: string;
}): Promise<{ teamId: string; domainRole?: string }> {
  const { data, error } = await supabase.rpc("redeem_team_invite", {
    p_code: params.code.trim().toUpperCase(),
  });

  if (!error && data?.team_id) {
    return { teamId: data.team_id, domainRole: data.domain_role };
  }

  // Fallback direct execution
  const { data: invite, error: fetchErr } = await supabase
    .from("invites")
    .select("*")
    .eq("code", params.code.toUpperCase())
    .is("used_by", null)
    .single();

  if (fetchErr || !invite) {
    throw new Error("Invalid or already-used invite code.");
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error("This invite code has expired.");
  }

  const { error: updateErr } = await supabase
    .from("invites")
    .update({ used_by: params.userId, used_at: new Date().toISOString() })
    .eq("code", invite.code);

  if (updateErr) throw updateErr;

  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ team_id: invite.team_id })
    .eq("id", params.userId);

  if (profileErr) throw profileErr;

  return { teamId: invite.team_id, domainRole: invite.domain_role };
}

// ─── Remove a member from team (LEAD / Admin action) ─────────────────────────
export async function removeMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_team_member", {
    p_user_id: userId,
  });

  if (error) {
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ team_id: null })
      .eq("id", userId);

    if (updateErr) throw updateErr;
  }
}

// ─── Fetch leaderboard for a team ────────────────────────────────────────────
export async function fetchLeaderboard(teamId: string): Promise<TeamMember[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, total_points, ca_id, created_at")
    .eq("team_id", teamId)
    .order("total_points", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    email: `${(p.ca_id || p.id.slice(0, 8)).toLowerCase()}@clstr.campus`,
    name: p.full_name,
    role: p.role,
    teamId,
    totalPoints: p.total_points,
    createdAt: p.created_at,
  }));
}
