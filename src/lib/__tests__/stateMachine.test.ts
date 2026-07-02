/**
 * stateMachine.test.ts — Unit tests for the task state machine
 *
 * Run with: npx vitest run src/lib/__tests__/
 */

import { describe, it, expect } from "vitest";
import { applyTransition } from "../types";
import { WEEKLY_MILESTONES, WEEKLY_CUMULATIVE } from "../store";
import type { TaskStatus, TaskAction } from "../types";

describe("Task State Machine — applyTransition()", () => {
  // ── Valid transitions ────────────────────────────────────────────────────────

  it("open → submit → pending", () => {
    expect(applyTransition("open", "submit")).toBe("pending");
  });

  it("pending → approve → verified", () => {
    expect(applyTransition("pending", "approve")).toBe("verified");
  });

  it("pending → reject → rejected", () => {
    expect(applyTransition("pending", "reject")).toBe("rejected");
  });

  it("rejected → submit → pending (member can retry)", () => {
    expect(applyTransition("rejected", "submit")).toBe("pending");
  });

  // ── Invalid transitions throw ────────────────────────────────────────────────

  it("throws: cannot approve an open task", () => {
    expect(() => applyTransition("open", "approve")).toThrow();
  });

  it("throws: cannot reject an open task", () => {
    expect(() => applyTransition("open", "reject")).toThrow();
  });

  it("throws: cannot submit a pending task (already submitted)", () => {
    expect(() => applyTransition("pending", "submit")).toThrow();
  });

  it("throws: cannot approve a verified task (terminal state)", () => {
    expect(() => applyTransition("verified", "approve")).toThrow();
  });

  it("throws: cannot reject a verified task (terminal state)", () => {
    expect(() => applyTransition("verified", "reject")).toThrow();
  });

  it("throws: cannot submit a verified task", () => {
    expect(() => applyTransition("verified", "submit")).toThrow();
  });

  it("throws: cannot approve a rejected task directly", () => {
    expect(() => applyTransition("rejected", "approve")).toThrow();
  });

  it("throws: cannot reject an already-rejected task", () => {
    expect(() => applyTransition("rejected", "reject")).toThrow();
  });

  // ── Error message format ─────────────────────────────────────────────────────

  it("error message includes the action and status", () => {
    expect(() => applyTransition("open", "approve")).toThrow(
      /cannot 'approve' a task with status 'open'/
    );
  });

  // ── All valid status/action combos covered ────────────────────────────────────

  const validCombos: Array<[TaskStatus, TaskAction, TaskStatus]> = [
    ["open", "submit", "pending"],
    ["pending", "approve", "verified"],
    ["pending", "reject", "rejected"],
    ["rejected", "submit", "pending"],
  ];

  validCombos.forEach(([from, action, to]) => {
    it(`[table] ${from} → ${action} → ${to}`, () => {
      expect(applyTransition(from, action)).toBe(to);
    });
  });
});

// ── Milestone threshold logic ─────────────────────────────────────────────────

describe("Milestone progress thresholds", () => {

  it("M1 threshold is 10% of tier target", () => {
    const m1 = WEEKLY_MILESTONES.find((m: { label: string }) => m.label === "M1");
    expect(m1?.pctTarget).toBe(10);
  });

  it("M4 final milestone is 100%", () => {
    const m4 = WEEKLY_MILESTONES.find((m: { label: string }) => m.label === "M4");
    expect(m4?.pctTarget).toBe(100);
  });

  it("tier 1 has 13 weekly targets", () => {
    expect(WEEKLY_CUMULATIVE[1]).toHaveLength(13);
  });

  it("tier 1 final target is 5000", () => {
    expect(WEEKLY_CUMULATIVE[1][12]).toBe(5000);
  });

  it("weekly targets are monotonically increasing", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      const targets = WEEKLY_CUMULATIVE[tier];
      for (let i = 1; i < targets.length; i++) {
        expect(targets[i]).toBeGreaterThan(targets[i - 1]);
      }
    }
  });
});
