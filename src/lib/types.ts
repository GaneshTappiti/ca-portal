/**
 * types.ts — Shared TypeScript types for the Clstr CA Portal
 *
 * All domain types live here so they can be imported by both the
 * query layer and any component without circular dependencies.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type AuthRole = "MEMBER" | "LEAD" | "SUPER_ADMIN";

export interface AuthUser {
  id: string;        // Supabase auth.users UUID
  email: string;
  role: AuthRole;
  name: string;
  campus: string;
  teamId?: string;
  totalPoints: number;
  tier: number;
  caId?: string;     // Server-assigned CA ID from profiles.ca_id
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export type TaskCategory =
  | "Clubs & Events"
  | "Placement & Career"
  | "Community"
  | "Growth & Outreach"
  | "CollabHub"
  | "General";

export type TaskStatus = "open" | "pending" | "verified" | "rejected";

export interface TaskDefinition {
  id: string;
  title: string;
  description?: string;
  points: number;
  category: TaskCategory;
  active: boolean;
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  userId: string;
  proofUrl?: string;
  notes?: string;
  status: TaskStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  pointsAwarded: number;
  submittedAt?: string;
  createdAt: string;
}

/** Task as seen by the UI — submission merged with definition */
export interface Task {
  id: string;          // submission id (or task_def id if not yet submitted)
  taskDefId: string;
  submissionId?: string;
  title: string;
  description?: string;
  points: number;
  category: TaskCategory;
  status: TaskStatus;
  proofUrl?: string;
  notes?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  pointsAwarded: number;
  submittedBy?: string;
}

// ─── Team ─────────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
  teamId?: string;
  totalPoints: number;
  createdAt: string;
}

export interface InviteCode {
  code: string;
  teamId: string;
  domainRole?: string;
  expiresAt?: string;
  usedBy?: string;
  usedAt?: string;
  createdAt: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  type: "task_submitted" | "task_approved" | "task_rejected" | "invite_accepted";
  payload?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

// ─── 90-Day Plan ──────────────────────────────────────────────────────────────

export type Tier = 1 | 2 | 3 | 4;
export type ReelType = "meme" | "campus_culture" | "student_conversation";

export interface ReelEntry {
  id?: string;
  week: number;
  type: ReelType;
  posted: boolean;
  url?: string;
  postedAt?: string;
}

export interface ClubEntry {
  id: string;
  teamId: string;
  userId: string;
  name: string;
  domain?: string;
  presidentName?: string;
  presidentContact?: string;
  eventCount: number;
  active: boolean;
  onboardedAt?: string;
  lastPostAt?: string;
  createdAt: string;
}

export interface WeeklyReport {
  id?: string;
  week: number;
  submitted: boolean;
  submittedAt?: string;
  signups: number;
  reelsPosted: number;
  clubsActive: number;
  win: string;
  blocker: string;
}

// ─── Task state machine ───────────────────────────────────────────────────────

export type TaskAction = "submit" | "approve" | "reject";

const VALID_TRANSITIONS: Record<TaskStatus, Partial<Record<TaskAction, TaskStatus>>> = {
  open:      { submit: "pending" },
  pending:   { approve: "verified", reject: "rejected" },
  verified:  {},
  rejected:  { submit: "pending" },  // member can retry
};

export function applyTransition(status: TaskStatus, action: TaskAction): TaskStatus {
  const next = VALID_TRANSITIONS[status][action];
  if (!next) {
    throw new Error(
      `Invalid transition: cannot '${action}' a task with status '${status}'.`
    );
  }
  return next;
}

// ─── 90-Day Plan constants (read-only, no DB needed) ─────────────────────────

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

export const WEEKLY_REELS: {
  week: number; meme: string; culture: string; conversation: string;
}[] = [
  { week: 1, meme: "Relatable fresher/reopening-week meme using trending audio", culture: '"POV: first day back on campus" walk-through', conversation: '"Meet your Campus Captain" intro reel' },
  { week: 2, meme: '"Things only [college] students understand" inside joke', culture: "Canteen/hostel/library POV reel", conversation: 'Vox-pop: "what do you wish your college app did?"' },
  { week: 3, meme: "Hostel/canteen/exam-fear meme, trending format", culture: '"Day in the life of a fresher at [college]" story reel', conversation: "Club president posting first event live on Clstr" },
  { week: 4, meme: "Relatable academic-life meme tied to trending audio", culture: "On-campus info session recap (energy, crowd, sign-ups)", conversation: "First testimonial reel: student on why they use Clstr" },
  { week: 5, meme: "Mid-July academic grind meme", culture: "Feed-content prompt reel for Campus Creators", conversation: 'Alumni/senior spotlight: "what I wish I knew as a fresher"' },
  { week: 6, meme: "Pre-Independence Day patriotic-but-funny meme", culture: "Club-event RSVP push reel for Aug 15 event", conversation: '"3 things I\'d change about campus life" vox-pop' },
  { week: 7, meme: "Festival/holiday-week meme", culture: '"Campus voices" — students share a campus memory', conversation: "Aug 15 campus celebration reel, collab-posted" },
  { week: 8, meme: "Fest-season meme, high shareability", culture: "Fresher's day / cultural fest tie-in reel", conversation: "Real testimonial from CollabHub or mentorship user" },
  { week: 9, meme: "Trending audio meme, campus-specific", culture: "Alumni engagement reel via TPO/mentorship", conversation: "CollabHub team-up in action: two students building something" },
  { week: 10, meme: "Highest-effort meme of the sprint — widest organic reach", culture: "Ganesh Chaturthi / festival-season reel", conversation: "Placement/internship reel if TPO listing has landed" },
  { week: 11, meme: "Mid-sem study-stress meme, high relatability", culture: "Study-group / library culture reel", conversation: '"How Clstr helped me this semester" quick clips' },
  { week: 12, meme: "End-of-sprint high-energy meme", culture: "Campus wins compilation reel (best moments)", conversation: "Case-study style testimonial for main Clstr repost" },
  { week: 13, meme: "Thank-you/community meme closing the sprint", culture: "Next-chapter teaser reel for Vizag community", conversation: '"3 months in numbers" recap reel for collab feature' },
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
