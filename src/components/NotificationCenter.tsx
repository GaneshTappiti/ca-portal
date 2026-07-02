/**
 * Phase 2.6 — In-app Notification Center
 * Phase 4.7 — Toast Accessibility (role="alert", aria-live)
 * Phase 7.6 — i18n strings
 */

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNotificationStore } from "../lib/store";
import { useAuth } from "../lib/auth";
import type { Notification } from "../lib/store";

// Derive a display message from notification type + payload
function getNotifMessage(notif: Notification): string {
  switch (notif.type) {
    case "task_submitted": return "A team member submitted a task for review.";
    case "task_approved": return `Your task was approved! +${(notif.payload as any)?.points ?? 0} points.`;
    case "task_rejected": return `Your task was rejected. Reason: ${(notif.payload as any)?.reason ?? "See notes."}` ;
    case "invite_accepted": return "A new member joined your team via invite.";
    default: return "New notification";
  }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BellIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={hasUnread ? "#CCFF00" : "#666"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0066FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}


// ─── Notification Icon ────────────────────────────────────────────────────────

function NotifIcon({ type }: { type: Notification["type"] }) {
  if (type === "task_approved") return <CheckIcon />;
  if (type === "task_rejected") return <XIcon />;
  if (type === "invite_accepted") return <UserPlusIcon />;
  return <ClockIcon />;
}

function notifAccent(type: Notification["type"]): string {
  if (type === "task_approved") return "#CCFF00";
  if (type === "task_rejected") return "#FF6A00";
  if (type === "invite_accepted") return "#0066FF";
  return "#FF6A00";
}

// ─── Single notification row ──────────────────────────────────────────────────

const NotifRow = memo(function NotifRow({
  notif,
  onMarkRead,
}: {
  notif: Notification;
  onMarkRead: (id: string) => void;
}) {
  const { t } = useTranslation();
  const accent = notifAccent(notif.type);
  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      onClick={() => onMarkRead(notif.id)}
      className={`w-full text-left flex items-start gap-3 px-3 py-3 rounded-xl transition-colors duration-150 ${
        notif.read
          ? "opacity-50 hover:opacity-70"
          : "bg-white/[0.02] hover:bg-white/[0.04]"
      }`}
      aria-label={`${notif.read ? "" : "Unread: "}${getNotifMessage(notif)}`}
    >
      <div
        className="mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}30` }}
      >
        <NotifIcon type={notif.type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white leading-relaxed">{getNotifMessage(notif)}</p>
        <p className="text-[10px] text-[#555] mt-0.5">
          {(() => {
            const diffMin = Math.floor((Date.now() - new Date(notif.createdAt).getTime()) / 60000);
            if (diffMin < 1) return t("notifications.justNow");
            if (diffMin < 60) return t("notifications.minutesAgo", { count: diffMin });
            return t("notifications.hoursAgo", { count: Math.floor(diffMin / 60) });
          })()}
        </p>
      </div>
      {!notif.read && (
        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#CCFF00] shrink-0" aria-hidden="true" />
      )}
    </motion.button>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

interface NotificationCenterProps {
  userEmail: string;
}

export default function NotificationCenter({ userEmail }: NotificationCenterProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationStore(user?.id ?? userEmail);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleMarkRead = useCallback((id: string) => markRead(id), [markRead]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell trigger */}
      <button
        ref={triggerRef}
        id="notification-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${t("notifications.title")}${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative p-2 rounded-xl border border-[#1A1A1A] bg-[#0A0A0A] hover:border-[#333] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50"
      >
        <BellIcon hasUnread={unreadCount > 0} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#CCFF00] text-[#000] text-[9px] font-bold flex items-center justify-center tabular-nums"
              aria-hidden="true"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-panel"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            role="dialog"
            aria-label={t("notifications.title")}
            className="absolute right-0 top-12 w-80 rounded-2xl bg-[#0A0A0A] border border-[#1A1A1A]/80 shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A1A]">
              <h2 className="text-sm font-bold text-white">{t("notifications.title")}</h2>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead()}
                  className="text-[10px] font-semibold text-[#CCFF00]/70 hover:text-[#CCFF00] transition-colors"
                >
                  {t("notifications.markAllRead")}
                </button>
              )}
            </div>

            {/* Phase 4.7 — aria-live region for dynamic content */}
            <div
              aria-live="polite"
              aria-label={t("notifications.title")}
              className="max-h-80 overflow-y-auto p-2 space-y-0.5"
            >
              {notifications.length === 0 ? (
                <p className="text-xs text-[#555] text-center py-8">{t("notifications.empty")}</p>
              ) : (
                <AnimatePresence>
                  {notifications.map((n) => (
                    <NotifRow key={n.id} notif={n} onMarkRead={handleMarkRead} />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
