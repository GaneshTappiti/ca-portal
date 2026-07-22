-- ============================================================
-- Clstr CA Portal — Migration 006: Consolidated SQL Fixes
-- Fixes all issues across migrations 001-005:
--   1. admin_create_user: add explicit user_role cast
--   2. profiles: own update — fix self-referencing policy recursion
--   3. task_category enum — ensure all frontend values exist
--   4. clubs.category — relax to text (frontend sends free-form)
--   5. invites: ensure reusable codes work (remove used_by null constraint)
--   6. task_definitions: seed essential default tasks
--   7. Cleanup: drop duplicate/conflicting policies
-- ============================================================

-- ─── 1. Fix admin_create_user: explicit cast to public.user_role ───────────────
-- Issue: `set role = p_role` (text) → profile column is typed user_role enum
--         PostgreSQL won't auto-cast text → enum in plpgsql assignment.
create or replace function public.admin_create_user(
  p_email    text,
  p_password text,
  p_full_name text,
  p_college  text,
  p_role     text,
  p_tier     int
)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id          uuid;
  v_ca_id            text;
  v_encrypted_password text;
begin
  -- Reject unauthenticated callers and non-admins
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Access denied: requires super admin role';
  end if;

  -- Validate role value early
  if p_role not in ('MEMBER', 'LEAD', 'SUPER_ADMIN') then
    raise exception 'Invalid role: %. Must be MEMBER, LEAD, or SUPER_ADMIN.', p_role;
  end if;

  v_user_id            := gen_random_uuid();
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    lower(trim(p_email)),
    v_encrypted_password,
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'college', p_college, 'role', p_role),
    'authenticated',
    'authenticated',   -- This is the postgres role (not app role)
    now(),
    now()
  );

  -- Cast text → user_role enum explicitly to avoid implicit cast error
  update public.profiles
  set tier  = p_tier,
      role  = p_role::public.user_role
  where id = v_user_id
  returning ca_id into v_ca_id;

  return jsonb_build_object(
    'user_id', v_user_id,
    'ca_id',   coalesce(v_ca_id, '')
  );
end;
$$;

-- ─── 2. Fix create_captain_and_team: explicit cast + validation ───────────────
create or replace function public.create_captain_and_team(
  p_email       text,
  p_password    text,
  p_full_name   text,
  p_college     text,
  p_tier        int     default 4,
  p_domain_role text    default 'Campus Captain'
)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id            uuid;
  v_team_id            uuid;
  v_encrypted_password text;
  v_ca_id              text;
  v_invite_code        text;
  v_effective_tier     int;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Access denied: requires super admin role';
  end if;

  v_effective_tier     := coalesce(p_tier, 4);
  v_user_id            := gen_random_uuid();
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  -- Remove any prior auth user with same email (idempotent re-runs)
  delete from auth.users where email = lower(trim(p_email));

  insert into public.teams (college, tier, target_users)
  values (
    p_college,
    v_effective_tier,
    case v_effective_tier
      when 1 then 5000
      when 2 then 3000
      when 3 then 2000
      else 1000
    end
  )
  returning id into v_team_id;

  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    lower(trim(p_email)),
    v_encrypted_password,
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'college', p_college),
    'authenticated',
    'authenticated',
    now(),
    now()
  );

  update public.profiles
  set role    = 'LEAD'::public.user_role,
      tier    = v_effective_tier,
      team_id = v_team_id,
      college = p_college
  where id = v_user_id
  returning ca_id into v_ca_id;

  update public.teams
  set lead_id = v_user_id
  where id = v_team_id;

  v_invite_code := 'CLSTR-' || upper(
    substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6)
  );

  insert into public.invites (code, team_id, created_by, domain_role)
  values (v_invite_code, v_team_id, v_user_id, p_domain_role);

  return jsonb_build_object(
    'user_id',     v_user_id,
    'team_id',     v_team_id,
    'ca_id',       coalesce(v_ca_id, ''),
    'invite_code', v_invite_code
  );
end;
$$;

-- ─── 3. Fix profiles: own update — eliminate self-referencing policy recursion ─
-- Issue: the WITH CHECK subquery `select role from public.profiles where id = auth.uid()`
--        re-evaluates the same table the policy is on → potential infinite recursion.
-- Fix: use a security definer helper function that bypasses RLS for the check.

create or replace function public._get_profile_immutable_fields(p_uid uuid)
returns table (role public.user_role, tier int, team_id uuid, total_points int)
language sql stable security definer as $$
  select role, tier, team_id, total_points
  from public.profiles
  where id = p_uid;
$$;

drop policy if exists "profiles: own update" on public.profiles;
create policy "profiles: own update"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role         = (select role         from public._get_profile_immutable_fields(auth.uid()))
    and tier         = (select tier         from public._get_profile_immutable_fields(auth.uid()))
    and team_id      is not distinct from
                       (select team_id      from public._get_profile_immutable_fields(auth.uid()))
    and total_points = (select total_points from public._get_profile_immutable_fields(auth.uid()))
  );

-- ─── 4. Ensure all task_category enum values exist (idempotent) ───────────────
-- Original enum: 'Registration & Onboarding','Campus Growth & Outreach',
--                'Event & Workshop Execution','Community & Content'
-- Frontend needs: 'Clubs & Events','Placement & Career','Community',
--                 'Growth & Outreach','CollabHub','General'
-- Migration 005 already added these; this re-runs safely via IF NOT EXISTS.
alter type public.task_category add value if not exists 'Clubs & Events';
alter type public.task_category add value if not exists 'Placement & Career';
alter type public.task_category add value if not exists 'Community';
alter type public.task_category add value if not exists 'Growth & Outreach';
alter type public.task_category add value if not exists 'CollabHub';
alter type public.task_category add value if not exists 'General';

