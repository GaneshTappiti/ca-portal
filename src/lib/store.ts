/**
 * Phase 2 — Persistent State Store
 *
 * All application state is persisted in localStorage so it survives
 * page refresh. State is shared across components via custom hooks.
 *
 * Architecture:
 *   - Each store domain (tasks, team, notifications) has its own key
 *   - A generic useLocalStorage hook handles serialisation/deserialisation
 *   - State transitions (task status machine) are enforced as pure functions
 *     that throw on invalid transitions — equivalent to a 400/422 from a
 *     real API route handler
 *
 * Phase 2.2 — Task state machine:
 *   Valid transitions:
 *     Open          → Pending Review  (MEMBER submits proof)
 *     Pending Review→ Verified        (LEAD approves)
 *     Pending Review→ Rejected        (LEAD rejects)
 *     Rejected      → Open            (auto-reset so member can retry)
 *   Invalid transitions throw so callers cannot accidentally corrupt status.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { taskSubmissionSchema, taskReviewSchema, parseErrors } from "./schemas";
import { fetchLiveVerifiedUsers } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskCategory = "Clubs & Events" | "Placement & Career" | "Community" | "Growth & Outreach" | "CollabHub" | "General";
export type TaskStatus = "Open" | "Pending Review" | "Verified" | "Rejected";

export interface Task {
  id: string;
  title: string;
  points: number;
  category: TaskCategory;
  status: TaskStatus;
  proofDataUrl?: string;
  notes?: string;
  submittedAt?: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
  submittedBy?: string;
}

export interface TeamMember {
  email: string;
  name: string;
  domain: string;
  joinedAt: number;
  role: "MEMBER";
}

export interface InviteCode {
  code: string;
  domain: string;
  createdAt: number;
  usedBy?: string;
}

export interface Notification {
  id: string;
  recipientEmail: string;
  type: "task_submitted" | "task_approved" | "task_rejected" | "invite_accepted";
  message: string;
  taskId?: string;
  read: boolean;
  createdAt: number;
}

// ─── 90-Day Plan Types ─────────────────────────────────────────────────────────

export type Tier = 1 | 2 | 3 | 4;
export type ReelType = "meme" | "campus_culture" | "student_conversation";

export interface ReelEntry {
  week: number;
  type: ReelType;
  title: string;
  posted: boolean;
  postedAt?: number;
  url?: string;
  views?: number;
  shares?: number;
}

export interface ClubEntry {
  id: string;
  name: string;
  domain: string;
  onboarded: boolean;
  onboardedAt?: number;
  presidentName?: string;
  eventCount: number;
  lastPostAt?: number;
  active: boolean;
}

export interface WeeklyReport {
  week: number;
  submitted: boolean;
  submittedAt?: number;
  signups: number;
  cumulativeSignups: number;
  reelsPosted: number;
  clubsActive: number;
  win: string;
  blocker: string;
}

// ─── 90-Day Plan Constants ─────────────────────────────────────────────────────

export const TIER_TARGETS: Record<Tier, string> = {
  1: "15,000+ students — 5,000 target",
  2: "8,000–15,000 students — 3,000 target",
  3: "4,000–8,000 students — 2,000 target",
  4: "Under 4,000 students — 1,000 target",
};

export const WEEKLY_CUMULATIVE: Record<Tier, number[]> = {
  1: [100, 250, 500, 800, 1150, 1550, 2000, 2500, 3050, 3650, 4200, 4700, 5000],
  2: [60, 150, 300, 480, 690, 930, 1200, 1500, 1830, 2190, 2520, 2820, 3000],
  3: [40, 100, 200, 320, 460, 620, 800, 1000, 1220, 1460, 1680, 1880, 2000],
  4: [20, 50, 100, 160, 230, 310, 400, 500, 610, 730, 840, 940, 1000],
};

export const WEEK_NAMES = [
  "SETUP", "MAPPING", "FIRST ACTIVATION", "GROWTH SPRINT",
  "ACTIVATION LOOPS", "MOMENTUM BUILD", "INDEPENDENCE DAY PUSH",
  "SCALE WEEK", "DEEPEN ENGAGEMENT", "PEAK SPRINT", "PRE-EXAM PUSH",
  "FINAL STRETCH", "MILESTONE CLOSE-OUT",
];

export const WEEK_DATES = [
  "Jul 1 – Jul 7", "Jul 8 – Jul 14", "Jul 15 – Jul 21", "Jul 22 – Jul 28",
  "Jul 29 – Aug 4", "Aug 5 – Aug 11", "Aug 12 – Aug 18", "Aug 19 – Aug 25",
  "Aug 26 – Sep 1", "Sep 2 – Sep 8", "Sep 9 – Sep 15", "Sep 16 – Sep 22",
  "Sep 23 – Sep 30",
];

export const WEEKLY_REELS: { week: number; meme: string; culture: string; conversation: string }[] = [
  { week: 1, meme: 'Relatable fresher/reopening-week meme using trending audio', culture: '"POV: first day back on campus" walk-through', conversation: '"Meet your Campus Captain" intro reel' },
  { week: 2, meme: '"Things only [college] students understand" inside joke', culture: 'Canteen/hostel/library POV reel', conversation: 'Vox-pop: "what do you wish your college app did?"' },
  { week: 3, meme: 'Hostel/canteen/exam-fear meme, trending format', culture: '"Day in the life of a fresher at [college]" story reel', conversation: 'Club president posting first event live on Clstr' },
  { week: 4, meme: 'Relatable academic-life meme tied to trending audio', culture: 'On-campus info session recap (energy, crowd, sign-ups)', conversation: 'First testimonial reel: student on why they use Clstr' },
  { week: 5, meme: 'Mid-July academic grind meme', culture: 'Feed-content prompt reel for Campus Creators', conversation: 'Alumni/senior spotlight: "what I wish I knew as a fresher"' },
  { week: 6, meme: 'Pre-Independence Day patriotic-but-funny meme', culture: 'Club-event RSVP push reel for Aug 15 event', conversation: '"3 things I\'d change about campus life" vox-pop' },
  { week: 7, meme: 'Festival/holiday-week meme', culture: '"Campus voices" — students share a campus memory', conversation: 'Aug 15 campus celebration reel, collab-posted' },
  { week: 8, meme: 'Fest-season meme, high shareability', culture: 'Fresher\'s day / cultural fest tie-in reel', conversation: 'Real testimonial from CollabHub or mentorship user' },
  { week: 9, meme: 'Trending audio meme, campus-specific', culture: 'Alumni engagement reel via TPO/mentorship', conversation: 'CollabHub team-up in action: two students building something' },
  { week: 10, meme: 'Highest-effort meme of the sprint — widest organic reach', culture: 'Ganesh Chaturthi / festival-season reel', conversation: 'Placement/internship reel if TPO listing has landed' },
  { week: 11, meme: 'Mid-sem study-stress meme, high relatability', culture: 'Study-group / library culture reel', conversation: '"How Clstr helped me this semester" quick clips' },
  { week: 12, meme: 'End-of-sprint high-energy meme', culture: 'Campus wins compilation reel (best moments)', conversation: 'Case-study style testimonial for main Clstr repost' },
  { week: 13, meme: 'Thank-you/community meme closing the sprint', culture: 'Next-chapter teaser reel for Vizag community', conversation: '"3 months in numbers" recap reel for collab feature' },
];

export const WEEKLY_CLUB_FOCUS: { week: number; focus: string }[] = [
  { week: 1, focus: "Map every active club + committee. Shortlist 3 to approach. No onboarding yet." },
  { week: 2, focus: "Pitch 3-4 clubs directly. Get first verbal yes. Identify 10 high-influence students." },
  { week: 3, focus: "Onboard 2 clubs LIVE — sit with each president and post their first event together." },
  { week: 4, focus: "Onboard 3rd club. Push RSVP for club events — target 60%+ attendance." },
  { week: 5, focus: "Onboard 4th club. Begin TPO/placement office conversation." },
  { week: 6, focus: "5th club active. Check RSVP-to-attendance rate — fix drop-off if under 60%." },
  { week: 7, focus: "6th club active. Use Aug 15 campus energy for joint activity." },
  { week: 8, focus: "7th club active. Cross-promote fest content with clubs running fresher's day." },
  { week: 9, focus: "8th club active — approaching full domain coverage. Confirm all clubs posted in last 7 days." },
  { week: 10, focus: "Sustain all 8 clubs. Push one more high-visibility event with strong RSVP push." },
  { week: 11, focus: "Sustain club activity through exam season — lighter cadence, keep feed alive." },
  { week: 12, focus: "Confirm RSVP-to-attendance rate holding at 60%+ across all clubs." },
  { week: 13, focus: "Lock in all active clubs for continuation next semester." },
];

export const WEEKLY_MILESTONES = [
  { week: 3, label: "M1", name: "First Activation", pctTarget: 10, reward: "Merch (hoodie/cap)" },
  { week: 7, label: "M2", name: "Independence Day Push", pctTarget: 40, reward: "₹500 voucher + shout-out" },
  { week: 10, label: "M3", name: "Peak Sprint", pctTarget: 73, reward: "Signed Campus Leader Certificate" },
  { week: 13, label: "M4", name: "Milestone Close-Out", pctTarget: 100, reward: "₹2,000 cash + letter + community gate unlocked" },
  { week: 14, label: "M5", name: "Top Rank", pctTarget: 100, reward: "Fast-tracked core team / internship interview", isBonus: true },
];

// ─── Generic localStorage hook ────────────────────────────────────────────────

function useLocalStorage<T>(key: string, initial: T): [T, (updater: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const setStoredValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage quota exceeded — degrade gracefully
        }
        return next;
      });
    },
    [key]
  );

  return [value, setStoredValue];
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_TASKS: Task[] = [
  { id: "t1", title: "Hold weekly team check-in", points: 50, category: "General", status: "Open" },
  { id: "t2", title: "Submit Monday Report", points: 100, category: "General", status: "Open" },
  { id: "t3", title: "Post first event for a club", points: 200, category: "Clubs & Events", status: "Open" },
  { id: "t4", title: "Recruit Domain Leads", points: 300, category: "General", status: "Open" },
  { id: "t5", title: "Onboard Placement Cell", points: 400, category: "Placement & Career", status: "Open" },
  { id: "t6", title: "Host a community meetup", points: 350, category: "Community", status: "Open" },
  { id: "t7", title: "100+ Signups Milestone", points: 500, category: "Growth & Outreach", status: "Open" },
  { id: "t8", title: "Form a team on CollabHub", points: 150, category: "CollabHub", status: "Open" },
];

const SEED_TEAM: TeamMember[] = [
  { email: "events@clstr.in", name: "Rahul S.", domain: "Clubs & Events", joinedAt: Date.now() - 86400000, role: "MEMBER" },
  { email: "placement@clstr.in", name: "Priya M.", domain: "Placement & Career", joinedAt: Date.now() - 172800000, role: "MEMBER" },
  { email: "community@clstr.in", name: "Aman D.", domain: "Community", joinedAt: Date.now() - 259200000, role: "MEMBER" },
];

const TASKS_KEY = "clstr_tasks";
const TEAM_KEY = "clstr_team";
const INVITES_KEY = "clstr_invites";
const NOTIFICATIONS_KEY = "clstr_notifications";

// ─── Task state machine ───────────────────────────────────────────────────────

type TaskAction = "submit" | "approve" | "reject";

const VALID_TRANSITIONS: Record<TaskStatus, Partial<Record<TaskAction, TaskStatus>>> = {
  Open: { submit: "Pending Review" },
  "Pending Review": { approve: "Verified", reject: "Rejected" },
  Verified: {},
  Rejected: { submit: "Pending Review" }, // member can retry
};

function applyTransition(task: Task, action: TaskAction): TaskStatus {
  const next = VALID_TRANSITIONS[task.status][action];
  if (!next) {
    throw new Error(
      `Invalid transition: cannot '${action}' a task with status '${task.status}'.`
    );
  }
  return next;
}

// ─── Notification factory ─────────────────────────────────────────────────────

function makeNotification(
  recipientEmail: string,
  type: Notification["type"],
  message: string,
  taskId?: string
): Notification {
  return {
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    recipientEmail,
    type,
    message,
    taskId,
    read: false,
    createdAt: Date.now(),
  };
}

// ─── Task Store ───────────────────────────────────────────────────────────────

export function useTaskStore() {
  const [tasks, setTasks] = useLocalStorage<Task[]>(TASKS_KEY, SEED_TASKS);
  const [notifications, setNotifications] = useLocalStorage<Notification[]>(NOTIFICATIONS_KEY, []);

  const addNotification = useCallback(
    (n: Notification) => setNotifications((prev) => [n, ...prev]),
    [setNotifications]
  );

  /** Phase 2.2 — Submit proof (MEMBER action) */
  const submitProof = useCallback(
    (
      taskId: string,
      proofDataUrl: string,
      notes: string,
      submitterEmail: string,
      leadEmail: string
    ): { success: boolean; errors?: Record<string, string> } => {
      // Phase 1.5 — validate at the "API boundary"
      const result = taskSubmissionSchema.safeParse({ taskId, proofDataUrl, notes });
      if (!result.success) {
        return { success: false, errors: parseErrors(result) };
      }

      let taskTitle = "";
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          const nextStatus = applyTransition(t, "submit");
          taskTitle = t.title;
          return {
            ...t,
            status: nextStatus,
            proofDataUrl,
            notes,
            submittedAt: Date.now(),
            submittedBy: submitterEmail,
          };
        })
      );

      // Notify LEAD that a new submission is pending
      addNotification(
        makeNotification(
          leadEmail,
          "task_submitted",
          `"${taskTitle}" submitted for review by ${submitterEmail}.`,
          taskId
        )
      );

      return { success: true };
    },
    [setTasks, addNotification]
  );

  /** Phase 2.5 — Approve task (LEAD action) */
  const approveTask = useCallback(
    (
      taskId: string,
      reviewerEmail: string,
      submitterEmail: string
    ): { success: boolean; errors?: Record<string, string> } => {
      const result = taskReviewSchema.safeParse({ taskId, action: "approve" });
      if (!result.success) return { success: false, errors: parseErrors(result) };

      let taskTitle = "";
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          const nextStatus = applyTransition(t, "approve");
          taskTitle = t.title;
          return { ...t, status: nextStatus, reviewedAt: Date.now(), reviewedBy: reviewerEmail };
        })
      );

      // Notify MEMBER that their task was approved
      addNotification(
        makeNotification(
          submitterEmail,
          "task_approved",
          `"${taskTitle}" was approved! Points have been credited.`,
          taskId
        )
      );

      return { success: true };
    },
    [setTasks, addNotification]
  );

  /** Phase 2.5 — Reject task (LEAD action) */
  const rejectTask = useCallback(
    (
      taskId: string,
      reviewerEmail: string,
      submitterEmail: string,
      reason?: string
    ): { success: boolean; errors?: Record<string, string> } => {
      const result = taskReviewSchema.safeParse({ taskId, action: "reject", reason });
      if (!result.success) return { success: false, errors: parseErrors(result) };

      let taskTitle = "";
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          const nextStatus = applyTransition(t, "reject");
          taskTitle = t.title;
          return {
            ...t,
            status: nextStatus,
            reviewedAt: Date.now(),
            reviewedBy: reviewerEmail,
            rejectionReason: reason,
          };
        })
      );

      addNotification(
        makeNotification(
          submitterEmail,
          "task_rejected",
          `"${taskTitle}" was rejected${reason ? `: ${reason}` : ""}. You can resubmit.`,
          taskId
        )
      );

      return { success: true };
    },
    [setTasks, addNotification]
  );

  return { tasks, setTasks, submitProof, approveTask, rejectTask, notifications };
}

