/**
 * supabaseClient.ts — Primary Supabase client (CA Portal's own data)
 *
 * This is the main client used for all app data: tasks, teams, profiles,
 * notifications, reels, clubs, reports.
 *
 * SECURITY RULES:
 *   - Uses VITE_SUPABASE_ANON_KEY (public/anon key) ONLY
 *   - Never use the service_role key in frontend code
 *   - All data access is enforced by RLS policies on the server
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Clstr] Supabase env vars not set. " +
    "Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      // Supabase Auth manages sessions via its own secure storage
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export type SupabaseClient = typeof supabase;
