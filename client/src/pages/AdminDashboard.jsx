import React, { useEffect, useState, useRef, useCallback } from "react";
import api from "../api/axios";
import ErrorRetry from "../components/ErrorRetry";
import {
  MdPeople, MdReportProblem, MdAttachMoney,
  MdCheckCircle, MdTrendingUp, MdCurrencyRupee,
  MdArrowForward, MdHotel,
} from "react-icons/md";
import { Link } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

// ── Animated counter ──
const useAnimatedNumber = (target, duration = 1000) => {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target == null) return;
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      setDisplay(Math.round(start + diff * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(tick);
    };
    prev.current = target;
    requestAnimationFrame(tick);
  }, [target, duration]);
  return display;
};

// ── Trend badge ──
const TrendBadge = ({ current, previous }) => {
  if (previous == null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return null;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
      <MdTrendingUp size={11} className={up ? "" : "rotate-180"} />
      {up ? "+" : ""}{Math.abs(pct).toFixed(1)}%
    </span>
  );
};

// ── Stat card ──
const StatCard = ({ label, value, icon: Icon, href, prefix = "", suffix = "", trend }) => {
  const numeric = parseInt(String(value ?? 0).replace(/[^0-9.-]/g, "") || "0") || 0;
  const animated = useAnimatedNumber(numeric);
  const card = (
    <div className="bg-white rounded-xl border border-border/60 p-5 hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] hover:border-border transition-all duration-200 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-primary/[0.07] flex items-center justify-center">
          <Icon className="text-lg text-primary" />
        </div>
        {trend && <TrendBadge current={numeric} previous={trend} />}
      </div>
      <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-[26px] font-bold font-display text-text-primary tracking-tight leading-none">
        {prefix}{animated.toLocaleString()}{suffix}
      </p>
    </div>
  );
  return href ? <Link to={href} className="block h-full">{card}</Link> : card;
};

const SUPPORT_FILTERS = [
  { id: "", label: "All open" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "resolved", label: "Resolved" },
];