// ─── Notification Store ───────────────────────────────────────────────────────

export function useNotificationStore(userEmail: string) {
  const [allNotifications, setAllNotifications] = useLocalStorage<Notification[]>(
    NOTIFICATIONS_KEY,
    []
  );

  const myNotifications = useMemo(
    () =>
      allNotifications
        .filter((n) => n.recipientEmail === userEmail)
        .sort((a, b) => b.createdAt - a.createdAt),
    [allNotifications, userEmail]
  );

  const unreadCount = useMemo(
    () => myNotifications.filter((n) => !n.read).length,
    [myNotifications]
  );

  const markRead = useCallback(
    (id: string) =>
      setAllNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      ),
    [setAllNotifications]
  );

  const markAllRead = useCallback(
    () =>
      setAllNotifications((prev) =>
        prev.map((n) => (n.recipientEmail === userEmail ? { ...n, read: true } : n))
      ),
    [setAllNotifications, userEmail]
  );

  return { notifications: myNotifications, unreadCount, markRead, markAllRead };
}

// ─── Team Store ───────────────────────────────────────────────────────────────

export function useTeamStore() {
  const [members, setMembers] = useLocalStorage<TeamMember[]>(TEAM_KEY, SEED_TEAM);
  const [invites, setInvites] = useLocalStorage<InviteCode[]>(INVITES_KEY, []);
  const [allNotifications, setAllNotifications] = useLocalStorage<Notification[]>(NOTIFICATIONS_KEY, []);

  /** Generate a new invite code */
  const generateInvite = useCallback(
    (leadEmail: string, domain: string): string => {
      const code = `CLSTR-${Math.random().toString(36).toUpperCase().slice(2, 8)}`;
      const invite: InviteCode = { code, domain, createdAt: Date.now() };
      setInvites((prev) => [invite, ...prev]);
      return code;
    },
    [setInvites]
  );

  /** Accept an invite code and join the team */
  const acceptInvite = useCallback(
    (
      code: string,
      joinerEmail: string,
      joinerName: string,
      leadEmail: string
    ): { success: boolean; error?: string } => {
      const invite = invites.find(
        (i) => i.code === code.toUpperCase() && !i.usedBy
      );
      if (!invite) {
        return { success: false, error: "Invalid or already-used invite code." };
      }

      // Mark invite as used
      setInvites((prev) =>
        prev.map((i) => (i.code === code.toUpperCase() ? { ...i, usedBy: joinerEmail } : i))
      );

      // Add to team
      const member: TeamMember = {
        email: joinerEmail,
        name: joinerName,
        domain: invite.domain,
        joinedAt: Date.now(),
        role: "MEMBER",
      };
      setMembers((prev) => {
        if (prev.some((m) => m.email === joinerEmail)) return prev;
        return [...prev, member];
      });

      // Notify LEAD
      setAllNotifications((prev) => [
        makeNotification(
          leadEmail,
          "invite_accepted",
          `${joinerName} (${joinerEmail}) joined your team as ${invite.domain} Lead.`
        ),
        ...prev,
      ]);

      return { success: true };
    },
    [invites, setInvites, setMembers, setAllNotifications]
  );

  /** Remove a member from the team */
  const removeMember = useCallback(
    (email: string) =>
      setMembers((prev) => prev.filter((m) => m.email !== email)),
    [setMembers]
  );

  return { members, invites, generateInvite, acceptInvite, removeMember };
}

