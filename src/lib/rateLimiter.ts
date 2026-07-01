/**
 * Phase 1.3 — Rate Limiter (frontend simulation of backend middleware)
 *
 * Sliding-window rate limiter that tracks auth attempt timestamps per
 * identity key (email address). After `maxAttempts` within `windowMs`,
 * further attempts are blocked until the oldest attempt ages out.
 *
 * In a real deployment this logic lives in backend middleware (Redis-backed).
 * Here it lives in module-level state so it survives component re-mounts
 * but resets on full page reload — exactly matching the security posture
 * of a server-side in-memory store on a single-instance server.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

// Module-level map: identity → sorted list of attempt timestamps
const attemptLog = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the oldest blocking attempt ages out of the window */
  retryAfterSeconds: number;
  /** How many attempts remain before the next block */
  remainingAttempts: number;
}

/**
 * Record an attempt for the given identity and return the rate-limit decision.
 * Call this BEFORE executing the actual auth logic.
 */
export function checkRateLimit(identity: string): RateLimitResult {
  const now = Date.now();
  const key = identity.trim().toLowerCase();

  // Retrieve or initialise the attempt log
  const timestamps = (attemptLog.get(key) ?? [])
    // Purge timestamps older than the window
    .filter((ts) => now - ts < WINDOW_MS);

  if (timestamps.length >= MAX_ATTEMPTS) {
    // Oldest timestamp in the current window determines when we unblock
    const oldestTs = timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldestTs);
    attemptLog.set(key, timestamps);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      remainingAttempts: 0,
    };
  }

  // Record this attempt and persist
  timestamps.push(now);
  attemptLog.set(key, timestamps);

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: MAX_ATTEMPTS - timestamps.length,
  };
}

/**
 * Peek at the current rate-limit state without recording a new attempt.
 * Useful for rendering the cooldown UI before the user tries again.
 */
export function peekRateLimit(identity: string): RateLimitResult {
  const now = Date.now();
  const key = identity.trim().toLowerCase();

  const timestamps = (attemptLog.get(key) ?? []).filter(
    (ts) => now - ts < WINDOW_MS
  );

  if (timestamps.length >= MAX_ATTEMPTS) {
    const oldestTs = timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldestTs);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: MAX_ATTEMPTS - timestamps.length,
  };
}

/** Reset rate limit for an identity (used after successful auth). */
export function resetRateLimit(identity: string): void {
  attemptLog.delete(identity.trim().toLowerCase());
}
