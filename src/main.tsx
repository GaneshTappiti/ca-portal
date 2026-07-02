import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./lib/i18n";
import "./index.css";
import { initSentry } from "./lib/sentry";

// Phase 6 — Initialize Sentry before render
initSentry();

// Phase 1 — React Query client
// staleTime: 0 means data is considered stale immediately after fetching,
// so Supabase Realtime + invalidateQueries drives freshness
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30s default; overridden per-query where needed
      retry: 2,                // retry twice on network failure
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
