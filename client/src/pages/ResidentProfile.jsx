import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  MdPerson, MdPhone, MdEmail, MdCalendarToday, MdMeetingRoom,
  MdHotel, MdBadge, MdCheckCircle, MdClose, MdArrowBack,
  MdPayment, MdHistory, MdCreditCard, MdHome, MdFingerprint, MdDescription,
  MdSwapHoriz, MdSecurity, MdVerifiedUser
} from "react-icons/md";
import ErrorRetry from "../components/ErrorRetry";

const DetailRow = ({ label, value, icon: Icon }) => (
  <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-b-0">
    <div className="flex items-center gap-2.5">
      {Icon && <Icon className="text-text-tertiary/50 text-base" />}
      <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">{label}</span>
    </div>
    <span className="text-sm font-semibold text-text-primary text-right max-w-[55%]">{value || "—"}</span>
  </div>
);

const StatusBadge = ({ active, temporary }) => {
  if (active === false) return <span className="badge bg-red-500/10 text-red-500 border-red-500/20">Inactive</span>;
  if (temporary) return <span className="badge-amber">Temporary</span>;
  return <span className="badge-emerald">Active</span>;
};

const ResidentProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [tenant, setTenant] = useState(null);
  const [payments, setPayments] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const [tenantRes, paymentsRes, historyRes] = await Promise.all([
        api.get(`/owner/tenants/${id}`),
        api.get(`/owner/payments?search=${id}`),
        api.get(`/owner/tenants/${id}/history`),
      ]);
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
      setPayments(Array.isArray(paymentsRes.data.data) ? paymentsRes.data.data : []);
      setHistory(Array.isArray(historyRes.data.data) ? historyRes.data.data : []);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to load resident profile");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="arch-card p-8">
        <div className="flex items-center gap-6">
          <div className="shimmer w-20 h-20 rounded-2xl" />
          <div className="space-y-3">
            <div className="shimmer h-6 w-48" />
            <div className="shimmer h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 mt-8">
          {[...Array(6)].map((_, i) => <div key={i} className="shimmer h-5 w-full" />)}
        </div>
      </div>
    </div>
  );

  if (error) return <ErrorRetry message={error} onRetry={fetchData} />;
  if (!tenant) return <ErrorRetry message="Resident not found" onRetry={fetchData} />;

  const totalPaid = payments
    .filter((p) => (p.paymentStatus || p.status) === "paid")
    .reduce((sum, p) => sum + (p.totalAmount || p.amount || 0), 0);
  const totalDue = payments
    .filter((p) => (p.paymentStatus || p.status) === "unpaid" || (p.paymentStatus || p.status) === "overdue")
    .reduce((sum, p) => sum + (p.totalAmount || p.amount || 0), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      {/* Back Button */}
      <Link to="/admin/tenants" className="inline-flex items-center gap-1.5 text-text-secondary/50 hover:text-primary text-xs font-bold uppercase tracking-wider transition-colors">
        <MdArrowBack size={16} /> Back to Residents
      </Link>

      {/* Profile Header */}
      <div className="arch-card p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className={`w-20 h-20 ${theme === "theme-2" ? "rounded-xl" : "rounded-2xl"} bg-primary/10 flex items-center justify-center text-3xl font-black text-primary`}>
            {tenant.name?.[0]?.toUpperCase() || "T"}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold font-display text-text-primary tracking-tight">{tenant.name}</h2>
              <StatusBadge active={tenant.isActive} temporary={tenant.isTemporary} />
            </div>
            <p className="text-text-secondary font-medium mt-1">
              {tenant.hostelId?.name || tenant.hostelName || "Hostel"} · Room {tenant.roomId?.roomNumber || "N/A"}
            </p>
            {tenant.isTemporary && tenant.preferredSharing && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-primary font-bold">
                <MdSwapHoriz size={14} />
                Waiting for {tenant.preferredSharing}-sharing room
              </div>
            )}
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
            <DetailRow label="Date Joined" value={tenant.joinDate ? new Date(tenant.joinDate).toLocaleDateString() : tenant.moveInDate ? new Date(tenant.moveInDate).toLocaleDateString() : "—"} icon={MdCalendarToday} />
          </div>
        </div>

        {/* Assignment Info */}
        <div className="arch-card p-6">
          <h3 className="text-sm font-bold font-display text-text-primary tracking-tight mb-4 flex items-center gap-2">
            <MdMeetingRoom className="text-primary" /> Assignment & Status
          </h3>
          <div className="space-y-0">
            <DetailRow label="Hostel" value={tenant.hostelId?.name || tenant.hostelName || "—"} icon={MdHome} />
            <DetailRow label="Room" value={tenant.roomId?.roomNumber || "—"} icon={MdMeetingRoom} />
            <DetailRow label="Bed" value={tenant.bedId?.bedNumber || "—"} icon={MdHotel} />
            <DetailRow label="Monthly Rent" value={tenant.monthlyRent ? `₹${tenant.monthlyRent.toLocaleString()}` : "—"} icon={MdCreditCard} />
            <DetailRow label="Status" value={tenant.isActive ? (tenant.isTemporary ? "Temporary" : "Permanent") : "Inactive"} icon={MdVerifiedUser} />
            <DetailRow label="Move Out" value={tenant.moveOutDate ? new Date(tenant.moveOutDate).toLocaleDateString() : "—"} icon={MdCalendarToday} />
          </div>
        </div>

        {/* Security Deposit */}
        <div className="arch-card p-6">
          <h3 className="text-sm font-bold font-display text-text-primary tracking-tight mb-4 flex items-center gap-2">
            <MdSecurity className="text-primary" /> Security Deposit
          </h3>
          <div className="space-y-0">
            <DetailRow label="Deposit Paid" value={tenant.isSecurityDepositPaid ? "Yes" : "No"} icon={MdCheckCircle} />
            {tenant.isSecurityDepositPaid && (
              <>
                <DetailRow label="Deposit Amount" value={tenant.securityDepositAmount ? `₹${tenant.securityDepositAmount.toLocaleString()}` : "—"} icon={MdCreditCard} />
                <DetailRow label="Deposit Date" value={tenant.securityDepositDate ? new Date(tenant.securityDepositDate).toLocaleDateString() : "—"} icon={MdCalendarToday} />
              </>
            )}
          </div>
        </div>

        {/* Documents */}
        <div className="arch-card p-6">
          <h3 className="text-sm font-bold font-display text-text-primary tracking-tight mb-4 flex items-center gap-2">
            <MdDescription className="text-primary" /> Documents
          </h3>
          <div className="space-y-3">
            {tenant.idProof ? (
              <div className="p-3 rounded-xl bg-surface border border-border/50">
                <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-2">ID Proof</p>
                <div className="relative">
                  <img src={tenant.idProof} alt="ID Proof" className="max-h-40 rounded-lg object-contain bg-white" />
                </div>
              </div>
            ) : (
              <p className="text-text-secondary/50 text-sm text-center py-4">No ID proof uploaded</p>
            )}
            {tenant.offlineBookingForm && (
              <div className="p-3 rounded-xl bg-surface border border-border/50">
                <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1">Offline Booking Form</p>
                <a href={tenant.offlineBookingForm} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary font-bold underline">View Document</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="arch-card p-5 text-center">
          <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1">Total Paid</p>
          <p className="text-2xl font-black text-emerald-600">₹{totalPaid.toLocaleString()}</p>
        </div>
        <div className="arch-card p-5 text-center">
          <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1">Total Due</p>
          <p className="text-2xl font-black text-red-500">₹{totalDue.toLocaleString()}</p>
        </div>
        <div className="arch-card p-5 text-center">
          <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1">Payments</p>
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
          <div className="py-12 text-center text-text-secondary/50 text-sm">No payment records.</div>
        ) : (
          <div className="divide-y divide-border/30">
            {payments.slice(0, 20).map((p) => (
              <div key={p._id} className="px-6 py-4 flex items-center justify-between hover:bg-surface/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    (p.paymentStatus || p.status) === "paid" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                  }`}>
                    {(p.paymentStatus || p.status) === "paid" ? <MdCheckCircle size={18} /> : <MdClose size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{p.paymentMonth || p.month} {p.year}</p>
                    <p className="text-[10px] text-text-secondary">Due: {new Date(p.dueDate).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-text-primary">₹{(p.totalAmount || p.amount || 0).toLocaleString()}</p>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${
                    (p.paymentStatus || p.status) === "paid" ? "text-emerald-500" : "text-amber-500"
                  }`}>
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
            <h3 className="text-sm font-bold font-display text-text-primary">Room Assignment History</h3>
          </div>
          <div className="divide-y divide-border/30">
            {history.slice(0, 15).map((h) => (
              <div key={h._id} className="px-6 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    h.action === "check_in" ? "bg-emerald-500/10 text-emerald-500" :
                    h.action === "bed_shift" ? "bg-primary-light text-primary" :
                    "bg-red-500/10 text-red-500"
                  }`}>{h.action.replace("_", " ")}</span>
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
  );
};

export default ResidentProfile;
