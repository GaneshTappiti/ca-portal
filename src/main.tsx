import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./lib/i18n"; // Phase 7.6 — initialise i18n before render
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
