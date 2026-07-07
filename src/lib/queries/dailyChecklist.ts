/**
 * queries/dailyChecklist.ts — Supabase query functions for the per-user
 * daily rhythm checklist (post reel, check signups, etc.).
 *
 * Replaces the previous localStorage implementation. Data persists per
 * user + calendar date so it survives across devices and reloads.
 */

import { supabase } from "../supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type DailyChecks = Record<string, boolean>;

// ─── Fetch today's checklist for a user ──────────────────────────────────────

export async function fetchDailyChecklist(
  userId: string,
  date: string
): Promise<DailyChecks> {
  const { data, error } = await supabase
    .from("daily_checklist")
    .select("checks")
    .eq("user_id", userId)
    .eq("check_date", date)
    .maybeSingle();

  if (error) throw error;
  return (data?.checks as DailyChecks) ?? {};
}

// ─── Save (upsert) today's checklist for a user ───────────────────────────────

export async function saveDailyChecklist(
  userId: string,
  date: string,
  checks: DailyChecks
): Promise<void> {
  const { error } = await supabase
    .from("daily_checklist")
    .upsert(
      { user_id: userId, check_date: date, checks, updated_at: new Date().toISOString() },
      { onConflict: "user_id,check_date" }
    );

  if (error) throw error;
}

// ─── Realtime sync (optional) ─────────────────────────────────────────────────

export function subscribeToDailyChecklist(
  userId: string,
  onUpdate: (checks: DailyChecks) => void
): RealtimeChannel {
  return supabase
    .channel(`daily_checklist:${userId}:${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "daily_checklist",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const raw = payload.new as Record<string, unknown>;
        onUpdate((raw.checks as DailyChecks) ?? {});
      }
    )
    .subscribe();
}
