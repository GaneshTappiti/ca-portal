/**
 * SuperAdminDashboard — Full lead management + live Supabase data
 *
 * Features:
 *   1. Live campus leaderboard from profiles table
 *   2. Create CA / Lead — create Supabase auth user + set role, tier, college
 *   3. Promote existing user to LEAD
 *   4. Adjust tier
 *   5. View live campus stats from admin_college_stats_v2 (secondary DB)
 */

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRequireRole } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Data hooks ───────────────────────────────────────────────────────────────

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
    staleTime: 30_000,
  });
}

async function adminCreateCA(params: {
  email: string;
  password: string;
  fullName: string;
  college: string;
  role: "MEMBER" | "LEAD";
  tier: number;
}) {
  // 1. Create auth user via Supabase Admin API (service role needed in prod;
  //    for now use signUp which triggers the handle_new_user trigger)
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: params.email.trim().toLowerCase(),
    password: params.password,
    options: {
      data: {
        full_name: params.fullName,
        college: params.college,
      },
    },
  });
  if (signUpError) throw new Error(signUpError.message);
  if (!signUpData.user) throw new Error("User creation failed");

  const userId = signUpData.user.id;

  // 2. Update the profile with role + tier (trigger creates it with MEMBER/tier 4)
  const caId = "CA-" + userId.replace(/-/g, "").toUpperCase().slice(0, 8);
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      role: params.role,
      tier: params.tier,
      college: params.college,
      full_name: params.fullName,
      team_id: params.role === "LEAD" ? caId : null,
    })
    .eq("id", userId);

  if (profileError) throw new Error(profileError.message);
  return { userId, caId };
}

async function adminUpdateProfile(params: {
  userId: string;
  role?: "MEMBER" | "LEAD" | "SUPER_ADMIN";
  tier?: number;
  college?: string;
}) {
  const updates: Record<string, unknown> = {};
  if (params.role !== undefined) updates.role = params.role;
  if (params.tier !== undefined) updates.tier = params.tier;
  if (params.college !== undefined) updates.college = params.college;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", params.userId);
  if (error) throw new Error(error.message);
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
);
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const CopyIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
);

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold text-[#555] uppercase tracking-[0.12em]">{children}</label>;
}

function Input({ id, value, onChange, placeholder, type = "text", disabled }: {
  id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#222] rounded-lg text-sm text-[#F0F0F0] placeholder-[#333] focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30 focus:border-[#C8FF00]/40 disabled:opacity-40 transition-all"
    />
  );
}

