import React, { useEffect, useState } from "react";
import api from "../../api/axios";
import { MdPayment, MdHistory, MdCheckCircle, MdWarning, MdAdd, MdClose } from "react-icons/md";
import toast from "react-hot-toast";
import ErrorRetry from "../../components/ErrorRetry";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { getApiError } from "../../utils/getApiError";
import PaymentCard from "./PaymentCard";


const mapPayment = (p) => ({
  ...p,
  fine: p.fineAmount ?? 0,
});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const TenantPayments = () => {
  const [overdue, setOverdue] = useState([]);
  const [unpaid, setUnpaid] = useState([]);
  const [paid, setPaid] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const { socket } = useSocket();
  const { user } = useAuth();
  const { theme } = useTheme();

  // Payment request flow
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    paymentMonth: MONTHS[new Date().getMonth()],
    year: new Date().getFullYear(),
    amount: "",
    paymentProof: "",
    notes: "",
  });

  const fetchPayments = async () => {
    setError(null);
    try {
      setLoading(true);
      const res = await api.get("/tenant/payments");
      const data = res.data.data ?? {};
      const grouped = data.grouped ?? {};
      setOverdue((grouped.overdue ?? []).map(mapPayment));
      setUnpaid((grouped.unpaid ?? []).map(mapPayment));
      setPaid((grouped.paid ?? data.payments?.filter((p) => (p.paymentStatus || p.status) === "paid") ?? []).map(mapPayment));
    } catch (error) {
      setError(error.response?.data?.message || "Failed to load payments");
      toast.error(getApiError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on("payment_completed", () => fetchPayments());
      return () => socket.off("payment_completed");
    }
  }, [socket]);

  const handlePayment = async (payment) => {
    try {
      setProcessing(true);
      toast.loading("Initiating payment...", { id: "payment" });
      const res = await api.post("/tenant/payments/create-order", { paymentId: payment._id });
      const data = res.data.data ?? {};
      const { order } = data;
      if (!order) throw new Error("Order creation failed");

      if (data.mock) {
        toast.loading("Simulating payment success...", { id: "payment" });
        await api.post("/tenant/payments/verify", {
          razorpay_payment_id: `pay_mock_${Math.random().toString(36).substring(2, 10)}`,
          razorpay_order_id: order.id,
          razorpay_signature: "mock_signature",
          paymentId: payment._id,
        });
        toast.success("Payment successful (Mock)!", { id: "payment" });
        fetchPayments();
        return;
      }

      if (!window.Razorpay) {
        toast.error("Razorpay SDK failed to load. Please refresh the page.", { id: "payment" });
        return;
      }

      const key = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!key) {
        toast.error("VITE_RAZORPAY_KEY_ID (Razorpay Test Key) is missing in environment settings", { id: "payment" });
        return;
      }

      const options = {
        key,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Sri Rama Hostel",
        description: `${payment.month} ${payment.year} rent`,
        order_id: order.id,
        handler: async (response) => {
          try {
            toast.loading("Verifying payment...", { id: "payment" });
            await api.post("/tenant/payments/verify", {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              paymentId: payment._id,
            });
            toast.success("Payment successful!", { id: "payment" });
            fetchPayments();
          } catch (err) {
            toast.error(getApiError(err), { id: "payment" });
          }
        },
        prefill: {
          name: user?.name || user?.personalInfo?.name || "Resident",
          email: user?.email || user?.personalInfo?.email || "",
          contact: user?.phone || user?.personalInfo?.phone || "",
        },
        theme: { color: "#B45309" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (response) {
        toast.error(`Payment failed: ${response.error.description}`, { id: "payment" });
      });
      rzp.open();
      toast.dismiss("payment");
    } catch (error) {
      toast.error(getApiError(error), { id: "payment" });
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitPaymentRequest = async (e) => {
    e.preventDefault();
    if (!requestForm.amount || Number(requestForm.amount) <= 0) {
      return toast.error("Please enter a valid amount");
    }
    try {
      await api.post("/tenant/payment-requests", {
        paymentMonth: requestForm.paymentMonth,
        year: requestForm.year,
        amount: Number(requestForm.amount),
        paymentProof: requestForm.paymentProof,
        notes: requestForm.notes,
      });
      toast.success("Payment request submitted for admin approval!");
      setShowRequestModal(false);
      setRequestForm({
        paymentMonth: MONTHS[new Date().getMonth()],
        year: new Date().getFullYear(),
        amount: "",
        paymentProof: "",
        notes: "",
      });
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  if (error) return <ErrorRetry message={error} onRetry={fetchPayments} />;
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary/40 font-bold animate-pulse uppercase tracking-wider text-xs">
        Loading Payment Portal...
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 max-w-4xl mx-auto">
      <div className="text-center space-y-3">
        <div className={`w-16 h-16 ${theme === "theme-2" ? "rounded-lg" : "rounded-2xl"} bg-primary/10 flex items-center justify-center mx-auto mb-4`}>
          <MdPayment className="text-3xl text-primary" />
        </div>
        <h3 className="section-title">Rent & <span>Dues</span></h3>
        <p className="text-text-secondary font-medium max-w-md mx-auto text-sm">
          <strong className="text-[#C62828]">Overdue</strong> = past months unpaid.{" "}
          <strong className="text-[#8D6E2A]">Unpaid</strong> = this month not paid yet.
        </p>
        <button
          onClick={() => setShowRequestModal(true)}
          className="btn-primary-sm mt-4 inline-flex items-center gap-1.5"
        >
          <MdAdd size={16} /> Submit Payment Request
        </button>
      </div>

      {overdue.length > 0 && (
        <section className="space-y-4">
          <h4 className="text-[9px] font-black text-[#C62828] uppercase tracking-wider pl-3 flex items-center gap-2">
            <MdWarning size={14} /> Overdue ({overdue.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {overdue.map((p) => (
              <PaymentCard key={p._id} payment={p} variant="overdue" onPay={handlePayment} processing={processing} />
            ))}
          </div>
        </section>
      )}

      {unpaid.length > 0 && (
        <section className="space-y-4">
          <h4 className="text-[9px] font-black text-[#8D6E2A] uppercase tracking-wider pl-3">
            Unpaid ({unpaid.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {unpaid.map((p) => (
              <PaymentCard key={p._id} payment={p} variant="unpaid" onPay={handlePayment} processing={processing} />
            ))}
          </div>
        </section>
      )}

      {overdue.length === 0 && unpaid.length === 0 && (
        <div className={`text-center py-14 bg-green-500/5 ${theme === "theme-2" ? "rounded-lg" : "rounded-xl"} border border-emerald-500/10`}>
          <MdCheckCircle className="text-4xl text-[#2E7D32] mx-auto mb-3" />
          <p className="text-[#2E7D32] font-bold">All caught up — no pending rent.</p>
        </div>
      )}

      <section className="space-y-4 pt-6">
        <h4 className="text-[9px] font-black text-text-secondary uppercase tracking-wider pl-3 flex items-center gap-2">
          <MdHistory size={14} /> Paid History
        </h4>
        {paid.length > 0 ? (
          <div className="arch-card overflow-hidden">
            {paid.map((p, i) => (
              <div key={p._id} className={`flex items-center justify-between p-6 ${i < paid.length - 1 ? "border-b border-border/50" : ""}`}>
                <div className="flex items-center gap-5">
                  <div className={`w-10 h-10 ${theme === "theme-2" ? "rounded-lg" : "rounded-2xl"} bg-emerald-500/10 text-[#2E7D32] flex items-center justify-center`}>
                    <MdCheckCircle size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-text-primary">{p.paymentMonth || p.month} {p.year}</p>
                    <p className="text-sm text-text-secondary">₹{(p.totalAmount || p.amount + (p.fine || 0)).toLocaleString()}</p>
                  </div>
                </div>
                <span className="badge-emerald text-[9px]">Paid</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-text-secondary/50 text-sm py-12">No payment history yet.</p>
        )}
      </section>

      {/* Payment Request Modal */}
      {showRequestModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-md">
            <div className="p-6 border-b border-border/60 flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold font-display text-text-primary">Submit Payment Request</h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">For admin approval</p>
              </div>
              <button onClick={() => setShowRequestModal(false)}
                className={`w-9 h-9 flex items-center justify-center ${theme === "theme-2" ? "rounded-lg" : "rounded-xl"} text-text-secondary/40 hover:text-primary hover:bg-primary-light transition-all`}>
                <MdClose size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitPaymentRequest} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Month</label>
                  <select className="field-select" value={requestForm.paymentMonth}
                    onChange={(e) => setRequestForm({ ...requestForm, paymentMonth: e.target.value })}>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Year</label>
                  <input type="number" className="field-input" value={requestForm.year}
                    onChange={(e) => setRequestForm({ ...requestForm, year: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Amount (₹)</label>
                <input required type="number" min="1" className="field-input" placeholder="e.g. 5000"
                  value={requestForm.amount} onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Payment Proof URL (optional)</label>
                <input type="text" className="field-input" placeholder="Link to screenshot or receipt"
                  value={requestForm.paymentProof} onChange={(e) => setRequestForm({ ...requestForm, paymentProof: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Notes (optional)</label>
                <textarea className="field-textarea h-20" placeholder="Any additional information..."
                  value={requestForm.notes} onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })} />
              </div>
              <button type="submit" className="btn-primary w-full py-4">
                Submit for Approval
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantPayments;
