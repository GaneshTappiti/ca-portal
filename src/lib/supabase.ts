/**
 * supabase.ts — Secondary Supabase client (Main Clstr production DB)
 *
 * Reads from admin_college_stats_v2 in the main Clstr app DB.
 * This is a completely separate Supabase project from the CA portal.
 *
 * Env vars required:
 *   VITE_SECONDARY_SUPABASE_URL      = https://cijcmqrezdftxjgqcbeg.supabase.co
 *   VITE_SECONDARY_SUPABASE_ANON_KEY = eyJ...
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── Client ───────────────────────────────────────────────────────────────────

const _url = import.meta.env.VITE_SECONDARY_SUPABASE_URL as string | undefined;
const _key = import.meta.env.VITE_SECONDARY_SUPABASE_ANON_KEY as string | undefined;

if (import.meta.env.DEV) {
  if (_url && _key) {
    console.info("[SecondaryDB] ✓ Connected to", _url);
  } else {
    console.warn(
      "[SecondaryDB] ✗ Not configured — VITE_SECONDARY_SUPABASE_URL or VITE_SECONDARY_SUPABASE_ANON_KEY missing in .env"
    );
  }
}

export const supabaseSecondary: SupabaseClient | null =
  _url && _key
    ? createClient(_url, _key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            apikey: _key,
          },
        },
      })
    : null;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CollegeOption {
  id: string;
  name: string;
  canonicalDomain: string;
  city: string | null;
  totalUsers: number;
  status: string | null;
}

export interface CollegeStats extends CollegeOption {
  studentCount: number;
  alumniCount: number;
  facultyCount: number;
  activeUsers7d: number;
  clubsCount: number;
  eventsCount: number;
  postsCount: number;
  statsRefreshedAt: string | null;
  firstUserAt: string | null;
  latestUserAt: string | null;
  isLive: boolean;
  error?: string;
}

// ─── Fetch all colleges (for dropdown) ───────────────────────────────────────

export async function fetchAllColleges(): Promise<CollegeOption[]> {
  if (!supabaseSecondary) {
    console.warn("[SecondaryDB] fetchAllColleges() skipped — client not configured");
    return [];
  }

  try {
    const { data, error } = await supabaseSecondary
      .from("admin_college_stats_v2")
      .select("id, name, canonical_domain, city, total_users, status")
      .not("canonical_domain", "is", null)
      .not("name", "is", null)
      .order("total_users", { ascending: false })
      .limit(300);

    if (error) {
      console.error("[SecondaryDB] fetchAllColleges error:", error.message, error.details);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((row) => ({
      id:              row.id,
      name:            row.name ?? "",
      canonicalDomain: row.canonical_domain ?? "",
      city:            row.city ?? null,
      totalUsers:      Number(row.total_users) || 0,
      status:          row.status ?? null,
    }));
  } catch (err) {
    console.error("[SecondaryDB] fetchAllColleges exception:", err);
    return [];
  }
}

// ─── Fetch stats for one campus ──────────────────────────────────────────────

/**
 * Fetch live campus stats from admin_college_stats_v2 by exact canonical_domain match.
 */
export async function fetchCollegeStats(
  canonicalDomain: string
): Promise<CollegeStats | null> {
  if (!supabaseSecondary) {
    return {
      id: "",
      name: "",
      canonicalDomain,
      city: null,
      status: null,
      totalUsers: 0,
      studentCount: 0,
      alumniCount: 0,
      facultyCount: 0,
      activeUsers7d: 0,
      clubsCount: 0,
      eventsCount: 0,
      postsCount: 0,
      statsRefreshedAt: null,
      firstUserAt: null,
      latestUserAt: null,
      isLive: false,
      error: "Secondary Supabase client not configured in environment",
    };
  }

  // Strip "clstr." prefix and normalize domain for exact lookup
  const domain = canonicalDomain.replace(/^clstr\./, "").trim().toLowerCase();
  if (!domain) {
    return {
      id: "",
      name: "",
      canonicalDomain,
      city: null,
      status: null,
      totalUsers: 0,
      studentCount: 0,
      alumniCount: 0,
      facultyCount: 0,
      activeUsers7d: 0,
      clubsCount: 0,
      eventsCount: 0,
      postsCount: 0,
      statsRefreshedAt: null,
      firstUserAt: null,
      latestUserAt: null,
      isLive: false,
      error: "Canonical domain name is missing",
    };
  }

  try {
    // Match exact canonical_domain to prevent incorrect college statistics matching
    const { data, error } = await supabaseSecondary
      .from("admin_college_stats_v2")
      .select(
        "id, name, canonical_domain, city, status, total_users, student_count, alumni_count, faculty_count, active_users_7d, clubs_count, events_count, posts_count, stats_refreshed_at, first_user_at, latest_user_at"
      )
      .eq("canonical_domain", domain)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[SecondaryDB] fetchCollegeStats error:", error.message);
      return {
        id: "",
        name: "",
        canonicalDomain: domain,
        city: null,
        status: null,
        totalUsers: 0,
        studentCount: 0,
        alumniCount: 0,
        facultyCount: 0,
        activeUsers7d: 0,
        clubsCount: 0,
        eventsCount: 0,
        postsCount: 0,
        statsRefreshedAt: null,
        firstUserAt: null,
        latestUserAt: null,
        isLive: false,
        error: `Database query error: ${error.message}`,
      };
    }

    if (!data) {
      return {
        id: "",
        name: "",
        canonicalDomain: domain,
        city: null,
        status: null,
        totalUsers: 0,
        studentCount: 0,
        alumniCount: 0,
        facultyCount: 0,
        activeUsers7d: 0,
        clubsCount: 0,
        eventsCount: 0,
        postsCount: 0,
        statsRefreshedAt: null,
        firstUserAt: null,
        latestUserAt: null,
        isLive: false,
        error: `No exact campus record found for domain: "${domain}"`,
      };
    }

    return {
      id:              data.id,
      name:            data.name ?? "",
      canonicalDomain: data.canonical_domain ?? domain,
      city:            data.city ?? null,
      status:          data.status ?? null,
      totalUsers:      Number(data.total_users)     || 0,
      studentCount:    Number(data.student_count)   || 0,
      alumniCount:     Number(data.alumni_count)    || 0,
      facultyCount:    Number(data.faculty_count)   || 0,
      activeUsers7d:   Number(data.active_users_7d) || 0,
      clubsCount:      Number(data.clubs_count)     || 0,
      eventsCount:     Number(data.events_count)    || 0,
      postsCount:      Number(data.posts_count)     || 0,
      statsRefreshedAt: data.stats_refreshed_at ?? null,
      firstUserAt:     data.first_user_at ?? null,
      latestUserAt:    data.latest_user_at ?? null,
      isLive:          true,
    };
  } catch (err) {
    console.error("[SecondaryDB] fetchCollegeStats exception:", err);
    return {
      id: "",
      name: "",
      canonicalDomain: domain,
      city: null,
      status: null,
      totalUsers: 0,
      studentCount: 0,
      alumniCount: 0,
      facultyCount: 0,
      activeUsers7d: 0,
      clubsCount: 0,
      eventsCount: 0,
      postsCount: 0,
      statsRefreshedAt: null,
      firstUserAt: null,
      latestUserAt: null,
      isLive: false,
      error: err instanceof Error ? err.message : "Unknown connection exception",
    };
  }
}

export async function fetchLiveVerifiedUsers(
  canonicalDomain: string
): Promise<number | null> {
  const stats = await fetchCollegeStats(canonicalDomain);
  return stats && stats.isLive ? stats.totalUsers : null;
}
