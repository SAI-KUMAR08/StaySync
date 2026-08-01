import { MdCalendarToday } from "react-icons/md";

const TYPE_LABELS = { rent: "Rent", deposit: "Security Deposit", fee: "Other Charge" };
const VARIANT_STYLES = {
  overdue: { bar: "bg-primary", badge: "badge-accent", label: "overdue" },
  unpaid: { bar: "bg-[#8D6E2A]", badge: "badge-amber", label: "unpaid" },
  partial: { bar: "bg-[#1565C0]", badge: "badge-primary", label: "partial" },
};

const PaymentCard = ({ payment, variant = "unpaid" }) => {
  const style = VARIANT_STYLES[variant] || VARIANT_STYLES.unpaid;

  return (
    <div className={`arch-card p-6 md:p-7 relative overflow-hidden`}>
      <div className={`absolute top-0 left-0 w-full h-1.5 ${style.bar}`} />
      <div className="flex justify-between items-start mb-6">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-text-secondary/60 mb-0.5">
            {payment.paymentMonth || payment.month} {payment.year}
            {payment.paymentType && payment.paymentType !== "rent" && (
              <span className="ml-2 text-[8px] font-bold uppercase tracking-wider text-text-secondary bg-surface border border-border/40 rounded-full px-2 py-0.5">
                {TYPE_LABELS[payment.paymentType] || payment.paymentType}
              </span>
            )}
          </p>
          <h5 className="text-3xl font-bold font-display text-text-primary tracking-tighter">
            ₹{(payment.totalAmount || payment.amount + (payment.fine || 0)).toLocaleString()}
          </h5>
          {payment.fine > 0 && (
            <span className="text-[10px] font-bold text-accent inline-block mt-2 bg-accent-soft px-2 py-1 rounded-lg">
              incl. ₹{payment.fine} penalty
            </span>
          )}
        </div>
        <span className={`badge ${style.badge}`}>{style.label}</span>
      </div>
      <div
        className={`flex items-center gap-2 text-sm text-text-secondary font-semibold mb-6 bg-surface p-4 rounded-2xl border border-border/50`}
      >
        <MdCalendarToday className="text-text-secondary/40" size={16} />
        Due{" "}
        {payment.dueDate && !isNaN(new Date(payment.dueDate).getTime())
          ? new Date(payment.dueDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—"}
      </div>
    </div>
  );
};

export default PaymentCard;
