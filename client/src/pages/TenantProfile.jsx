import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/axios";
import {
  MdPerson,
  MdPhone,
  MdEmail,
  MdCalendarToday,
  MdMeetingRoom,
  MdHotel,
  MdCheckCircle,
  MdClose,
  MdArrowBack,
  MdPayment,
  MdHistory,
  MdCreditCard,
  MdHome,
  MdFingerprint,
  MdDescription,
  MdSwapHoriz,
  MdSecurity,
  MdVerifiedUser,
} from "react-icons/md";
import ErrorRetry from "../components/ErrorRetry";
import Button from "../components/Button";
import toast from "react-hot-toast";
import { useSocket } from "../context/SocketContext";

const DetailRow = ({ label, value, icon: Icon }) => (
  <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-b-0">
    <div className="flex items-center gap-2.5">
      {Icon && <Icon className="text-text-tertiary/50 text-base" />}
      <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">
        {label}
      </span>
    </div>
    <span className="text-sm font-semibold text-text-primary text-right max-w-[55%]">
      {value || "—"}
    </span>
  </div>
);

const StatusBadge = ({ active, temporary }) => {
  if (active === false)
    return <span className="badge bg-red-500/10 text-red-500 border-red-500/20">Inactive</span>;
  if (temporary) return <span className="badge-amber">Temporary</span>;
  return <span className="badge-emerald">Active</span>;
};

/** Drag-and-drop / browse file upload stored as a base64 data URL. */
const DocumentUploadField = ({ label, value, onChange, inputId, accept = "image/*,.pdf" }) => (
  <div className="space-y-1.5">
    <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
      {label}
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
        const file = e.dataTransfer.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => onChange(reader.result);
          reader.readAsDataURL(file);
        }
      }}
      className={`border-2 border-dashed border-border/60 rounded-2xl p-4 text-center cursor-pointer hover:border-primary/40 transition-all bg-surface/30`}
      onClick={() => document.getElementById(inputId)?.click()}
    >
      {value ? (
        <div className="relative inline-block">
          {value.startsWith("data:image") ? (
            <img src={value} alt={label} className="max-h-24 mx-auto rounded-lg object-contain" />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
              <MdCheckCircle size={14} /> File attached
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="absolute -top-2 -right-2 w-6 h-6 bg-danger text-white rounded-full text-xs font-bold hover:scale-110 transition-all"
            title="Remove file"
          >
            ×
          </button>
        </div>
      ) : (
        <p className="text-xs text-text-secondary/60 font-medium">
          Click or drop to upload {label.toLowerCase()}
        </p>
      )}
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result);
            reader.readAsDataURL(file);
          }
        }}
      />
    </div>
  </div>
);