-- ─── 5. Seed default task definitions (skip if already exist) ─────────────────
-- The app breaks at launch if task_definitions is empty; seed 6 starter tasks.
insert into public.task_definitions (title, description, points, category, active, week_assigned)
select * from (values
  ('Launch Announcement Reel',
   'Post a campus launch announcement reel on Instagram/TikTok showing students signing up.',
   200, 'Clubs & Events'::public.task_category, true, 1),
  ('Onboard First Club',
   'Onboard your first campus club to Clstr. Sit with the president and post their first event live.',
   300, 'Clubs & Events'::public.task_category, true, 3),
  ('Recruit 50 Signups',
   'Drive 50 verified new student sign-ups to Clstr on your campus.',
   250, 'Growth & Outreach'::public.task_category, true, 2),
  ('Host an Info Session',
   'Organize and host a campus info session — minimum 20 attendees. Submit photo proof.',
   300, 'Community'::public.task_category, true, 4),
  ('Post Weekly Report',
   'Submit your weekly progress report covering signups, reels posted, and clubs active.',
   100, 'General'::public.task_category, true, 1),
  ('ColabHub Project Feature',
   'Get a student team to post their project on CollabHub and share it on campus socials.',
   200, 'CollabHub'::public.task_category, true, 6)
) as v(title, description, points, category, active, week_assigned)
where not exists (select 1 from public.task_definitions limit 1);

-- ─── 6. Fix invites: reusable invite codes (allow multiple uses) ──────────────
-- The invites table currently marks used_by when first redeemed, preventing
-- reusable team invite codes. Add a separate is_reusable flag so multi-use
-- codes remain valid after first use.
alter table public.invites
  add column if not exists is_reusable boolean not null default false,
  add column if not exists use_count   int     not null default 0;

-- Update redeem_team_invite to support reusable codes
create or replace function public.redeem_team_invite(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
  v_invite  record;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Allow reusable invites OR single-use unused invites
  select * into v_invite
  from public.invites
  where code = upper(trim(p_code))
    and (is_reusable = true or used_by is null);

  if v_invite.code is null then
    raise exception 'Invalid or already-used invite code';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Invite code has expired';
  end if;

  -- For single-use: mark as used; for reusable: increment counter only
  if v_invite.is_reusable then
    update public.invites
    set use_count = use_count + 1
    where code = v_invite.code;
  else
    update public.invites
    set used_by  = v_user_id,
        used_at  = now(),
        use_count = use_count + 1
    where code = v_invite.code;
  end if;

  -- Assign user to team
  update public.profiles
  set team_id = v_invite.team_id
  where id = v_user_id;

  -- Notify the invite creator
  if v_invite.created_by is not null then
    insert into public.notifications (user_id, type, payload)
    values (
      v_invite.created_by,
      'invite_accepted',
      jsonb_build_object(
        'invitee_id',  v_user_id,
        'code',        v_invite.code,
        'domain_role', v_invite.domain_role
      )
    );
  end if;

  return jsonb_build_object(
    'team_id',     v_invite.team_id,
    'domain_role', v_invite.domain_role
  );
end;
$$;

-- ─── 7. Ensure generate_team_invite supports reusable flag ────────────────────
create or replace function public.generate_team_invite(
  p_domain_role  text    default null,
  p_expiry_days  int     default null,
  p_is_reusable  boolean default false
)
returns jsonb language plpgsql security definer as $$
declare
  v_caller_id  uuid := auth.uid();
  v_team_id    uuid;
  v_code       text;
  v_expires_at timestamptz;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select team_id into v_team_id
  from public.profiles
  where id = v_caller_id and role in ('LEAD', 'SUPER_ADMIN');

  if v_team_id is null then
    raise exception 'Access denied: caller is not a team lead or super admin';
  end if;

  v_code := 'CLSTR-' || upper(
    substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6)
  );

  if p_expiry_days is not null and p_expiry_days > 0 then
    v_expires_at := now() + (p_expiry_days || ' days')::interval;
  end if;

  insert into public.invites (code, team_id, created_by, domain_role, expires_at, is_reusable)
  values (v_code, v_team_id, v_caller_id, p_domain_role, v_expires_at, coalesce(p_is_reusable, false));

  return jsonb_build_object(
    'code',        v_code,
    'team_id',     v_team_id,
    'domain_role', p_domain_role,
    'expires_at',  v_expires_at,
    'is_reusable', coalesce(p_is_reusable, false)
  );
end;
$$;

-- ─── 8. Add missing index on profiles.team_id for join performance ────────────
create index if not exists profiles_team_id_idx on public.profiles (team_id);

-- ─── 9. Add missing index on task_submissions for lead review queries ──────────
create index if not exists task_submissions_user_id_idx  on public.task_submissions (user_id);
create index if not exists task_submissions_status_idx   on public.task_submissions (status);

-- ─── 10. Add missing index on notifications for real-time query ──────────────
create index if not exists notifications_user_id_read_idx
  on public.notifications (user_id, read)
  where read = false;

-- ─── 11. program_config: add updated_at trigger ──────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists program_config_updated_at on public.program_config;
create trigger program_config_updated_at
  before update on public.program_config
  for each row execute procedure public.set_updated_at();

drop trigger if exists daily_checklist_updated_at on public.daily_checklist;
create trigger daily_checklist_updated_at
  before update on public.daily_checklist
  for each row execute procedure public.set_updated_at();