// ─── Metrics (Guidebook KPIs) ──────────────────────────────────────────────────

export function useMetrics(userEmail?: string, campusName: string = "raghuinstitute") {
  const [tasks] = useLocalStorage<Task[]>(TASKS_KEY, SEED_TASKS);
  
  // Real async metrics
  const [verifiedUsers, setVerifiedUsers] = useState<number>(480);
  
  useEffect(() => {
    fetchLiveVerifiedUsers(campusName).then(count => {
      setVerifiedUsers(count);
    });
  }, [campusName]);

  // These would typically come from an external Supabase API or database
  // Setting placeholders based on guidebook targets for the demo.
  const activeClubs = 2;
  const eventsPosted = 5;

  return useMemo(() => {
    const verifiedTasks = tasks.filter(
      (t) => t.status === "Verified" && (!userEmail || t.submittedBy === userEmail)
    );
    const totalPoints = verifiedTasks.reduce((sum, t) => sum + t.points, 0);
    const pendingCount = tasks.filter((t) => t.status === "Pending Review").length;
    const verifiedCount = tasks.filter((t) => t.status === "Verified").length;

    return {
      totalPoints,
      verifiedUsers,
      activeClubs,
      eventsPosted,
      pendingCount,
      verifiedCount,
      taskBreakdown: {
        open: tasks.filter((t) => t.status === "Open").length,
        pendingReview: pendingCount,
        verified: verifiedCount,
        rejected: tasks.filter((t) => t.status === "Rejected").length,
      },
    };
  }, [tasks, userEmail]);
}