const TenantProfile = () => {
  const { id } = useParams();
  const [tenant, setTenant] = useState(null);
  const [payments, setPayments] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editDeposit, setEditDeposit] = useState(false);
  const [depositForm, setDepositForm] = useState({
    isPaid: false,
    amount: 0,
  });
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    email: "",
    emergencyContact: "",
    aadhaarNumber: "",
    monthlyRent: 0,
    idProof: "",
    offlineBookingForm: "",
  });
  const [saving, setSaving] = useState(false);
  const [paymentData, setPaymentData] = useState({ totalPaid: 0, totalDue: 0 });

  const fetchReqId = useRef(0);

  const fetchData = useCallback(async () => {
    const reqId = ++fetchReqId.current;
    setError(null);
    try {
      setLoading(true);
      const [tenantRes, paymentsRes, historyRes] = await Promise.all([
        api.get(`/owner/tenants/${id}`),
        api.get(`/owner/tenants/${id}/payments`),
        api.get(`/owner/tenants/${id}/history`),
      ]);
      if (reqId !== fetchReqId.current) return;
      const t = tenantRes.data.data;
      setTenant({
        ...t,
        name: t.name || t.personalInfo?.name || "",
        phone: t.phone || t.personalInfo?.phone || "",
        email: t.email || t.personalInfo?.email || "",
        idProof: t.idProof || "",
        aadhaarNumber: t.aadhaarNumber || "",
        offlineBookingForm: t.offlineBookingForm || "",
      });
      const pd = paymentsRes.data.data;
      setPayments(Array.isArray(pd.payments) ? pd.payments : []);
      setPaymentData({ totalPaid: pd.totalPaid || 0, totalDue: pd.totalDue || 0 });
      setHistory(Array.isArray(historyRes.data.data) ? historyRes.data.data : []);
    } catch (error) {
      if (reqId !== fetchReqId.current) return;
      setError(error.response?.data?.message || "Failed to load tenant profile");
    } finally {
      if (reqId === fetchReqId.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time: profile/document updates or vacate reviews for THIS tenant refresh
  // the view without needing to navigate away and back.
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onTenantUpdated = (data) => {
      if (!data || String(data._id) === String(id)) fetchData();
    };
    const onVacateUpdated = (data) => {
      if (!data || String(data.tenantId) === String(id)) fetchData();
    };
    // Profile request approved/rejected — the tenant's DB record was updated;
    // refetch so the displayed name/phone/email/etc. reflects the new values.
    const onProfileRequestUpdated = (data) => {
      if (!data || String(data.tenantId) === String(id)) fetchData();
    };
    socket.on("tenant_updated", onTenantUpdated);
    socket.on("vacate_request_updated", onVacateUpdated);
    socket.on("profile_request_updated", onProfileRequestUpdated);
    return () => {
      socket.off("tenant_updated", onTenantUpdated);
      socket.off("vacate_request_updated", onVacateUpdated);
      socket.off("profile_request_updated", onProfileRequestUpdated);
    };
  }, [socket, fetchData, id]);

  const handleSaveDeposit = async () => {
    try {
      // Deposit amount is fixed at ₹1,000 server-side; only the paid status is editable.
      await api.patch(`/owner/tenants/${id}`, {
        isSecurityDepositPaid: depositForm.isPaid,
        securityDepositDate: depositForm.isPaid ? new Date().toISOString() : null,
      });
      toast.success("Security deposit updated");
      setEditDeposit(false);
      fetchData();
    } catch {
      toast.error("Failed to update security deposit");
    }
  };

  if (loading)
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="arch-card p-8">
          <div className="flex items-center gap-6">
            <div className="skeleton w-20 h-20 rounded-2xl" />
            <div className="space-y-3">
              <div className="skeleton h-6 w-48" />
              <div className="skeleton h-4 w-32" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 mt-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton h-5 w-full" />
            ))}
          </div>
        </div>
      </div>
    );

  if (error) return <ErrorRetry message={error} onRetry={fetchData} />;
  if (!tenant) return <ErrorRetry message="Tenant not found" onRetry={fetchData} />;

  // Use API-computed totals for consistency with backend
  const totalPaid =
    paymentData.totalPaid ||
    payments
      .filter((p) => (p.paymentStatus || p.status) === "paid")
      .reduce((sum, p) => sum + (p.totalAmount || p.amount || 0), 0);
  const totalDue =
    paymentData.totalDue ||
    payments
      .filter(
        (p) =>
          (p.paymentStatus || p.status) === "unpaid" || (p.paymentStatus || p.status) === "overdue"
      )
      .reduce((sum, p) => sum + (p.totalAmount || p.amount || 0), 0);

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        {/* Back Button */}
        <Link
          to="/admin/tenants"
          className="inline-flex items-center gap-1.5 text-text-secondary/50 hover:text-primary text-xs font-bold uppercase tracking-wider transition-colors"
        >
          <MdArrowBack size={16} /> Back to Tenants
        </Link>

        {/* Profile Header */}
        <div className="arch-card p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div
              className={`w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl font-black text-primary`}
            >
              {tenant.name?.[0]?.toUpperCase() || "T"}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-bold font-display text-text-primary tracking-tight">
                  {tenant.name}
                </h2>
                <StatusBadge active={tenant.isActive} temporary={tenant.isTemporary} />
              </div>
              <p className="text-text-secondary font-medium mt-1">
                {tenant.hostelId?.name || tenant.hostelName || "Hostel"} · Room{" "}
                {tenant.roomId?.roomNumber || "N/A"}
              </p>
              {tenant.isTemporary && tenant.preferredSharing && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-primary font-bold">
                  <MdSwapHoriz size={14} />
                  Waiting for {tenant.preferredSharing}-sharing room
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <Button
                  onClick={() => {
                    setEditMode(true);
                    setEditForm({
                      name: tenant.name || "",
                      phone: tenant.phone || "",
                      email: tenant.email || "",
                      emergencyContact: tenant.emergencyContact || "",
                      aadhaarNumber: tenant.aadhaarNumber || "",
                      monthlyRent: tenant.monthlyRent || 0,
                      idProof: tenant.idProof || "",
                      offlineBookingForm: tenant.offlineBookingForm || "",
                    });
                  }}
                  size="sm"
                  icon={MdPerson}
                >
                  Edit Profile
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Info */}
          <div className="arch-card p-6">
            <h3 className="text-sm font-bold font-display text-text-primary tracking-tight mb-4 flex items-center gap-2">
              <MdPerson className="text-primary" /> Personal Information
            </h3>
            <div className="space-y-0">
              <DetailRow label="Full Name" value={tenant.name} icon={MdPerson} />
              <DetailRow label="Email" value={tenant.email} icon={MdEmail} />
              <DetailRow label="Phone" value={tenant.phone} icon={MdPhone} />
              <DetailRow label="Aadhaar Number" value={tenant.aadhaarNumber} icon={MdFingerprint} />
              <DetailRow label="Emergency Contact" value={tenant.emergencyContact} icon={MdPhone} />
              <DetailRow
                label="Date Joined"
                value={
                  tenant.joinDate
                    ? new Date(tenant.joinDate).toLocaleDateString()
                    : tenant.moveInDate
                      ? new Date(tenant.moveInDate).toLocaleDateString()
                      : "—"
                }
                icon={MdCalendarToday}
              />
            </div>
          </div>

          {/* Assignment Info */}
          <div className="arch-card p-6">
            <h3 className="text-sm font-bold font-display text-text-primary tracking-tight mb-4 flex items-center gap-2">
              <MdMeetingRoom className="text-primary" /> Assignment & Status
            </h3>
            <div className="space-y-0">
              <DetailRow
                label="Hostel"
                value={tenant.hostelId?.name || tenant.hostelName || "—"}
                icon={MdHome}
              />
              <DetailRow
                label="Room"
                value={tenant.roomId?.roomNumber || "—"}
                icon={MdMeetingRoom}
              />
              <DetailRow label="Bed" value={tenant.bedId?.bedNumber || "—"} icon={MdHotel} />
              <DetailRow
                label="Monthly Rent"
                value={tenant.monthlyRent ? `₹${tenant.monthlyRent.toLocaleString()}` : "—"}
                icon={MdCreditCard}
              />
              <DetailRow
                label="Status"
                value={
                  tenant.isActive ? (tenant.isTemporary ? "Temporary" : "Permanent") : "Inactive"
                }
                icon={MdVerifiedUser}
              />
              <DetailRow
                label="Move Out"
                value={tenant.moveOutDate ? new Date(tenant.moveOutDate).toLocaleDateString() : "—"}
                icon={MdCalendarToday}
              />
            </div>
          </div>

          {/* Security Deposit */}
          <div className="arch-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold font-display text-text-primary tracking-tight flex items-center gap-2">
                <MdSecurity className="text-primary" /> Security Deposit
              </h3>
              <button
                onClick={() => {
                  setEditDeposit(!editDeposit);
                  if (!editDeposit) {
                    setDepositForm({
                      isPaid: tenant.isSecurityDepositPaid || false,
                      amount: tenant.securityDepositAmount || 0,
                    });
                  }
                }}
                className="text-[9px] font-bold uppercase tracking-wider text-primary hover:text-primary-hover transition-colors"
              >
                {editDeposit ? "Cancel" : "Edit"}
              </button>
            </div>
            {editDeposit ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 cursor-pointer group">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={depositForm.isPaid}
                    aria-label="Deposit Paid"
                    onClick={() => setDepositForm({ ...depositForm, isPaid: !depositForm.isPaid })}
                    className={`relative w-10 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer ${
                      depositForm.isPaid ? "bg-primary shadow-sm shadow-primary/30" : "bg-white/10"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                        depositForm.isPaid ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span className="text-sm font-semibold text-text-primary">Deposit Paid</span>
                </div>
                <div className="pl-[52px]">
                  <p className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                    Deposit Amount
                  </p>
                  <p className="text-sm font-bold text-text-primary">₹1,000 (fixed)</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSaveDeposit} size="sm">
                    Save
                  </Button>
                  <Button onClick={() => setEditDeposit(false)} variant="secondary" size="sm">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-0">
                <DetailRow
                  label="Deposit Paid"
                  value={tenant.isSecurityDepositPaid ? "Yes" : "No"}
                  icon={MdCheckCircle}
                />
                {tenant.isSecurityDepositPaid && (
                  <>
                    <DetailRow
                      label="Deposit Amount"
                      value={
                        tenant.securityDepositAmount
                          ? `₹${tenant.securityDepositAmount.toLocaleString()}`
                          : "—"
                      }
                      icon={MdCreditCard}
                    />
                    <DetailRow
                      label="Deposit Date"
                      value={
                        tenant.securityDepositDate
                          ? new Date(tenant.securityDepositDate).toLocaleDateString()
                          : "—"
                      }
                      icon={MdCalendarToday}
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="arch-card p-6">
            <h3 className="text-sm font-bold font-display text-text-primary tracking-tight mb-4 flex items-center gap-2">
              <MdDescription className="text-primary" /> Documents
            </h3>
            {/* Missing document warning */}
            {(!tenant.aadhaarNumber || !tenant.idProof || !tenant.offlineBookingForm) && (
              <div className="mb-4 p-3 rounded-xl bg-danger-bg/30 border border-danger-border/30 flex items-start gap-3">
                <MdClose
                  className="text-danger text-lg shrink-0 mt-0.5"
                  style={{ transform: "rotate(45deg)" }}
                />
                <div>
                  <p className="text-[10px] font-bold text-danger uppercase tracking-wider">
                    Missing Documents
                  </p>
                  <ul className="text-[10px] text-danger/70 mt-1 space-y-0.5">
                    {!tenant.aadhaarNumber && <li>• Aadhaar Number not provided</li>}
                    {!tenant.idProof && <li>• ID Proof document not uploaded</li>}
                    {!tenant.offlineBookingForm && <li>• Registration Form not uploaded</li>}
                  </ul>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {tenant.idProof ? (
                <div className="p-3 rounded-xl bg-surface border border-border/50">
                  <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-2">
                    ID Proof
                  </p>
                  <div className="relative">
                    <img
                      src={tenant.idProof}
                      alt="ID Proof"
                      className="max-h-40 rounded-lg object-contain bg-white"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-text-secondary/50 text-sm text-center py-4">
                  No ID proof uploaded
                </p>
              )}
              {tenant.offlineBookingForm && (
                <div className="p-3 rounded-xl bg-surface border border-border/50">
                  <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1">
                    Offline Booking Form
                  </p>
                  <a
                    href={tenant.offlineBookingForm}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary font-bold underline"
                  >
                    View Document
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="arch-card p-5 text-center">
            <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1">
              Total Paid
            </p>
            <p className="text-2xl font-black text-emerald-600">₹{totalPaid.toLocaleString()}</p>
          </div>
          <div className="arch-card p-5 text-center">
            <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1">
              Total Due
            </p>
            <p className="text-2xl font-black text-red-500">₹{totalDue.toLocaleString()}</p>
          </div>
          <div className="arch-card p-5 text-center">
            <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1">
              Payments
            </p>
            <p className="text-2xl font-black text-text-primary">{payments.length}</p>
          </div>
        </div>

        {/* Payment History */}
        <div className="arch-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/40 flex items-center gap-2">
            <MdPayment className="text-primary" />
            <h3 className="text-sm font-bold font-display text-text-primary">Payment History</h3>
          </div>
          {payments.length === 0 ? (
            <div className="py-12 text-center text-text-secondary/50 text-sm">
              No payment records.
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {payments.slice(0, 20).map((p) => (
                <div
                  key={p._id}
                  className="px-6 py-4 flex items-center justify-between hover:bg-surface/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        (p.paymentStatus || p.status) === "paid"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-amber-500/10 text-amber-500"
                      }`}
                    >
                      {(p.paymentStatus || p.status) === "paid" ? (
                        <MdCheckCircle size={18} />
                      ) : (
                        <MdClose size={18} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {p.paymentMonth || p.month} {p.year}
                      </p>
                      <p className="text-[10px] text-text-secondary">
                        Due:{" "}
                        {p.dueDate && !isNaN(new Date(p.dueDate).getTime())
                          ? new Date(p.dueDate).toLocaleDateString()
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-text-primary">
                      ₹{(p.totalAmount || p.amount || 0).toLocaleString()}
                    </p>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider ${
                        (p.paymentStatus || p.status) === "paid"
                          ? "text-emerald-500"
                          : "text-amber-500"
                      }`}
                    >
                      {p.paymentStatus || p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assignment History */}
        {history.length > 0 && (
          <div className="arch-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border/40 flex items-center gap-2">
              <MdHistory className="text-primary" />
              <h3 className="text-sm font-bold font-display text-text-primary">
                Room Assignment History
              </h3>
            </div>
            <div className="divide-y divide-border/30">
              {history.slice(0, 15).map((h) => (
                <div key={h._id} className="px-6 py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        h.action === "check_in"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : h.action === "bed_shift"
                            ? "bg-primary-light text-primary"
                            : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {h.action.replace("_", " ")}
                    </span>
                    <span className="text-text-secondary font-medium">
                      Room {h.roomId?.roomNumber || "—"} · Bed {h.bedId?.bedNumber || "—"}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-tertiary">
                    {new Date(h.date).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      {editMode && (
        <div className="modal-overlay">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await api.patch(`/owner/tenants/${id}`, {
                  name: editForm.name,
                  phone: editForm.phone,
                  email: editForm.email,
                  emergencyContact: editForm.emergencyContact,
                  aadhaarNumber: editForm.aadhaarNumber,
                  monthlyRent: editForm.monthlyRent,
                  ...(editForm.idProof !== undefined ? { idProof: editForm.idProof } : {}),
                  ...(editForm.offlineBookingForm !== undefined
                    ? { offlineBookingForm: editForm.offlineBookingForm }
                    : {}),
                });
                toast.success("Profile updated");
                setEditMode(false);
                fetchData();
              } catch (error) {
                toast.error(error.response?.data?.message || "Failed to update profile");
              } finally {
                setSaving(false);
              }
            }}
            className="modal-card max-w-lg p-6 md:p-7 space-y-5"
          >
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold font-display text-text-primary tracking-tight">
                  Edit Profile
                </h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">
                  Update tenant information
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-accent hover:bg-accent-soft transition-all"
              >
                <MdClose size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Full Name
                </label>
                <input
                  required
                  type="text"
                  className="field"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Phone
                </label>
                <input
                  required
                  type="tel"
                  className="field"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Email
                </label>
                <input
                  type="email"
                  className="field"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Emergency Contact
                </label>
                <input
                  type="text"
                  className="field"
                  value={editForm.emergencyContact}
                  onChange={(e) => setEditForm({ ...editForm, emergencyContact: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Aadhaar Number
                </label>
                <input
                  type="text"
                  className="field"
                  value={editForm.aadhaarNumber}
                  onChange={(e) => setEditForm({ ...editForm, aadhaarNumber: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Monthly Rent (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  className="field"
                  value={editForm.monthlyRent}
                  onChange={(e) =>
                    setEditForm({ ...editForm, monthlyRent: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <div className="pt-1 border-t border-border/40 space-y-4">
              <DocumentUploadField
                label="ID Proof Document"
                value={editForm.idProof}
                onChange={(v) => setEditForm({ ...editForm, idProof: v })}
                inputId="tenantProfileIdProofInput"
              />
              <DocumentUploadField
                label="Registration Form Document"
                value={editForm.offlineBookingForm}
                onChange={(v) => setEditForm({ ...editForm, offlineBookingForm: v })}
                inputId="tenantProfileRegFormInput"
              />
            </div>

            <Button type="submit" fullWidth disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </div>
      )}
    </>
  );
};

export default TenantProfile;
