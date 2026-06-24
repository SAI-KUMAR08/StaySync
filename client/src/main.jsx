import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";

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
  document.body.innerHTML = `<pre style="color:red;padding:40px;font-size:16px;white-space:pre-wrap">${e.stack || e.message}</pre>`;
  console.error("Fatal render error:", e);
}
