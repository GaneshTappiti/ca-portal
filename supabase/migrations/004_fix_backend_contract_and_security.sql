-- ============================================================
-- Clstr CA Portal — Migration 004: Backend Contract & Security Hardening
-- Realtime, Audit Trail, Transactional RPCs, and Strict RLS
-- ============================================================

-- ─── 1. Point Audit Log Table ───────────────────────────────────────────────
create table if not exists public.point_audit_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete cascade not null,
  submission_id uuid references public.task_submissions(id) on delete set null,
  points        int not null,
  awarded_by    uuid references public.profiles(id) not null,
  created_at    timestamptz default now()
);

alter table public.point_audit_log enable row level security;

drop policy if exists "point_audit_log: read own or lead/admin" on public.point_audit_log;
create policy "point_audit_log: read own or lead/admin"
  on public.point_audit_log for select
  using (
    user_id = auth.uid()
    or awarded_by = auth.uid()
    or public.is_lead_or_admin()
  );

-- ─── 2. Transactional RPCs ──────────────────────────────────────────────────

-- 2A. Create Captain and Team together atomically
drop function if exists public.create_captain_and_team(text,text,text,text,int,text) cascade;
create or replace function public.create_captain_and_team(
  p_email text,
  p_password text,
  p_full_name text,
  p_college text,
  p_tier int default 4,
  p_domain_role text default 'Campus Captain'
)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid;
  v_team_id uuid;
  v_encrypted_password text;
  v_ca_id text;
  v_invite_code text;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Access denied: requires super admin role';
  end if;

  -- Clean up existing auth user with same email if present
  delete from auth.users where email = lower(trim(p_email));

  v_user_id := gen_random_uuid();
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  -- Create team first
  insert into public.teams (college, tier, target_users)
  values (p_college, coalesce(p_tier, 4), case coalesce(p_tier, 4)
    when 1 then 5000
    when 2 then 3000
    when 3 then 2000
    else 1000 end)
  returning id into v_team_id;

  -- Create auth user
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000'::uuid,
    p_email, v_encrypted_password, now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'college', p_college),
    'authenticated', 'authenticated', now(), now()
  );

  -- Update profile with LEAD role & team_id
  update public.profiles
  set role = 'LEAD',
      tier = coalesce(p_tier, 4),
      team_id = v_team_id,
      college = p_college
  where id = v_user_id
  returning ca_id into v_ca_id;

  -- Link team lead_id back to profile
  update public.teams
  set lead_id = v_user_id
  where id = v_team_id;

  -- Generate initial reusable team invite
  v_invite_code := 'CLSTR-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
  insert into public.invites (code, team_id, created_by, domain_role)
  values (v_invite_code, v_team_id, v_user_id, p_domain_role);

  return jsonb_build_object(
    'user_id', v_user_id,
    'team_id', v_team_id,
    'ca_id', coalesce(v_ca_id, ''),
    'invite_code', v_invite_code
  );
end;
$$;

