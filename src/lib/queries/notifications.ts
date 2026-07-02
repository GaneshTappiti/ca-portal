/**
 * queries/notifications.ts — Supabase query functions + Realtime subscription
 *
 * Replaces the BroadcastChannel (same-device only) with Supabase Realtime
 * so notifications appear instantly across all devices and users.
 */

import { supabase } from "../supabaseClient";
import type { Notification } from "../types";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─── Fetch notifications for a user ──────────────────────────────────────────

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []).map((n) => ({
    id: n.id,
    userId: n.user_id,
    type: n.type,
    payload: n.payload,
    read: n.read,
    createdAt: n.created_at,
  }));
}

// ─── Mark a notification as read ─────────────────────────────────────────────

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);

  if (error) throw error;
}

// ─── Mark all notifications as read ──────────────────────────────────────────

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error) throw error;
}

// ─── Subscribe to real-time notifications ────────────────────────────────────
// Returns the channel so the caller can unsubscribe on cleanup

export function subscribeToNotifications(
  userId: string,
  onNew: (notification: Notification) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`notifications:${userId}:${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const raw = payload.new as Record<string, unknown>;
        onNew({
          id: raw.id as string,
          userId: raw.user_id as string,
          type: raw.type as Notification["type"],
          payload: raw.payload as Record<string, unknown> | undefined,
          read: raw.read as boolean,
          createdAt: raw.created_at as string,
        });
      }
    )
    .subscribe();

  return channel;
}

// ─── Subscribe to task submission updates (for LEADs) ─────────────────────────

export function subscribeToTaskUpdates(
  teamId: string,
  onUpdate: (event: { type: string; submissionId: string }) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`task_updates:team:${teamId}:${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "task_submissions",
      },
      (payload) => {
        const raw = payload.new as Record<string, unknown>;
        onUpdate({
          type: payload.eventType,
          submissionId: raw.id as string,
        });
      }
    )
    .subscribe();

  return channel;
}
