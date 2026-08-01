import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { initErrorTracking } from "./utils/errorTracking.js";
import "./index.css";

// Capture uncaught errors / unhandled rejections (L-12).
initErrorTracking();

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element not found!");
  const root = createRoot(rootEl);
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
} catch (e) {
  // Render the fatal error as plain text (never innerHTML) so an error message
  // that embeds attacker-influenced text can't be parsed as HTML.
  const pre = document.createElement("pre");
  pre.style.cssText = "color:red;padding:40px;font-size:16px;white-space:pre-wrap";
  pre.textContent = String(e?.stack || e?.message || e || "Unknown error");
  document.body.textContent = "";
  document.body.appendChild(pre);
  console.error("Fatal render error:", e);
}
