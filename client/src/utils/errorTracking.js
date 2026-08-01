/**
 * Lightweight frontend error tracking.
 *
 * Captures uncaught errors / unhandled promise rejections and, when
 * `VITE_ERROR_TRACKING_URL` is configured, forwards them to that endpoint
 * (fire-and-forget). Without a tracking URL it still logs structured errors to
 * the console so the integration point exists and works out of the box.
 */

const trackingUrl = import.meta.env?.VITE_ERROR_TRACKING_URL || "";

// Never ship raw error text (which routinely embeds tenant PII like names,
// phones, room numbers, or bearer tokens) to a third-party tracking endpoint.
const REDACT_RE =
  /\b(Bearer\s+)?[A-Za-z0-9\-._~+/]+=?\.[A-Za-z0-9\-._~+/]+=?\.[A-Za-z0-9\-._~+/]+=?\b|([+]?\d{10,12})/g;
const MAX_PAYLOAD_CHARS = 4096;

function redact(text) {
  return String(text || "").replace(REDACT_RE, (m, _bearer, _phone) =>
    m.length >= 20 ? "[REDACTED-TOKEN]" : "[REDACTED-PHONE]"
  );
}

function sendError(payload) {
  if (!trackingUrl) return;
  try {
    fetch(trackingUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* never let tracking break the app */
  }
}

/** Report an error (used by ErrorBoundary and explicit catches). */
export function captureError(error, context = {}) {
  const entry = {
    ts: new Date().toISOString(),
    url: window.location?.href || "",
    message: redact(error?.message || String(error)),
    stack: (redact(error?.stack || null) || "").slice(0, MAX_PAYLOAD_CHARS) || null,
    context,
  };
  console.error("[error-tracking]", JSON.stringify(entry));
  sendError(entry);
}

export function initErrorTracking() {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    captureError(event.error || new Error(event.message || "Uncaught error"), {
      source: "window.onerror",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    captureError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)), {
      source: "unhandledrejection",
    });
  });

  if (trackingUrl) {
    console.info("[error-tracking] Enabled — sending to", trackingUrl);
  }
}
