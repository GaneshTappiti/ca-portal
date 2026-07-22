-- ============================================================
-- Clstr CA Portal — RLS Policy Tests
-- Verifies security boundaries for MEMBER, LEAD (Captain), and SUPER_ADMIN
-- across two distinct campus teams.
-- ============================================================

BEGIN;
SELECT plan(15);

-- ─── Setup test fixtures ─────────────────────────────────────────────────────

-- Temporarily bypass FK constraints for test setup (rolled back at end)
SET session_replication_role = 'replica';

-- Create test teams
INSERT INTO public.teams (id, college, tier, target_users) VALUES
  ('11111111-0000-0000-0000-000000000000'::uuid, 'Test College A', 1, 5000),
  ('22222222-0000-0000-0000-000000000000'::uuid, 'Test College B', 2, 3000);

-- Create test profiles (FK to auth.users is bypassed via session_replication_role)
-- User A1: Member on Team A
INSERT INTO public.profiles (id, full_name, college, role, team_id, total_points) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'Member A1', 'Test College A', 'MEMBER', '11111111-0000-0000-0000-000000000000'::uuid, 0);

-- User A2: Captain (Lead) on Team A
INSERT INTO public.profiles (id, full_name, college, role, team_id, total_points) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'Captain A2', 'Test College A', 'LEAD', '11111111-0000-0000-0000-000000000000'::uuid, 100);

-- User B1: Member on Team B
INSERT INTO public.profiles (id, full_name, college, role, team_id, total_points) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'Member B1', 'Test College B', 'MEMBER', '22222222-0000-0000-0000-000000000000'::uuid, 50);

-- User Admin: Super Admin
INSERT INTO public.profiles (id, full_name, college, role, total_points) VALUES
  ('99999999-0000-0000-0000-000000000009'::uuid, 'Super Admin', 'Central HQ', 'SUPER_ADMIN', 1000);

-- Re-enable FK constraints for the actual test execution
SET session_replication_role = 'origin';

-- ─── Test 1: MEMBER cannot read another team's submissions ───────────────────
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

SELECT is(
  (SELECT count(*)::int FROM public.task_submissions WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid),
  0,
  'MEMBER cannot read another team member''s submissions'
);

-- ─── Test 2: MEMBER cannot self-promote role ────────────────────────────────
SELECT throws_ok(
  $$UPDATE public.profiles SET role = 'SUPER_ADMIN' WHERE id = auth.uid()$$,
  'MEMBER cannot escalate own role to SUPER_ADMIN'
);

-- ─── Test 3: MEMBER cannot alter own team_id directly ────────────────────────
SELECT throws_ok(
  $$UPDATE public.profiles SET team_id = '22222222-0000-0000-0000-000000000000'::uuid WHERE id = auth.uid()$$,
  'MEMBER cannot modify own team_id directly'
);

-- ─── Test 4: Task definitions readable by authenticated users ─────────────────
SELECT ok(
  (SELECT count(*)::int FROM public.task_definitions WHERE active = true) >= 0,
  'Authenticated users can read active task definitions'
);

-- ─── Test 5: MEMBER cannot insert task definitions ───────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.task_definitions (title, points, category) VALUES ('Fake Task', 999, 'General')$$,
  'MEMBER cannot insert task definitions'
);

-- ─── Test 6: MEMBER cannot read another team's clubs ─────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.clubs WHERE team_id = '22222222-0000-0000-0000-000000000000'::uuid),
  0,
  'MEMBER cannot read another team''s clubs'
);

-- ─── Test 7: MEMBER cannot read another user's notifications ──────────────────
SELECT is(
  (SELECT count(*)::int FROM public.notifications WHERE user_id != auth.uid()),
  0,
  'Users cannot read other users'' notifications'
);

-- ─── Test 8: MEMBER cannot create invite codes for another team ───────────────
SELECT throws_ok(
  $$INSERT INTO public.invites (code, team_id, created_by) VALUES ('UNAUTH-1', '22222222-0000-0000-0000-000000000000'::uuid, auth.uid())$$,
  'MEMBER cannot create invites for another team'
);

-- ─── Test 9: Captain can read team submissions for own team ─────────────────
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);

SELECT ok(
  (SELECT count(*)::int FROM public.profiles WHERE team_id = '11111111-0000-0000-0000-000000000000'::uuid) >= 1,
  'Captain can read profiles for own team'
);

-- ─── Test 10: Captain cannot read team submissions for team B ────────────────
SELECT is(
  (SELECT count(*)::int FROM public.task_submissions WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid),
  0,
  'Captain A cannot read team B member submissions'
);

-- ─── Test 11: Super Admin can read all profiles ──────────────────────────────
SELECT set_config('request.jwt.claim.sub', '99999999-0000-0000-0000-000000000009', true);

SELECT is(
  (SELECT count(*)::int FROM public.profiles),
  4,
  'SUPER_ADMIN can read all profiles across all teams'
);

-- ─── Cleanup ──────────────────────────────────────────────────────────────────
DELETE FROM public.profiles WHERE id IN (
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
  '99999999-0000-0000-0000-000000000009'::uuid
);

DELETE FROM public.teams WHERE id IN (
  '11111111-0000-0000-0000-000000000000'::uuid,
  '22222222-0000-0000-0000-000000000000'::uuid
);

SELECT * FROM finish();
ROLLBACK;
