import React, { useEffect, useState, useRef, useCallback } from "react";
import api from "../api/axios";
import ErrorRetry from "../components/ErrorRetry";
import {
  MdPeople, MdReportProblem,
  MdAttachMoney, MdCheckCircle, MdNotificationsActive, MdArrowForward,
  MdQueryStats, MdHome, MdTrendingUp, MdWarning, MdReceipt,
  MdHotel, MdCurrencyRupee
} from "react-icons/md";
import { Link } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import toast from "react-hot-toast";

// ── Trend badge ───
const TrendBadge = ({ current, previous }) => {
  if (previous === undefined || previous === null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.01) return null;
  const isUp = pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${isUp ? 'text-emerald-600' : 'text-danger'}`}>
      <MdTrendingUp size={14} className={isUp ? '' : 'rotate-180'} />
      {isUp ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
};

// ─── Animated counter ───
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

// ── Vivanta-inspired stat block: large number + label ──
const StatBadge = ({ value, label, icon: Icon, trend, prefix = "" }) => {
  const { theme } = useTheme();
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const numericVal = parseFloat(cleaned) || 0;
  const animated = useAnimatedNumber(numericVal);

  return (
    <div className="flex flex-col items-center py-6 px-2">
      {Icon && (
        <div className={`w-10 h-10 ${theme === "theme-2" ? "rounded-lg" : "rounded-full"} bg-primary/10 border border-primary/15 flex items-center justify-center mb-3`}>
          <Icon className="text-lg text-primary" />
        </div>
      )}
      <span className="text-3xl font-bold font-display text-text-primary tracking-tight">
        {prefix}{typeof numericVal === 'number' ? animated.toLocaleString() : value}
      </span>
      <span className="text-[10px] font-medium text-text-secondary uppercase tracking-[0.12em] mt-1 text-center leading-tight">
        {label}
      </span>
      {trend && <div className="mt-1.5">{trend}</div>}
    </div>
  );
};

// ── Main stat card ──
const HeroStat = ({ title, value, icon: Icon, subValue, trend, TrendComponent, to, prefix = "" }) => {
  const { theme } = useTheme();
  const isMoney = title.toLowerCase().includes("collection") || title.toLowerCase().includes("revenue");
  const numericVal = isMoney ? parseInt(value?.replace(/[₹,]/g, "") || "0") : parseInt(value) || 0;
  const animated = useAnimatedNumber(numericVal);

  const content = (
    <div className={`${theme === "theme-2" ? "bg-white rounded-lg border border-border p-6 hover:border-[rgba(0,0,0,0.12)]" : "bg-white rounded-2xl border border-border p-7 md:p-8 hover:shadow-lg"} transition-all duration-300 col-span-1 md:col-span-2`}>
      <div className="flex items-start justify-between mb-5">
        <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/15 flex flex-col items-center justify-center">
          <Icon className="text-2xl text-primary" />
        </div>
        {TrendComponent && <TrendComponent />}
        {trend && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/15">
            <MdTrendingUp size={14} /> {trend}
          </span>
        )}
      </div>
      <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.12em] mb-1.5">{title}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold font-display text-text-primary tracking-tight">
          {prefix}{isMoney ? animated.toLocaleString() : animated}
        </span>
        {subValue && <span className="text-text-secondary text-sm font-medium">{subValue}</span>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{content}</Link> : content;
};

// ── Mini stat card ──
const MiniStat = ({ title, value, icon: Icon, color, to, prefix = "" }) => {
  const { theme } = useTheme();
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const numericVal = parseFloat(cleaned) || 0;
  const animated = useAnimatedNumber(numericVal);

  const content = (
    <div className={`${theme === "theme-2" ? "bg-white rounded-lg border border-border p-4 flex items-center gap-3 hover:border-[rgba(0,0,0,0.12)]" : "bg-white rounded-2xl border border-border p-5 flex items-center gap-4 hover:shadow-md"} transition-all duration-300`}>
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center shadow-sm`}>
        <Icon className="text-xl text-white" />
      </div>
      <div>
        <p className="text-[9px] font-semibold text-text-tertiary uppercase tracking-[0.1em] leading-tight mb-0.5">{title}</p>
        <p className="text-xl font-bold text-text-primary tracking-tight">{prefix}{animated.toLocaleString()}</p>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{content}</Link> : content;
};

const SUPPORT_FILTERS = [
  { id: "", label: "All open" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "resolved", label: "Resolved" },
];

