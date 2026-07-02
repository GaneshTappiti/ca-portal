/**
 * supabase.ts — Secondary Supabase client (Main Clstr production DB)
 *
 * This client connects to the MAIN Clstr app database (not the CA portal DB).
 * Used exclusively to read live campus stats from admin_college_stats_v2.
 *
 * Table: public.admin_college_stats_v2
 *   - canonical_domain  → matched against profiles.college (e.g. "raghuinstitute")
 *   - total_users       → total registered users on that campus
 *   - student_count     → breakdown: students
 *   - alumni_count      → breakdown: alumni
 *   - faculty_count     → breakdown: faculty
 *   - active_users_7d   → users active in the last 7 days
 *   - clubs_count       → number of clubs on that campus
 *   - events_count      → number of events posted
 *   - posts_count       → number of posts
 *   - stats_refreshed_at → when the stats were last computed
 *
 * Configure in .env:
 *   VITE_SECONDARY_SUPABASE_URL      = https://your-main-clstr-project.supabase.co
 *   VITE_SECONDARY_SUPABASE_ANON_KEY = your-main-clstr-anon-key
 *
 * If env vars are not set, all functions return null so the UI shows
 * a "cached" badge instead of silently displaying stale data.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SECONDARY_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SECONDARY_SUPABASE_ANON_KEY as string;

export const supabaseSecondary =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }, // read-only secondary — no auth needed
      })
    : null;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Full live stats for a campus, sourced from admin_college_stats_v2 */
export interface CollegeStats {
  /** College name (e.g. "Raghu Institute of Technology") */
  name: string;
  /** Canonical domain key (e.g. "raghuinstitute") */
  canonicalDomain: string;
  city: string | null;
  /** Total registered users on this campus */
  totalUsers: number;
  /** Students specifically */
  studentCount: number;
  /** Alumni count */
  alumniCount: number;
  /** Faculty count */
  facultyCount: number;
  /** Users who were active in the last 7 days */
  activeUsers7d: number;
  /** Number of clubs registered on Clstr for this campus */
  clubsCount: number;
  /** Number of events posted */
  eventsCount: number;
  /** Number of posts */
  postsCount: number;
  /** When these stats were last refreshed in the main DB */
  statsRefreshedAt: string | null;
  /** First user signup date */
  firstUserAt: string | null;
  /** Most recent user signup date */
  latestUserAt: string | null;
}

// ─── Query: fetch stats for a single campus ───────────────────────────────────

/**
 * Fetch live campus stats from admin_college_stats_v2 by canonical_domain.
 *
 * The canonical_domain in the main Clstr DB is matched against
 * the CA's profiles.college field (e.g. "raghuinstitute").
 *
 * Returns null if:
 *   - The secondary DB is not configured
 *   - No matching college is found
 *   - A query error occurs
 */
export async function fetchCollegeStats(
  canonicalDomain: string
): Promise<CollegeStats | null> {
  if (!supabaseSecondary) {
    console.info("[Clstr] Secondary DB not configured — showing cached data.");
    return null;
  }

  try {
    const { data, error } = await supabaseSecondary
      .from("admin_college_stats_v2")
      .select(
        [
          "id",
          "name",
          "canonical_domain",
          "city",
          "total_users",
          "student_count",
          "alumni_count",
          "faculty_count",
          "active_users_7d",
          "clubs_count",
          "events_count",
          "posts_count",
          "stats_refreshed_at",
          "first_user_at",
          "latest_user_at",
        ].join(", ")
      )
      // Match by canonical_domain (e.g. "raghuinstitute")
      // The field may contain the full domain like "clstr.raghuinstitute" — strip prefix
      .ilike("canonical_domain", `%${canonicalDomain.replace(/^clstr\./, "")}%`)
      .order("total_users", { ascending: false }) // if multiple matches, take highest
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      name:             data.name ?? "",
      canonicalDomain:  data.canonical_domain ?? canonicalDomain,
      city:             data.city ?? null,
      totalUsers:       Number(data.total_users)    || 0,
      studentCount:     Number(data.student_count)  || 0,
      alumniCount:      Number(data.alumni_count)   || 0,
      facultyCount:     Number(data.faculty_count)  || 0,
      activeUsers7d:    Number(data.active_users_7d) || 0,
      clubsCount:       Number(data.clubs_count)    || 0,
      eventsCount:      Number(data.events_count)   || 0,
      postsCount:       Number(data.posts_count)    || 0,
      statsRefreshedAt: data.stats_refreshed_at ?? null,
      firstUserAt:      data.first_user_at ?? null,
      latestUserAt:     data.latest_user_at ?? null,
    };
  } catch (err) {
    console.error("[Clstr] Error fetching college stats:", err);
    return null;
  }
}

/**
 * Legacy: kept for backward compatibility with useMetrics.
 * Prefer fetchCollegeStats() for richer data.
 */
export async function fetchLiveVerifiedUsers(
  canonicalDomain: string
): Promise<number | null> {
  const stats = await fetchCollegeStats(canonicalDomain);
  return stats ? stats.totalUsers : null;
}