function Select({ id, value, onChange, children }: {
  id: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#222] rounded-lg text-sm text-[#F0F0F0] focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30 focus:border-[#C8FF00]/40 transition-all"
    >
      {children}
    </select>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider"
      style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
    >
      {label}
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-[#444] hover:text-[#C8FF00] transition-colors"
      title="Copy"
    >
      {copied
        ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
        : <CopyIcon />}
    </button>
  );
}

// ─── Create CA Modal ──────────────────────────────────────────────────────────

function CreateCAModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    fullName: "", email: "", password: "",
    college: "", role: "LEAD" as "MEMBER" | "LEAD", tier: "2",
  });
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ caId: string; email: string } | null>(null);

  const set = (key: keyof typeof form) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleCreate = async () => {
    if (!form.fullName || !form.email || !form.password || !form.college) {
      setError("All fields are required."); return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters."); return;
    }
    setError(null);
    setCreating(true);
    try {
      const res = await adminCreateCA({
        ...form, tier: parseInt(form.tier),
      });
      setResult({ caId: res.caId, email: form.email });
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Creation failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        className="relative w-full max-w-md bg-[#111] border border-[#222] rounded-2xl overflow-hidden shadow-2xl"
      >
        {/* Top accent */}
        <div className="h-[2px] w-full bg-[#C8FF00]" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#C8FF00]">Admin Action</p>
            <h2 className="text-base font-black text-[#F0F0F0]">Create New CA / Lead</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#444] hover:text-[#F0F0F0] hover:bg-white/5 transition-colors">
            <XIcon />
          </button>
        </div>

        {result ? (
          /* Success state */
          <div className="px-6 py-8 space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-[#C8FF00] rounded-full flex items-center justify-center mx-auto text-black text-xl font-black">✓</div>
              <p className="text-base font-bold text-[#F0F0F0]">CA Created Successfully</p>
              <p className="text-sm text-[#555]">Share these credentials with the CA:</p>
            </div>
            <div className="bg-[#0A0A0A] border border-[#222] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#555] uppercase tracking-wider font-bold">CA ID (Invite Code)</span>
                <div className="flex items-center gap-2">
                  <span className="font-black font-mono text-[#C8FF00] text-sm">{result.caId}</span>
                  <CopyBtn text={result.caId} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#555] uppercase tracking-wider font-bold">Email</span>
                <span className="text-sm text-[#F0F0F0] font-mono">{result.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#555] uppercase tracking-wider font-bold">Password</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#F0F0F0] font-mono">{form.password}</span>
                  <CopyBtn text={form.password} />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-[#444] text-center">⚠ Share the password securely. The CA should change it on first login.</p>
            <button onClick={onClose} className="w-full py-2.5 bg-[#C8FF00] text-black text-sm font-black rounded-lg hover:opacity-90 transition-opacity">
              Done
            </button>
          </div>
        ) : (
          /* Form */
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input id="ca-name" value={form.fullName} onChange={set("fullName")} placeholder="Ganesh Tappiti" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input id="ca-email" value={form.email} onChange={set("email")} placeholder="ca@college.edu" type="email" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input id="ca-pass" value={form.password} onChange={set("password")} placeholder="Min. 6 characters" type="password" />
            </div>

            <div className="space-y-1.5">
              <Label>Campus / College (canonical domain)</Label>
              <Input id="ca-college" value={form.college} onChange={set("college")} placeholder="e.g. raghuinstitute" />
              <p className="text-[9px] text-[#3A3A3A]">Must match canonical_domain in admin_college_stats_v2</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select id="ca-role" value={form.role} onChange={set("role")}>
                  <option value="LEAD">LEAD (Campus Captain)</option>
                  <option value="MEMBER">MEMBER (Team Member)</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Select id="ca-tier" value={form.tier} onChange={set("tier")}>
                  <option value="1">Tier 1 — 15k+ students</option>
                  <option value="2">Tier 2 — 8–15k students</option>
                  <option value="3">Tier 3 — 4–8k students</option>
                  <option value="4">Tier 4 — Under 4k students</option>
                </Select>
              </div>
            </div>

            {error && (
              <p className="text-[11px] text-[#FF5500] font-bold bg-[#FF5500]/10 px-3 py-2 rounded-lg border border-[#FF5500]/20">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 border border-[#222] rounded-lg text-sm font-semibold text-[#555] hover:text-[#F0F0F0] hover:border-[#444] transition-all">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 py-2.5 bg-[#C8FF00] text-black text-sm font-black rounded-lg hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {creating && (
                  <motion.span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full"
                    animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }} />
                )}
                {creating ? "Creating…" : "Create CA"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────

function EditProfileModal({ profile, onClose, onSuccess }: {
  profile: CAProfile; onClose: () => void; onSuccess: () => void;
}) {
  const [role, setRole] = useState(profile.role as string);
  const [tier, setTier] = useState(String(profile.tier));
  const [college, setCollege] = useState(profile.college);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await adminUpdateProfile({
        userId: profile.id,
        role: role as "MEMBER" | "LEAD" | "SUPER_ADMIN",
        tier: parseInt(tier),
        college,
      });
      onSuccess(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        className="relative w-full max-w-sm bg-[#111] border border-[#222] rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="h-[2px] w-full bg-[#4488FF]" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#4488FF]">Edit Profile</p>
            <h2 className="text-sm font-black text-[#F0F0F0]">{profile.full_name}</h2>
            <p className="text-[10px] font-mono text-[#C8FF00]">{profile.ca_id}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#444] hover:text-[#F0F0F0] hover:bg-white/5 transition-colors">
            <XIcon />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select id="edit-role" value={role} onChange={setRole}>
              <option value="MEMBER">MEMBER</option>
              <option value="LEAD">LEAD (Campus Captain)</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tier</Label>
            <Select id="edit-tier" value={tier} onChange={setTier}>
              <option value="1">Tier 1 — 15k+ students (target 5,000)</option>
              <option value="2">Tier 2 — 8–15k students (target 3,000)</option>
              <option value="3">Tier 3 — 4–8k students (target 2,000)</option>
              <option value="4">Tier 4 — Under 4k (target 1,000)</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Campus (canonical domain)</Label>
            <Input id="edit-college" value={college} onChange={setCollege} placeholder="raghuinstitute" />
          </div>
          {error && <p className="text-[11px] text-[#FF5500] font-bold">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-[#222] rounded-lg text-sm font-semibold text-[#555] hover:text-[#F0F0F0] transition-all">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-[#4488FF] text-white text-sm font-black rounded-lg hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving && (
                <motion.span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"
                  animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }} />
              )}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Role badge color ─────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  LEAD: "#C8FF00", MEMBER: "#4488FF", SUPER_ADMIN: "#A855F7",
};
const TIER_COLOR: Record<number, string> = {
  1: "#FF5500", 2: "#C8FF00", 3: "#4488FF", 4: "#555",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const user = useRequireRole("SUPER_ADMIN");
  const qc = useQueryClient();
  const { data: profiles = [], isLoading } = useAllProfiles();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<CAProfile | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "LEAD" | "MEMBER">("ALL");

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ["admin_profiles"] }), [qc]);

  const filtered = useMemo(() => {
    return profiles.filter(p => {
      const matchSearch = !search ||
        p.full_name.toLowerCase().includes(search.toLowerCase()) ||
        p.college.toLowerCase().includes(search.toLowerCase()) ||
        p.ca_id?.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === "ALL" || p.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [profiles, search, roleFilter]);

  const totals = useMemo(() => ({
    leads:   profiles.filter(p => p.role === "LEAD").length,
    members: profiles.filter(p => p.role === "MEMBER").length,
    points:  profiles.reduce((s, p) => s + (p.total_points ?? 0), 0),
  }), [profiles]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 border border-[#222] bg-[#111] rounded-2xl overflow-hidden">
        <div className="w-12 h-12 shrink-0 bg-[#C8FF00] flex items-center justify-center text-black font-black text-sm border-r border-[#222]">SA</div>
        <div className="px-4 py-3 flex-1 min-w-0">
          <p className="text-sm font-black text-[#F0F0F0]">Super Admin Panel</p>
          <p className="text-[10px] text-[#444] font-mono truncate">{user.name} · {user.email}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 mx-4 px-4 py-2 bg-[#C8FF00] text-black text-[11px] font-black rounded-lg hover:opacity-90 active:scale-[0.97] transition-all"
        >
          <PlusIcon /> Add CA / Lead
        </button>
      </div>

      {/* ── Summary stat strip ── */}
      <div className="grid grid-cols-3 border border-[#222] bg-[#111] rounded-2xl overflow-hidden divide-x divide-[#1A1A1A]">
        {[
          { label: "Campus Leads", value: totals.leads, color: "#C8FF00" },
          { label: "Team Members", value: totals.members, color: "#4488FF" },
          { label: "Total Points", value: totals.points.toLocaleString(), color: "#A855F7" },
        ].map(s => (
          <div key={s.label} className="px-5 py-4 flex flex-col gap-1">
            <span className="text-3xl font-black tabular-nums" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#555]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Profiles table ── */}
      <div className="border border-[#222] bg-[#111] rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-[#1A1A1A] flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#555] shrink-0">All CA Profiles</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, campus, CA ID…"
            className="flex-1 min-w-[160px] px-3 py-1.5 bg-[#0A0A0A] border border-[#222] rounded-lg text-xs text-[#F0F0F0] placeholder-[#333] focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30 transition-all"
          />
          <div className="flex rounded-lg border border-[#222] overflow-hidden shrink-0">
            {(["ALL", "LEAD", "MEMBER"] as const).map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase transition-colors ${
                  roleFilter === r ? "bg-[#C8FF00] text-black" : "text-[#555] hover:text-[#F0F0F0]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <motion.div className="w-5 h-5 border-2 border-[#C8FF00] border-t-transparent rounded-full"
                animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
              <span className="ml-3 text-xs text-[#444]">Loading profiles…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-[#3A3A3A]">No profiles found.</p>
              <button onClick={() => setShowCreate(true)} className="mt-3 text-xs text-[#C8FF00] underline underline-offset-2">
                Create the first CA →
              </button>
            </div>
          ) : (
            <table className="w-full" aria-label="CA profiles">
              <thead>
                <tr className="border-b border-[#1A1A1A]">
                  {["CA ID", "Name", "Campus", "Role", "Tier", "Points", ""].map(col => (
                    <th key={col} scope="col" className="py-2.5 px-4 text-left text-[9px] font-bold text-[#3A3A3A] uppercase tracking-wider whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#111]">
                <AnimatePresence initial={false}>
                  {filtered.map((p, i) => (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="hover:bg-white/[0.015] transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-[#C8FF00] font-black select-all">{p.ca_id ?? "—"}</span>
                          {p.ca_id && <CopyBtn text={p.ca_id} />}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-[#F0F0F0] font-semibold">{p.full_name || "—"}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-[#555] font-mono">{p.college || "—"}</span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge label={p.role} color={ROLE_COLOR[p.role] ?? "#555"} />
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-black tabular-nums" style={{ color: TIER_COLOR[p.tier] ?? "#555" }}>
                          T{p.tier}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm font-black tabular-nums text-[#C8FF00]">
                          {(p.total_points ?? 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => setEditTarget(p)}
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1.5 border border-[#222] rounded-lg text-[10px] font-bold text-[#555] hover:text-[#F0F0F0] hover:border-[#444] transition-all"
                        >
                          <EditIcon /> Edit
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="px-5 py-2.5 border-t border-[#1A1A1A]">
            <span className="text-[10px] text-[#3A3A3A]">{filtered.length} of {profiles.length} profiles</span>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showCreate && (
          <CreateCAModal
            onClose={() => setShowCreate(false)}
            onSuccess={refresh}
          />
        )}
        {editTarget && (
          <EditProfileModal
            profile={editTarget}
            onClose={() => setEditTarget(null)}
            onSuccess={refresh}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
