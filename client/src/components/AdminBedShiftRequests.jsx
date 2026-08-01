import { useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import toast from "react-hot-toast";
import { useSocket } from "../context/SocketContext";
import { showUndoToast } from "../utils/undoToast";
import {
  MdSwapHoriz,
  MdCheckCircle,
  MdCancel,
  MdHourglassEmpty,
  MdDescription,
} from "react-icons/md";

const STATUS_ICONS = { pending: MdHourglassEmpty, approved: MdCheckCircle, rejected: MdCancel };
const STATUS_COLORS = {
  pending: "text-amber-600 bg-amber-50",
  approved: "text-emerald-600 bg-emerald-50",
  rejected: "text-red-600 bg-red-50",
};

const AdminBedShiftRequests = () => {
  const { socket } = useSocket();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [ownerNote, setOwnerNote] = useState("");
  const [reviewing, setReviewing] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/owner/bed-shift-requests${filter ? `?status=${filter}` : ""}`);
      setRequests(res.data.data || []);
    } catch {
      toast.error("Failed to load room shift requests");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-time: a new tenant request or a review from another tab appears instantly.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchRequests();
    socket.on("bed_shift_request_updated", refresh);
    return () => {
      socket.off("bed_shift_request_updated", refresh);
    };
  }, [socket, fetchRequests]);

  const handleReview = async (id, status) => {
    try {
      await api.patch(`/owner/bed-shift-requests/${id}`, { status, ownerNote });
      setReviewing(null);
      setOwnerNote("");
      fetchRequests();
      showUndoToast({
        message: `Room shift request ${status}`,
        onUndo: async () => {
          try {
            await api.patch(`/owner/bed-shift-requests/${id}/undo`);
            toast.success("Undone — request is pending again");
          } catch (err) {
            toast.error(err.response?.data?.message || "Undo failed");
          } finally {
            fetchRequests();
          }
        },
        // The processed request is auto-cleaned once the undo window passes.
        onExpire: async () => {
          try {
            await api.delete(`/owner/bed-shift-requests/${id}`);
          } catch {
            /* already gone */
          }
          fetchRequests();
        },
      });
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${status} request`);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center">
            <MdSwapHoriz className="text-primary" size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold font-display text-text-primary">
              Room Shift Requests
            </h3>
            <p className="text-[10px] text-text-tertiary">
              Review and manage tenant room-shift requests
            </p>
          </div>
        </div>
        <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-border/40">
          {["pending", "approved", "rejected", ""].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                filter === s
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="shimmer h-24 rounded-xl" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12">
          <MdDescription className="text-4xl mx-auto mb-3 text-text-tertiary/20" />
          <p className="text-sm font-medium text-text-tertiary/60">No room shift requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const Icon = STATUS_ICONS[r.status] || MdHourglassEmpty;
            const color = STATUS_COLORS[r.status] || "text-gray-600 bg-gray-50";
            return (
              <div key={r._id} className="arch-card p-5">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0`}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-text-primary">
                        {r.tenantId?.personalInfo?.name || "Unknown"}
                      </p>
                      <span
                        className={`text-[9px] font-semibold px-2 py-0.5 rounded-full capitalize ${color}`}
                      >
                        {r.status}
                      </span>
                      <span className="text-[9px] text-text-tertiary/60">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      {r.currentBedId?.bedNumber
                        ? `Current bed: ${r.currentBedId.bedNumber}`
                        : "Current bed: —"}
                      {" → "}
                      {r.requestedRoomId?.roomNumber
                        ? `Room ${r.requestedRoomId.roomNumber}${r.requestedRoomId.floor ? ` (Floor ${r.requestedRoomId.floor})` : ""}`
                        : "Room —"}
                    </p>
                    {r.reason && (
                      <p className="text-[10px] text-text-tertiary/70 mt-1">{r.reason}</p>
                    )}
                    {r.ownerNote && (
                      <p className="text-[10px] text-text-tertiary/70 mt-1 italic">
                        Note: {r.ownerNote}
                      </p>
                    )}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleReview(r._id, "approved")}
                        className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs font-bold transition-all"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewing(reviewing === r._id ? null : r._id)}
                        className="px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
                {reviewing === r._id && (
                  <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
                    <textarea
                      className="field-input min-h-[60px]"
                      placeholder="Reason for rejection..."
                      value={ownerNote}
                      onChange={(e) => setOwnerNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(r._id, "rejected")}
                        className="btn bg-red-500 text-white py-2 text-xs flex-1"
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => {
                          setReviewing(null);
                          setOwnerNote("");
                        }}
                        className="btn btn-ghost py-2 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminBedShiftRequests;
