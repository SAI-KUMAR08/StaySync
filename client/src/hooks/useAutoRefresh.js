import { useEffect, useCallback, useRef } from "react";

/**
 * Socket-independent fallback that keeps a view fresh without a manual reload.
 *
 * - Refetches when the browser tab becomes visible again (`visibilitychange`).
 * - Optionally polls every `interval` ms while the tab is visible.
 *
 * The refetch is invoked with `{ _skipCache: true }` (when `fresh` is true, the
 * default) so a poll/focus actually re-queries the server instead of re-serving
 * the axios SWR cache. Without the bypass, a stale cache entry (up to 5 min)
 * would keep the view stale forever: the SWR background refresh only re-warms
 * the cache, it does not re-render the component.
 *
 * A ref guards against overlapping fetches — if a refetch is already in flight,
 * a visibility/poll trigger is skipped, so the two triggers can never fire a
 * concurrent request storm.
 *
 * Existing socket listeners are unaffected; on Render/local the socket still
 * delivers instant updates and this hook is simply the Vercel-safe fallback.
 */
export function useAutoRefresh(refetch, { interval = 60000, fresh = true, enabled = true } = {}) {
  const refetchRef = useRef(refetch);
  const inFlightRef = useRef(false);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const refresh = useCallback(() => {
    if (!enabled || inFlightRef.current) return;
    inFlightRef.current = true;
    const opts = fresh ? { _skipCache: true } : undefined;
    Promise.resolve(refetchRef.current?.(opts))
      .catch(() => {}) // a background refresh failure must never crash the UI
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [enabled, fresh]);

  // Refetch when the tab regains visibility — catches changes that happened
  // while the tab was hidden and any events the serverless socket stub dropped.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refresh]);

  // Optional polling while the tab is visible (hidden tabs don't poll).
  useEffect(() => {
    if (!interval || interval <= 0) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, interval);
    return () => clearInterval(id);
  }, [interval, refresh]);
}
