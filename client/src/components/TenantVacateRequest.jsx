import { useState, useEffect, useCallback } from "react";
import api from "../api/axios";
import toast from "react-hot-toast";
import { useSocket } from "../context/SocketContext";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { MdMeetingRoom, MdCheckCircle, MdCancel, MdHourglassEmpty, MdDelete } from "react-icons/md";

// Minimum advance notice (days) before the intended vacating date. Must match
// server/src/utils/constants.js TENANT.VACATE_MIN_NOTICE_DAYS.
const MIN_NOTICE_DAYS = 15;

const STATUS_ICONS = {
  pending: MdHourglassEmpty,
  approved: MdCheckCircle,
  rejected: MdCancel,
  completed: MdCheckCircle,
};
const STATUS_COLORS = {
  pending: "text-amber-600 bg-amber-50",
  approved: "text-emerald-600 bg-emerald-50",
  rejected: "text-red-600 bg-red-50",
  completed: "text-sky-600 bg-sky-50",
};

/** Whole-day difference between two dates (rounded down). */
function dayDiff(from, to) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

const TenantVacateRequest = () => {
  const { socket } = useSocket();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [vacateDate, setVacateDate] = useState("");
  const [reason, setReason] = useState("");
  const [vacateError, setVacateError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchRequests = useCallback(async (opts) => {
    try {
      const res = await api.get("/tenant/vacate-requests", opts);
      setRequests(res.data.data || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Re-fetch when the admin approves/rejects so the status updates in real time.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchRequests();
    socket.on("vacate_request_updated", refresh);
    return () => {
      socket.off("vacate_request_updated", refresh);
    };
  }, [socket, fetchRequests]);

  // Socket-independent fallback (Vercel's serverless socket stub drops events):
  // refetch on tab visibility + poll while visible so an admin review shows up
  // without a manual reload.
  useAutoRefresh(fetchRequests);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Inline validation: the request must be at least 15 days before the date.
    const diff = vacateDate ? dayDiff(new Date(), new Date(vacateDate)) : 0;
    if (diff < MIN_NOTICE_DAYS) {
      setVacateError(
        `The request must be submitted at least ${MIN_NOTICE_DAYS} days before the desired vacating date. Please choose a date at least ${MIN_NOTICE_DAYS} days from today.`
      );
      return;
    }
    setVacateError("");
    setSubmitting(true);
    try {
      await api.post("/tenant/vacate-request", { requestedVacateDate: vacateDate, reason });
      toast.success("Vacate request submitted!");
      setShowForm(false);
      setVacateDate("");
      setReason("");
      fetchRequests();
    } catch (err) {
      const msg = err.response?.data?.message;
      if (msg && /15 days/i.test(msg)) {
        setVacateError(
          "The request must be submitted at least 15 days before the desired vacating date."
        );
      } else {
        toast.error(msg || "Failed to submit vacate request");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await api.delete(`/tenant/vacate-requests/${id}`);
      toast.success("Vacate request deleted");
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete request");
    } finally {
      setDeletingId(null);
    }
  };

  const minDate = new Date(Date.now() + MIN_NOTICE_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const hasPending = requests.some((r) => r.status === "pending");

  return (
    <div className="arch-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <MdMeetingRoom className="text-amber-600" size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold font-display text-text-primary">Vacate Request</h3>
            <p className="text-[10px] text-text-tertiary">Submit a request to vacate your room</p>
          </div>
        </div>
        {!hasPending && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary text-xs py-2 px-4">
            New Request
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 p-4 bg-gray-50 rounded-xl border border-border/40 space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Intended Vacate Date
            </label>
            <input
              required
              type="date"
              className="field-input"
              value={vacateDate}
              min={minDate}
              onChange={(e) => {
                setVacateDate(e.target.value);
                setVacateError("");
              }}
              aria-invalid={!!vacateError}
            />
            <p className="text-[9px] text-text-tertiary">Must be at least 15 days from today</p>
            {vacateError && (
              <p className="text-[10px] text-red-600 font-medium mt-1" role="alert">
                {vacateError}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Reason (optional)
            </label>
            <textarea
              className="field-input min-h-[80px]"
              placeholder="Tell us why you're leaving..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !vacateDate}
              className="btn btn-primary flex-1 py-2.5 text-xs"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn btn-ghost py-2.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="shimmer h-20 rounded-xl" />
      ) : requests.length === 0 ? (
        <p className="text-sm text-text-tertiary/60 text-center py-6">No vacate requests yet</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const Icon = STATUS_ICONS[r.status] || MdHourglassEmpty;
            const color = STATUS_COLORS[r.status] || "text-gray-600 bg-gray-50";
            return (
              <div
                key={r._id}
                className="flex items-start gap-3 p-3 rounded-xl bg-white border border-border/40"
              >
                <div
                  className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0`}
                >
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary capitalize">{r.status}</p>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${color}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    Vacate date: {new Date(r.requestedVacateDate).toLocaleDateString()}
                  </p>
                  {r.status === "approved" && r.approvedVacateDate && (
                    <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                      Approved — vacating can be completed on or after{" "}
                      {new Date(r.approvedVacateDate).toLocaleDateString()}
                    </p>
                  )}
                  {r.reason && (
                    <p className="text-[10px] text-text-tertiary/70 mt-0.5">{r.reason}</p>
                  )}
                  {r.reviewNotes && (
                    <p className="text-[10px] text-text-tertiary/70 mt-0.5 italic">
                      Admin note: {r.reviewNotes}
                    </p>
                  )}
                  <p className="text-[9px] text-text-tertiary/50 mt-1">
                    Submitted: {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {r.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => handleDelete(r._id)}
                    disabled={deletingId === r._id}
                    title="Delete this request"
                    aria-label="Delete this request"
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 disabled:opacity-40 transition-all"
                  >
                    <MdDelete size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TenantVacateRequest;
