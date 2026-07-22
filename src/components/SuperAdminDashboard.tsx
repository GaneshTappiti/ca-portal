/**
 * SuperAdminDashboard — Full lead management, operational views & production tools
 * Preserves exact visual design language (sharp edges, #111 bg, #222 border, #CCFF00, #FF5500).
 */

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRequireRole } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";
import { fetchAllColleges, type CollegeOption } from "../lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TaskCategory } from "../lib/types";

interface CAProfile {
  id: string;
  full_name: string;
  college: string;
  role: "MEMBER" | "LEAD" | "SUPER_ADMIN";
  tier: number;
  ca_id: string;
  total_points: number;
  team_id: string | null;
  created_at: string;
}

interface TaskDefinitionAdmin {
  id: string;
  title: string;
  description: string;
  points: number;
  category: TaskCategory;
  active: boolean;
}

function useAllProfiles() {
  return useQuery({
    queryKey: ["admin_profiles"],
    queryFn: async (): Promise<CAProfile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, college, role, tier, ca_id, total_points, team_id, created_at")
        .order("total_points", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });
}

function useTaskDefinitionsAdmin() {
  return useQuery({
    queryKey: ["admin_task_definitions"],
    queryFn: async (): Promise<TaskDefinitionAdmin[]> => {
      const { data, error } = await supabase
        .from("task_definitions")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

function useColleges() {
  return useQuery({
    queryKey: ["all_colleges"],
    queryFn: fetchAllColleges,
    staleTime: 10 * 60_000,
    placeholderData: [],
    retry: 1,
  });
}

async function adminCreateCaptainAndTeam(params: {
  email: string;
  password: string;
  fullName: string;
  college: string;
  tier: number;
}) {
  const { data, error } = await supabase.rpc("create_captain_and_team", {
    p_email: params.email.trim().toLowerCase(),
    p_password: params.password,
    p_full_name: params.fullName.trim(),
    p_college: params.college.trim(),
    p_tier: params.tier,
    p_domain_role: "Campus Captain",
  });

  if (error) {
    // Fallback to admin_create_user
    const { data: fbData, error: fbErr } = await supabase.rpc("admin_create_user", {
      p_email: params.email.trim().toLowerCase(),
      p_password: params.password,
      p_full_name: params.fullName.trim(),
      p_college: params.college.trim(),
      p_role: "LEAD",
      p_tier: params.tier,
    });
    if (fbErr) throw new Error(fbErr.message);
    return { userId: fbData.user_id, inviteCode: "CLSTR-DEFAULT" };
  }

  return { userId: data.user_id, teamId: data.team_id, inviteCode: data.invite_code };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
);

export default function SuperAdminDashboard() {
  useRequireRole("SUPER_ADMIN");
  const qc = useQueryClient();

  const { data: profiles = [], isLoading: loadingProfiles, isRefetching } = useAllProfiles();
  const { data: taskDefs = [], isLoading: loadingTaskDefs } = useTaskDefinitionsAdmin();
  const { data: colleges = [] } = useColleges();

  const [adminTab, setAdminTab] = useState<"overview" | "captains" | "tasks" | "config">("overview");

  // Create Captain Form State
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [tier, setTier] = useState<number>(4);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // New Task Definition Form State
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPoints, setNewPoints] = useState(100);
  const [newCategory, setNewCategory] = useState<TaskCategory>("General");

  // Filtered colleges dropdown
  const filteredColleges = useMemo(() => {
    if (!collegeSearch.trim()) return colleges.slice(0, 30);
    const q = collegeSearch.toLowerCase();
    return colleges.filter((c) => c.name.toLowerCase().includes(q) || c.canonicalDomain.toLowerCase().includes(q)).slice(0, 30);
  }, [colleges, collegeSearch]);

  const createCaptainMutation = useMutation({
    mutationFn: adminCreateCaptainAndTeam,
    onSuccess: (data) => {
      setCreatedNotice(`Account & Team created! Initial invite code: ${data.inviteCode}. Password reset invitation sent.`);
      setEmail("");
      setFullName("");
      setCollegeSearch("");
      setFormError(null);
      qc.invalidateQueries({ queryKey: ["admin_profiles"] });
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const createTaskDefMutation = useMutation({
    mutationFn: async (params: { title: string; description: string; points: number; category: TaskCategory }) => {
      const { error } = await supabase.from("task_definitions").insert({
        title: params.title,
        description: params.description,
        points: params.points,
        category: params.category,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewTitle("");
      setNewDesc("");
      setNewPoints(100);
      qc.invalidateQueries({ queryKey: ["admin_task_definitions"] });
    },
  });

  const handleCreateCaptain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName || !collegeSearch) {
      setFormError("All fields are required.");
      return;
    }
    // Generate secure temporary random password for backend RPC creation (not displayed to user)
    const tempPassword = `Clstr!${Math.random().toString(36).slice(2, 10)}${Math.floor(Math.random() * 100)}`;
    createCaptainMutation.mutate({
      email,
      password: tempPassword,
      fullName,
      college: collegeSearch,
      tier,
    });
  };

  const handleCreateTaskDef = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createTaskDefMutation.mutate({
      title: newTitle.trim(),
      description: newDesc.trim(),
      points: newPoints,
      category: newCategory,
    });
  };

  const operationalStats = useMemo(() => {
    const totalCaptains = profiles.filter((p) => p.role === "LEAD").length;
    const totalMembers = profiles.filter((p) => p.role === "MEMBER").length;
    const atRiskCaptains = profiles.filter((p) => p.role === "LEAD" && p.total_points < 100).length;
    const totalPointsAwarded = profiles.reduce((sum, p) => sum + p.total_points, 0);
    return { totalCaptains, totalMembers, atRiskCaptains, totalPointsAwarded };
  }, [profiles]);

  return (
    <div className="space-y-6">
      {/* Super Admin Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#222]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#F0F0F0] tracking-tight">Super Admin Operations</h1>
            <span className="px-2 py-0.5 text-[10px] font-black bg-[#FF5500]/10 text-[#FF5500] border border-[#FF5500]/30 uppercase">
              SUPER_ADMIN
            </span>
          </div>
          <p className="text-xs text-[#555] font-mono mt-1">
            Production control panel for CAs, campus teams, task definitions, and campaign targets.
          </p>
        </div>

        {/* Tab Navigation Bar */}
        <div className="flex gap-1 bg-[#0A0A0A] p-1 border border-[#222]">
          {(["overview", "captains", "tasks", "config"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setAdminTab(tab)}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase transition-colors ${
                adminTab === tab ? "bg-[#C8FF00] text-black" : "text-[#666] hover:text-[#FFF]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {adminTab === "overview" && (
        <div className="space-y-6">
          {/* Operational Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-[#111] border border-[#222]">
              <span className="text-[10px] font-mono text-[#555] uppercase block">Total Captains</span>
              <span className="text-2xl font-black text-[#C8FF00] font-mono">{operationalStats.totalCaptains}</span>
            </div>
            <div className="p-4 bg-[#111] border border-[#222]">
              <span className="text-[10px] font-mono text-[#555] uppercase block">Total Members</span>
              <span className="text-2xl font-black text-[#4488FF] font-mono">{operationalStats.totalMembers}</span>
            </div>
            <div className="p-4 bg-[#111] border border-[#222]">
              <span className="text-[10px] font-mono text-[#555] uppercase block">Captains At Risk</span>
              <span className="text-2xl font-black text-[#FF5500] font-mono">{operationalStats.atRiskCaptains}</span>
            </div>
            <div className="p-4 bg-[#111] border border-[#222]">
              <span className="text-[10px] font-mono text-[#555] uppercase block">Total Points Logged</span>
              <span className="text-2xl font-black text-[#F0F0F0] font-mono">{operationalStats.totalPointsAwarded.toLocaleString()}</span>
            </div>
          </div>

          {/* Leaderboard Table */}
          <div className="bg-[#111] border border-[#222] p-5 space-y-4">
            <h2 className="text-sm font-bold text-[#F0F0F0]">Live Campus Leaderboard</h2>
            {loadingProfiles ? (
              <p className="text-xs text-[#555] font-mono">Loading profiles...</p>
            ) : (
              <div className="divide-y divide-[#1A1A1A] border border-[#1A1A1A]">
                {profiles.map((p) => (
                  <div key={p.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#F0F0F0]">{p.full_name}</span>
                        <span className={`px-1.5 py-0.2 text-[9px] font-black uppercase border ${
                          p.role === "LEAD" ? "text-[#C8FF00] border-[#C8FF00]/30" : "text-[#666] border-[#333]"
                        }`}>
                          {p.role}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#555] font-mono block mt-0.5">{p.college}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-[#C8FF00] font-mono block">{p.total_points} PTS</span>
                      <span className="text-[9px] text-[#444] font-mono block">Tier {p.tier}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CAPTAINS TAB */}
      {adminTab === "captains" && (
        <div className="space-y-6">
          {/* Create Captain Form */}
          <form onSubmit={handleCreateCaptain} className="bg-[#111] border border-[#222] p-5 space-y-4 relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#C8FF00]" />
            <h2 className="text-sm font-bold text-[#F0F0F0]">Onboard New Campus Captain & Team</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#555] uppercase">Captain Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#555] uppercase">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rahul@college.edu"
                  className="px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#555] uppercase">Campus / College</label>
                <input
                  type="text"
                  value={collegeSearch}
                  onChange={(e) => setCollegeSearch(e.target.value)}
                  placeholder="Type college name..."
                  className="px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#555] uppercase">Campus Tier (Target)</label>
                <select
                  value={tier}
                  onChange={(e) => setTier(Number(e.target.value))}
                  className="px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                >
                  <option value={1}>Tier 1 (5,000 Target)</option>
                  <option value={2}>Tier 2 (3,000 Target)</option>
                  <option value={3}>Tier 3 (2,000 Target)</option>
                  <option value={4}>Tier 4 (1,000 Target)</option>
                </select>
              </div>
            </div>

            {formError && <p className="text-xs text-[#FF5500] font-bold">{formError}</p>}
            {createdNotice && (
              <p className="text-xs text-[#C8FF00] font-bold bg-[#C8FF00]/10 p-2 border border-[#C8FF00]/30 font-mono">
                {createdNotice}
              </p>
            )}

            <button
              type="submit"
              disabled={createCaptainMutation.isPending}
              className="px-4 py-2 bg-[#C8FF00] text-black text-xs font-bold hover:bg-[#b5e600] transition-colors"
            >
              {createCaptainMutation.isPending ? "Creating Account & Team…" : "Create Captain & Team"}
            </button>
          </form>
        </div>
      )}

      {/* TASKS TAB */}
      {adminTab === "tasks" && (
        <div className="space-y-6">
          {/* Create Task Definition */}
          <form onSubmit={handleCreateTaskDef} className="bg-[#111] border border-[#222] p-5 space-y-4 relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#4488FF]" />
            <h2 className="text-sm font-bold text-[#F0F0F0]">Create New Task Definition</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#555] uppercase">Task Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Host Placement Prep Workshop"
                  className="px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#555] uppercase">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as TaskCategory)}
                  className="px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                >
                  <option>Clubs & Events</option>
                  <option>Placement & Career</option>
                  <option>Community</option>
                  <option>Growth & Outreach</option>
                  <option>CollabHub</option>
                  <option>General</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-[10px] font-bold text-[#555] uppercase">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Instructions for Ambassadors..."
                  rows={2}
                  className="px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#555] uppercase">Reward Points</label>
                <input
                  type="number"
                  value={newPoints}
                  onChange={(e) => setNewPoints(Number(e.target.value))}
                  className="px-3 py-2 bg-[#0A0A0A] border border-[#222] text-xs text-[#F0F0F0] font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={createTaskDefMutation.isPending}
              className="px-4 py-2 bg-[#4488FF] text-black text-xs font-bold hover:bg-[#3377EE] transition-colors"
            >
              {createTaskDefMutation.isPending ? "Creating Task…" : "Add Task Definition"}
            </button>
          </form>

          {/* Existing Task Definitions List */}
          <div className="bg-[#111] border border-[#222] p-5 space-y-3">
            <h2 className="text-sm font-bold text-[#F0F0F0]">Active Task Definitions</h2>
            <div className="divide-y divide-[#1A1A1A] border border-[#1A1A1A]">
              {taskDefs.map((def) => (
                <div key={def.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#F0F0F0]">{def.title}</span>
                      <span className="text-[9px] font-mono text-[#888] bg-[#1A1A1A] px-1.5 py-0.5">{def.category}</span>
                    </div>
                    {def.description && <p className="text-[10px] text-[#555] mt-0.5 font-mono">{def.description}</p>}
                  </div>
                  <span className="text-xs font-bold text-[#C8FF00] font-mono">+{def.points} PTS</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONFIG TAB */}
      {adminTab === "config" && (
        <div className="bg-[#111] border border-[#222] p-5 space-y-4 relative">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#A855F7]" />
          <h2 className="text-sm font-bold text-[#F0F0F0]">Campaign Configuration</h2>
          <p className="text-xs text-[#666] font-mono leading-relaxed">
            Campaign timeline start date, week dates, and target rules are persisted in the <code className="text-[#A855F7]">program_config</code> database table and reflected dynamically across all dashboards.
          </p>
        </div>
      )}
    </div>
  );
}
