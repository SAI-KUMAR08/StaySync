import React, { useEffect, useState, useRef, useCallback } from "react";
import api from "../api/axios";
import ErrorRetry from "../components/ErrorRetry";
import {
  MdPeople, MdReportProblem,
  MdAttachMoney, MdCheckCircle, MdTrendingUp,
  MdHome, MdCurrencyRupee, MdArrowForward,
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
    if (target === undefined || target === null) return;
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    prev.current = target;
    requestAnimationFrame(tick);
  }, [target, duration]);
  return display;
};

// ── Trend badge ──
const Trend = ({ current, previous }) => {
  if (!previous || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.01) return null;
  const isUp = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[9px] font-semibold ${
        isUp ? "text-emerald-600" : "text-red-500"
      }`}
    >
      <MdTrendingUp
        size={12}
        className={isUp ? "" : "rotate-180"}
      />
      {isUp ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
};

// ── Stat card ──
const StatCard = ({ label, value, icon: Icon, trend, href, prefix = "", suffix = "", subtitle }) => {
  const numeric = parseInt(String(value).replace(/[^0-9.-]/g, "") || "0") || 0;
  const animated = useAnimatedNumber(numeric);
  const content = (
    <div className="bg-surface border border-border/60 rounded-2xl p-5 hover:shadow-sm hover:border-border transition-all duration-200 h-full flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="text-lg text-primary" />
        </div>
        {trend && <Trend current={numeric} previous={numeric * 0.92} />}
      </div>
      <p className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-2xl font-bold font-display text-text-primary tracking-tight">
        {prefix}
        {animated.toLocaleString()}
        {suffix}
      </p>
      {subtitle && (
        <p className="text-[9px] text-text-secondary/60 mt-auto pt-2">{subtitle}</p>
      )}
    </div>
  );
  return href ? <Link to={href} className="block h-full">{content}</Link> : content;
};

const SUPPORT_FILTERS = [
  { id: "", label: "All open" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "resolved", label: "Resolved" },
];

const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [expenseSummary, setExpenseSummary] = useState(null);
  const [financialOverview, setFinancialOverview] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [supportFilter, setSupportFilter] = useState("");
  const supportFilterRef = useRef(supportFilter);
  const { socket } = useSocket();

  useEffect(() => { supportFilterRef.current = supportFilter; }, [supportFilter]);

  const fetchComplaints = useCallback(async (status) => {
    const url = status ? `/owner/complaints?status=${status}` : "/owner/complaints";
    const res = await api.get(url);
    const list = res.data.data || [];
    setActivities(
      (status ? list : list.filter((c) => !["resolved", "closed"].includes(c.status))).slice(0, 6)
    );
  }, []);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [statsRes, expRes, finRes] = await Promise.all([
        api.get("/owner/dashboard"),
        api.get("/owner/expenses/summary"),
        api.get("/owner/financial-overview").catch(() => ({ data: { data: null } })),
      ]);
      setStats(statsRes.data.data.stats || null);
      setExpenseSummary(expRes.data.data || null);
      if (finRes.data.data) setFinancialOverview(finRes.data.data);
      await fetchComplaints(supportFilterRef.current);
    } catch (error) {
      console.error(error);
      setError(error.response?.data?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [fetchComplaints]);

  useEffect(() => { fetchData(); }, [fetchData, user?.hostelId]);
  useEffect(() => {
    if (!loading) fetchComplaints(supportFilter).catch(console.error);
  }, [loading, supportFilter, fetchComplaints]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => { toast.success("Update received", { icon: "🔔" }); fetchData(); };
    const events = ["tenant_assigned", "tenant_removed", "payment_completed", "occupancy_update"];
    events.forEach((e) => socket.on(e, refresh));
    socket.on("complaint_created", () => fetchComplaints(supportFilterRef.current));
    socket.on("complaint_updated", () => fetchComplaints(supportFilterRef.current));
    return () => {
      events.forEach((e) => socket.off(e, refresh));
      socket.off("complaint_created");
      socket.off("complaint_updated");
    };
  }, [socket, fetchData, fetchComplaints]);

  if (error && !stats) return <ErrorRetry message={error} onRetry={fetchData} />;

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface border border-border/60 rounded-2xl p-5 space-y-3">
              <div className="shimmer w-9 h-9 rounded-xl" />
              <div className="shimmer h-3 w-20" />
              <div className="shimmer h-7 w-28" />
            </div>
          ))}
        </div>
        <div className="shimmer h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div>
        <h2 className="text-2xl md:text-3xl font-bold font-display text-text-primary tracking-tight">
          Overview
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          Real-time health and occupancy metrics for{" "}
          <span className="font-semibold text-text-primary">
            {stats?.totalTenants ?? 0} residents
          </span>
        </p>
      </div>

      {/* KPI Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Active Residents"
            value={stats.totalTenants}
            icon={MdPeople}
            trend={stats.totalTenants > (stats.previousTotalTenants || 0)}
            href="/admin/tenants"
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
          <StatCard
            label="Unpaid Bills"
            value={stats.unpaidPayments ?? 0}
            icon={MdReportProblem}
            href="/admin/payments"
          />
          <StatCard
            label="Occupancy Rate"
            value={stats.totalBeds ? Math.round((stats.occupiedBeds / stats.totalBeds) * 100) : 0}
            suffix="%"
            icon={MdHome}
          />
          <StatCard
            label="Available Rooms"
            value={stats.vacantRooms ?? 0}
            icon={MdCheckCircle}
          />
          <StatCard
            label="Active Tickets"
            value={stats.activeComplaints}
            icon={MdReportProblem}
            href="/admin/complaints"
          />
          <StatCard
            label="Overdue"
            value={stats.overduePayments ?? 0}
            icon={MdAttachMoney}
            href="/admin/payments"
          />
        </div>
      )}

      {/* Multi-Hostel Overview */}
      {financialOverview && financialOverview.hostelCount > 1 && (
        <div className="bg-surface rounded-2xl border border-border/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40">
            <h3 className="text-sm font-bold font-display text-text-primary">
              Multi-Property Summary
            </h3>
            <p className="text-[9px] text-text-tertiary font-medium uppercase tracking-wider mt-0.5">
              {financialOverview.hostelCount} properties
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border/40">
            <div className="p-5 text-center">
              <p className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">Income</p>
              <p className="text-xl font-bold text-emerald-600">₹{financialOverview.totalIncome.toLocaleString()}</p>
            </div>
            <div className="p-5 text-center">
              <p className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">Expenses</p>
              <p className="text-xl font-bold text-red-500">₹{financialOverview.totalExpenses.toLocaleString()}</p>
            </div>
            <div className="p-5 text-center">
              <p className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">Net</p>
              <p className={`text-xl font-bold ${financialOverview.net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                ₹{financialOverview.net.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Support Desk */}
      <div className="bg-surface rounded-2xl border border-border/60 overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[9px] font-bold text-primary uppercase tracking-wider">
                Support Desk
              </p>
              <h3 className="text-base font-bold font-display text-text-primary mt-0.5">
                Recent Tickets
              </h3>
            </div>
            <Link
              to="/admin/complaints"
              className="text-[10px] font-semibold text-primary hover:text-primary-hover transition-colors inline-flex items-center gap-0.5"
            >
              View All <MdArrowForward size={13} />
            </Link>
          </div>
          <div className="flex flex-wrap gap-1.5 pb-4 border-b border-border/40">
            {SUPPORT_FILTERS.map(({ id, label }) => (
              <button
                key={id || "all"}
                onClick={() => setSupportFilter(id)}
                className={`px-3.5 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  supportFilter === id
                    ? "bg-primary text-white"
                    : "bg-transparent text-text-tertiary border border-border/60 hover:border-border hover:text-text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pb-5 pt-3">
          {activities.length === 0 ? (
            <div className="py-12 text-center">
              <MdCheckCircle className="text-4xl mx-auto mb-2 text-emerald-500/25" />
              <p className="text-xs font-medium text-text-tertiary/50">
                Zero unresolved tickets
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.map((a, i) => (
                <div
                  key={a._id}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-background/50 transition-all"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <MdReportProblem size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-primary text-sm leading-tight truncate">
                      {a.description}
                    </p>
                    <p className="text-[8px] text-text-tertiary font-medium uppercase tracking-wider mt-0.5">
                      {a.tenantId?.name || a.tenantId?.personalInfo?.name || "Resident"}
                      {" · "}
                      {new Date(a.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span
                    className={`text-[9px] font-semibold px-2.5 py-1 rounded-lg capitalize ${
                      a.status === "pending"
                        ? "bg-amber-50 text-amber-700"
                        : a.status === "in_progress" || a.status === "assigned"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
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
