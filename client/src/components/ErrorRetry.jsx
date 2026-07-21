import React from "react";
import { MdErrorOutline, MdRefresh } from "react-icons/md";

const ErrorRetry = ({ message = "Something went wrong", onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500 mb-4">
        <MdErrorOutline size={28} />
      </div>
      <p className="text-text-primary font-semibold mb-1">{message}</p>
      <p className="text-text-secondary text-sm mb-6">Please try again or refresh the page.</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary flex items-center gap-2 px-5 py-2.5 text-sm"
        >
          <MdRefresh size={16} /> Retry
        </button>
      )}
    </div>
  );
};

export default React.memo(ErrorRetry);
