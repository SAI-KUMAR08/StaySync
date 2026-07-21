import React, { useEffect, useState, useCallback } from "react";
import api from "../../api/axios";
import {
  MdPayment, MdCheckCircle, MdError, MdSearch,
  MdAddCircleOutline, MdClose, MdAttachMoney,
  MdCalendarToday, MdThumbUp, MdThumbDown, MdHistory,
  MdAdd, MdPerson
} from "react-icons/md";
import toast from "react-hot-toast";
import ErrorRetry from "../../components/ErrorRetry";
import Button from "../../components/Button";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { getApiError } from "../../utils/getApiError";
import { usePaymentTotals } from "../../context/PaymentContext";
import { useDebounce } from "../../hooks/useDebounce";


const SummaryCard = ({ title, value, icon: Icon, color }) => {
  
  return (
    <div className={`arch-card p-5 flex items-center gap-4`}>
      <div className={`w-11 h-11 rounded-2xl ${color} flex items-center justify-center`}>
        <Icon className="text-xl text-white" />
      </div>
      <div>
        <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider leading-none mb-0.5">{title}</p>
        <p className="text-lg font-bold text-text-primary tracking-tight">{value}</p>
      </div>
    </div>
  );
};

const AdminPayments = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("");
  const [showFineModal, setShowFineModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [fineAmount, setFineAmount] = useState(0);
  const { socket } = useSocket();
  const { refreshTotals } = usePaymentTotals();

  // Payment Requests
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Add Payment
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [addPaymentForm, setAddPaymentForm] = useState({
    tenantId: "",
    amount: "",
    paymentMonth: new Date().toLocaleString("en-US", { month: "long" }),
    year: new Date().getFullYear(),
    dueDate: new Date().toISOString().split("T")[0],
    fineAmount: 0,
    notes: "",
  });
  

  const fetchPayments = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const res = await api.get(`/owner/payments?status=${statusFilter}&search=${debouncedSearch}`);
      const list = Array.isArray(res.data.data) ? res.data.data : [];
      setPayments(list.map((p) => ({ ...p, fine: p.fineAmount ?? 0 })));
    } catch (error) {
      console.error(error);
      setError(error.response?.data?.message || "Failed to load payments");
      toast.error("Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments, user?.hostelId]);

  useEffect(() => {
    if (socket) {
      socket.on("payment_completed", (data) => {
        toast.success(data.message);
        fetchPayments();
      });
      return () => socket.off("payment_completed");
    }
  }, [socket]);

  const handleStatusUpdate = async (id, status) => {
    try {
      await api.patch(`/owner/payments/${id}`, {
        status,
        ...(status === "paid" ? { paymentMethod: "cash" } : {}),
      });
      toast.success("Payment status updated");
      fetchPayments();
      refreshTotals();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const handleAddFine = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/owner/payments/${selectedPayment._id}`, { fineAmount: Number(fineAmount) });
      toast.success("Fine added successfully");
      setShowFineModal(false);
      fetchPayments();
      refreshTotals();
    } catch (error) {
      toast.error("Operation failed");
    }
  };

  const fetchPaymentRequests = async () => {
    try {
      setLoadingRequests(true);
      const res = await api.get("/owner/payment-requests");
      setPaymentRequests(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (error) {
      console.error("Failed to load payment requests:", error);
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchTenants = async () => {
    try {
      setLoadingTenants(true);
      const res = await api.get("/owner/tenants?status=active");
      const list = Array.isArray(res.data.data) ? res.data.data : [];
      setTenants(list);
    } catch (error) {
      console.error("Failed to load tenants:", error);
    } finally {
      setLoadingTenants(false);
    }
  };

  const handleCreatePayment = async (e) => {
    e.preventDefault();
    if (!addPaymentForm.tenantId || !addPaymentForm.amount) {
      return toast.error("Please select a tenant and enter amount");
    }
    try {
      await api.post("/owner/payments", {
        tenantId: addPaymentForm.tenantId,
        amount: Number(addPaymentForm.amount),
        fineAmount: Number(addPaymentForm.fineAmount || 0),
        paymentMonth: addPaymentForm.paymentMonth,
        year: Number(addPaymentForm.year),
        dueDate: addPaymentForm.dueDate,
        notes: addPaymentForm.notes,
      });
      toast.success("Payment created successfully");
      setShowAddPaymentModal(false);
      setAddPaymentForm({
        tenantId: "",
        amount: "",
        paymentMonth: new Date().toLocaleString("en-US", { month: "long" }),
        year: new Date().getFullYear(),
        dueDate: new Date().toISOString().split("T")[0],
        fineAmount: 0,
        notes: "",
      });
      fetchPayments();
      refreshTotals();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const handleReviewRequest = async (id, status) => {
    try {
      await api.patch(`/owner/payment-requests/${id}`, { status });
      toast.success(`Payment request ${status} successfully`);
      fetchPayments();
      refreshTotals();
      fetchPaymentRequests();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  useEffect(() => {
    fetchPaymentRequests();
  }, [user?.hostelId]);

  const now = new Date();
  const currentMonth = now.toLocaleString("en-US", { month: "long" });
  const currentYear = now.getFullYear();
  // Use totalAmount only — it already includes fineAmount from the DB.
  // Do NOT add fine/fineAmount on top (would double-count).
  const stats = {
    total: payments.reduce((acc, p) => {
      if (p.paymentStatus !== "paid" && p.status !== "paid") return acc;
      if ((p.paymentMonth || p.month) !== currentMonth || p.year !== currentYear) return acc;
      return acc + (p.totalAmount || p.amount);
    }, 0),
    pending: payments.filter((p) => (p.paymentStatus || p.status) === "unpaid").length,
    overdue: payments.filter((p) => (p.paymentStatus || p.status) === "overdue").length,
  };

  if (error && payments.length === 0) return <ErrorRetry message={error} onRetry={fetchPayments} />;
  if (loading && payments.length === 0) return (
    <div className="space-y-6" role="status" aria-label="Loading payments">
      {/* Summary skeletons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card card-md">
            <div className="skeleton w-9 h-9 rounded-lg mb-3" />
            <div className="skeleton h-3 w-20 mb-2" />
            <div className="skeleton h-7 w-28" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="card">
        <div className="px-5 py-4 border-b border-border-light">
          <div className="skeleton h-4 w-32" />
        </div>
        <div className="divide-y divide-border-light">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4">
              <div className="skeleton w-9 h-9 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-24" />
              </div>
              <div className="skeleton h-4 w-20" />
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-10 pb-20">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 animate-slide-up-big">
        <div>
          <div className="section-ornament-diamond mb-3">
            <MdPayment /> Collections
          </div>
          <h3 className="section-title">Financials</h3>
          <p className="section-sub">Operational billing and collection overview</p>
        </div>
        <div className="flex gap-3">
          <SummaryCard title="Collected (this month)" value={`₹${stats.total.toLocaleString()}`} icon={MdAttachMoney} color="bg-[#2E7D32]" />
          <SummaryCard title="Overdue bills" value={stats.overdue} icon={MdError} color="bg-primary" />
          <SummaryCard title="Unpaid (this month)" value={stats.pending} icon={MdAttachMoney} color="bg-[#8D6E2A]" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <MdSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-text-secondary/40 text-lg" />
          <input type="text" placeholder="Search by tenant name..."
            className="field pl-12"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {['all', 'paid', 'unpaid', 'overdue'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s === 'all' ? '' : s)}
              className={`px-6 py-3 rounded-2xl font-bold text-[9px] uppercase tracking-[0.12em] transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                (statusFilter === s || (s === 'all' && statusFilter === ''))
                  ? 'bg-text-primary text-white shadow-lg shadow-text-primary/20'
                  : 'bg-card text-text-secondary/60 border border-border/60 hover:border-border'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Payments Table */}
      <div className="arch-card overflow-hidden overflow-x-auto">
        <table className="heritage-table">
          <thead>
            <tr>
              <th>Resident</th>
              <th>Amount Details</th>
              <th>Due Date</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {payments?.map((p) => (
              <tr key={p._id} className="group">
                <td>
                  <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center font-black text-base`}>
                      {p.tenantId?.name?.[0]?.toUpperCase() || p.tenantId?.personalInfo?.name?.[0]?.toUpperCase() || 'T'}
                    </div>
                    <div>
                      <p className="font-bold text-text-primary">{p.tenantId?.name || p.tenantId?.personalInfo?.name || "Unknown Tenant"}</p>
                      <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider mt-0.5">Room {p.tenantId?.roomId?.roomNumber || 'N/A'}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="space-y-0.5">
                    <p className="font-bold text-text-primary text-base tracking-tight">₹{(p.totalAmount || p.amount + (p.fine || 0)).toLocaleString()}</p>
                    {p.fine > 0 && <p className="text-[9px] text-[#C62828] font-bold tracking-wider uppercase">+ ₹{p.fine} Fine</p>}
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-2 text-sm text-text-secondary font-semibold">
                    <MdCalendarToday className="text-text-secondary/40" size={14} />
                    {new Date(p.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${
                      (p.paymentStatus || p.status) === 'paid' ? 'badge-emerald' :
                      (p.paymentStatus || p.status) === 'overdue' ? 'badge-accent' : 'badge-amber'
                    }`}>
                      {p.paymentStatus || p.status}
                    </span>
                    {(p.paymentStatus || p.status) === "paid" && (
                      <span className="badge bg-surface text-text-secondary border-border/50">
                        {(p.paymentMethod || "upi").includes("cash") ? "Cash" : "UPI"}
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(p.paymentStatus || p.status) !== 'paid' && (
                      <>
                        <button onClick={() => handleStatusUpdate(p._id, "paid")}
                          className={`p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500 hover:text-white transition-all`}>
                          <MdCheckCircle size={18} />
                        </button>
                        <button onClick={() => { setSelectedPayment(p); setFineAmount(p.fine || 0); setShowFineModal(true); }}
                          className={`p-2.5 bg-primary-light text-primary rounded-xl hover:bg-primary-hover hover:text-white transition-all`}>
                          <MdAddCircleOutline size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(!payments || payments.length === 0) && (
              <tr>
                <td colSpan="5" className="px-6 py-28 text-center text-text-secondary/50">
                  <MdPayment className="text-5xl mx-auto mb-3 opacity-20" />
                  <p className="font-medium uppercase tracking-wider text-[9px]">No payment records found.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Requests Section */}
      <div className="space-y-5 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MdHistory className="text-xl text-primary" />
            <h3 className="text-base font-bold font-display text-text-primary tracking-tight">
              Payment Requests ({paymentRequests.filter((r) => r.status === "pending").length})
            </h3>
          </div>
          <Button
            onClick={() => { fetchTenants(); setShowAddPaymentModal(true); }}
            icon={MdAdd}
            variant="secondary"
            size="sm"
          >
            Add Payment
          </Button>
        </div>

        {loadingRequests ? (
          <div className="skeleton h-20 rounded-2xl" />
        ) : paymentRequests.filter((r) => r.status === "pending").length === 0 ? (
          <p className="text-text-secondary/50 text-sm py-4 text-center">No pending payment requests.</p>
        ) : (
          <div className="arch-card overflow-hidden">
            {paymentRequests.filter((r) => r.status === "pending").map((req) => (
              <div key={req._id} className="flex items-center justify-between p-5 border-b border-border/40 last:border-b-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-text-primary">
                      {req.tenantId?.personalInfo?.name || "Unknown"}
                    </span>
                    <span className="badge-amber text-[8px]">Pending</span>
                  </div>
                  <p className="text-[11px] text-text-secondary">
                    ₹{req.amount?.toLocaleString()} for {req.paymentMonth} {req.year}
                    {req.notes && <span className="ml-2 text-text-tertiary">— {req.notes}</span>}
                  </p>
                  {req.paymentProof && (
                    <a href={req.paymentProof} target="_blank" rel="noopener noreferrer"
                      className="text-[9px] text-primary font-bold underline">View Proof</a>
                  )}
                </div>
                <div className="flex gap-2 shrink-0 ml-4">
                  <button onClick={() => handleReviewRequest(req._id, "approved")}
                    className={`p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all`}
                    title="Approve">
                    <MdThumbUp size={16} />
                  </button>
                  <button onClick={() => handleReviewRequest(req._id, "rejected")}
                    className={`p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all`}
                    title="Reject">
                    <MdThumbDown size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fine Modal */}
      {showFineModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-sm border border-border/50">
            <div className="p-6 border-b border-border/60 flex justify-between items-center">
              <h4 className="text-lg font-bold font-display text-text-primary tracking-tight uppercase">Apply Fine</h4>
              <button onClick={() => setShowFineModal(false)} className="text-text-secondary/40 hover:text-accent transition-colors">
                <MdClose size={22} />
              </button>
            </div>
            <form onSubmit={handleAddFine} className="p-6 space-y-6">
              <div className="space-y-2 text-center">
                <label className="field-label">Fine Amount (₹)</label>
                <input type="number" required autoFocus min="0"
                  className={`w-full py-5 rounded-3xl border border-transparent bg-surface outline-none font-black text-3xl text-center text-[#C62828] focus:bg-card focus:border-rose-100 focus:ring-4 focus:ring-rose-50 transition-all tracking-tighter`}
                  value={fineAmount} onChange={(e) => setFineAmount(e.target.value)} />
              </div>
              <p className="text-[9px] text-text-secondary/60 text-center font-medium uppercase tracking-wider">
                Added to base rent of <span className="text-text-primary font-bold">₹{selectedPayment?.amount}</span>.
              </p>
              <Button type="submit" fullWidth size="xl">
                Apply Penalty
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
      {showAddPaymentModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-md">
            <div className="p-6 border-b border-border/60 flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold font-display text-text-primary tracking-tight">Add Manual Payment</h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">Create a payment record for a resident</p>
              </div>
              <button onClick={() => setShowAddPaymentModal(false)} className="text-text-secondary/40 hover:text-accent transition-colors">
                <MdClose size={22} />
              </button>
            </div>
            <form onSubmit={handleCreatePayment} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Resident</label>
                <select
                  className="field-select"
                  required
                  value={addPaymentForm.tenantId}
                  onChange={(e) => {
                    const t = tenants.find((t) => t._id === e.target.value);
                    setAddPaymentForm({
                      ...addPaymentForm,
                      tenantId: e.target.value,
                      amount: t?.monthlyRent || addPaymentForm.amount,
                    });
                  }}
                >
                  <option value="">Select a resident...</option>
                  {tenants.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name || t.personalInfo?.name} — ₹{t.monthlyRent}/mo
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Amount (₹)</label>
                  <input required type="number" min="1" className="field" placeholder="5000"
                    value={addPaymentForm.amount}
                    onChange={(e) => setAddPaymentForm({ ...addPaymentForm, amount: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Fine (₹)</label>
                  <input type="number" min="0" className="field" placeholder="0"
                    value={addPaymentForm.fineAmount}
                    onChange={(e) => setAddPaymentForm({ ...addPaymentForm, fineAmount: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Month</label>
                  <select className="field-select" value={addPaymentForm.paymentMonth}
                    onChange={(e) => setAddPaymentForm({ ...addPaymentForm, paymentMonth: e.target.value })}>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Year</label>
                  <input type="number" min="2020" max="2099" className="field"
                    value={addPaymentForm.year}
                    onChange={(e) => setAddPaymentForm({ ...addPaymentForm, year: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Due Date</label>
                <input type="date" required className="field" value={addPaymentForm.dueDate}
                  onChange={(e) => setAddPaymentForm({ ...addPaymentForm, dueDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Notes (optional)</label>
                <input type="text" className="field" placeholder="e.g. Manual entry for June rent"
                  value={addPaymentForm.notes}
                  onChange={(e) => setAddPaymentForm({ ...addPaymentForm, notes: e.target.value })} />
              </div>
              <Button type="submit" fullWidth size="xl">
                Create Payment Record
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;
