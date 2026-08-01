import { useAuth } from "../context/AuthContext";
import AdminPayments from "../components/payments/AdminPayments";
import TenantPayments from "../components/payments/TenantPayments";

const Payments = () => {
  const { user } = useAuth();

  if (!user) return null;

  return user.role === "owner" ? <AdminPayments /> : <TenantPayments />;
};

export default Payments;
