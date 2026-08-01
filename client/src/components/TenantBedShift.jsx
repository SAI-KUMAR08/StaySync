import { useState, useEffect, useCallback } from "react";
import api from "../api/axios";
import toast from "react-hot-toast";
import { useSocket } from "../context/SocketContext";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import {
  MdSwapHoriz,
  MdCheckCircle,
  MdCancel,
  MdHourglassEmpty,
  MdMeetingRoom,
  MdDelete,
} from "react-icons/md";

const STATUS_ICONS = { pending: MdHourglassEmpty, approved: MdCheckCircle, rejected: MdCancel };
const STATUS_COLORS = {
  pending: "text-amber-600 bg-amber-50",
  approved: "text-emerald-600 bg-emerald-50",
  rejected: "text-red-600 bg-red-50",
};

const TenantBedShift = () => {
  const { socket } = useSocket();
  const [requests, setRequests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [requestedRoomId, setRequestedRoomId] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchRequests = useCallback(async (opts) => {
    try {
      const res = await api.get("/tenant/bed-shift-requests", opts);
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

  // Real-time: refresh when the admin approves/rejects the request.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchRequests();
    socket.on("bed_shift_request_updated", refresh);
    return () => {
      socket.off("bed_shift_request_updated", refresh);
    };
  }, [socket, fetchRequests]);

  // Socket-independent fallback (Vercel's serverless socket stub drops events):
  // refetch on tab visibility + poll while visible so an admin review shows up
  // without a manual reload.
  useAutoRefresh(fetchRequests);

  // Populate the room picker (available rooms in the hostel).
  useEffect(() => {
    api
      .get("/tenant/rooms")
      .then((res) => setRooms(res.data.data || []))
      .catch(() => setRooms([]));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!requestedRoomId) {
      setFormError("Please select the room you'd like to move to.");
      return;
    }
    if (!reason || reason.trim().length < 5) {
      setFormError("Please provide a reason (at least 5 characters).");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      await api.post("/tenant/bed-shift-requests", { requestedRoomId, reason: reason.trim() });
      toast.success("Room shift request submitted!");
      setShowForm(false);
      setRequestedRoomId("");
      setReason("");
      fetchRequests();
    } catch (err) {
      const msg = err.response?.data?.message;
      if (/pending bed shift/i.test(msg || "")) {
        setFormError("You already have a pending room shift request.");
      } else {
        toast.error(msg || "Failed to submit room shift request");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await api.delete(`/tenant/bed-shift-requests/${id}`);
      toast.success("Room shift request deleted");
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete request");
    } finally {
      setDeletingId(null);
    }
  };

  const hasPending = requests.some((r) => r.status === "pending");
  const currentRoomLabel = (r) =>
    (r.currentBedId?.bedNumber ? `Bed ${r.currentBedId.bedNumber}` : "Bed —") +
    (r.requestedRoomId?.roomNumber ? ` → Room ${r.requestedRoomId.roomNumber}` : "");

  return (
    <div className="arch-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center">
            <MdSwapHoriz className="text-primary" size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold font-display text-text-primary">
              Room Shift Request
            </h3>
            <p className="text-[10px] text-text-tertiary">Request to move to a different room</p>
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
              Target Room
            </label>
            <select
              className="field-input"
              value={requestedRoomId}
              onChange={(e) => {
                setRequestedRoomId(e.target.value);
                setFormError("");
              }}
              aria-invalid={!!formError}
            >
              <option value="">Select a room…</option>
              {rooms.map((room) => (
                <option key={room._id} value={room._id}>
                  Room {room.roomNumber} — Floor {room.floor} ({room.capacity}-sharing
                  {room.roomType === "AC" ? ", AC" : ""})
                </option>
              ))}
            </select>
            {rooms.length === 0 && (
              <p className="text-[10px] text-text-tertiary">
                No rooms available to list right now — try again shortly.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Reason
            </label>
            <textarea
              className="field-input min-h-[80px]"
              placeholder="Why do you want to shift rooms?"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setFormError("");
              }}
            />
          </div>
          {formError && (
            <p className="text-[10px] text-red-600 font-medium" role="alert">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
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
        <p className="text-sm text-text-tertiary/60 text-center py-6">No room shift requests yet</p>
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
                  <p className="text-[11px] text-text-tertiary mt-0.5 flex items-center gap-1">
                    <MdMeetingRoom size={12} /> {currentRoomLabel(r)}
                  </p>
                  {r.reason && (
                    <p className="text-[10px] text-text-tertiary/70 mt-0.5">{r.reason}</p>
                  )}
                  {r.ownerNote && (
                    <p className="text-[10px] text-text-tertiary/70 mt-0.5 italic">
                      Admin note: {r.ownerNote}
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

export default TenantBedShift;
