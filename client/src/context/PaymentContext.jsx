import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import api from "../api/axios";
import { useAuth } from "./AuthContext";

const PaymentContext = createContext(null);

export const PaymentProvider = ({ children }) => {
  const { user } = useAuth();
  const [totals, setTotals] = useState({
    totalCollected: 0,
    totalPending: 0,
    totalOverdue: 0,
    paidCount: 0,
    unpaidCount: 0,
    overdueCount: 0,
    collectionRate: 0,
  });
  const [loading, setLoading] = useState(false);
  const fetchRef = useRef(null);

  const fetchTotals = useCallback(async () => {
    if (!user?.hostelId) return;
    setLoading(true);
    try {
      const res = await api.get("/owner/payments/totals");
      if (res.data?.data) {
        setTotals(res.data.data);
      }
    } catch (err) {
      // Non-critical — components will show 0
      console.warn("PaymentContext: failed to fetch totals", err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.hostelId]);

  fetchRef.current = fetchTotals;

  // Fetch on hostel change
  useEffect(() => {
    fetchTotals();
  }, [fetchTotals]);

  return (
    <PaymentContext.Provider value={{ totals, loading, refreshTotals: fetchTotals }}>
      {children}
    </PaymentContext.Provider>
  );
};

export const usePaymentTotals = () => {
  const ctx = useContext(PaymentContext);
  if (!ctx) {
    return {
      totals: { totalCollected: 0, totalPending: 0, totalOverdue: 0, paidCount: 0, unpaidCount: 0, overdueCount: 0, collectionRate: 0 },
      loading: false,
      refreshTotals: () => {},
    };
  }
  return ctx;
};
