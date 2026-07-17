import React, { useEffect, useState } from "react";
import api from "../../api/axios";
import {
  MdPayment, MdCheckCircle, MdError, MdSearch,
  MdAddCircleOutline, MdClose, MdAttachMoney,
  MdCalendarToday
} from "react-icons/md";
import toast from "react-hot-toast";
import ErrorRetry from "../../components/ErrorRetry";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { getApiError } from "../../utils/getApiError";
import { useDebounce } from "../../hooks/useDebounce";

const SummaryCard = ({ title, value, icon: Icon, color }) => (
  <div className="arch-card p-5 flex items-center gap-4">
    <div className={`w-11 h-11 rounded-2xl ${color} flex items-center justify-center`}>
      <Icon className="text-xl text-white" />
    </div>
    <div>
      <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider leading-none mb-0.5">{title}</p>
      <p className="text-lg font-bold text-text-primary tracking-tight">{value}</p>
    </div>
  </div>
);

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

  const fetchPayments = async () => {
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
  };

  useEffect(() => {
    fetchPayments();
  }, [statusFilter, debouncedSearch, user?.hostelId]);

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
    } catch (error) {
      toast.error("Operation failed");
    }
  };

  const now = new Date();
  const currentMonth = now.toLocaleString("en-US", { month: "long" });
  const currentYear = now.getFullYear();
  const stats = {
    total: payments.reduce((acc, p) => {
      if (p.paymentStatus !== "paid" && p.status !== "paid") return acc;
      if ((p.paymentMonth || p.month) !== currentMonth || p.year !== currentYear) return acc;
      return acc + (p.totalAmount || p.amount) + (p.fine || 0);
    }, 0),
    pending: payments.filter((p) => (p.paymentStatus || p.status) === "unpaid").length,
    overdue: payments.filter((p) => (p.paymentStatus || p.status) === "overdue").length,
  };

  if (error && payments.length === 0) return <ErrorRetry message={error} onRetry={fetchPayments} />;
  if (loading && payments.length === 0) return (
    <div className="flex items-center justify-center h-64 text-text-secondary/40 font-bold animate-pulse uppercase tracking-wider text-xs">
      Loading Financials...
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
            className="field-input pl-12"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {['all', 'paid', 'unpaid', 'overdue'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s === 'all' ? '' : s)}
              className={`px-6 py-3 rounded-2xl font-bold text-[9px] uppercase tracking-[0.12em] transition-all ${
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
                    <div className="w-10 h-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center font-black text-base">
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
                          className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500 hover:text-white transition-all">
                          <MdCheckCircle size={18} />
                        </button>
                        <button onClick={() => { setSelectedPayment(p); setFineAmount(p.fine || 0); setShowFineModal(true); }}
                          className="p-2.5 bg-primary-light text-primary rounded-xl hover:bg-primary-hover hover:text-white transition-all">
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
                <label className="form-label">Fine Amount (₹)</label>
                <input type="number" required autoFocus min="0"
                  className="w-full py-5 rounded-3xl border border-transparent bg-surface outline-none font-black text-3xl text-center text-[#C62828] focus:bg-card focus:border-rose-100 focus:ring-4 focus:ring-rose-50 transition-all tracking-tighter"
                  value={fineAmount} onChange={(e) => setFineAmount(e.target.value)} />
              </div>
              <p className="text-[9px] text-text-secondary/60 text-center font-medium uppercase tracking-wider">
                Added to base rent of <span className="text-text-primary font-bold">₹{selectedPayment?.amount}</span>.
              </p>
              <button type="submit" className="btn-primary w-full py-4">
                Apply Penalty
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;
