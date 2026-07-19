import { useEffect, useRef, useCallback } from "react";
import { MdClose } from "react-icons/md";

const Modal = ({ open, onClose, title, children, footer, size = "md" }) => {
  const overlayRef = useRef(null);
  const previousFocus = useRef(null);

  const sizes = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  // Focus trap and Escape key
  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") { onClose?.(); return; }
    if (e.key !== "Tab") return;
    const modal = overlayRef.current?.querySelector("[role='dialog']");
    if (!modal) return;
    const focusable = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    // Focus first focusable element in modal
    requestAnimationFrame(() => {
      const dialog = overlayRef.current?.querySelector("[role='dialog']");
      if (!dialog) return;
      const first = dialog.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
    });
    return () => { previousFocus.current?.focus?.(); };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
      onClick={(e) => { if (e.target === overlayRef.current) onClose?.(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${sizes[size] || sizes.md} bg-white rounded-2xl shadow-modal animate-scale-in overflow-hidden`}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border-light">
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-neutral-100 transition-all"
            >
              <MdClose size={18} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border-light bg-neutral-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
