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
import toast from "react-hot-toast";

const TrendBadge = ({ current, previous }) => {
  if (previous === undefined || previous === null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.01) return null;
  const isUp = pct > 0;
  return (
    <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${isUp ? 'text-emerald-600' : 'text-danger'} bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/10`}>
      <MdTrendingUp size={12} className={isUp ? '' : 'rotate-180'} /> {isUp ? '+' : ''}{pct.toFixed(1)}%
    </div>
  );
};

const useAnimatedNumber = (target, duration = 800) => {
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

const HeroStat = ({ title, value, icon: Icon, subValue, trend, TrendComponent, to, prefix = "" }) => {
  const isMoney = title.toLowerCase().includes("collection") || title.toLowerCase().includes("revenue");
  const numericVal = isMoney ? parseInt(value?.replace(/[₹,]/g, "") || "0") : parseInt(value) || 0;
  const animated = useAnimatedNumber(numericVal);

  const content = (
    <div className="arch-card p-6 md:p-8 relative overflow-hidden col-span-1 md:col-span-2 row-span-1 group cursor-pointer">
      <div className="flex items-start justify-between mb-6">
        <div className="w-[72px] h-[72px] rounded-full bg-primary/10 border-2 border-primary/15 flex flex-col items-center justify-center">
          <Icon className="text-2xl text-primary" />
        </div>
        {TrendComponent && <TrendComponent />}
        {trend && (
          <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${trend.startsWith('+') ? 'text-emerald-600' : 'text-danger'} bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/10`}>
            <MdTrendingUp size={12} /> {trend}
          </div>
        )}
      </div>
      <h3 className="text-text-secondary text-[9px] font-bold uppercase tracking-[0.15em] mb-1">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold font-sans text-text-primary tracking-tight">
          {prefix}{isMoney ? animated.toLocaleString() : animated}
        </span>
        {subValue && <span className="text-text-secondary font-medium text-xs">{subValue}</span>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block cursor-pointer">{content}</Link> : content;
};

const MiniStat = ({ title, value, icon: Icon, color, to, prefix = "" }) => {
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const numericVal = parseFloat(cleaned) || 0;
  const animated = useAnimatedNumber(numericVal);

  const content = (
    <div className="origami-stat flex items-center gap-4 group">
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center shadow-md shrink-0`}>
        <Icon className="text-xl text-white" />
      </div>
      <div>
        <p className="text-[8px] font-bold font-body text-text-secondary uppercase tracking-[0.15em] leading-none mb-1">{title}</p>
        <p className="text-xl font-bold font-body text-text-primary tracking-tight">{prefix}{animated.toLocaleString()}</p>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block cursor-pointer">{content}</Link> : content;
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
      const [statsRes, expRes] = await Promise.all([
        api.get("/owner/dashboard"),
        api.get("/owner/expenses/summary"),
      ]);
      setStats(statsRes.data.data.stats || null);
      setExpenseSummary(expRes.data.data || null);
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
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`arch-card p-6 space-y-4 ${i === 0 ? 'md:col-span-2' : ''}`}>
            <div className="shimmer w-12 h-12 rounded-xl" />
            <div className="shimmer h-3 w-20" />
            <div className="shimmer h-8 w-32 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );

  if (error && !stats) return <ErrorRetry message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-8 pb-16">
      <header className="animate-slide-up-big">
        <div className="section-ornament-diamond mb-3">Pulse</div>
        <h2 className="section-title">Live <span className="highlight">Overview</span></h2>
        <p className="section-sub">Real-time health and occupancy metrics for your facility.</p>
      </header>

      <div className="stagger-container grid grid-cols-1 md:grid-cols-4 gap-5">
        <HeroStat title="Total Residents" value={stats.totalTenants} icon={MdPeople} TrendComponent={() => <TrendBadge current={stats.totalTenants} previous={stats.previousTotalTenants} />} subValue="Active" to="/admin/tenants" />
        <MiniStat title="Monthly Income" value={stats.monthlyRevenue ?? 0} prefix="₹" icon={MdCurrencyRupee} color="bg-emerald-600" to="/admin/payments" />
        <MiniStat title="Monthly Expenses" value={expenseSummary?.thisMonthTotal ?? 0} prefix="₹" icon={MdReceipt} color="bg-zinc-600" to="/admin/expenses" />
        <MiniStat title="Unpaid Bills" value={stats.unpaidPayments ?? 0} icon={MdAttachMoney} color="bg-amber-600" to="/admin/payments" />
        <MiniStat title="Active Tickets" value={stats.activeComplaints} icon={MdReportProblem} color="bg-zinc-600" to="/admin/complaints" />
      </div>

      {/* Support Tickets */}
      <div className="arch-card p-6 md:p-8 animate-fade-in" style={{ animationDelay: '0.3s' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold font-body text-text-primary uppercase tracking-[0.15em]">Support Tickets</h3>
              <div className="h-px flex-1 w-12 bg-border/60" />
            </div>
          </div>
          <Link to="/admin/complaints" className="btn-ghost inline-flex items-center gap-1.5 text-xs">
            Full Desk <MdArrowForward size={13} />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          {SUPPORT_FILTERS.map(({ id, label }) => (
            <button key={id || "all"} onClick={() => setSupportFilter(id)}
              className={`px-4 py-2.5 rounded-[14px] text-[8px] font-bold uppercase tracking-wider transition-all duration-300 ${
                supportFilter === id ? 'bg-primary text-white shadow-md shadow-primary/25' : 'bg-white/[0.04] text-text-secondary hover:bg-primary/5 hover:text-primary'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          {activities.length === 0 ? (
            <div className="py-16 text-center animate-fade-in">
              <MdCheckCircle className="text-5xl mx-auto mb-3 text-emerald-500/30" />
              <p className="font-medium text-text-secondary/50 text-xs uppercase tracking-wider">Zero unresolved tickets</p>
            </div>
          ) : (
            activities.map((activity, i) => (
              <div key={activity._id} className="stagger-enter" style={{ animationDelay: `${Math.min(i * 0.06, 0.3)}s` }}>
                <div className="flex items-center gap-4 p-4 rounded-[16px] hover:bg-primary/[0.02] transition-all group">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <MdNotificationsActive className="text-xl text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-primary text-sm leading-tight mb-0.5 truncate">{activity.description}</p>
                    <p className="text-[8px] text-text-secondary font-medium uppercase tracking-wider">
                      {activity.tenantId?.name || "Resident"} • {new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="badge-primary shrink-0">
                    {activity.status?.replace("_", " ")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
