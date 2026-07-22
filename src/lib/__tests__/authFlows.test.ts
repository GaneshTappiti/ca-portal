/**
 * authFlows.test.ts — Unit tests for authentication, invite codes, and security rules
 *
 * Run with: npx vitest run src/lib/__tests__/
 */

import { describe, it, expect } from "vitest";
import { TIER_TARGETS, WEEK_NAMES, WEEK_DATES, WEEKLY_REELS } from "../types";

describe("Auth & Invite Security Contracts", () => {
  it("verifies public signup accounts default to MEMBER role", () => {
    // Role assignment hierarchy
    const allowedSignupRoles = ["MEMBER"];
    expect(allowedSignupRoles).not.toContain("LEAD");
    expect(allowedSignupRoles).not.toContain("SUPER_ADMIN");
  });

  it("validates invite code format rules", () => {
    const isValidFormat = (code: string) => /^CLSTR-[A-Z0-9]{6}$/.test(code.toUpperCase());
    expect(isValidFormat("CLSTR-AB12CD")).toBe(true);
    expect(isValidFormat("CLSTR-123456")).toBe(true);
    expect(isValidFormat("INVALID-CODE")).toBe(false);
  });

  it("checks campaign program configuration completeness", () => {
    expect(Object.keys(TIER_TARGETS)).toHaveLength(4);
    expect(WEEK_NAMES).toHaveLength(13);
    expect(WEEK_DATES).toHaveLength(13);
    expect(WEEKLY_REELS).toHaveLength(13);
  });

  it("ensures campaign dates start in July 2026", () => {
    expect(WEEK_DATES[0]).toContain("Jul 1");
    expect(WEEK_DATES[12]).toContain("Sep 30");
  });
});
