import React, { useEffect, useState, useRef, useCallback } from "react";
import api from "../api/axios";
import ErrorRetry from "../components/ErrorRetry";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import {
  MdPeople, MdReportProblem, MdAttachMoney,
  MdCheckCircle, MdTrendingUp, MdCurrencyRupee,
  MdArrowForward, MdAnnouncement, MdAdd, MdClose,
  MdWarning, MdNotificationImportant,
} from "react-icons/md";
import { Link } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { usePaymentTotals } from "../context/PaymentContext";
import toast from "react-hot-toast";
import { getApiError } from "../utils/getApiError";

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
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-success" : "text-danger"}`}>
      <MdTrendingUp size={12} className={up ? "" : "rotate-180"} />
      {up ? "+" : ""}{Math.abs(pct).toFixed(1)}%
    </span>
  );
};

// ── Stat card ──
const StatCard = ({ label, value, icon: Icon, href, prefix = "", suffix = "", trend }) => {
  const numeric = parseInt(String(value ?? 0).replace(/[^0-9.-]/g, "") || "0") || 0;
  const animated = useAnimatedNumber(numeric);
  const card = (
    <div className="card card-md card-hover h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center">
          <Icon className="text-lg text-primary" />
        </div>
        {trend && <TrendBadge current={numeric} previous={trend} />}
      </div>
      <p className="text-xs font-medium text-text-tertiary mb-0.5">{label}</p>
      <p className="text-2xl font-semibold font-numeric text-text-primary tracking-tight leading-none">
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

const NOTICE_TYPES = [
  { id: "general", label: "General" },
  { id: "maintenance", label: "Maintenance" },
  { id: "water_shutdown", label: "Water" },
  { id: "emergency", label: "Emergency" },
  { id: "curfew", label: "Curfew" },
  { id: "fee_reminder", label: "Fee Reminder" },
];

const AdminDashboard = () => {
  const { user, hostels } = useAuth();
  const [stats, setStats] = useState(null);
  const [expenseSummary, setExpenseSummary] = useState(null);
  const [hostelSummaries, setHostelSummaries] = useState([]);
  const [financialOverview, setFinancialOverview] = useState(null);
  const [activities, setActivities] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [supportFilter, setSupportFilter] = useState("");
  const supRef = useRef(supportFilter);
  const { socket } = useSocket();
  const { totals: paymentTotals, refreshTotals } = usePaymentTotals();

  // ── Inline Notice Creation ──
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [noticeForm, setNoticeForm] = useState({
    title: "",
    message: "",
    type: "general",
    priority: "medium",
  });

  // ── Incomplete Profile Alerts ──
  const [incompleteProfiles, setIncompleteProfiles] = useState([]);

  // ── Use refs to keep socket callbacks fresh ──
  const fetchDataRef = useRef(null);
  const fetchHostelSummariesRef = useRef(null);
  const fetchComplaintsRef = useRef(null);

  useEffect(() => { supRef.current = supportFilter; }, [supportFilter]);

  const fetchComplaints = useCallback(async (status) => {
    const url = status ? `/owner/complaints?status=${status}` : "/owner/complaints";
    const res = await api.get(url);
    const list = res.data.data || [];
    setActivities(
      (status ? list : list.filter((c) => !["resolved", "closed"].includes(c.status))).slice(0, 6)
    );
  }, []);

  const fetchIncompleteProfiles = useCallback(async () => {
    try {
      const res = await api.get("/owner/tenants/incomplete-profiles");
      setIncompleteProfiles(Array.isArray(res.data.data) ? res.data.data : []);
    } catch { /* non-critical */ }
  }, []);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [s, e, f, n] = await Promise.all([
        api.get("/owner/dashboard"),
        api.get("/owner/expenses/summary"),
        api.get("/owner/financial-overview").catch(() => ({ data: { data: null } })),
        api.get("/owner/notices").catch(() => ({ data: { data: [] } })),
      ]);
      setStats(s.data.data.stats || null);
      setExpenseSummary(e.data.data || null);
      if (f.data.data) setFinancialOverview(f.data.data);
      setNotices((n.data.data || []).slice(0, 5));
      await fetchComplaints(supRef.current);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [fetchComplaints]);

  const fetchHostelSummaries = useCallback(async () => {
    try {
      const res = await api.get("/owner/hostels-summary");
      setHostelSummaries(res.data.data || []);
    } catch { /* non-critical */ }
  }, []);

  // Keep refs in sync
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);
  useEffect(() => { fetchHostelSummariesRef.current = fetchHostelSummaries; }, [fetchHostelSummaries]);
  useEffect(() => { fetchComplaintsRef.current = fetchComplaints; }, [fetchComplaints]);

  const fullRefresh = useCallback(() => {
    if (fetchDataRef.current) fetchDataRef.current();
    if (fetchHostelSummariesRef.current) fetchHostelSummariesRef.current();
    if (fetchIncompleteProfiles) fetchIncompleteProfiles();
  }, [fetchIncompleteProfiles]);

  const handleCreateNotice = async (e) => {
    e.preventDefault();
    if (!noticeForm.title.trim() || !noticeForm.message.trim()) {
      return toast.error("Title and message are required");
    }
    try {
      await api.post("/owner/notices", noticeForm);
      toast.success("Notice posted");
      setShowNoticeForm(false);
      setNoticeForm({ title: "", message: "", type: "general", priority: "medium" });
      fetchData();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const handleDeleteNotice = async (id) => {
    if (!window.confirm("Remove this notice?")) return;
    try {
      await api.delete(`/owner/notices/${id}`);
      toast.success("Notice removed");
      fetchData();
    } catch (error) {
      toast.error("Failed to remove notice");
    }
  };

  useEffect(() => {
    setStats(null);
    setExpenseSummary(null);
    setLoading(true);
  }, [user?.hostelId]);

  useEffect(() => { fetchData(); }, [fetchData, user?.hostelId]);
  useEffect(() => { fetchHostelSummaries(); }, [fetchHostelSummaries, hostels?.length]);
  useEffect(() => { fetchIncompleteProfiles(); }, [fetchIncompleteProfiles, user?.hostelId]);

  // Re-fetch when tab regains focus — catches stale data if socket events were missed
  useEffect(() => {
    const onFocus = () => { fullRefresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fullRefresh]);

  useEffect(() => {
    if (!loading) fetchComplaints(supportFilter).catch(() => {});
  }, [loading, supportFilter, fetchComplaints]);

  // ── Socket listeners — use refs to always call the latest fetch functions ──
  useEffect(() => {
    if (!socket) return;
    socket.on("tenant_assigned", fullRefresh);
    socket.on("tenant_removed", fullRefresh);
    socket.on("payment_completed", () => {
      fullRefresh();
      refreshTotals();
    });
    socket.on("occupancy_update", fullRefresh);
    socket.on("expense_updated", fullRefresh);
    socket.on("notice_created", (notice) => {
      setNotices((prev) => [notice, ...prev.filter((n) => n._id !== notice._id)].slice(0, 5));
    });
    socket.on("complaint_created", () => {
      if (fetchComplaintsRef.current) fetchComplaintsRef.current(supRef.current);
    });
    socket.on("complaint_updated", () => {
      if (fetchComplaintsRef.current) fetchComplaintsRef.current(supRef.current);
    });
    return () => {
      socket.off("tenant_assigned", fullRefresh);
      socket.off("tenant_removed", fullRefresh);
      socket.off("payment_completed");
      socket.off("occupancy_update", fullRefresh);
      socket.off("expense_updated", fullRefresh);
      socket.off("notice_created");
      socket.off("complaint_created");
      socket.off("complaint_updated");
    };
  }, [socket, fullRefresh]);

  if (error && !stats) return <ErrorRetry message={error} onRetry={fetchData} />;

  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card card-md">
            <div className="skeleton w-9 h-9 rounded-lg mb-3" />
            <div className="skeleton h-3 w-20 mb-2" />
            <div className="skeleton h-7 w-28" />
          </div>
        ))}
      </div>
    );
  }

  const totalIncome = hostelSummaries.reduce((s, h) => s + (h.monthlyIncome || 0), 0);
  const totalExpenses = hostelSummaries.reduce((s, h) => s + (h.monthlyExpenses || 0), 0);
  const net = totalIncome - totalExpenses;

  return (
    <div className="space-y-6">
      {/* ═══ Section header — original pre-overhaul style ═══ */}
      <div className="animate-slide-up-big">
        <div className="section-ornament-diamond mb-4">Overview</div>
        <h2 className="section-title">Live <span className="highlight">Overview</span></h2>
        <p className="section-sub">Real-time health and occupancy metrics for your facility.</p>
      </div>

      {/* ═══ Incomplete Profile Alerts ═══ */}
      {incompleteProfiles.length > 0 && (
        <div className="card border-2 border-danger-border/60 bg-danger-bg/30">
          <div className="px-5 py-4 border-b border-danger-border/30 flex items-center gap-3">
            <MdWarning className="text-xl text-danger shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-danger">Immediate Action Required</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {incompleteProfiles.length} resident profile{incompleteProfiles.length > 1 ? "s" : ""} with missing information
              </p>
            </div>
          </div>
          <div className="divide-y divide-danger-border/20">
            {incompleteProfiles.slice(0, 5).map((p) => (
              <div key={p._id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <Link to={`/admin/tenants/${p._id}`} className="text-sm font-semibold text-text-primary hover:text-primary transition-colors">
                    {p.name}
                  </Link>
                  <p className="text-[10px] text-danger font-medium mt-0.5">
                    Missing: {p.missing.join(", ")}
                  </p>
                </div>
                <Link
                  to={`/admin/tenants/${p._id}`}
                  className="text-[9px] font-bold uppercase tracking-wider text-primary hover:text-primary-hover shrink-0"
                >
                  Update
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Overview Cards ═══ */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Active Residents"
            value={stats.totalTenants}
            icon={MdPeople}
            href="/admin/tenants"
            trend={stats.previousTotalTenants}
          />
          <StatCard
            label="Monthly Income"
            value={stats?.monthlyRevenue ?? 0}
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
            label="Raised Tokens"
            value={stats.activeComplaints ?? 0}
            icon={MdReportProblem}
            href="/admin/complaints"
          />
          {hostelSummaries.length > 0 && (
            <div className="card card-md card-hover h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center">
                  <MdAttachMoney className="text-lg text-primary" />
                </div>
              </div>
              <p className="text-xs font-medium text-text-tertiary mb-0.5">Total Unpaid Bills</p>
              <p className="text-2xl font-semibold font-numeric text-text-primary tracking-tight leading-none">
                ₹{(paymentTotals.totalPending + paymentTotals.totalOverdue).toLocaleString()}
              </p>
              <p className="text-xs text-text-tertiary mt-auto pt-2">
                {paymentTotals.unpaidCount + paymentTotals.overdueCount} outstanding
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══ Multi-Hostel Section ═══ */}
      {hostelSummaries.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-border-light">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Multi-Hostel Financial Overview</h3>
                <p className="text-xs text-text-tertiary mt-0.5">{hostelSummaries.length} properties active this month</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border-light">
            <div className="p-5 text-center">
              <p className="text-xs font-medium text-text-tertiary mb-1">Total Income</p>
              <p className="text-xl font-semibold font-numeric text-success">₹{totalIncome.toLocaleString()}</p>
            </div>
            <div className="p-5 text-center">
              <p className="text-xs font-medium text-text-tertiary mb-1">Total Expenses</p>
              <p className="text-xl font-semibold font-numeric text-danger">₹{totalExpenses.toLocaleString()}</p>
            </div>
            <div className="p-5 text-center">
              <p className="text-xs font-medium text-text-tertiary mb-1">Net Position</p>
              <p className={`text-xl font-semibold font-numeric ${net >= 0 ? "text-success" : "text-danger"}`}>
                {net >= 0 ? "+" : ""}₹{net.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Support Desk + Notices Side by Side ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Support Desk ── */}
        <div className="card">
          <div className="px-5 py-4 border-b border-border-light">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-primary">Support Desk</p>
                <h3 className="text-sm font-semibold text-text-primary mt-0.5">Recent Tickets</h3>
              </div>
              <Link
                to="/admin/complaints"
                className="btn btn-ghost btn-sm"
              >
                View all <MdArrowForward size={14} />
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border-light">
              {SUPPORT_FILTERS.map(({ id, label }) => (
                <button
                  key={id || "all"}
                  onClick={() => setSupportFilter(id)}
                  className={`btn btn-sm ${
                    supportFilter === id ? "btn-primary" : "btn-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-5">
            {activities.length === 0 ? (
              <EmptyState icon={MdCheckCircle} title="All clear" description="No open support tickets" />
            ) : (
              <div className="space-y-1">
                {activities.map((a) => (
                  <div
                    key={a._id}
                    className="flex items-center gap-3.5 p-3 rounded-lg hover:bg-neutral-50 transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center shrink-0">
                      <MdReportProblem size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{a.title || a.description}</p>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        {a.tenantId?.name || a.tenantId?.personalInfo?.name || "Resident"}
                        {" · "}
                        {new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <span className={`badge ${
                      a.status === "pending" ? "badge-warning" :
                      a.status === "in_progress" || a.status === "assigned" ? "badge-info" :
                      "badge-success"
                    }`}>
                      {a.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Hostel Notices ── */}
        <div className="card">
          <div className="px-5 py-4 border-b border-border-light flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-primary">Hostel Notices</p>
              <h3 className="text-sm font-semibold text-text-primary mt-0.5">Recent Notices</h3>
            </div>
            <Button
              onClick={() => setShowNoticeForm(true)}
              icon={MdAdd}
              variant="primary"
              size="sm"
            >
              Add
            </Button>
          </div>
          <div className="p-5 max-h-[320px] overflow-y-auto">
            {notices.length === 0 ? (
              <EmptyState icon={MdCheckCircle} title="No notices yet" description="Click + to create one" />
            ) : (
              <div className="space-y-1">
                {notices.map((n) => (
                  <div
                    key={n._id}
                    className={`flex items-start gap-3.5 p-3 rounded-lg transition-all group ${
                      n.type === "system_incomplete_profile"
                        ? "bg-danger-bg/30 border border-danger-border/30"
                        : "hover:bg-neutral-50"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      n.type === "system_incomplete_profile"
                        ? "bg-danger-bg text-danger"
                        : "bg-primary-light text-primary"
                    }`}>
                      {n.type === "system_incomplete_profile"
                        ? <MdNotificationImportant size={16} />
                        : <MdAnnouncement size={16} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        n.type === "system_incomplete_profile" ? "text-danger" : "text-text-primary"
                      }`}>{n.title}</p>
                      {n.message && (
                        <p className={`text-xs mt-0.5 line-clamp-2 ${
                          n.type === "system_incomplete_profile" ? "text-danger/70" : "text-text-tertiary"
                        }`}>{n.message}</p>
                      )}
                      <p className="text-[10px] text-text-tertiary/60 mt-1 font-medium">
                        {new Date(n.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {n.priority === "high" && (
                      <span className="badge badge-danger text-[8px] shrink-0 mt-0.5">High</span>
                    )}
                    {n.type && n.type !== "system_incomplete_profile" && n.type !== "high" && (
                      <span className="badge badge-neutral text-[10px] shrink-0 mt-0.5">
                        {n.type.replace("_", " ")}
                      </span>
                    )}
                    {n.type !== "system_incomplete_profile" && (
                      <button
                        onClick={() => handleDeleteNotice(n._id)}
                        className="p-1 text-text-secondary/30 hover:text-danger opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5"
                        title="Remove notice"
                      >
                        <MdClose size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* View All at bottom */}
          <div className="border-t border-border-light px-5 py-3 text-center">
            <Link
              to="/admin/notifications"
              className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-primary hover:text-primary-hover transition-colors"
            >
              View All Notices <MdArrowForward size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* ═══ Inline Notice Creation Modal ═══ */}
      {showNoticeForm && (
        <div className="modal-overlay">
          <form onSubmit={handleCreateNotice} className="modal-card max-w-lg p-6 md:p-7 space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold font-display text-text-primary tracking-tight">Post Notice</h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">Broadcast to residents</p>
              </div>
              <button type="button" onClick={() => setShowNoticeForm(false)} className={`w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-accent hover:bg-accent-soft transition-all`}>
                <MdClose size={20} />
              </button>
            </div>
            <input required placeholder="Title (e.g. Water supply disruption)" className="field"
              value={noticeForm.title} onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-4">
              <select className="field-select" value={noticeForm.type}
                onChange={(e) => setNoticeForm({ ...noticeForm, type: e.target.value })}>
                {NOTICE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <select className="field-select" value={noticeForm.priority}
                onChange={(e) => setNoticeForm({ ...noticeForm, priority: e.target.value })}>
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
            </div>
            <textarea required rows={4} placeholder="Detailed message for all residents..." className="field"
              value={noticeForm.message} onChange={(e) => setNoticeForm({ ...noticeForm, message: e.target.value })} />
            <Button type="submit" fullWidth size="lg">
              Broadcast to Residents
            </Button>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
