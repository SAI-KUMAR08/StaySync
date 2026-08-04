import { useState, useRef, useCallback } from "react";
import { MdGavel, MdCheckCircle } from "react-icons/md";

const RULES = [
  "ROOM RENT MUST BE PAID WITHIN 2–3 DAYS OF THE DUE DATE.",
  "A SECURITY DEPOSIT OF ₹1000 IS REQUIRED AND IS NON-REFUNDABLE.",
  "RESIDENTS MUST INFORM AT LEAST 15 DAYS IN ADVANCE BEFORE VACATING THE HOSTEL.",
  "DAY RENT IS ₹300 PER DAY.",
  "ANY DAMAGE TO THE ROOM WILL RESULT IN A FINE OF ₹1000–₹2000, DEPENDING ON THE DAMAGE.",
  "SMOKING, SPITTING, AND CONSUMPTION OF ALCOHOL ARE STRICTLY PROHIBITED.",
];

const HostelRulesModal = ({ onContinue }) => {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const scrollRef = useRef(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 5;
    if (atBottom) setScrolledToBottom(true);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Hostel rules"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MdGavel className="text-primary" size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold font-display text-text-primary">Hostel Rules</h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                Please read all the rules carefully before continuing
              </p>
            </div>
          </div>
        </div>

        {/* Rules list — scrollable. tabIndex makes the scroll region reachable by
            keyboard so a keyboard-only user can actually scroll to the bottom and
            enable Continue (previously an a11y lockout). */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          tabIndex={0}
          aria-label="Scroll through the rules"
          className="px-6 py-5 max-h-[50vh] overflow-y-auto space-y-4"
        >
          {RULES.map((rule, i) => (
            <div
              key={rule}
              className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200/40"
            >
              <span className="shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm font-medium text-text-primary leading-relaxed">{rule}</p>
            </div>
          ))}
          <div className="h-2" />
        </div>

        {/* Scroll indicator */}
        {!scrolledToBottom && (
          <p className="text-center text-[11px] text-text-tertiary/60 pb-2">
            Scroll down to read all rules
          </p>
        )}

        {/* Continue button */}
        <div className="px-6 pb-6 pt-3 border-t border-border/40">
          <button
            onClick={onContinue}
            disabled={!scrolledToBottom}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              scrolledToBottom
                ? "bg-primary text-white shadow-md hover:shadow-lg hover:brightness-110"
                : "bg-gray-100 text-text-tertiary/50 cursor-not-allowed"
            }`}
          >
            <MdCheckCircle size={18} />
            {scrolledToBottom ? "Continue" : "Scroll to the bottom to continue"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HostelRulesModal;
