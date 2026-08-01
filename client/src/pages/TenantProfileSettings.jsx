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
  MdPictureAsPdf,
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

const MAX_DOC_BYTES = 6 * 1024 * 1024; // 6 MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

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

  // Document upload state — two separate single-file fields
  const [idProofFile, setIdProofFile] = useState(""); // base64 data URL
  const [offlineFormFile, setOfflineFormFile] = useState(""); // base64 data URL
  const [docError, setDocError] = useState("");
  const idProofInputRef = useRef(null);
  const offlineFormInputRef = useRef(null);

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

  const handleFileChange = async (file, setter) => {
    if (!file) return;
    setDocError("");
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setDocError("Only photos (JPG/PNG/WebP) and PDFs are accepted.");
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      setDocError("File must be under 6 MB.");
      return;
    }
    try {
      const dataUrl = await readAsDataURL(file);
      setter(dataUrl);
    } catch {
      setDocError("Failed to read file. Please try again.");
    }
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
    if (idProofFile) payload.idProof = idProofFile;
    if (offlineFormFile) payload.offlineBookingForm = offlineFormFile;
    if (Object.keys(payload).length === 0) {
      toast.error("No changes to submit — your profile already has these values.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/tenant/profile-request", payload);
      toast.success("Profile update submitted for admin approval!");
      setEditing(false);
      setIdProofFile("");
      setOfflineFormFile("");
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

            {/* Document Upload — two dedicated single-file fields */}
            <div className="space-y-4">
              <p className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                Documents (Optional)
              </p>

              {/* ID Proof */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  ID Proof (Aadhaar / PAN / Voter ID)
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("border-primary");
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("border-primary");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("border-primary");
                    handleFileChange(e.dataTransfer.files[0], setIdProofFile);
                  }}
                  className="border-2 border-dashed border-border/60 rounded-2xl p-5 text-center cursor-pointer hover:border-primary/40 transition-all bg-surface/30"
                  onClick={() => idProofInputRef.current?.click()}
                >
                  {idProofFile ? (
                    <div className="relative inline-block">
                      {idProofFile.startsWith("data:image") ? (
                        <img
                          src={idProofFile}
                          alt="ID Proof"
                          className="max-h-24 mx-auto rounded-lg object-contain"
                        />
                      ) : (
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary bg-primary/10 px-4 py-2 rounded-xl">
                          <MdPictureAsPdf size={16} /> File attached
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIdProofFile("");
                        }}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-danger text-white rounded-full text-xs font-bold hover:scale-110 transition-all"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <>
                      <MdUploadFile className="mx-auto text-text-tertiary mb-2" size={22} />
                      <p className="text-xs text-text-secondary/70">
                        Click or drag to upload ID proof
                      </p>
                      <p className="text-[9px] text-text-tertiary mt-1">
                        JPG, PNG or PDF · Max 6 MB
                      </p>
                    </>
                  )}
                  <input
                    ref={idProofInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      handleFileChange(e.target.files?.[0], setIdProofFile);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              {/* Offline Application Form */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Offline Application Form (Soft Copy)
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("border-primary");
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("border-primary");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("border-primary");
                    handleFileChange(e.dataTransfer.files[0], setOfflineFormFile);
                  }}
                  className="border-2 border-dashed border-border/60 rounded-2xl p-5 text-center cursor-pointer hover:border-primary/40 transition-all bg-surface/30"
                  onClick={() => offlineFormInputRef.current?.click()}
                >
                  {offlineFormFile ? (
                    <div className="relative inline-block">
                      {offlineFormFile.startsWith("data:image") ? (
                        <img
                          src={offlineFormFile}
                          alt="Application Form"
                          className="max-h-24 mx-auto rounded-lg object-contain"
                        />
                      ) : (
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary bg-primary/10 px-4 py-2 rounded-xl">
                          <MdPictureAsPdf size={16} /> File attached
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOfflineFormFile("");
                        }}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-danger text-white rounded-full text-xs font-bold hover:scale-110 transition-all"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <>
                      <MdUploadFile className="mx-auto text-text-tertiary mb-2" size={22} />
                      <p className="text-xs text-text-secondary/70">Click or drag to upload form</p>
                      <p className="text-[9px] text-text-tertiary mt-1">
                        JPG, PNG or PDF · Max 6 MB
                      </p>
                    </>
                  )}
                  <input
                    ref={offlineFormInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      handleFileChange(e.target.files?.[0], setOfflineFormFile);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              {docError && <p className="text-[10px] text-red-600 font-medium">{docError}</p>}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary flex-1 py-3 text-sm"
              >
                {submitting
                  ? "Submitting…"
                  : `Submit for Approval${idProofFile || offlineFormFile ? " (with documents)" : ""}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setIdProofFile("");
                  setOfflineFormFile("");
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
