-- ============================================================
-- Clstr CA Portal — Initial Schema
-- Run against your Supabase project via:
--   supabase db push  OR  paste into SQL editor
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Teams ───────────────────────────────────────────────────────────────────
-- Must be created before profiles (profiles FK → teams)
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  college     text not null,
  lead_id     uuid,                          -- back-filled after profiles insert
  tier        int  not null check (tier between 1 and 4),
  target_users int not null default 1000,
  created_at  timestamptz default now()
);

-- ─── Profiles (extends auth.users) ───────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  college     text not null default '',
  tier        int  not null default 4 check (tier between 1 and 4),
  squad       text check (squad in ('growth','campus','product')),
  role        text not null default 'MEMBER' check (role in ('MEMBER','LEAD','SUPER_ADMIN')),
  team_id     uuid references public.teams(id),
  total_points int not null default 0,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- Back-fill teams.lead_id FK now that profiles exists
alter table public.teams
  add foreign key (lead_id) references public.profiles(id);

-- ─── Invite Codes ─────────────────────────────────────────────────────────────
create table if not exists public.invites (
  code        text primary key,
  team_id     uuid references public.teams(id) not null,
  created_by  uuid references public.profiles(id),
  domain_role text,
  expires_at  timestamptz,
  used_by     uuid references public.profiles(id),
  used_at     timestamptz,
  created_at  timestamptz default now()
);

-- ─── Task Definitions (admin-editable reference data) ─────────────────────────
create table if not exists public.task_definitions (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  points      int  not null default 0,
  category    text not null default 'General',
  active      boolean default true,
  created_at  timestamptz default now()
);

-- Seed the 8 starter tasks
insert into public.task_definitions (title, description, points, category) values
  ('Hold weekly team check-in',   'Run a weekly sync with your team', 50,  'General'),
  ('Submit Monday Report',        'Submit your weekly progress report', 100, 'General'),
  ('Post first event for a club', 'Onboard a club and post their first event on Clstr', 200, 'Clubs & Events'),
  ('Recruit Domain Leads',        'Recruit and onboard domain-specific leads', 300, 'General'),
  ('Onboard Placement Cell',      'Get the placement cell onto Clstr', 400, 'Placement & Career'),
  ('Host a community meetup',     'Organise an on-campus community event', 350, 'Community'),
  ('100+ Signups Milestone',      'Hit 100 verified user signups', 500, 'Growth & Outreach'),
  ('Form a team on CollabHub',    'Create a project team using CollabHub', 150, 'CollabHub')
on conflict do nothing;

-- ─── Task Submissions (the state machine) ─────────────────────────────────────
create table if not exists public.task_submissions (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid references public.task_definitions(id) not null,
  user_id          uuid references public.profiles(id) not null,
  proof_url        text,          -- Supabase Storage path, not base64
  notes            text,
  status           text not null default 'pending'
                   check (status in ('open','pending','verified','rejected')),
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  points_awarded   int default 0,
  submitted_at     timestamptz,
  created_at       timestamptz default now(),
  unique(task_id, user_id)       -- one submission record per user per task
);

-- ─── Weekly Reports ───────────────────────────────────────────────────────────
create table if not exists public.weekly_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) not null,
  week_number  int  not null check (week_number between 1 and 13),
  signups      int  not null default 0,
  reels_posted int  not null default 0,
  clubs_active int  not null default 0,
  win          text,
  blocker      text,
  submitted_at timestamptz default now(),
  unique(user_id, week_number)
);

-- ─── Reels ────────────────────────────────────────────────────────────────────
create table if not exists public.reels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) not null,
  week_number int  not null check (week_number between 1 and 13),
  reel_type   text not null check (reel_type in ('meme','campus_culture','student_conversation')),
  posted      boolean default false,
  url         text,
  posted_at   timestamptz,
  created_at  timestamptz default now(),
  unique(user_id, week_number, reel_type)
);

-- ─── Clubs ────────────────────────────────────────────────────────────────────
create table if not exists public.clubs (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid references public.teams(id) not null,
  user_id        uuid references public.profiles(id) not null,
  name           text not null,
  domain         text,
  president_name text,
  event_count    int  not null default 0,
  active         boolean default true,
  onboarded_at   timestamptz,
  last_post_at   timestamptz,
  created_at     timestamptz default now()
);

-- ─── Notifications ────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) not null,
  type       text not null check (type in ('task_submitted','task_approved','task_rejected','invite_accepted')),
  payload    jsonb,
  read       boolean default false,
  created_at timestamptz default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table public.profiles         enable row level security;
alter table public.teams            enable row level security;
alter table public.invites          enable row level security;
alter table public.task_definitions enable row level security;
alter table public.task_submissions enable row level security;
alter table public.weekly_reports   enable row level security;
alter table public.reels            enable row level security;
alter table public.clubs            enable row level security;
alter table public.notifications    enable row level security;

-- ── Helper: is the caller a SUPER_ADMIN? ──────────────────────────────────────
create or replace function public.is_super_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'SUPER_ADMIN'
  );
$$;

-- ── Helper: is the caller a LEAD or SUPER_ADMIN? ──────────────────────────────
create or replace function public.is_lead_or_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('LEAD','SUPER_ADMIN')
  );
$$;

-- ── Helper: get caller's team_id ──────────────────────────────────────────────
create or replace function public.my_team_id()
returns uuid language sql security definer as $$
  select team_id from public.profiles where id = auth.uid();
