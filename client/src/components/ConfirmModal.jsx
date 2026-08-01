import { useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";

/**
 * Centered confirmation modal with a blurred overlay, keyboard focus, and
 * Escape/Cancel/Confirm actions. Replaces browser alert()/confirm().
 */
const ConfirmModal = ({
  title,
  children,
  onCancel,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
}) => {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div
        className="modal-card max-w-md p-6 md:p-7 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h4 className="text-lg font-bold font-display text-text-primary tracking-tight">
            {title}
          </h4>
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-accent hover:bg-accent-soft transition-all"
            aria-label="Close"
          >
            <MdClose size={20} />
          </button>
        </div>
        <div className="text-sm text-text-secondary font-medium leading-relaxed">{children}</div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="btn btn-secondary px-5 py-2.5"
          >
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="btn btn-primary px-5 py-2.5">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
