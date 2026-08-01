import { useEffect, useState, useCallback, useRef } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import toast from "react-hot-toast";
import {
  MdEdit,
  MdCheckCircle,
  MdCancel,
  MdHourglassEmpty,
  MdMeetingRoom,
  MdPhone,
  MdEmail,
  MdLocationOn,
  MdBadge,
  MdDelete,
  MdUploadFile,
  MdClose,
  MdPictureAsPdf,
  MdDescription,
  MdImage,
} from "react-icons/md";
import ErrorRetry from "../components/ErrorRetry";

const STATUS_ICONS = { pending: MdHourglassEmpty, approved: MdCheckCircle, rejected: MdCancel };
const STATUS_STYLES = {
  pending: "badge-amber",
  approved: "badge-emerald",
  rejected: "badge-accent",
};

const LABELS = {
  name: "Full Name",
  phone: "Mobile Number",
  email: "Email",
  address: "Address",
  emergencyContact: "Emergency Contact",
  aadhaarNumber: "Aadhaar Number",
};

const MAX_DOCS = 3;
const MAX_DOC_BYTES = 6 * 1024 * 1024; // 6 MB
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

function fileIcon(mime) {
  if (mime?.startsWith("image/")) return <MdImage size={22} className="text-blue-500" />;
  if (mime === "application/pdf") return <MdPictureAsPdf size={22} className="text-red-500" />;
  return <MdDescription size={22} className="text-indigo-500" />;
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const TenantProfileSettings = () => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Document upload state
  const [docs, setDocs] = useState([]); // [{ name, mime, preview, url }]
  const [docError, setDocError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const fetchData = useCallback(async (opts) => {
    setError(null);
    try {
      const [dashRes, reqRes] = await Promise.all([
        api.get("/tenant/dashboard", opts),
        api.get("/tenant/profile-requests", opts),
      ]);
      const t = dashRes.data.data?.tenant || null;
      setProfile(t);
      if (t) {
        setForm({
          name: t.personalInfo?.name || "",
          phone: t.personalInfo?.phone || "",
          email: t.personalInfo?.email || "",
          address: t.address || "",
          emergencyContact: t.emergencyContact || "",
          aadhaarNumber: t.aadhaarNumber || "",
        });
      }
      setRequests(reqRes.data.data || []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time: refresh status when an admin approves/rejects a request.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchData();
    socket.on("profile_request_updated", refresh);
    return () => {
      socket.off("profile_request_updated", refresh);
    };
  }, [socket, fetchData]);

  // Socket-independent fallback (Vercel's serverless socket stub drops events):
  // refetch on tab visibility + poll while visible so an admin review shows up
  // without a manual reload.
  useAutoRefresh(fetchData);

  const validate = () => {
    const errors = {};
    if (form.name && form.name.trim().length < 2)
      errors.name = "Name must be at least 2 characters";
    if (form.phone && !/^\d{10}$/.test(form.phone.trim()))
      errors.phone = "Mobile number must be exactly 10 digits";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errors.email = "Invalid email address";
    if (form.address && !form.address.trim()) errors.address = "Address is required";
    if (form.emergencyContact && !/^\d{10}$/.test(form.emergencyContact.trim()))
      errors.emergencyContact = "Emergency Contact must be exactly 10 digits";
    if (form.aadhaarNumber && !/^\d{12}$/.test(form.aadhaarNumber.trim()))
      errors.aadhaarNumber = "Aadhaar must be exactly 12 digits";
    if (form.phone && form.emergencyContact && form.phone.trim() === form.emergencyContact.trim()) {
      errors.emergencyContact = "Emergency Contact must be different from the Mobile Number";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Document handlers ────────────────────────────────────────
  const addFiles = useCallback(
    async (fileList) => {
      setDocError("");
      const incoming = Array.from(fileList);
      const remaining = MAX_DOCS - docs.length;
      if (remaining <= 0) {
        setDocError(`Maximum ${MAX_DOCS} documents allowed.`);
        return;
      }
      const toAdd = incoming.slice(0, remaining);
      if (incoming.length > remaining) {
        setDocError(`Only ${remaining} more document(s) can be added (max ${MAX_DOCS}).`);
      }
      const invalid = toAdd.filter((f) => !ACCEPTED_TYPES.includes(f.type));
      if (invalid.length) {
        setDocError("Only photos (JPG/PNG/WebP), PDFs, and DOCX files are accepted.");
        return;
      }
      const oversized = toAdd.filter((f) => f.size > MAX_DOC_BYTES);
      if (oversized.length) {
        setDocError(
          `Each file must be under 6 MB. Remove: ${oversized.map((f) => f.name).join(", ")}`
        );
        return;
      }
      try {
        const converted = await Promise.all(
          toAdd.map(async (f) => ({
            name: f.name,
            mime: f.type,
            preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
            url: await readAsDataURL(f),
          }))
        );
        setDocs((prev) => [...prev, ...converted]);
      } catch {
        setDocError("Failed to read one or more files. Please try again.");
      }
    },
    [docs.length]
  );

  const removeDoc = (idx) => {
    setDocs((prev) => {
      const next = [...prev];
      if (next[idx]?.preview) URL.revokeObjectURL(next[idx].preview);
      next.splice(idx, 1);
      return next;
    });
    setDocError("");
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => {
    setDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Send only the fields that actually changed — the server rejects no-op requests.
    const payload = {};
    for (const key of Object.keys(form)) {
      const next = (form[key] || "").trim();
      const cur =
        key === "name" || key === "phone" || key === "email"
          ? (profile.personalInfo?.[key] || "").trim()
          : (profile[key] || "").trim();
      if (next !== cur) payload[key] = next;
    }
    if (docs.length > 0) {
      payload.documents = docs.map(({ name, url }) => ({ name, url }));
    }
    if (Object.keys(payload).length === 0) {
      toast.error("No changes to submit — your profile already has these values.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/tenant/profile-request", payload);
      toast.success("Profile update submitted for admin approval!");
      setEditing(false);
      setDocs([]);
      setDocError("");
      fetchData();
    } catch (err) {
      const data = err.response?.data;
      const fieldMsg = data?.errors?.fieldErrors
        ? Object.values(data.errors.fieldErrors).flat().join(", ")
        : null;
      toast.error(fieldMsg || data?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await api.delete(`/tenant/profile-requests/${id}`);
      toast.success("Profile update request deleted");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete request");
    } finally {
      setDeletingId(null);
    }
  };

  if (error) return <ErrorRetry message={error} onRetry={fetchData} />;
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-5" role="status" aria-label="Loading profile">
        <div className="shimmer h-40 rounded-2xl" />
        <div className="shimmer h-64 rounded-2xl" />
      </div>
    );
  }

  const p = profile || {};
  const field = (k) => {
    if (k === "name" || k === "phone" || k === "email") return p.personalInfo?.[k] || "—";
    return p[k] || "—";
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      {/* Profile card */}
      <div className="arch-card p-7 md:p-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-xl">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold font-display text-text-primary">
                {p.personalInfo?.name}
              </h2>
              <p className="text-[10px] text-text-secondary font-medium uppercase tracking-wider mt-0.5">
                {p.isTemporary ? "Temporary tenant" : "Permanent tenant"} · Room{" "}
                {p.roomId?.roomNumber || "—"}
              </p>
            </div>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="btn btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
            >
              <MdEdit size={15} /> Edit Profile
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-[10px] text-text-secondary bg-surface border border-border/40 rounded-xl p-3">
              <MdBadge className="inline mr-1 text-primary" />
              Changes are <strong>not applied directly</strong> — they are sent to your hostel admin
              for review and applied only after approval.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(LABELS).map((key) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                    {LABELS[key]}
                  </label>
                  {key === "address" ? (
                    <textarea
                      className={`field ${fieldErrors[key] ? "!border-red-400" : ""}`}
                      rows={2}
                      placeholder={LABELS[key]}
                      value={form[key] || ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  ) : (
                    <input
                      className={`field ${fieldErrors[key] ? "!border-red-400" : ""}`}
                      placeholder={LABELS[key]}
                      value={form[key] || ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  )}
                  {fieldErrors[key] && (
                    <p className="text-[10px] text-red-600 font-medium ml-1" role="alert">
                      {fieldErrors[key]}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Upload Zone */}
            <div className="space-y-2">
              <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                Documents (Optional)
              </label>
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  id="doc-upload"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                <label htmlFor="doc-upload" className="cursor-pointer">
                  <MdUploadFile className="mx-auto text-text-tertiary mb-2" size={24} />
                  <p className="text-xs text-text-primary">Click or drag files here</p>
                  <p className="text-[9px] text-text-tertiary mt-1">
                    Max 6MB each. JPG, PNG, PDF, DOCX
                  </p>
                </label>
              </div>
              {docError && <p className="text-[10px] text-red-600 font-medium">{docError}</p>}
              <div className="flex flex-wrap gap-2">
                {docs.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-surface px-3 py-1 rounded-full border border-border"
                  >
                    {doc.preview && (
                      <img src={doc.preview} className="w-5 h-5 object-cover rounded" alt="" />
                    )}
                    <span className="text-[10px] truncate max-w-[100px]">{doc.name}</span>
                    <button
                      type="button"
                      onClick={() => removeDoc(idx)}
                      className="text-text-tertiary hover:text-red-500"
                    >
                      <MdClose size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary flex-1 py-3 text-sm"
              >
                {submitting
                  ? "Submitting…"
                  : `Submit for Approval${docs.length > 0 ? ` (${docs.length} doc${docs.length > 1 ? "s" : ""})` : ""}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDocs([]);
                  setDocError("");
                  setFieldErrors({});
                  fetchData();
                }}
                className="btn btn-ghost py-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: MdPhone, label: "Mobile Number", value: field("phone") },
              { icon: MdEmail, label: "Email", value: field("email") },
              { icon: MdPhone, label: "Emergency Contact", value: field("emergencyContact") },
              { icon: MdBadge, label: "Aadhaar Number", value: field("aadhaarNumber") },
              {
                icon: MdMeetingRoom,
                label: "Room / Bed",
                value: `Room ${p.roomId?.roomNumber || "—"} · Bed ${p.bedId?.bedNumber || "—"}`,
              },
              { icon: MdLocationOn, label: "Address", value: field("address") },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border/40"
              >
                <div className="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center shrink-0">
                  <Icon className="text-primary" size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-text-secondary/60">
                    {label}
                  </p>
                  <p className="text-sm font-medium text-text-primary truncate">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Change-request status */}
      <div className="arch-card p-7 md:p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <MdHourglassEmpty className="text-amber-600" size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold font-display text-text-primary">Update Requests</h3>
            <p className="text-[10px] text-text-tertiary">
              Status of your submitted profile changes
            </p>
          </div>
        </div>

        {requests.length === 0 ? (
          <p className="text-sm text-text-tertiary/60 text-center py-6">
            No profile update requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => {
              const Icon = STATUS_ICONS[r.status] || MdHourglassEmpty;
              const changedKeys = Object.keys(r.requestedChanges || {}).filter(
                (k) => r.requestedChanges[k] !== undefined && r.requestedChanges[k] !== null
              );
              return (
                <div
                  key={r._id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-white border border-border/40"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      r.status === "approved"
                        ? "bg-emerald-50 text-emerald-600"
                        : r.status === "rejected"
                          ? "bg-red-50 text-red-600"
                          : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-text-primary capitalize">
                        {r.status}
                      </p>
                      <span
                        className={`badge ${STATUS_STYLES[r.status] || "badge-amber"} !text-[7px]`}
                      >
                        {r.status}
                      </span>
                      <span className="text-[9px] text-text-tertiary/60">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {changedKeys.filter((k) => k !== "documents").length > 0 && (
                      <p className="text-[10px] text-text-tertiary mt-1">
                        Requested:{" "}
                        {changedKeys
                          .filter((k) => k !== "documents")
                          .map((k) => `${LABELS[k] || k} → ${r.requestedChanges[k]}`)
                          .join(", ")}
                      </p>
                    )}
                    {/* Document chips */}
                    {Array.isArray(r.requestedChanges?.documents) &&
                      r.requestedChanges.documents.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {r.requestedChanges.documents.map((doc, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-light text-primary text-[9px] font-medium border border-primary/20"
                            >
                              <MdUploadFile size={10} />
                              {doc.name}
                            </span>
                          ))}
                        </div>
                      )}
                    {r.status === "approved" && (
                      <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                        Approved {r.reviewDate ? new Date(r.reviewDate).toLocaleDateString() : ""} —
                        your profile was updated.
                      </p>
                    )}
                    {r.status === "rejected" && r.reviewNotes && (
                      <p className="text-[10px] text-red-600 mt-0.5 italic">
                        Rejected — {r.reviewNotes}
                      </p>
                    )}
                    {r.status === "pending" && (
                      <p className="text-[10px] text-amber-600 mt-0.5">Waiting for admin review.</p>
                    )}
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
    </div>
  );
};

export default TenantProfileSettings;
