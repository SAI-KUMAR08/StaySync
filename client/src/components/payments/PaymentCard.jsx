import React from "react";
import { useTheme } from "../../context/ThemeContext";
import { MdPayment, MdCalendarToday } from "react-icons/md";

const PaymentCard = ({ payment, onPay, processing, variant = "unpaid" }) => {
  const { theme } = useTheme();
  return (
    <div className={`arch-card ${theme === "theme-2" ? "p-5" : "p-6 md:p-7"} relative overflow-hidden`}>
    <div className={`absolute top-0 left-0 w-full h-1.5 ${variant === "overdue" ? "bg-primary" : "bg-[#8D6E2A]"}`} />
    <div className="flex justify-between items-start mb-6">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-text-secondary/60 mb-0.5">
          {payment.paymentMonth || payment.month} {payment.year}
        </p>
        <h5 className="text-3xl font-bold font-display text-text-primary tracking-tighter">
          ₹{(payment.totalAmount || payment.amount + (payment.fine || 0)).toLocaleString()}
        </h5>
        {payment.fine > 0 && (
          <span className="text-[10px] font-bold text-accent inline-block mt-2 bg-accent-soft px-2 py-1 rounded-lg">
            + ₹{payment.fine} penalty
          </span>
        )}
      </div>
      <span className={`badge ${
        variant === "overdue" ? "badge-accent" : "badge-amber"
      }`}>
        {variant === "overdue" ? "overdue" : "unpaid"}
      </span>
    </div>
    <div className={`flex items-center gap-2 text-sm text-text-secondary font-semibold mb-6 bg-surface p-4 ${theme === "theme-2" ? "rounded-lg" : "rounded-2xl"} border border-border/50`}>
      <MdCalendarToday className="text-text-secondary/40" size={16} />
      Due {new Date(payment.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
    </div>
    {onPay && (
      <button type="button" onClick={() => onPay(payment)} disabled={processing}
        className="btn-primary w-full py-4 text-sm flex items-center justify-center gap-2">
        <MdPayment size={18} />
        {processing ? "Processing..." : "Pay Now"}
      </button>
    )}
  </div>
  );
};

export default PaymentCard;
