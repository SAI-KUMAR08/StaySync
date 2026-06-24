import React from "react";
import { useAuth } from "../context/AuthContext";
import AdminPayments from "../components/payments/AdminPayments";
import TenantPayments from "../components/payments/TenantPayments";

const Payments = () => {
  const { user } = useAuth();

  if (!user) return null;

  if (user.role === "manager") {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-sm max-w-lg mx-auto space-y-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center font-bold text-3xl">⚠️</div>
        <h4 className="text-xl font-bold text-slate-800">Access Restricted</h4>
        <p className="text-sm text-slate-500 font-medium">Managers are restricted from viewing or altering hostel financial records.</p>
      </div>
    );
  }

  return user.role === "owner" ? <AdminPayments /> : <TenantPayments />;
};

export default Payments;
