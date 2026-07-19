import React, { useEffect, useState } from "react";
import api from "../../api/axios";
import { MdPayment, MdHistory, MdCheckCircle, MdWarning } from "react-icons/md";
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
    </div>
  );
};

export default TenantPayments;
