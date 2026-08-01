import { useEffect, useState, useRef, useCallback } from "react";
import api from "../api/axios";
import ErrorRetry from "../components/ErrorRetry";
import EmptyState from "../components/EmptyState";

import {
  MdPeople,
  MdReportProblem,
  MdAttachMoney,
  MdCheckCircle,
  MdTrendingUp,
  MdCurrencyRupee,
  MdArrowForward,
  MdWarning,
  MdPersonSearch,
  MdPayment,
  MdSwapHoriz,
  MdExitToApp,
} from "react-icons/md";
import { Link } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { usePaymentTotals } from "../context/PaymentContext";

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
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-success" : "text-danger"}`}
    >
      <MdTrendingUp size={12} className={up ? "" : "rotate-180"} />
      {up ? "+" : ""}
      {Math.abs(pct).toFixed(1)}%
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
        {prefix}
        {animated.toLocaleString()}
        {suffix}
      </p>
    </div>
  );
  return href ? (
    <Link to={href} className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
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
  const [hostelSummaryLoading, setHostelSummaryLoading] = useState(true);
  const [financialOverview, setFinancialOverview] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState({
    profile: 0,
    payment: 0,
    bedShift: 0,
    vacate: 0,
  });
  const [error, setError] = useState(null);
  const [supportFilter, setSupportFilter] = useState("");
  const supRef = useRef(supportFilter);
  const { socket } = useSocket();
  const { totals: paymentTotals, refreshTotals } = usePaymentTotals();

  // ── Incomplete Profile Alerts ──
  const [incompleteProfiles, setIncompleteProfiles] = useState([]);

  // ── Use refs to keep socket callbacks fresh ──
  const fetchDataRef = useRef(null);
  const fetchHostelSummariesRef = useRef(null);
  const fetchComplaintsRef = useRef(null);

  useEffect(() => {
    supRef.current = supportFilter;
  }, [supportFilter]);

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
    } catch {
      /* non-critical */
    }
  }, []);

  const fetchPendingRequests = useCallback(async () => {
    try {
      const [profile, payment, bedShift, vacate] = await Promise.all([
        api.get("/owner/profile-requests?status=pending").catch(() => ({ data: { data: [] } })),
        api.get("/owner/payment-requests?status=pending").catch(() => ({ data: { data: [] } })),
        api.get("/owner/bed-shift-requests?status=pending").catch(() => ({ data: { data: [] } })),
        api.get("/owner/vacate-requests?status=pending").catch(() => ({ data: { data: [] } })),
      ]);
      setPendingRequests({
        profile: (profile.data.data || []).length,
        payment: (payment.data.data || []).length,
        bedShift: (bedShift.data.data || []).length,
        vacate: (vacate.data.data || []).length,
      });
    } catch {
      /* non-critical */
    }
  }, []);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [s, e, f] = await Promise.all([
        api.get("/owner/dashboard", { _skipCache: true }),
        api.get("/owner/expenses/summary", { _skipCache: true }),
        api
          .get("/owner/financial-overview", { _skipCache: true })
          .catch(() => ({ data: { data: null } })),
      ]);
      setStats(s.data.data.stats || null);
      setExpenseSummary(e.data.data || null);
      if (f.data.data) setFinancialOverview(f.data.data);
      // Complaints are fetched by the dedicated [loading, supportFilter] effect —
      // fetching here too would duplicate the same request on every mount/switch.
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHostelSummaries = useCallback(async () => {
    setHostelSummaryLoading(true);
    try {
      const res = await api.get("/owner/hostels-summary");
      setHostelSummaries(res.data.data || []);
    } catch {
      /* non-critical — the Multi-Hostel box falls back to /owner/financial-overview */
    } finally {
      setHostelSummaryLoading(false);
    }
  }, []);

  // Keep refs in sync
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);
  useEffect(() => {
    fetchHostelSummariesRef.current = fetchHostelSummaries;
  }, [fetchHostelSummaries]);
  useEffect(() => {
    fetchComplaintsRef.current = fetchComplaints;
  }, [fetchComplaints]);

  const fullRefresh = useCallback(() => {
    if (fetchDataRef.current) fetchDataRef.current();
    if (fetchHostelSummariesRef.current) fetchHostelSummariesRef.current();
    if (fetchIncompleteProfiles) fetchIncompleteProfiles();
    if (fetchPendingRequests) fetchPendingRequests();
  }, [fetchIncompleteProfiles, fetchPendingRequests]);

  useEffect(() => {
    setStats(null);
    setExpenseSummary(null);
    setFinancialOverview(null);
    setLoading(true);
  }, [user?.hostelId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, user?.hostelId]);
  useEffect(() => {
    fetchHostelSummaries();
  }, [fetchHostelSummaries, hostels?.length]);
  useEffect(() => {
    fetchIncompleteProfiles();
  }, [fetchIncompleteProfiles, user?.hostelId]);
  useEffect(() => {
    fetchPendingRequests();
  }, [fetchPendingRequests, user?.hostelId]);

  // Re-fetch when tab regains focus — catches stale data if socket events were missed
  useEffect(() => {
    const onFocus = () => {
      fullRefresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fullRefresh]);

  useEffect(() => {
    if (!loading) fetchComplaints(supportFilter).catch(() => {});
  }, [loading, supportFilter, fetchComplaints]);

  // ── Socket listeners — use refs to always call the latest fetch functions ──
  useEffect(() => {
    if (!socket) return;
    const refreshPending = () => fetchPendingRequests();
    socket.on("tenant_assigned", fullRefresh);
    socket.on("tenant_removed", fullRefresh);
    socket.on("payment_completed", () => {
      fullRefresh();
      refreshTotals();
    });
    socket.on("occupancy_update", fullRefresh);
    socket.on("expense_updated", fullRefresh);
    socket.on("complaint_created", () => {
      if (fetchComplaintsRef.current) fetchComplaintsRef.current(supRef.current);
    });
    socket.on("complaint_updated", () => {
      if (fetchComplaintsRef.current) fetchComplaintsRef.current(supRef.current);
    });
    // Pending-request counters — refresh when any tenant submits or an admin acts
    socket.on("profile_request_created", refreshPending);
    socket.on("profile_request_updated", refreshPending);
    socket.on("payment_request_created", refreshPending);
    socket.on("payment_request_updated", refreshPending);
    socket.on("bed_shift_request_updated", refreshPending);
    socket.on("vacate_request_created", refreshPending);
    socket.on("vacate_request_updated", refreshPending);
    return () => {
      socket.off("tenant_assigned", fullRefresh);
      socket.off("tenant_removed", fullRefresh);
      socket.off("payment_completed");
      socket.off("occupancy_update", fullRefresh);
      socket.off("expense_updated", fullRefresh);
      socket.off("complaint_created");
      socket.off("complaint_updated");
      socket.off("profile_request_created", refreshPending);
      socket.off("profile_request_updated", refreshPending);
      socket.off("payment_request_created", refreshPending);
      socket.off("payment_request_updated", refreshPending);
      socket.off("bed_shift_request_updated", refreshPending);
      socket.off("vacate_request_created", refreshPending);
      socket.off("vacate_request_updated", refreshPending);
    };
  }, [socket, fullRefresh, refreshTotals, fetchPendingRequests]);

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

  // Multi-Hostel box data — prefer the cross-hostel /owner/financial-overview
  // payload (fetched alongside the dashboard with the main loader) and fall
  // back to summing the per-hostel hostels-summary rows when that endpoint is
  // unavailable. Both compute the same month totals (paid non-deposit payments
  // + this-month expenses across all the owner's hostels).
  const summaryTotalIncome = hostelSummaries.reduce((s, h) => s + (h.monthlyIncome || 0), 0);
  const summaryTotalExpenses = hostelSummaries.reduce((s, h) => s + (h.monthlyExpenses || 0), 0);
  const totalIncome = financialOverview ? (financialOverview.totalIncome ?? 0) : summaryTotalIncome;
  const totalExpenses = financialOverview
    ? (financialOverview.totalExpenses ?? 0)
    : summaryTotalExpenses;
  const net = financialOverview
    ? (financialOverview.net ?? totalIncome - totalExpenses)
    : totalIncome - totalExpenses;
  const propertyCount = financialOverview
    ? (financialOverview.hostelCount ?? hostelSummaries.length)
    : hostelSummaries.length;
  // financial-overview is resolved by the time the page renders (part of the
  // main fetchData Promise.all), so the box only needs its own skeleton while
  // the hostels-summary fallback is still in flight.
  const financialBoxLoading = !financialOverview && hostelSummaryLoading;
  // The backend reports the most recent month WITH activity (never an empty
  // current month at the start of a cycle) — surface that label.
  const financialMonthLabel = financialOverview?.month
    ? `${financialOverview.month}${financialOverview.year ? ` ${financialOverview.year}` : ""}`
    : "this month";

  return (
    <div className="space-y-6">
      {/* ═══ Section header — original pre-overhaul style ═══ */}
      <div className="animate-slide-up-big">
        <div className="section-ornament-diamond mb-4">Overview</div>
        <h2 className="section-title">
          Live <span className="highlight">Overview</span>
        </h2>
        <p className="section-sub">Real-time health and occupancy metrics for your facility.</p>
      </div>

      {/* ═══ Overview Cards ═══ */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Active Tenants"
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
      <div className="card">
        <div className="px-5 py-4 border-b border-border-light">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Multi-Hostel Financial Overview
              </h3>
              <p className="text-xs text-text-tertiary mt-0.5">
                {financialBoxLoading
                  ? "Loading properties..."
                  : `${propertyCount} ${propertyCount === 1 ? "property" : "properties"} · ${financialMonthLabel}`}
              </p>
            </div>
          </div>
        </div>
        {financialBoxLoading ? (
          <div className="grid grid-cols-3 divide-x divide-border-light">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-5 text-center space-y-2">
                <div className="skeleton h-3 w-20 mx-auto" />
                <div className="skeleton h-5 w-24 mx-auto" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 divide-x divide-border-light">
              <div className="p-5 text-center">
                <p className="text-xs font-medium text-text-tertiary mb-1">Total Income</p>
                <p className="text-xl font-semibold font-numeric text-success">
                  ₹{totalIncome.toLocaleString()}
                </p>
              </div>
              <div className="p-5 text-center">
                <p className="text-xs font-medium text-text-tertiary mb-1">Total Expenses</p>
                <p className="text-xl font-semibold font-numeric text-danger">
                  ₹{totalExpenses.toLocaleString()}
                </p>
              </div>
              <div className="p-5 text-center">
                <p className="text-xs font-medium text-text-tertiary mb-1">Net Position</p>
                <p
                  className={`text-xl font-semibold font-numeric ${net >= 0 ? "text-success" : "text-danger"}`}
                >
                  {net >= 0 ? "+" : ""}₹{net.toLocaleString()}
                </p>
              </div>
            </div>
            {propertyCount === 0 ? (
              <div className="px-5 pb-4 text-center">
                <p className="text-xs text-text-tertiary">
                  No hostels set up yet — create one to see monthly financials.
                </p>
              </div>
            ) : totalIncome === 0 && totalExpenses === 0 ? (
              <div className="px-5 pb-4 text-center">
                <p className="text-xs text-text-tertiary">
                  No income or expenses recorded this month yet.
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

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
              <Link to="/admin/complaints" className="btn btn-ghost btn-sm">
                View all <MdArrowForward size={14} />
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border-light">
              {SUPPORT_FILTERS.map(({ id, label }) => (
                <button
                  key={id || "all"}
                  onClick={() => setSupportFilter(id)}
                  className={`btn btn-sm ${supportFilter === id ? "btn-primary" : "btn-secondary"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-5">
            {activities.length === 0 ? (
              <EmptyState
                icon={MdCheckCircle}
                title="All clear"
                description="No open support tickets"
              />
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
                      <p className="text-sm font-medium text-text-primary truncate">
                        {a.title || a.description}
                      </p>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        {a.tenantId?.name || a.tenantId?.personalInfo?.name || "Tenant"}
                        {" · "}
                        {new Date(a.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <span
                      className={`badge ${
                        a.status === "pending"
                          ? "badge-warning"
                          : a.status === "in_progress" || a.status === "assigned"
                            ? "badge-info"
                            : "badge-success"
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

        {/* ── Pending Requests ── */}
        {(() => {
          const rows = [
            {
              key: "profile",
              label: "Profile Updates",
              desc: "Name, phone, Aadhaar changes",
              icon: MdPersonSearch,
              count: pendingRequests.profile,
              href: "/admin/requests?type=profile",
              color: "bg-violet-50 text-violet-600",
              badgeColor: "bg-violet-100 text-violet-700",
            },
            {
              key: "payment",
              label: "Payment Requests",
              desc: "Rent payment verifications",
              icon: MdPayment,
              count: pendingRequests.payment,
              href: "/admin/requests?type=payment",
              color: "bg-emerald-50 text-emerald-600",
              badgeColor: "bg-emerald-100 text-emerald-700",
            },
            {
              key: "bedShift",
              label: "Room Shift Requests",
              desc: "Bed / room transfer requests",
              icon: MdSwapHoriz,
              count: pendingRequests.bedShift,
              href: "/admin/requests?type=bed-shift",
              color: "bg-blue-50 text-blue-600",
              badgeColor: "bg-blue-100 text-blue-700",
            },
            {
              key: "vacate",
              label: "Vacate Requests",
              desc: "Tenant move-out notices",
              icon: MdExitToApp,
              count: pendingRequests.vacate,
              href: "/admin/requests?type=vacate",
              color: "bg-rose-50 text-rose-600",
              badgeColor: "bg-rose-100 text-rose-700",
            },
          ];
          const activeRows = rows.filter((r) => r.count > 0);

          return (
            <div className="card">
              <div className="px-5 py-4 border-b border-border-light">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-primary">Action Required</p>
                    <h3 className="text-sm font-semibold text-text-primary mt-0.5">
                      Pending Requests
                    </h3>
                  </div>
                  <Link to="/admin/requests" className="btn btn-ghost btn-sm">
                    View all <MdArrowForward size={14} />
                  </Link>
                </div>
              </div>
              <div className="p-5">
                {activeRows.length === 0 ? (
                  <EmptyState
                    icon={MdCheckCircle}
                    title="All clear"
                    description="No pending requests yet"
                  />
                ) : (
                  <div className="space-y-1">
                    {activeRows.map(
                      ({ key, label, desc, icon: Icon, count, href, color, badgeColor }) => (
                        <Link
                          key={key}
                          to={href}
                          className="flex items-center gap-3.5 p-3 rounded-lg hover:bg-neutral-50 transition-all group"
                        >
                          <div
                            className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center shrink-0`}
                          >
                            <Icon size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary">{label}</p>
                            <p className="text-xs text-text-tertiary mt-0.5">{desc}</p>
                          </div>
                          <span
                            className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full ${badgeColor} text-[11px] font-bold shrink-0`}
                          >
                            {count}
                          </span>
                          <MdArrowForward
                            size={14}
                            className="text-text-tertiary/40 group-hover:text-primary transition-colors shrink-0"
                          />
                        </Link>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ═══ Incomplete Profile Alerts (bottom of page) ═══ */}
      {incompleteProfiles.length > 0 && (
        <div className="card border-2 border-danger-border/60 bg-danger-bg/30">
          <div className="px-5 py-4 border-b border-danger-border/30 flex items-center gap-3">
            <MdWarning className="text-xl text-danger shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-danger">Immediate Action Required</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {incompleteProfiles.length} tenant profile{incompleteProfiles.length > 1 ? "s" : ""}{" "}
                with missing information
              </p>
            </div>
          </div>
          <div className="divide-y divide-danger-border/20">
            {incompleteProfiles.slice(0, 5).map((p) => (
              <div key={p._id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <Link
                    to={`/admin/tenants/${p._id}`}
                    className="text-sm font-semibold text-text-primary hover:text-primary transition-colors"
                  >
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
    </div>
  );
};

export default AdminDashboard;
