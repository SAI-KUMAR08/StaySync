import { useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import toast from "react-hot-toast";
import { useSocket } from "../context/SocketContext";
import { showUndoToast } from "../utils/undoToast";
import { MdPerson, MdCheckCircle, MdCancel, MdHourglassEmpty, MdDescription } from "react-icons/md";

const STATUS_ICONS = { pending: MdHourglassEmpty, approved: MdCheckCircle, rejected: MdCancel };
const STATUS_COLORS = {
  pending: "text-amber-600 bg-amber-50",
  approved: "text-emerald-600 bg-emerald-50",
  rejected: "text-red-600 bg-red-50",
};

const FIELD_LABELS = {
  name: "Full Name",
  phone: "Mobile Number",
  email: "Email",
  address: "Address",
  emergencyContact: "Emergency Contact",
  aadhaarNumber: "Aadhaar Number",
};

const AdminProfileRequests = () => {
  const { socket } = useSocket();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing, setReviewing] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/owner/profile-requests${filter ? `?status=${filter}` : ""}`);
      setRequests(res.data.data || []);
    } catch {
      toast.error("Failed to load profile requests");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchRequests();
    socket.on("profile_request_created", refresh);
    socket.on("profile_request_updated", refresh);
    return () => {
      socket.off("profile_request_created", refresh);
      socket.off("profile_request_updated", refresh);
    };
  }, [socket, fetchRequests]);

  const handleReview = async (id, status) => {
    try {
      await api.patch(`/owner/profile-requests/${id}`, { status, reviewNotes });
      setReviewing(null);
      setReviewNotes("");
      fetchRequests();
      showUndoToast({
        message:
          status === "approved"
            ? "Profile update approved and applied"
            : "Profile update request rejected",
        onUndo: async () => {
          try {
            await api.patch(`/owner/profile-requests/${id}/undo`);
            toast.success("Undone — request is pending again, profile restored");
          } catch (err) {
            toast.error(err.response?.data?.message || "Undo failed");
          } finally {
            fetchRequests();
          }
        },
        // The processed request is auto-cleaned once the undo window passes.
        onExpire: async () => {
          try {
            await api.delete(`/owner/profile-requests/${id}`);
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

  // Fields actually requested (a key present with a non-null value).
  const requestedFields = (r) =>
    Object.keys(FIELD_LABELS).filter(
      (k) => r.requestedChanges?.[k] !== undefined && r.requestedChanges[k] !== null
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center">
            <MdPerson className="text-primary" size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold font-display text-text-primary">
              Profile Update Requests
            </h3>
            <p className="text-[10px] text-text-tertiary">
              Approve or reject tenant profile changes
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
            <div key={i} className="shimmer h-32 rounded-xl" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12">
          <MdDescription className="text-4xl mx-auto mb-3 text-text-tertiary/20" />
          <p className="text-sm font-medium text-text-tertiary/60">
            No profile update requests found
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const Icon = STATUS_ICONS[r.status] || MdHourglassEmpty;
            const color = STATUS_COLORS[r.status] || "text-gray-600 bg-gray-50";
            const keys = requestedFields(r);
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
                        Submitted {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Current vs requested diff */}
                    <div className="mt-3 rounded-xl bg-surface border border-border/40 overflow-hidden">
                      <table className="w-full text-left">
                        <tbody>
                          {keys.length === 0 && (
                            <tr>
                              <td className="p-3 text-[10px] text-text-tertiary">
                                No field changes recorded
                              </td>
                            </tr>
                          )}
                          {keys.map((k) => (
                            <tr key={k} className="border-t border-border/40 first:border-t-0">
                              <td className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-text-secondary/60 w-28">
                                {FIELD_LABELS[k]}
                              </td>
                              <td className="px-3 py-2 text-[11px] text-text-tertiary line-through decoration-red-400/60">
                                {r.currentSnapshot?.[k] || "—"}
                              </td>
                              <td className="px-3 py-2 text-[11px] font-semibold text-emerald-700">
                                → {r.requestedChanges[k]}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {r.reviewNotes && (
                      <p className="text-[10px] text-text-tertiary/70 mt-2 italic">
                        Note: {r.reviewNotes}
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
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
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
                          setReviewNotes("");
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

export default AdminProfileRequests;