const AdminDashboard = () => {
  const { user, hostels } = useAuth();
  const [stats, setStats] = useState(null);
  const [expenseSummary, setExpenseSummary] = useState(null);
  const [hostelSummaries, setHostelSummaries] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [supportFilter, setSupportFilter] = useState("");
  const supRef = useRef(supportFilter);
  const { socket } = useSocket();

  useEffect(() => { supRef.current = supportFilter; }, [supportFilter]);

  const fetchComplaints = useCallback(async (status) => {
    const url = status ? `/owner/complaints?status=${status}` : "/owner/complaints";
    const res = await api.get(url);
    const list = res.data.data || [];
    setActivities(
      (status ? list : list.filter((c) => !["resolved", "closed"].includes(c.status))).slice(0, 6)
    );
  }, []);

  // Fetch selected-hostel dashboard data
  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [s, e] = await Promise.all([
        api.get("/owner/dashboard"),
        api.get("/owner/expenses/summary"),
      ]);
      setStats(s.data.data.stats || null);
      setExpenseSummary(e.data.data || null);
      await fetchComplaints(supRef.current);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [fetchComplaints]);

  // Fetch all-hostels summary table data (independent of selected hostel)
  const fetchHostelSummaries = useCallback(async () => {
    try {
      const res = await api.get("/owner/hostels-summary");
      setHostelSummaries(res.data.data || []);
    } catch { /* non-critical */ }
  }, []);

  // Clear stale dashboard state when hostel changes
  useEffect(() => {
    setStats(null);
    setExpenseSummary(null);
    setLoading(true);
  }, [user?.hostelId]);

  useEffect(() => { fetchData(); }, [fetchData, user?.hostelId]);

  // Fetch all-hostels summary on mount and when hostels list changes
  useEffect(() => { fetchHostelSummaries(); }, [fetchHostelSummaries, hostels?.length]);

  useEffect(() => {
    if (!loading) fetchComplaints(supportFilter).catch(() => {});
  }, [loading, supportFilter, fetchComplaints]);

  // Socket events
  useEffect(() => {
    if (!socket) return;
    const refresh = () => { fetchData(); fetchHostelSummaries(); };
    const onComplaint = () => fetchComplaints(supRef.current);
    ["tenant_assigned","tenant_removed","payment_completed","occupancy_update"].forEach(
      (e) => socket.on(e, refresh)
    );
    socket.on("complaint_created", onComplaint);
    socket.on("complaint_updated", onComplaint);
    return () => {
      ["tenant_assigned","tenant_removed","payment_completed","occupancy_update"].forEach(
        (e) => socket.off(e, refresh)
      );
      socket.off("complaint_created", onComplaint);
      socket.off("complaint_updated", onComplaint);
    };
  }, [socket, fetchData, fetchComplaints, fetchHostelSummaries]);

  if (error && !stats) return <ErrorRetry message={error} onRetry={fetchData} />;

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border/60 p-5 space-y-3">
              <div className="shimmer w-9 h-9 rounded-lg" />
              <div className="shimmer h-3 w-20" />
              <div className="shimmer h-7 w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* ── Overview Cards (selected hostel) ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="Active Residents"
            value={stats.totalTenants}
            icon={MdPeople}
            href="/admin/tenants"
            trend={stats.previousTotalTenants}
          />
          <StatCard
            label="Monthly Income"
            value={stats.monthlyRevenue ?? 0}
            prefix="₹"
            icon={MdCurrencyRupee}
            href="/admin/payments"
          />
          <StatCard
            label="Monthly Expenses"
            value={expenseSummary?.thisMonthTotal ?? 0}
            prefix="₹"
            icon={MdAttachMoney}
            href="/admin/expenses"
          />
        </div>
      )}

      {/* ── All Hostels Summary Table ── */}
      {hostelSummaries.length > 0 && (
        <div className="bg-white rounded-xl border border-border/60 overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-border/40">
            <div className="flex items-center gap-2">
              <MdHotel className="text-primary shrink-0" size={18} />
              <h3 className="text-base font-bold font-display text-text-primary">
                All Hostels Summary
              </h3>
              <span className="text-[10px] font-medium text-text-tertiary/60 bg-black/[0.04] px-2 py-0.5 rounded-full ml-1">
                {hostelSummaries.length}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-black/[0.02]">
                  <th className="text-left px-6 py-3.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Hostel</th>
                  <th className="text-right px-4 py-3.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Residents</th>
                  <th className="text-right px-4 py-3.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Income</th>
                  <th className="text-right px-4 py-3.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Expenses</th>
                  <th className="text-right px-4 py-3.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Net</th>
                  <th className="text-right px-4 py-3.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Unpaid</th>
                  <th className="text-right px-4 py-3.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Beds</th>
                  <th className="text-right px-6 py-3.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Occupancy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {hostelSummaries.map((h) => {
                  const net = h.monthlyIncome - h.monthlyExpenses;
                  return (
                    <tr key={h._id} className="hover:bg-black/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                            {(h.name || "H")[0].toUpperCase()}
                          </div>
                          <span className="font-semibold text-text-primary">{h.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-text-primary tabular-nums">{h.activeResidents}</td>
                      <td className="px-4 py-4 text-right font-semibold text-text-primary tabular-nums">{h.monthlyIncome > 0 ? `₹${h.monthlyIncome.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-4 text-right font-semibold text-text-primary tabular-nums">{h.monthlyExpenses > 0 ? `₹${h.monthlyExpenses.toLocaleString()}` : "—"}</td>
                      <td className={`px-4 py-4 text-right font-semibold tabular-nums ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {net >= 0 ? "+" : ""}₹{net.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {h.unpaidCount > 0 ? (
                          <span className="font-semibold text-amber-600 tabular-nums">
                            ₹{h.unpaidAmount.toLocaleString()}
                            <span className="text-[10px] text-amber-500/70 ml-1">({h.unpaidCount})</span>
                          </span>
                        ) : (
                          <span className="text-text-tertiary/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right text-text-primary tabular-nums">
                        <span className="font-semibold">{h.occupiedBeds}</span>
                        <span className="text-text-tertiary/60">/{h.totalBeds}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded ${
                          h.occupancyRate >= 90
                            ? "text-emerald-600 bg-emerald-50"
                            : h.occupancyRate >= 50
                            ? "text-amber-600 bg-amber-50"
                            : "text-text-tertiary/60 bg-black/[0.04]"
                        }`}>
                          {h.occupancyRate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Support Desk */}
      <div className="bg-white rounded-xl border border-border/60 overflow-hidden">
        <div className="px-6 pt-5 pb-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                Support Desk
              </p>
              <h3 className="text-base font-bold font-display text-text-primary mt-0.5">
                Recent Tickets
              </h3>
            </div>
            <Link
              to="/admin/complaints"
              className="text-xs font-medium text-text-tertiary hover:text-primary transition-colors inline-flex items-center gap-1"
            >
              View all <MdArrowForward size={13} />
            </Link>
          </div>
          <div className="flex flex-wrap gap-1.5 pb-4 border-b border-border/40">
            {SUPPORT_FILTERS.map(({ id, label }) => (
              <button
                key={id || "all"}
                onClick={() => setSupportFilter(id)}
                className={`px-3.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                  supportFilter === id
                    ? "bg-primary text-white shadow-sm"
                    : "bg-transparent text-text-tertiary border border-border/60 hover:border-border hover:text-text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-6 pb-5 pt-3">
          {activities.length === 0 ? (
            <div className="py-12 text-center">
              <MdCheckCircle className="text-4xl mx-auto mb-2 text-emerald-500/20" />
              <p className="text-sm font-medium text-text-tertiary/50">No open tickets</p>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.map((a) => (
                <div
                  key={a._id}
                  className="flex items-center gap-3.5 p-3 rounded-lg hover:bg-black/[0.02] transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/[0.07] flex items-center justify-center shrink-0">
                    <MdReportProblem size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{a.title || a.description}</p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      {a.tenantId?.name || a.tenantId?.personalInfo?.name || "Resident"}
                      {" · "}
                      {new Date(a.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-md capitalize ${
                    a.status === "pending"
                      ? "bg-amber-50 text-amber-700"
                      : a.status === "in_progress" || a.status === "assigned"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}>
                    {a.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
