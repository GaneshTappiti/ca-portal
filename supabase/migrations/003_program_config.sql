-- ============================================================
-- Clstr CA Portal — Migration 003: Program Config & Admin Helpers
-- ============================================================

-- ─── 1. Program Config Table ────────────────────────────────────────────────
create table if not exists public.program_config (
  id                  text primary key default 'active',
  campaign_start_date timestamptz not null default '2026-07-01 00:00:00+00'::timestamptz,
  tier_targets        jsonb not null,
  weekly_cumulative   jsonb not null,
  week_names          jsonb not null,
  week_dates          jsonb not null,
  weekly_reels        jsonb not null,
  weekly_club_focus   jsonb not null,
  weekly_milestones   jsonb not null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Enable RLS on program_config
alter table public.program_config enable row level security;

-- Policies for program_config
drop policy if exists "program_config: read all authenticated" on public.program_config;
create policy "program_config: read all authenticated"
  on public.program_config for select
  using (auth.uid() is not null);

drop policy if exists "program_config: admin all" on public.program_config;
create policy "program_config: admin all"
  on public.program_config for all
  using (public.is_super_admin());

-- ─── 2. Ensure ca_id column exists on profiles ──────────────────────────────
-- The frontend references ca_id, and TeamManager/SuperAdmin use it.
alter table public.profiles 
  add column if not exists ca_id text unique default 'CA-' || upper(substring(gen_random_uuid()::text from 1 for 6));

-- ─── 3. Seed Default Configuration ──────────────────────────────────────────
insert into public.program_config (
  id,
  campaign_start_date,
  tier_targets,
  weekly_cumulative,
  week_names,
  week_dates,
  weekly_reels,
  weekly_club_focus,
  weekly_milestones
) values (
  'active',
  '2026-07-01 00:00:00+00'::timestamptz,
  '{
    "1": "15,000+ students — 5,000 target",
    "2": "8,000–15,000 students — 3,000 target",
    "3": "4,000–8,000 students — 2,000 target",
    "4": "Under 4,000 students — 1,000 target"
  }'::jsonb,
  '{
    "1": [100, 250, 500, 800, 1150, 1550, 2000, 2500, 3050, 3650, 4200, 4700, 5000],
    "2": [60, 150, 300, 480, 690, 930, 1200, 1500, 1830, 2190, 2520, 2820, 3000],
    "3": [40, 100, 200, 320, 460, 620, 800, 1000, 1220, 1460, 1680, 1880, 2000],
    "4": [20, 50, 100, 160, 230, 310, 400, 500, 610, 730, 840, 940, 1000]
  }'::jsonb,
  '[
    "SETUP", "MAPPING", "FIRST ACTIVATION", "GROWTH SPRINT",
    "ACTIVATION LOOPS", "MOMENTUM BUILD", "INDEPENDENCE DAY PUSH",
    "SCALE WEEK", "DEEPEN ENGAGEMENT", "PEAK SPRINT", "PRE-EXAM PUSH",
    "FINAL STRETCH", "MILESTONE CLOSE-OUT"
  ]'::jsonb,
  '[
    "Jul 1 – Jul 7", "Jul 8 – Jul 14", "Jul 15 – Jul 21", "Jul 22 – Jul 28",
    "Jul 29 – Aug 4", "Aug 5 – Aug 11", "Aug 12 – Aug 18", "Aug 19 – Aug 25",
    "Aug 26 – Sep 1", "Sep 2 – Sep 8", "Sep 9 – Sep 15", "Sep 16 – Sep 22",
    "Sep 23 – Sep 30"
  ]'::jsonb,
  '[
    { "week": 1, "meme": "Relatable fresher/reopening-week meme using trending audio", "culture": "\"POV: first day back on campus\" walk-through", "conversation": "\"Meet your Campus Captain\" intro reel" },
    { "week": 2, "meme": "\"Things only [college] students understand\" inside joke", "culture": "Canteen/hostel/library POV reel", "conversation": "Vox-pop: \"what do you wish your college app did?\"" },
    { "week": 3, "meme": "Hostel/canteen/exam-fear meme, trending format", "culture": "\"Day in the life of a fresher at [college]\" story reel", "conversation": "Club president posting first event live on Clstr" },
    { "week": 4, "meme": "Relatable academic-life meme tied to trending audio", "culture": "On-campus info session recap (energy, crowd, sign-ups)", "conversation": "First testimonial reel: student on why they use Clstr" },
    { "week": 5, "meme": "Mid-July academic grind meme", "culture": "Feed-content prompt reel for Campus Creators", "conversation": "Alumni/senior spotlight: \"what I wish I knew as a fresher\"" },
    { "week": 6, "meme": "Pre-Independence Day patriotic-but-funny meme", "culture": "Club-event RSVP push reel for Aug 15 event", "conversation": "\"3 things I''d change about campus life\" vox-pop" },
    { "week": 7, "meme": "Festival/holiday-week meme", "culture": "\"Campus voices\" — students share a campus memory", "conversation": "Aug 15 campus celebration reel, collab-posted" },
    { "week": 8, "meme": "Fest-season meme, high shareability", "culture": "Fresher''s day / cultural fest tie-in reel", "conversation": "Real testimonial from CollabHub or mentorship user" },
    { "week": 9, "meme": "Trending audio meme, campus-specific", "culture": "Alumni engagement reel via TPO/mentorship", "conversation": "CollabHub team-up in action: two students building something" },
    { "week": 10, "meme": "Highest-effort meme of the sprint — widest organic reach", "culture": "Ganesh Chaturthi / festival-season reel", "conversation": "Placement/internship reel if TPO listing has landed" },
    { "week": 11, "meme": "Mid-sem study-stress meme, high relatability", "culture": "Study-group / library culture reel", "conversation": "\"How Clstr helped me this semester\" quick clips" },
    { "week": 12, "meme": "End-of-sprint high-energy meme", "culture": "Campus wins compilation reel (best moments)", "conversation": "Case-study style testimonial for main Clstr repost" },
    { "week": 13, "meme": "Thank-you/community meme closing the sprint", "culture": "Next-chapter teaser reel for Vizag community", "conversation": "\"3 months in numbers\" recap reel for collab feature" }
  ]'::jsonb,
  '[
    { "week": 1, "focus": "Map every active club + committee. Shortlist 3 to approach. No onboarding yet." },
    { "week": 2, "focus": "Pitch 3-4 clubs directly. Get first verbal yes. Identify 10 high-influence students." },
    { "week": 3, "focus": "Onboard 2 clubs LIVE — sit with each president and post their first event together." },
    { "week": 4, "focus": "Onboard 3rd club. Push RSVP for club events — target 60%+ attendance." },
    { "week": 5, "focus": "Onboard 4th club. Begin TPO/placement office conversation." },
    { "week": 6, "focus": "5th club active. Check RSVP-to-attendance rate — fix drop-off if under 60%." },
    { "week": 7, "focus": "6th club active. Use Aug 15 campus energy for joint activity." },
    { "week": 8, "focus": "7th club active. Cross-promote fest content with clubs running fresher''s day." },
    { "week": 9, "focus": "8th club active — approaching full domain coverage. Confirm all clubs posted in last 7 days." },
    { "week": 10, "focus": "Sustain all 8 clubs. Push one more high-visibility event with strong RSVP push." },
    { "week": 11, "focus": "Sustain club activity through exam season — lighter cadence, keep feed alive." },
    { "week": 12, "focus": "Confirm RSVP-to-attendance rate holding at 60%+ across all clubs." },
    { "week": 13, "focus": "Lock in all active clubs for continuation next semester." }
  ]'::jsonb,
  '[
    { "week": 3, "label": "M1", "name": "First Activation", "pctTarget": 10, "reward": "Merch (hoodie/cap)" },
    { "week": 7, "label": "M2", "name": "Independence Day Push", "pctTarget": 40, "reward": "₹500 voucher + shout-out" },
    { "week": 10, "label": "M3", "name": "Peak Sprint", "pctTarget": 73, "reward": "Signed Campus Leader Certificate" },
    { "week": 13, "label": "M4", "name": "Milestone Close-Out", "pctTarget": 100, "reward": "₹2,000 cash + letter + community gate unlocked" },
    { "week": 14, "label": "M5", "name": "Top Rank", "pctTarget": 100, "reward": "Fast-tracked core team / internship interview", "isBonus": true }
  ]'::jsonb
) on conflict (id) do update set
  campaign_start_date = excluded.campaign_start_date,
  tier_targets = excluded.tier_targets,
  weekly_cumulative = excluded.weekly_cumulative,
  week_names = excluded.week_names,
  week_dates = excluded.week_dates,
  weekly_reels = excluded.weekly_reels,
  weekly_club_focus = excluded.weekly_club_focus,
  weekly_milestones = excluded.weekly_milestones;

-- ─── 4. Admin Create User Secure RPC ───────────────────────────────────────
create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_college text,
  p_role text,
  p_tier int
)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid;
  v_ca_id text;
  v_encrypted_password text;
begin
  -- Check if caller is super admin
  if not public.is_super_admin() then
    raise exception 'Access denied: requires super admin role';
  end if;

  -- Generate user ID
  v_user_id := gen_random_uuid();
  -- Hash password using crypt from pgcrypto (must exist)
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  -- Insert into auth.users
  insert into auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_email,
    v_encrypted_password,
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'college', p_college, 'role', p_role),
    'authenticated',
    'authenticated',
    now(),
    now()
  );

  -- Explicitly update the public.profiles row created by the auth trigger
  -- to apply the correct tier and role (trigger defaults role to MEMBER, tier to 4)
  update public.profiles
  set tier = p_tier,
      role = p_role
  where id = v_user_id
  returning ca_id into v_ca_id;

  return jsonb_build_object(
    'user_id', v_user_id,
    'ca_id', coalesce(v_ca_id, '')
  );
end;
$$;
