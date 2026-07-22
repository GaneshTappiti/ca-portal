-- ============================================================
-- Clstr CA Portal — Migration 005: Schema Alignment & Security Fixes
-- Fixes DB/frontend column mismatches, security holes, missing RPCs
-- ============================================================

-- ─── 1. Fix create_captain_and_team auth check ──────────────────────────────
-- Security vuln: auth.uid() is null → check passes (unauthenticated access)
-- Fix: reject when auth.uid() is null OR not super admin
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
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Access denied: requires super admin role';
  end if;

  v_user_id := gen_random_uuid();
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  insert into public.teams (college, tier, target_users)
  values (p_college, coalesce(p_tier, 4), case coalesce(p_tier, 4)
    when 1 then 5000
    when 2 then 3000
    when 3 then 2000
    else 1000 end)
  returning id into v_team_id;

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

  update public.profiles
  set role = 'LEAD',
      tier = coalesce(p_tier, 4),
      team_id = v_team_id,
      college = p_college
  where id = v_user_id
  returning ca_id into v_ca_id;

  update public.teams
  set lead_id = v_user_id
  where id = v_team_id;

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

-- ─── 2. Fix admin_create_user auth check (same pattern) ─────────────────────
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
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Access denied: requires super admin role';
  end if;

  v_user_id := gen_random_uuid();
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000'::uuid,
    p_email, v_encrypted_password, now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'college', p_college, 'role', p_role),
    'authenticated', 'authenticated', now(), now()
  );

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

-- ─── 3. Add missing columns to clubs table ─────────────────────────────────
-- Frontend expects: domain, event_count, onboarded_at, last_post_at, president_name
alter table public.clubs
  add column if not exists domain text,
  add column if not exists event_count int not null default 0,
  add column if not exists onboarded_at timestamptz default now(),
  add column if not exists last_post_at timestamptz;

-- ─── 4. Add posted_at to reels table ───────────────────────────────────────
-- Frontend expects posted_at (timestamptz) alongside existing posted_date (date)
alter table public.reels
  add column if not exists posted_at timestamptz;

-- ─── 5. Remove Team Member RPC ─────────────────────────────────────────────
-- Allows LEADs to remove members from their team (bypasses RLS)
drop function if exists public.remove_team_member(uuid) cascade;
create or replace function public.remove_team_member(p_user_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_team_id uuid;
  v_target_team_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select role, team_id into v_caller_role, v_caller_team_id
  from public.profiles where id = v_caller_id;

  if v_caller_role not in ('LEAD', 'SUPER_ADMIN') then
    raise exception 'Access denied: requires LEAD or SUPER_ADMIN role';
  end if;

  select team_id into v_target_team_id
  from public.profiles where id = p_user_id;

  if v_caller_role != 'SUPER_ADMIN' and v_target_team_id != v_caller_team_id then
    raise exception 'Access denied: user is not in your team';
  end if;

  update public.profiles
  set team_id = null
  where id = p_user_id;

  return jsonb_build_object('success', true, 'user_id', p_user_id);
end;
$$;

-- ─── 6. Fix generate_team_invite auth check ────────────────────────────────
-- Same security pattern: reject unauthenticated callers
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
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select team_id into v_team_id
  from public.profiles
  where id = v_caller_id and role in ('LEAD', 'SUPER_ADMIN');

  if v_team_id is null then
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

-- ─── 7. Validate Invite Code RPC ──────────────────────────────────────────
-- Allows unauthenticated users to validate a specific invite code
-- without exposing the entire invites table
drop function if exists public.validate_invite_code(text) cascade;
create or replace function public.validate_invite_code(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  v_invite record;
begin
  select * into v_invite from public.invites
  where code = upper(trim(p_code)) and used_by is null;

  if v_invite.code is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  return jsonb_build_object(
    'valid', true,
    'team_id', v_invite.team_id,
    'domain_role', v_invite.domain_role
  );
end;
$$;

-- ─── 8. Fix invite policy — authenticated-only reads ──────────────────────
-- The validate_invite_code RPC handles unauthenticated validation
drop policy if exists "invites: anyone can validate a code (for signup)" on public.invites;
create policy "invites: anyone can validate a code (for signup)"
  on public.invites for select
  using (auth.uid() is not null);

-- ─── 9. Fix task_category enum to match frontend values ───────────────────
-- Frontend expects: Clubs & Events, Placement & Career, Community, Growth & Outreach, CollabHub, General
-- DB had different values. Add the frontend values so inserts don't fail.
alter type public.task_category add value if not exists 'Clubs & Events';
alter type public.task_category add value if not exists 'Placement & Career';
alter type public.task_category add value if not exists 'Community';
alter type public.task_category add value if not exists 'Growth & Outreach';
alter type public.task_category add value if not exists 'CollabHub';
alter type public.task_category add value if not exists 'General';

-- ─── 10. Add REINDEX recommendation for ca_id ─────────────────────────────
create index if not exists profiles_ca_id_idx on public.profiles (ca_id);

