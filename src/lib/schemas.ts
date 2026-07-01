/**
 * Phase 1.5 — Input Validation via Zod
 *
 * These schemas define the exact shape every payload must satisfy.
 * They are applied:
 *   1. Client-side: on form submit for immediate inline error feedback
 *   2. Server-side equivalent: the same schema is checked in the store/API
 *      layer before any state mutation — rejecting with field-level errors
 *      if validation fails, without crashing or leaking internals.
 *
 * In a real deployment these schemas would be published as a shared package
 * imported by both the frontend and the backend route handlers.
 */

import { z } from "zod";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Enter a valid email address.")
    .max(254, "Email is too long."),
  password: z
    .string()
    .min(1, "Access key is required.")
    .min(6, "Access key must be at least 6 characters.")
    .max(128, "Access key is too long."),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Task submission ──────────────────────────────────────────────────────────

export const taskSubmissionSchema = z.object({
  taskId: z.string().min(1, "Task ID is required."),
  proofDataUrl: z
    .string()
    .min(1, "Proof file is required. Upload an image or video.")
    .refine(
      (v) => v.startsWith("data:image/") || v.startsWith("data:video/"),
      "Only image or video files are accepted."
    ),
  notes: z
    .string()
    .max(1000, "Notes must be 1000 characters or fewer.")
    .optional(),
});

export type TaskSubmissionInput = z.infer<typeof taskSubmissionSchema>;

// ─── Task review (LEAD approve/reject) ───────────────────────────────────────

export const taskReviewSchema = z.object({
  taskId: z.string().min(1),
  action: z.enum(["approve", "reject"] as const, {
    message: "Action must be approve or reject.",
  }),
  reason: z
    .string()
    .max(500, "Reason must be 500 characters or fewer.")
    .optional(),
});

export type TaskReviewInput = z.infer<typeof taskReviewSchema>;

// ─── Team invite ──────────────────────────────────────────────────────────────

export const inviteSchema = z.object({
  code: z
    .string()
    .min(6, "Invite code must be at least 6 characters.")
    .max(32, "Invite code is too long.")
    .regex(/^[A-Z0-9-]+$/, "Invite code must contain only letters, numbers, and hyphens."),
});

export type InviteInput = z.infer<typeof inviteSchema>;


// ─── Task creation (LEAD) ─────────────────────────────────────────────────────

export const taskCreateSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters.")
    .max(120, "Title must be 120 characters or fewer."),
  points: z
    .number()
    .int("Points must be a whole number.")
    .min(10, "Minimum 10 points.")
    .max(1000, "Maximum 1000 points."),
  category: z.enum(["Clubs & Events", "Placement & Career", "Community", "Growth & Outreach", "CollabHub", "General"] as const, {
    message: "Category must be one of the valid domains.",
  }),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

// ─── Utility: extract first error per field ───────────────────────────────────

export function parseErrors(
  result: { success: boolean; error?: z.ZodError }
): Record<string, string> {
  if (result.success || !result.error) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