const AdminDashboard = () => {
  const { theme } = useTheme();
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
    const complaintsRes = await api.get(url);
    let list = complaintsRes.data.data || [];
    if (!status) list = list.filter((c) => !["resolved", "closed"].includes(c.status));
    setActivities(list.slice(0, 5));
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
    } finally { setLoading(false); }
  }, [fetchComplaints]);

  useEffect(() => { fetchData(); }, [fetchData, user?.hostelId]);
  useEffect(() => { if (!loading) fetchComplaints(supportFilter).catch(console.error); }, [loading, supportFilter, fetchComplaints]);

  useEffect(() => {
    if (!socket) return;
    const h = (e, m) => { toast.success(m, { icon: "🔔" }); fetchData(); };
    socket.on("tenant_assigned", (d) => h(d, d.message));
    socket.on("tenant_removed", (d) => h(d, d.message));
    socket.on("payment_completed", (d) => h(d, d.message));
    socket.on("occupancy_update", () => fetchData());
    socket.on("complaint_created", () => fetchComplaints(supportFilterRef.current));
    socket.on("complaint_updated", () => fetchComplaints(supportFilterRef.current));
    return () => { ["tenant_assigned","tenant_removed","payment_completed","occupancy_update","complaint_created","complaint_updated"].forEach(e => socket.off(e)); };
  }, [socket, fetchData, fetchComplaints]);

  if (loading && !stats) return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`bg-white rounded-2xl border border-border p-7 space-y-4 ${i === 0 ? 'md:col-span-2' : ''}`}>
            <div className="shimmer w-12 h-12 rounded-full" />
            <div className="shimmer h-3 w-20" />
            <div className="shimmer h-8 w-32 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );

  if (error && !stats) return <ErrorRetry message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-10 pb-20">
      {/* ── Section header — like Vivanta's hero headline ── */}
      <div className="animate-slide-up-big">
        <div className="section-ornament-diamond mb-4">Overview</div>
        <h2 className="section-title">Live <span className="highlight">Overview</span></h2>
        <p className="section-sub">Real-time health and occupancy metrics for your facility.</p>
      </div>

      {/* ── Vivanta-style stat badges row ── */}
      {stats && (
        <div className="bg-white/60 backdrop-blur rounded-2xl border border-border/60 overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border/40">
            <StatBadge value={stats.totalTenants} label="Active Residents" icon={MdPeople} trend={<TrendBadge current={stats.totalTenants} previous={stats.previousTotalTenants} />} />
            <StatBadge value={stats.monthlyRevenue ?? 0} label="Monthly Income" prefix="₹" />
            <StatBadge value={expenseSummary?.thisMonthTotal ?? 0} label="Monthly Expenses" prefix="₹" />
            <StatBadge value={stats.activeComplaints} label="Active Tickets" />
          </div>
        </div>
      )}

      {/* ── Multi-Hostel Financial Overview ── */}
      {financialOverview && (
        <div className={`${theme === "theme-2" ? "rounded-lg" : "rounded-2xl"} bg-white border border-border overflow-hidden ${financialOverview.hostelCount > 1 ? '' : 'hidden'}`}>
          <div className={`px-6 py-5 border-b border-border/50 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${theme === "theme-2" ? "rounded-lg" : "rounded-xl"} bg-primary-light text-primary flex items-center justify-center`}>
                <MdAttachMoney size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">Multi-Hostel Financial Overview</h3>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">{financialOverview.hostelCount} properties active this month</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/40">
            <div className="p-6 text-center">
              <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Total Income</p>
              <p className="text-2xl font-black text-emerald-600">₹{financialOverview.totalIncome.toLocaleString()}</p>
            </div>
            <div className="p-6 text-center">
              <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Total Expenses</p>
              <p className="text-2xl font-black text-danger">₹{financialOverview.totalExpenses.toLocaleString()}</p>
            </div>
            <div className="p-6 text-center">
              <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Net Position</p>
              <p className={`text-2xl font-black ${financialOverview.net >= 0 ? 'text-emerald-600' : 'text-danger'}`}>
                ₹{financialOverview.net.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div className="stagger-container grid grid-cols-1 md:grid-cols-4 gap-6">
        <HeroStat title="Total Residents" value={stats.totalTenants} icon={MdPeople} TrendComponent={() => <TrendBadge current={stats.totalTenants} previous={stats.previousTotalTenants} />} subValue="Active" to="/admin/tenants" />
        <MiniStat title="Unpaid Bills" value={stats.unpaidPayments ?? 0} icon={MdAttachMoney} color="bg-amber-600" to="/admin/payments" />
        <MiniStat title="Monthly Revenue" value={stats.monthlyRevenue ?? 0} prefix="₹" icon={MdCurrencyRupee} color="bg-emerald-600" to="/admin/payments" />
        <MiniStat title="Active Tickets" value={stats.activeComplaints} icon={MdReportProblem} color="bg-zinc-600" to="/admin/complaints" />
      </div>

      {/* ── Support Tickets — like Vivanta's amenity card ── */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-7 pt-7 pb-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="section-ornament-diamond text-[9px]">Support Desk</span>
              <h3 className="text-xl font-bold font-display text-text-primary tracking-tight mt-1">Recent Tickets</h3>
            </div>
            <Link to="/admin/complaints" className="text-sm font-medium text-primary hover:text-primary-hover transition-colors inline-flex items-center gap-1">
              View All <MdArrowForward size={16} />
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 pb-5 border-b border-border/40">
            {SUPPORT_FILTERS.map(({ id, label }) => (
              <button key={id || "all"} onClick={() => setSupportFilter(id)}
                className={`px-5 py-2.5 rounded-[10px] text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  supportFilter === id ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-text-secondary border border-border/60 hover:border-border'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-7 pb-7 pt-4">
          {activities.length === 0 ? (
            <div className="py-16 text-center">
              <MdCheckCircle className="text-5xl mx-auto mb-3 text-emerald-500/25" />
              <p className="font-medium text-text-tertiary/50 text-xs uppercase tracking-wider">Zero unresolved tickets</p>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.map((activity, i) => (
                <div key={activity._id} className="stagger-enter" style={{ animationDelay: `${Math.min(i * 0.06, 0.3)}s` }}>
                  <div className="flex items-center gap-4 p-4 rounded-xl hover:bg-background/50 transition-all">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <MdNotificationsActive size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary text-sm leading-tight mb-0.5 truncate">{activity.description}</p>
                      <p className="text-[9px] text-text-tertiary font-medium uppercase tracking-wider">
                        {activity.tenantId?.name || "Resident"} • {new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className="badge-primary">{activity.status?.replace("_", " ")}</span>
                  </div>
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