-- 2B. Generate Team Invite
drop function if exists public.generate_team_invite(text,int) cascade;
create or replace function public.generate_team_invite(
  p_domain_role text default null,
  p_expiry_days int default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_caller_id uuid := auth.uid();
  v_team_id uuid;
  v_code text;
  v_expires_at timestamptz;
begin
  select team_id into v_team_id
  from public.profiles
  where id = v_caller_id and role in ('LEAD', 'SUPER_ADMIN');

  if v_team_id is null and auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Access denied: caller is not a team lead or super admin';
  end if;

  v_code := 'CLSTR-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
  if p_expiry_days is not null and p_expiry_days > 0 then
    v_expires_at := now() + (p_expiry_days || ' days')::interval;
  end if;

  insert into public.invites (code, team_id, created_by, domain_role, expires_at)
  values (v_code, v_team_id, v_caller_id, p_domain_role, v_expires_at);

  return jsonb_build_object(
    'code', v_code,
    'team_id', v_team_id,
    'domain_role', p_domain_role,
    'expires_at', v_expires_at
  );
end;
$$;

-- 2C. Redeem Team Invite
drop function if exists public.redeem_team_invite(text) cascade;
create or replace function public.redeem_team_invite(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
  v_invite record;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_invite
  from public.invites
  where code = upper(trim(p_code))
    and used_by is null;

  if v_invite.code is null then
    raise exception 'Invalid or already-used invite code';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Invite code has expired';
  end if;

  -- Mark invite as used
  update public.invites
  set used_by = v_user_id,
      used_at = now()
  where code = v_invite.code;

  -- Assign user to team
  update public.profiles
  set team_id = v_invite.team_id
  where id = v_user_id;

  -- Create notification for lead
  if v_invite.created_by is not null then
    insert into public.notifications (user_id, type, payload)
    values (
      v_invite.created_by,
      'invite_accepted',
      jsonb_build_object('invitee_id', v_user_id, 'code', v_invite.code, 'domain_role', v_invite.domain_role)
    );
  end if;

  return jsonb_build_object(
    'team_id', v_invite.team_id,
    'domain_role', v_invite.domain_role
  );
end;
$$;

-- 2D. Submit Task
drop function if exists public.submit_task(uuid,text,text) cascade;
create or replace function public.submit_task(
  p_task_id uuid,
  p_proof_url text default null,
  p_notes text default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
  v_submission_id uuid;
  v_status text;
  v_lead_id uuid;
  v_team_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select team_id into v_team_id from public.profiles where id = v_user_id;

  insert into public.task_submissions (task_id, user_id, proof_url, notes, status, submitted_at)
  values (p_task_id, v_user_id, p_proof_url, p_notes, 'pending', now())
  on conflict (task_id, user_id) do update set
    proof_url = excluded.proof_url,
    notes = excluded.notes,
    status = 'pending',
    submitted_at = now()
  returning id, status into v_submission_id, v_status;

  -- Notify team lead if available
  if v_team_id is not null then
    select lead_id into v_lead_id from public.teams where id = v_team_id;
    if v_lead_id is not null and v_lead_id != v_user_id then
      insert into public.notifications (user_id, type, payload)
      values (
        v_lead_id,
        'task_submitted',
        jsonb_build_object('submission_id', v_submission_id, 'task_id', p_task_id, 'submitter_id', v_user_id)
      );
    end if;
  end if;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'status', v_status
  );
end;
$$;

-- 2E. Approve Task Submission
drop function if exists public.approve_task_submission(uuid,int) cascade;
create or replace function public.approve_task_submission(
  p_submission_id uuid,
  p_points_override int default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_reviewer_id uuid := auth.uid();
  v_sub record;
  v_task_points int;
  v_awarded int;
begin
  if v_reviewer_id is null then
    raise exception 'Authentication required';
  end if;

  select ts.*, p.team_id as submitter_team_id
  into v_sub
  from public.task_submissions ts
  join public.profiles p on p.id = ts.user_id
  where ts.id = p_submission_id;

  if v_sub.id is null then
    raise exception 'Submission not found';
  end if;

  if v_sub.status = 'verified' then
    raise exception 'Submission is already verified';
  end if;

  -- Verify reviewer authorization: Lead of submitter team or Super Admin
  if not public.is_super_admin() then
    if not exists (
      select 1 from public.profiles
      where id = v_reviewer_id
        and role = 'LEAD'
        and team_id = v_sub.submitter_team_id
    ) then
      raise exception 'Access denied: caller cannot review this team submission';
    end if;
  end if;

  -- Determine points
  select points into v_task_points
  from public.task_definitions
  where id = v_sub.task_id;

  v_awarded := coalesce(p_points_override, v_task_points, 0);

  -- Update submission state
  update public.task_submissions
  set status = 'verified',
      reviewed_by = v_reviewer_id,
      reviewed_at = now(),
      points_awarded = v_awarded
  where id = p_submission_id;

  -- Record audit log
  insert into public.point_audit_log (user_id, submission_id, points, awarded_by)
  values (v_sub.user_id, p_submission_id, v_awarded, v_reviewer_id);

  -- Send notification to submitter
  insert into public.notifications (user_id, type, payload)
  values (
    v_sub.user_id,
    'task_approved',
    jsonb_build_object('submission_id', p_submission_id, 'points', v_awarded, 'reviewer_id', v_reviewer_id)
  );

  return jsonb_build_object(
    'submission_id', p_submission_id,
    'status', 'verified',
    'points_awarded', v_awarded
  );
end;
$$;

-- 2F. Reject Task Submission
drop function if exists public.reject_task_submission(uuid,text) cascade;
create or replace function public.reject_task_submission(
  p_submission_id uuid,
  p_rejection_reason text
)
returns jsonb language plpgsql security definer as $$
declare
  v_reviewer_id uuid := auth.uid();
  v_sub record;
  v_reason text := trim(coalesce(p_rejection_reason, ''));
begin
  if v_reviewer_id is null then
    raise exception 'Authentication required';
  end if;

  if v_reason = '' then
    raise exception 'Rejection reason is required';
  end if;

  select ts.*, p.team_id as submitter_team_id
  into v_sub
  from public.task_submissions ts
  join public.profiles p on p.id = ts.user_id
  where ts.id = p_submission_id;

  if v_sub.id is null then
    raise exception 'Submission not found';
  end if;

  if v_sub.status = 'verified' then
    raise exception 'Cannot reject an already verified submission';
  end if;

  if not public.is_super_admin() then
    if not exists (
      select 1 from public.profiles
      where id = v_reviewer_id
        and role = 'LEAD'
        and team_id = v_sub.submitter_team_id
    ) then
      raise exception 'Access denied: caller cannot review this team submission';
    end if;
  end if;

  update public.task_submissions
  set status = 'rejected',
      reviewed_by = v_reviewer_id,
      reviewed_at = now(),
      rejection_reason = v_reason
  where id = p_submission_id;

  insert into public.notifications (user_id, type, payload)
  values (
    v_sub.user_id,
    'task_rejected',
    jsonb_build_object('submission_id', p_submission_id, 'reason', v_reason, 'reviewer_id', v_reviewer_id)
  );

  return jsonb_build_object(
    'submission_id', p_submission_id,
    'status', 'rejected',
    'reason', v_reason
  );
end;
$$;

-- ─── 3. Strict RLS Policies Fixes ──────────────────────────────────────────

-- Profiles update policy: users can update full_name or avatar_url, but NOT role, tier, team_id, total_points
drop policy if exists "profiles: own update" on public.profiles;
create policy "profiles: own update"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and tier = (select tier from public.profiles where id = auth.uid())
    and team_id is not distinct from (select team_id from public.profiles where id = auth.uid())
    and total_points = (select total_points from public.profiles where id = auth.uid())
  );

-- Task Submissions WITH CHECK policy
drop policy if exists "task_submissions: own update (submit/retry)" on public.task_submissions;
create policy "task_submissions: own update (submit/retry)"
  on public.task_submissions for update
  using (user_id = auth.uid() and status in ('open','rejected'))
  with check (user_id = auth.uid() and status = 'pending');

-- Notifications insert policy: block arbitrary browser inserts
drop policy if exists "notifications: service can insert" on public.notifications;
create policy "notifications: service can insert"
  on public.notifications for insert
  with check (
    user_id = auth.uid()
    or public.is_lead_or_admin()
  );

-- ─── 4. Signup Security: Force MEMBER role in trigger ──────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, college, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'college', ''),
    'MEMBER' -- Force MEMBER role for public signups regardless of metadata
  );
  return new;
end;
$$;

-- ─── 5. Enable Realtime Replication ──────────────────────────────────────────
-- Publication setup for live updates (idempotent)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'task_submissions'
  ) then
    alter publication supabase_realtime add table public.task_submissions;
  end if;

  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'invites'
  ) then
    alter publication supabase_realtime add table public.invites;
  end if;

  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'clubs'
  ) then
    alter publication supabase_realtime add table public.clubs;
  end if;

  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'reels'
  ) then
    alter publication supabase_realtime add table public.reels;
  end if;

  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'weekly_reports'
  ) then
    alter publication supabase_realtime add table public.weekly_reports;
  end if;
end;
$$;
