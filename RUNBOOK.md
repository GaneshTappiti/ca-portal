# Clstr CA Portal — Operational Runbook

> Keep this open during Week 1. If something breaks, fix it in under 15 minutes using this guide.

---

## 🔴 P0 — Site is down / completely inaccessible

**Symptoms:** App won't load. Blank page or 5xx error.

**Fix:**
1. Check Vercel deployment status → [vercel.com/dashboard](https://vercel.com/dashboard)
2. Check Supabase service health → [status.supabase.com](https://status.supabase.com)
3. If Vercel: re-deploy the last working commit via Vercel dashboard
4. If Supabase down: fallback mode — tell CAs to log tasks locally (WhatsApp) for up to 24h. Supabase SLA is 99.9% so this is rare.

---

## 🟠 Invite code not working

**Symptoms:** CA types invite code at signup, gets "Invalid or already-used" error.

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Code was already used by someone | Generate a new code: Supabase → Table Editor → invites → Insert Row |
| Code expired (set an expiry date) | Same — generate a new code with no expiry |
| CA typed the code wrong | Code is case-insensitive, but check for spaces |
| invite code was for a different team | Confirm the Lead sent the right code for their campus |

**How to generate a code manually (Supabase SQL Editor):**
```sql
INSERT INTO public.invites (code, team_id, created_by)
VALUES (
  'CLSTR-MANUAL',
  '<paste team UUID from teams table>',
  '<paste lead's profile UUID>'
);
```

---

## 🟠 File upload failing (proof photos/videos)

**Symptoms:** DropZone shows error after selecting a file, or upload progress stalls.

**Cause checklist:**
1. **File > 10 MB** — ask CA to compress the video or upload a screenshot instead
2. **Supabase Storage not set up** — ensure `task-proofs` bucket exists and storage policies are configured (see `supabase/migrations/001_initial_schema.sql` comments)
3. **Incorrect bucket name** — check `src/components/DropZone.tsx` uses `"task-proofs"` as bucket
4. **CORS issue** — Supabase Storage CORS is configured automatically; if seeing CORS errors, check the Supabase project settings → Storage → CORS

**Quick workaround while fixing:**
Tell LEAD to ask CA to paste a public Google Drive / Instagram link in the Notes field instead of uploading directly.

---

## 🟡 Points not updating after LEAD approval

**Symptoms:** LEAD approves a task, but MEMBER's point total doesn't change.

**Root cause:** The `handle_submission_verified` Postgres trigger may have failed.

**Fix:**
1. Check if the trigger exists:
   ```sql
   SELECT * FROM information_schema.triggers WHERE trigger_name = 'on_submission_verified';
   ```
2. If missing, re-run the trigger creation from `supabase/migrations/001_initial_schema.sql`
3. Manually update points as a temporary fix:
   ```sql
   UPDATE public.profiles
   SET total_points = total_points + <points_value>
   WHERE id = '<member_user_uuid>';
   ```

---

## 🟡 Task submission not appearing for LEAD review

**Symptoms:** MEMBER submits proof, but LEAD doesn't see it in their review queue.

**Cause checklist:**
1. **RLS issue** — MEMBER may not be in the LEAD's team. Check `profiles.team_id`:
   ```sql
   SELECT id, full_name, team_id FROM public.profiles WHERE email = '<member_email>';
   ```
2. **MEMBER has no team_id** — invite code was accepted but team linking failed. Fix:
   ```sql
   UPDATE public.profiles SET team_id = '<team_uuid>' WHERE id = '<member_uuid>';
   ```
3. **Status not 'pending'** — check submission status:
   ```sql
   SELECT * FROM public.task_submissions WHERE user_id = '<member_uuid>';
   ```

---

## 🟡 Notifications not showing in real-time

**Symptoms:** MEMBER submits task, LEAD doesn't get instant notification.

**Cause:** Supabase Realtime subscription may have dropped.

**Fix:** Reload the app. The Realtime subscription re-establishes on mount. If persistent:
1. Check Supabase Realtime is enabled: Dashboard → Database → Replication → Enable for `notifications` table
2. Check browser console for WebSocket errors

---

## 🟡 User forgot password (or can't receive verification email)

**Fix for forgotten password:**
Direct them to the login page → click "Forgot password?" → enter email → check inbox + spam folder.

**Fix for verification email not received:**
Supabase Dashboard → Authentication → Users → find their email → "Resend confirmation email"

**Fix for admin-reset (emergency):**
```
Supabase Dashboard → Authentication → Users → click user → "Send password recovery"
```

---

## 🔵 Wrong role assigned to user

**Symptoms:** A CA signed up and got MEMBER instead of LEAD role.

**Fix (Supabase SQL Editor):**
```sql
UPDATE public.profiles
SET role = 'LEAD'  -- or 'SUPER_ADMIN'
WHERE id = (SELECT id FROM auth.users WHERE email = 'user@example.com');
```
> ⚠️ Only SUPER_ADMIN should do this. Never share this query with CAs.

---

## 🔵 Dashboard showing "live data unavailable" for Verified Users

**Cause:** `VITE_SECONDARY_SUPABASE_URL` and `VITE_SECONDARY_SUPABASE_ANON_KEY` are not set, OR the table/column names in `supabase.ts` don't match the main Clstr DB schema.

**Fix:**
1. Set the env vars in Vercel dashboard
2. Update table/column names in `src/lib/supabase.ts` (marked with `// ← TODO:` comments)
3. Redeploy

---

## 📊 Useful Supabase queries for debugging

```sql
-- See all teams and their member counts
SELECT t.college, t.tier, count(p.id) as member_count
FROM public.teams t
LEFT JOIN public.profiles p ON p.team_id = t.id
GROUP BY t.id;

-- See pending task submissions across all teams
SELECT p.full_name, td.title, ts.status, ts.submitted_at
FROM public.task_submissions ts
JOIN public.profiles p ON p.id = ts.user_id
JOIN public.task_definitions td ON td.id = ts.task_id
WHERE ts.status = 'pending'
ORDER BY ts.submitted_at;

-- Leaderboard by total points
SELECT full_name, college, total_points, role
FROM public.profiles
ORDER BY total_points DESC
LIMIT 20;

-- Unread notifications older than 24h (potential delivery failure)
SELECT * FROM public.notifications
WHERE read = false
AND created_at < now() - interval '24 hours';
```

---

## 📞 Escalation Path

1. **You** — check this runbook first (< 5 min)
2. **Supabase dashboard** — Table Editor, Auth, Storage, SQL Editor
3. **Sentry** — check for error reports at sentry.io
4. **Vercel** — check deployment logs
5. **WhatsApp fallback** — for P0 outages: ask CAs to track manually for up to 24h while you fix
