import React, { useEffect, useState, useRef, useCallback } from "react";
import api from "../api/axios";
import ErrorRetry from "../components/ErrorRetry";
import {
  MdPeople, MdReportProblem,
  MdCheckCircle, MdTrendingUp,
  MdArrowForward,
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

// ── Stat badge row (the original overview table) ──
const StatBadge = ({ value, label, icon: Icon, trend, prefix = "" }) => {
  const cleaned = String(value ?? 0).replace(/[^0-9.-]/g, "");
  const numericVal = parseFloat(cleaned) || 0;
  const animated = useAnimatedNumber(numericVal);
  return (
    <div className="flex flex-col items-center py-6 px-2">
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/15 flex items-center justify-center mb-3">
          <Icon className="text-lg text-primary" />
        </div>
      )}
      <span className="text-3xl font-bold font-display text-text-primary tracking-tight">
        {prefix}{animated.toLocaleString()}
      </span>
      <span className="text-[10px] font-medium text-text-secondary uppercase tracking-[0.12em] mt-1 text-center leading-tight">
        {label}
      </span>
      {trend && <div className="mt-1.5">{trend}</div>}
    </div>
  );
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

  // Clear stale dashboard state when hostel changes — prevents old cards from flashing
  useEffect(() => {
    setStats(null);
    setExpenseSummary(null);
    setLoading(true);
  }, [user?.hostelId]);

  useEffect(() => { fetchData(); }, [fetchData, user?.hostelId]);

  useEffect(() => {
    if (!loading) fetchComplaints(supportFilter).catch(() => {});
  }, [loading, supportFilter, fetchComplaints]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchData();
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
  }, [socket, fetchData, fetchComplaints]);

  if (error && !stats) return <ErrorRetry message={error} onRetry={fetchData} />;

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
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
      {/* ── Stat badge table ── */}
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
