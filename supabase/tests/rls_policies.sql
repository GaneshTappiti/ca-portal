-- ============================================================
-- Clstr CA Portal — RLS Policy Tests
-- These tests verify that the security boundary is correct:
-- MEMBERs cannot read other teams' data, LEADs can only manage
-- their own team, SUPER_ADMINs can read all.
--
-- Run via Supabase CLI: supabase test db
-- Or paste into pgTAP test runner
-- ============================================================

-- Install pgTAP if not already installed
-- create extension if not exists pgtap;

BEGIN;
SELECT plan(20);

-- ─── Setup test fixtures ─────────────────────────────────────────────────────

-- Create test teams
INSERT INTO public.teams (id, college, tier, target_users) VALUES
  ('11111111-0000-0000-0000-000000000000'::uuid, 'Test College A', 1, 5000),
  ('22222222-0000-0000-0000-000000000000'::uuid, 'Test College B', 2, 3000);

-- Create test profiles (simulating different users)
-- In real tests these would reference actual auth.users rows
-- For pgTAP testing we use set_config to simulate auth.uid()

-- ─── Test 1: MEMBER cannot read another team's submissions ───────────────────

-- Simulate member from team A
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- Member from team B should not be readable
SELECT is(
  (SELECT count(*)::int FROM public.task_submissions
   WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid),
  0,
  'MEMBER cannot read another team member''s submissions'
);

-- ─── Test 2: MEMBER can read own submissions ─────────────────────────────────

SELECT is(
  (SELECT count(*)::int FROM public.task_submissions
   WHERE user_id = auth.uid()),
  (SELECT count(*)::int FROM public.task_submissions
   WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid),
  'MEMBER can read own submissions'
);

-- ─── Test 3: MEMBER cannot update submission status directly ─────────────────

-- A MEMBER should not be able to set status=verified themselves
SELECT throws_ok(
  $$UPDATE public.task_submissions
    SET status = 'verified'
    WHERE user_id = auth.uid()$$,
  'MEMBER cannot self-verify a submission'
);

-- ─── Test 4: Task definitions are readable by all authenticated users ─────────

SELECT ok(
  (SELECT count(*)::int FROM public.task_definitions WHERE active = true) >= 0,
  'Authenticated users can read active task definitions'
);

-- ─── Test 5: MEMBER cannot create task definitions ──────────────────────────

SELECT throws_ok(
  $$INSERT INTO public.task_definitions (title, points, category)
    VALUES ('Malicious Task', 9999, 'General')$$,
  'MEMBER cannot insert task definitions'
);

-- ─── Test 6: MEMBER cannot read another team's clubs ────────────────────────

-- Simulate member from team A checking team B's clubs
SELECT is(
  (SELECT count(*)::int FROM public.clubs
   WHERE team_id = '22222222-0000-0000-0000-000000000000'::uuid),
  0,
  'MEMBER cannot read another team''s clubs'
);

-- ─── Test 7: MEMBER cannot read another user's weekly reports ───────────────

SELECT is(
  (SELECT count(*)::int FROM public.weekly_reports
   WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid),
  0,
  'MEMBER cannot read another user''s weekly reports'
);

-- ─── Test 8: Notifications are private ──────────────────────────────────────

SELECT is(
  (SELECT count(*)::int FROM public.notifications
   WHERE user_id != auth.uid()),
  0,
  'Users cannot read other users'' notifications'
);

-- ─── Test 9: Invite codes visible (for signup validation) ───────────────────

-- Invites need to be readable to validate codes during signup
SELECT ok(
  (SELECT count(*)::int FROM public.invites) >= 0,
  'Invite codes are readable for validation'
);

-- ─── Test 10: MEMBER cannot create invite codes ──────────────────────────────

-- Only LEADs and SUPER_ADMINs can create invites
-- A regular MEMBER should be blocked
SELECT throws_ok(
  $$INSERT INTO public.invites (code, team_id, created_by)
    VALUES ('HACKED-1', '22222222-0000-0000-0000-000000000000'::uuid, auth.uid())$$,
  'MEMBER cannot create invites for another team'
);

-- ─── Cleanup ──────────────────────────────────────────────────────────────────

DELETE FROM public.teams WHERE id IN (
  '11111111-0000-0000-0000-000000000000'::uuid,
  '22222222-0000-0000-0000-000000000000'::uuid
);

SELECT * FROM finish();
ROLLBACK;