$$;

-- ── Profiles policies ──────────────────────────────────────────────────────────
create policy "profiles: own read"
  on public.profiles for select
  using (id = auth.uid() or is_lead_or_admin());

create policy "profiles: own update"
  on public.profiles for update
  using (id = auth.uid());

create policy "profiles: insert own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles: super admin full"
  on public.profiles for all
  using (is_super_admin());

-- ── Teams policies ─────────────────────────────────────────────────────────────
create policy "teams: member can read own team"
  on public.teams for select
  using (id = my_team_id() or is_super_admin());

create policy "teams: lead can update own team"
  on public.teams for update
  using (lead_id = auth.uid() or is_super_admin());

create policy "teams: super admin full"
  on public.teams for all
  using (is_super_admin());

-- ── Invites policies ───────────────────────────────────────────────────────────
create policy "invites: lead can create for own team"
  on public.invites for insert
  with check (team_id = my_team_id() and is_lead_or_admin());

create policy "invites: lead can read own team invites"
  on public.invites for select
  using (team_id = my_team_id() or is_super_admin());

create policy "invites: anyone can validate a code (for signup)"
  on public.invites for select
  using (true);  -- code lookup during signup; code is not sensitive

create policy "invites: lead can update own team invites"
  on public.invites for update
  using (team_id = my_team_id() or is_super_admin());

-- ── Task definitions policies ──────────────────────────────────────────────────
create policy "task_definitions: all authenticated can read"
  on public.task_definitions for select
  using (auth.uid() is not null and active = true);

create policy "task_definitions: super admin full"
  on public.task_definitions for all
  using (is_super_admin());

-- ── Task submissions policies ──────────────────────────────────────────────────
create policy "task_submissions: own read"
  on public.task_submissions for select
  using (user_id = auth.uid() or is_lead_or_admin());

create policy "task_submissions: own insert"
  on public.task_submissions for insert
  with check (user_id = auth.uid());

create policy "task_submissions: own update (submit/retry)"
  on public.task_submissions for update
  using (user_id = auth.uid() and status in ('open','rejected'));

create policy "task_submissions: lead reviews team submissions"
  on public.task_submissions for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = task_submissions.user_id
        and p.team_id = my_team_id()
    )
    or is_super_admin()
  );

create policy "task_submissions: lead updates team submissions"
  on public.task_submissions for update
  using (
    is_lead_or_admin()
    and exists (
      select 1 from public.profiles p
      where p.id = task_submissions.user_id
        and p.team_id = my_team_id()
    )
  );

create policy "task_submissions: super admin full"
  on public.task_submissions for all
  using (is_super_admin());

-- ── Weekly reports policies ────────────────────────────────────────────────────
create policy "weekly_reports: own read/write"
  on public.weekly_reports for all
  using (user_id = auth.uid());

create policy "weekly_reports: lead read team"
  on public.weekly_reports for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = weekly_reports.user_id and p.team_id = my_team_id()
    )
    or is_super_admin()
  );

-- ── Reels policies ─────────────────────────────────────────────────────────────
create policy "reels: own read/write"
  on public.reels for all
  using (user_id = auth.uid());

create policy "reels: lead read team"
  on public.reels for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = reels.user_id and p.team_id = my_team_id()
    )
    or is_super_admin()
  );

-- ── Clubs policies ─────────────────────────────────────────────────────────────
create policy "clubs: team members read own team clubs"
  on public.clubs for select
  using (team_id = my_team_id() or is_super_admin());

create policy "clubs: own write"
  on public.clubs for all
  using (user_id = auth.uid() or is_lead_or_admin());

-- ── Notifications policies ─────────────────────────────────────────────────────
create policy "notifications: own read/update"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications: own update (mark read)"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "notifications: service can insert"
  on public.notifications for insert
  with check (true);  -- notifications are created by triggers/edge functions

-- ─── Trigger: auto-create profile on signup ───────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, college, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'college', ''),
    coalesce(new.raw_user_meta_data->>'role', 'MEMBER')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Trigger: update profiles.total_points when submission verified ───────────
create or replace function public.handle_submission_verified()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'verified' and old.status != 'verified' then
    update public.profiles
    set total_points = total_points + new.points_awarded
    where id = new.user_id;
  end if;
  if old.status = 'verified' and new.status != 'verified' then
    -- Revocation: subtract points if un-verified
    update public.profiles
    set total_points = greatest(0, total_points - old.points_awarded)
    where id = old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_submission_verified on public.task_submissions;
create trigger on_submission_verified
  after update on public.task_submissions
  for each row execute procedure public.handle_submission_verified();

-- ─── Storage bucket ───────────────────────────────────────────────────────────
-- Run this separately in the Supabase Storage tab or via management API:
-- insert into storage.buckets (id, name, public) values ('task-proofs', 'task-proofs', false);

-- Storage policies (add these in Supabase Dashboard → Storage → task-proofs → Policies):
-- 1. Users can upload to their own folder:
--    (bucket_id = 'task-proofs' AND auth.uid()::text = (string_to_array(name, '/'))[1])
-- 2. Leads can read their team members' files:
--    (bucket_id = 'task-proofs' AND is_lead_or_admin())
-- 3. Super admin can read all:
--    (bucket_id = 'task-proofs' AND is_super_admin())
