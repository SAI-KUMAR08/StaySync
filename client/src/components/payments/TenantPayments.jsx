import React, { useEffect, useState } from "react";
import api from "../../api/axios";
import { MdPayment, MdHistory, MdCheckCircle, MdWarning, MdLock, MdLocalOffer } from "react-icons/md";
import toast from "react-hot-toast";
import { useSocket } from "../../context/SocketContext";
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
  const [processing, setProcessing] = useState(false);
  const { socket } = useSocket();

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await api.get("/tenant/payments");
      const data = res.data.data ?? {};
      const grouped = data.grouped ?? {};
      setOverdue((grouped.overdue ?? []).map(mapPayment));
      setUnpaid((grouped.unpaid ?? []).map(mapPayment));
      setPaid((grouped.paid ?? data.payments?.filter((p) => p.status === "paid") ?? []).map(mapPayment));
    } catch (error) {
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
        name: "Hostel StaySync",
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
          name: "Resident",
          email: "resident@srirama.com",
          contact: "9999999999",
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
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <MdPayment className="text-3xl text-primary" />
        </div>
        <h3 className="section-title">Rent & <span>Dues</span></h3>
        <p className="text-text-secondary font-medium max-w-md mx-auto text-sm">
          <strong className="text-rose-600">Overdue</strong> = past months unpaid.{" "}
          <strong className="text-amber-600">Unpaid</strong> = this month not paid yet.
        </p>
      </div>

      {overdue.length > 0 && (
        <section className="space-y-4">
          <h4 className="text-[9px] font-black text-rose-600 uppercase tracking-wider pl-3 flex items-center gap-2">
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
          <h4 className="text-[9px] font-black text-amber-600 uppercase tracking-wider pl-3">
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
        <div className="text-center py-14 bg-emerald-50/50 rounded-[2.5rem] border border-emerald-100/60">
          <MdCheckCircle className="text-4xl text-emerald-400 mx-auto mb-3" />
          <p className="text-emerald-700 font-bold">All caught up — no pending rent.</p>
        </div>
      )}

      {/* 🪙 Razorpay Online Payment Gateway */}
      <section className="space-y-4">
        <h4 className="text-[9px] font-black text-text-secondary uppercase tracking-wider pl-3 flex items-center gap-2">
          <MdLock size={14} /> Online Payment
        </h4>
        <div className="bento-card overflow-hidden bg-gradient-to-br from-card to-zinc-50">
          <div className="p-6 md:p-8 text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <MdPayment className="text-4xl text-primary" />
            </div>
            <h3 className="text-2xl font-black font-sans text-text-primary tracking-tight mb-2">
              Pay Rent Online
            </h3>
            <p className="text-text-secondary text-sm max-w-md mx-auto mb-6">
              Pay your hostel fees securely through our Razorpay-powered payment gateway.
              Credit cards, debit cards, UPI, and net banking accepted.
            </p>

            {/* Razorpay Branding */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="flex items-center gap-2 px-4 py-2 bg-[#02042B] rounded-xl shadow-md">
                <svg viewBox="0 0 100 30" className="h-6" fill="white" xmlns="http://www.w3.org/2000/svg">
                  <text x="5" y="22" fontFamily="sans-serif" fontSize="20" fontWeight="bold" fill="white">R<span fill="#2563EB" style={{fill: '#2563EB'}}>azor</span>pay</text>
                </svg>
              </div>
              <span className="text-text-secondary/40 text-[9px] uppercase tracking-wider font-bold">Powered by</span>
            </div>

            {/* Security badges */}
            <div className="flex flex-wrap justify-center gap-6 text-[9px] text-text-secondary/50 font-medium uppercase tracking-wider">
              <span className="flex items-center gap-1.5">🔒 256-bit SSL</span>
              <span className="flex items-center gap-1.5">✅ RBI Compliant</span>
              <span className="flex items-center gap-1.5">⚡ Instant Confirmation</span>
            </div>

            {/* Blank Razorpay slot */}
            <div id="razorpay-checkout" className="mt-8 p-8 rounded-2xl border-2 border-dashed border-border/60 bg-zinc-50/50">
              <p className="text-text-secondary/40 font-medium text-sm">
                Razorpay Checkout Widget will render here
              </p>
              <p className="text-text-secondary/30 text-[10px] mt-1 uppercase tracking-wider">
                Click "Pay Now" on any pending invoice above to initiate payment
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 pt-6">
        <h4 className="text-[9px] font-black text-text-secondary uppercase tracking-wider pl-3 flex items-center gap-2">
          <MdHistory size={14} /> Paid History
        </h4>
        {paid.length > 0 ? (
          <div className="bento-card overflow-hidden">
            {paid.map((p, i) => (
              <div key={p._id} className={`flex items-center justify-between p-6 ${i < paid.length - 1 ? "border-b border-border/50" : ""}`}>
                <div className="flex items-center gap-5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                    <MdCheckCircle size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-text-primary">{p.month} {p.year}</p>
                    <p className="text-sm text-text-secondary">₹{(p.amount + (p.fine || 0)).toLocaleString()}</p>
                  </div>
                </div>
                <span className="badge-paid text-[9px]">Paid</span>
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
