-- ============================================================
-- Clstr CA Portal — Daily Checklist (closes last localStorage gap)
-- Run after 001_initial_schema.sql (same Supabase project).
-- ============================================================

create table if not exists public.daily_checklist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade not null,
  check_date  date not null,
  checks      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now(),
  unique (user_id, check_date)
);

alter table public.daily_checklist enable row level security;

drop policy if exists "daily_checklist: own all" on public.daily_checklist;
create policy "daily_checklist: own all"
  on public.daily_checklist for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
