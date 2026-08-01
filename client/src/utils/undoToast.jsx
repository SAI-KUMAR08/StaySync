import toast from "react-hot-toast";

/**
 * Bottom-right toast with an Undo button, used after an admin approves/rejects
 * a tenant request.
 *
 * - If the user hits Undo, `onUndo()` runs and the toast dismisses.
 * - If not, `onExpire()` runs 2 seconds after the toast auto-dismisses — the
 *   caller usually deletes the processed request there.
 *
 * Returns a `cancel()` function to clear the pending expire timer.
 */
export function showUndoToast({ message, duration = 8000, onUndo, onExpire }) {
  const timeout = setTimeout(() => {
    onExpire?.();
  }, duration + 2000);

  toast(
    (t) => (
      <div className="flex items-center gap-3">
        <span className="text-sm">{message}</span>
        <button
          type="button"
          onClick={() => {
            clearTimeout(timeout);
            toast.dismiss(t.id);
            onUndo?.();
          }}
          className="ml-1 px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold shrink-0"
        >
          Undo
        </button>
      </div>
    ),
    { duration }
  );

  return () => clearTimeout(timeout);
}