// ─── 90-Day Plan Store ─────────────────────────────────────────────────────────

const REELS_KEY = "clstr_reels";
const CLUBS_KEY = "clstr_clubs";
const REPORTS_KEY = "clstr_reports";
const TIER_KEY = "clstr_tier";

export function usePlanStore() {
  const [tier] = useLocalStorage<Tier>(TIER_KEY, 1);
  const [reels, setReels] = useLocalStorage<ReelEntry[]>(REELS_KEY, []);
  const [clubs, setClubs] = useLocalStorage<ClubEntry[]>(CLUBS_KEY, []);
  const [reports, setReports] = useLocalStorage<WeeklyReport[]>(REPORTS_KEY, []);

  const currentWeek = useMemo(() => {
    const now = Date.now();
    const start = new Date("2026-07-01").getTime();
    const msPerWeek = 7 * 86400 * 1000;
    const diff = now - start;
    if (diff < 0) return 1;
    const wk = Math.floor(diff / msPerWeek) + 1;
    return Math.min(Math.max(wk, 1), 13);
  }, []);

  const weeklyTargets = useMemo(() => WEEKLY_CUMULATIVE[tier], [tier]);
  const currentTarget = weeklyTargets[currentWeek - 1] ?? 0;

  const toggleReelPosted = useCallback((week: number, type: ReelType, data?: Partial<ReelEntry>) => {
    setReels((prev) => {
      const existing = prev.findIndex((r) => r.week === week && r.type === type);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], ...data, posted: !updated[existing].posted };
        return updated;
      }
      return [...prev, { week, type, title: "", posted: true, ...data }];
    });
  }, [setReels]);

  const addClub = useCallback((club: ClubEntry) => {
    setClubs((prev) => [...prev, club]);
  }, [setClubs]);

  const updateClub = useCallback((id: string, data: Partial<ClubEntry>) => {
    setClubs((prev) => prev.map((c) => c.id === id ? { ...c, ...data } : c));
  }, [setClubs]);

  const removeClub = useCallback((id: string) => {
    setClubs((prev) => prev.filter((c) => c.id !== id));
  }, [setClubs]);

  const submitReport = useCallback((week: number, data: Omit<WeeklyReport, "week" | "submitted" | "submittedAt">) => {
    setReports((prev) => {
      const existing = prev.findIndex((r) => r.week === week);
      const report: WeeklyReport = { ...data, week, submitted: true, submittedAt: Date.now() };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = report;
        return updated;
      }
      return [...prev, report];
    });
  }, [setReports]);

  const getWeekReels = useCallback((week: number) => {
    return reels.filter((r) => r.week === week);
  }, [reels]);

  const getWeekReport = useCallback((week: number) => {
    return reports.find((r) => r.week === week);
  }, [reports]);

  const activeClubsCount = useMemo(() => clubs.filter((c) => c.active).length, [clubs]);
  const totalOnboardedClubs = clubs.length;

  return {
    tier, currentWeek, weeklyTargets, currentTarget,
    reels, clubs, reports,
    toggleReelPosted, addClub, updateClub, removeClub,
    submitReport, getWeekReels, getWeekReport,
    activeClubsCount, totalOnboardedClubs,
  };
}

// ─── BroadcastChannel real-time sync (Phase 7.5) ──────────────────────────────

const REALTIME_CHANNEL = "clstr_realtime";

export type RealtimeEvent =
  | { type: "TASK_SUBMITTED"; taskId: string }
  | { type: "TASK_APPROVED"; taskId: string }
  | { type: "TASK_REJECTED"; taskId: string }
  | { type: "MEMBER_JOINED"; email: string };

let _channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!_channel) _channel = new BroadcastChannel(REALTIME_CHANNEL);
  return _channel;
}

export function broadcastEvent(event: RealtimeEvent): void {
  getChannel()?.postMessage(event);
}

export function useRealtimeSync(onEvent: (event: RealtimeEvent) => void): void {
  useEffect(() => {
    const ch = getChannel();
    if (!ch) return;
    const handler = (e: MessageEvent) => onEvent(e.data as RealtimeEvent);
    ch.addEventListener("message", handler);
    return () => ch.removeEventListener("message", handler);
  }, [onEvent]);
}
