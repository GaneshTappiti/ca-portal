import { createClient } from "@supabase/supabase-js";

// Initialize the secondary database for Live Users
// The user will need to provide these variables in their .env file
const supabaseUrl = import.meta.env.VITE_SECONDARY_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SECONDARY_SUPABASE_ANON_KEY || "";

export const supabaseSecondary = 
  supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey) 
    : null;

/**
 * Fetch the number of live verified users for the campus.
 * Replace 'users_table' and the matching logic with the actual schema of the secondary database.
 */
export async function fetchLiveVerifiedUsers(campusName: string): Promise<number> {
  if (!supabaseSecondary) {
    console.warn("Secondary Supabase not configured. Using fallback data for verified users.");
    return 480; // fallback guidebook target
  }

  try {
    const { count, error } = await supabaseSecondary
      .from("users_table") // <-- Change to actual table name
      .select("*", { count: "exact", head: true })
      .eq("campus", campusName)
      .eq("is_verified", true); // <-- Change to actual verification column if needed

    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    console.error("Error fetching live users:", err);
    return 480; // fallback
  }
}
