/**
 * sentry.ts — Error monitoring initialization
 *
 * Phase 6: Sentry captures unhandled errors and Supabase query failures
 * in production so you know when something silently breaks in the field.
 *
 * DSN is set via VITE_SENTRY_DSN env var. If blank, Sentry is disabled
 * (safe for local dev — no errors sent to Sentry during development).
 */

import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const env = import.meta.env.VITE_APP_ENV as string | undefined;

export function initSentry() {
  if (!dsn) {
    // Sentry not configured — skip. This is expected in local dev.
    return;
  }

  Sentry.init({
    dsn,
    environment: env ?? "development",
    // Only send events in production to avoid noise during development
    enabled: env === "production" || env === "staging",
    // Capture 10% of traces for performance monitoring
    tracesSampleRate: 0.1,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    beforeSend(event) {
      // Strip PII from breadcrumbs before sending
      if (event.user) {
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

/** Capture a Supabase error with additional context */
export function captureSupabaseError(
  error: unknown,
  context: Record<string, unknown>
): void {
  Sentry.withScope((scope) => {
    scope.setContext("supabase", context);
    scope.setTag("error_type", "supabase_query");
    Sentry.captureException(error);
  });
}

export { Sentry };
