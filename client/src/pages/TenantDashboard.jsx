import { useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import {
  MdMeetingRoom,
  MdAttachMoney,
  MdNotifications,
  MdReportProblem,
  MdChevronRight,
  MdHistory,
  MdAssignment,
  MdCheckCircle,
  MdSwapHoriz,
  MdAccessTime,
  MdRestaurant,
  MdGavel,
  MdExpandMore,
  MdExpandLess,
} from "react-icons/md";
import { Link } from "react-router-dom";

import { useSocket } from "../context/SocketContext";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import ErrorRetry from "../components/ErrorRetry";
import HostelRulesModal from "../components/HostelRulesModal";
import TenantVacateRequest from "../components/TenantVacateRequest";

// ── Static hostel info from .docx files ──
const FOOD_TIMINGS = [
  { meal: "Breakfast", time: "07:30 AM – 09:30 AM", emoji: "🍳" },
  { meal: "Lunch", time: "12:30 PM – 02:30 PM", emoji: "🍛" },
  { meal: "Dinner", time: "07:30 PM – 09:30 PM", emoji: "🌙" },
];

const WEEKLY_MENU = [
  {
    day: "Sun",
    breakfast: "Upma + Chutney",
    lunch: "Rice, Dal, Pachi Pulusu, Buttermilk",
    dinner: "Bagara Rice, Chicken Curry, Buttermilk",
  },
  {
    day: "Mon",
    breakfast: "Idli + Chutney",
    lunch: "Rice, Veg Curry, Dal, Buttermilk",
    dinner: "Chapati, Veg Curry, Sambar, Buttermilk",
  },
  {
    day: "Tue",
    breakfast: "Bonda + Chutney",
    lunch: "Rice, Veg Curry, Dal, Buttermilk",
    dinner: "Rice, Egg, Rasam, Buttermilk",
  },
  {
    day: "Wed",
    breakfast: "Uttapam / Dosa + Chutney",
    lunch: "Rice, Veg Curry, Dal, Buttermilk",
    dinner: "Rice, Chicken Curry, Buttermilk",
  },
  {
    day: "Thu",
    breakfast: "Tomato Rice / Kichidi / Upma + Chutney",
    lunch: "Rice, Veg Curry, Dal, Buttermilk",
    dinner: "Chapati, Veg Curry, Sambar, Buttermilk",
  },
  {
    day: "Fri",
    breakfast: "Poori + Curry",
    lunch: "Rice, Veg Curry, Dal, Buttermilk",
    dinner: "Rice, Egg, Rasam, Buttermilk",
  },
  {
    day: "Sat",
    breakfast: "Poha",
    lunch: "Rice, Veg Curry, Dal, Buttermilk",
    dinner: "Chapati, Veg Curry, Sambar, Buttermilk",
  },
];

const HOSTEL_RULES = [
  "Room rent must be paid within 2–3 days of the due date.",
  "A security deposit of ₹1000 is required and is non-refundable.",
  "Residents must inform at least 15 days in advance before vacating the hostel.",
  "Day rent is ₹300 per day.",
  "Any damage to the room will result in a fine of ₹1000–₹2000, depending on the damage.",
  "Smoking, spitting, and consumption of alcohol are strictly prohibited.",
];

// ── Collapsible Rules Card ──
const RulesCard = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="arch-card overflow-hidden animate-fade-in" style={{ animationDelay: "0.3s" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-black/[0.01] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MdGavel className="text-primary" size={22} />
          </div>
          <div>
            <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">
              Important
            </h3>
            <p className="text-base font-bold font-display text-text-primary tracking-tight">
              Hostel Rules &amp; Regulations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-text-tertiary hidden sm:block">
            {open ? "Collapse" : "View Rules"}
          </span>
          {open ? (
            <MdExpandLess size={20} className="text-text-tertiary" />
          ) : (
            <MdExpandMore size={20} className="text-text-tertiary" />
          )}
        </div>
      </button>
      {open && (
        <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-border/40 pt-5">
          {HOSTEL_RULES.map((rule, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200/40"
            >
              <span className="shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm font-medium text-text-primary leading-relaxed">{rule}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value, sub, icon: Icon, color }) => {
  return (
    <div className={`card card-lg group`}>
      <div
        className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-5 shadow-md`}
      >
        <Icon className="text-2xl text-white" />
      </div>
      <h3 className="text-text-secondary text-[8px] font-bold font-sans uppercase tracking-[0.15em] mb-1.5">
        {label}
      </h3>
      <p className="text-2xl font-bold font-numeric text-text-primary tracking-tight">{value}</p>
      <p className="text-[8px] text-text-secondary font-medium mt-1 uppercase tracking-tight">
        {sub}
      </p>
    </div>
  );
};

const TenantDashboard = () => {
  const { user } = useAuth();
  const [showRules, setShowRules] = useState(() => !sessionStorage.getItem("hostelRulesRead"));
  const { socket } = useSocket();
  const [inbox, setInbox] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [complaints, setComplaints] = useState([]);
  const [payments, setPayments] = useState([]);
  const [roomDetails, setRoomDetails] = useState(null);
  const [completeness, setCompleteness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const overdueDues = payments.reduce(
    (sum, p) => sum + ((p.paymentStatus || p.status) === "overdue" ? p.totalAmount || p.amount : 0),
    0
  );
  const unpaidDues = payments.reduce(
    (sum, p) =>
      sum +
      ((p.paymentStatus || p.status) !== "paid" && (p.paymentStatus || p.status) !== "overdue"
        ? p.totalAmount || p.amount
        : 0),
    0
  );

  const fetchData = useCallback(async (opts) => {
    setError(null);
    try {
      const [inboxRes, compRes, payRes, roomRes, completeRes] = await Promise.all([
        api.get("/tenant/inbox?limit=8", opts),
        api.get("/tenant/complaints", opts),
        api.get("/tenant/payments", opts),
        api.get("/tenant/room", opts).catch(() => null),
        api.get("/tenant/profile-completeness", opts).catch(() => null),
      ]);
      setInbox(inboxRes.data.data?.notifications || []);
      setUnreadCount(inboxRes.data.data?.unreadCount || 0);
      setComplaints(compRes.data.data || []);
      setPayments(payRes.data.data?.payments || []);
      setRoomDetails(roomRes?.data?.data || null);
      setCompleteness(completeRes?.data?.data || null);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Mark a single notification read (optimistic).
  const markNotificationRead = async (id) => {
    setInbox((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.post(`/tenant/inbox/${id}/read`);
    } catch {
      /* silent */
    }
  };

  const markAllNotificationsRead = async () => {
    if (unreadCount === 0) return;
    setInbox((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api.post("/tenant/inbox/read-all");
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    if (!socket) return;
    const handlers = {
      payment_completed: () => fetchData(),
      complaint_updated: () => fetchData(),
      notice_created: () => fetchData(),
      notice_deleted: () => fetchData(),
      // Refresh the completeness banner once an admin approves/rejects a profile request.
      profile_request_updated: () => fetchData(),
      // Room-shift / vacate request reviewed: refresh so statuses update live.
      bed_shift_request_updated: () => fetchData(),
      vacate_request_updated: () => fetchData(),
      // Durable-inbox event — refetch only when it's for me (or a broadcast).
      new_notification: (data) => {
        if (data?.broadcast || String(data?.tenantId) === String(user?.id)) fetchData();
      },
      // Waiting-queue auto-shift / bed assignment: refresh only when it's me.
      tenant_assigned: (data) => {
        if (!data?.tenantId || String(data.tenantId) === String(user?.id)) fetchData();
      },
    };
    Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn));
    return () => {
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn));
    };
  }, [socket, fetchData, user?.id]);

  // Socket-independent fallback (Vercel's serverless socket stub drops events):
  // refetch when the tab becomes visible and poll every 60s while it stays
  // visible, so admin actions / rent changes surface without a manual reload.
  useAutoRefresh(fetchData);

  if (error) return <ErrorRetry message={error} onRetry={fetchData} />;

  const handleRulesContinue = () => {
    sessionStorage.setItem("hostelRulesRead", "true");
    setShowRules(false);
  };

  if (loading)
    return (
      <div className="space-y-5">
        <div className={`shimmer h-24 w-full rounded-2xl`} />
        <div className="grid grid-cols-5 gap-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`shimmer h-40 rounded-2xl`} />
          ))}
        </div>
      </div>
    );

  return (
    <>
      {showRules && <HostelRulesModal onContinue={handleRulesContinue} />}
      <div className="space-y-8 pb-16">
        {/* Mandatory-info missing alert — shown until the info is approved + recorded */}
        {completeness && !completeness.isComplete && (
          <div
            className="rounded-2xl border-2 border-danger-border/50 bg-danger-bg/20 p-5 animate-slide-up-big"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-danger-bg flex items-center justify-center shrink-0 border border-danger-border/40">
                <MdReportProblem className="text-danger" size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold font-display text-danger">
                  Action required — complete your profile
                </p>
                <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                  The following mandatory details are missing from your profile. Please submit them
                  for admin review:
                </p>
                <ul className="mt-2 space-y-1">
                  {(completeness.missing || []).map((m) => (
                    <li
                      key={m.key}
                      className="flex items-center gap-2 text-[11px] font-medium text-text-secondary"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                      {m.label}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/tenant/profile"
                  className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-primary hover:underline"
                >
                  Update Profile <MdChevronRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Profile header */}
        <header className="arch-card p-7 md:p-9 animate-slide-up-big">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center text-white font-bold font-sans text-2xl shadow-md">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display text-text-primary tracking-tight">
                {user?.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-text-secondary">{user?.phone}</span>
                <span className="w-1 h-1 rounded-full bg-text-tertiary" />
                {completeness && !completeness.isComplete ? (
                  <span className="text-[8px] font-bold uppercase tracking-wider text-danger bg-danger-bg px-2 py-0.5 rounded-full border border-danger-border/40">
                    Incomplete Profile
                  </span>
                ) : (
                  <span className="text-[8px] font-bold uppercase tracking-wider text-success bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/10">
                    Verified
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Stats */}
        <div className="stagger-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
          {[
            {
              label: "Assigned Unit",
              value: `Room ${roomDetails?.room?.roomNumber || roomDetails?.room?.number || user?.roomDetails?.roomId?.number || "N/A"}`,
              sub: `Floor ${roomDetails?.room?.floor || roomDetails?.floorId?.number || roomDetails?.floorId?.floorNumber || user?.roomDetails?.floorId?.number || "0"}`,
              icon: MdMeetingRoom,
              color: "bg-primary",
            },
            {
              label: "Base Rent",
              value: `₹${(roomDetails?.room?.pricing || roomDetails?.room?.monthlyRent || user?.rentAmount || 0).toLocaleString()}`,
              sub: "Monthly cycle",
              icon: MdAttachMoney,
              color: "bg-emerald-600",
            },
            {
              label: "Overdue",
              value: `₹${overdueDues.toLocaleString()}`,
              sub: `${payments.filter((p) => (p.paymentStatus || p.status) === "overdue").length} month(s)`,
              icon: MdAssignment,
              color: "bg-primary",
            },
            {
              label: "Unpaid",
              value: `₹${unpaidDues.toLocaleString()}`,
              sub: `${payments.filter((p) => (p.paymentStatus || p.status) !== "paid" && (p.paymentStatus || p.status) !== "overdue").length} bill(s)`,
              icon: MdAttachMoney,
              color: "bg-amber-600",
            },
            {
              label: "Support",
              value: complaints.filter((c) => c.status !== "resolved").length,
              sub: "Active tickets",
              icon: MdReportProblem,
              color: "bg-zinc-600",
            },
          ].map((card, i) => (
            <div
              key={card.label}
              className={i % 2 === 0 ? "stagger-left" : "stagger-right"}
              style={{ animationDelay: `${Math.min(i * 0.08, 0.3)}s` }}
            >
              <StatCard {...card} />
            </div>
          ))}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Invoices */}
            <div className="arch-card p-6 md:p-7 animate-fade-in">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">
                    Financials
                  </h3>
                  <p className="text-base font-bold font-display text-text-primary tracking-tight">
                    Recent Invoices
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <MdHistory size={20} />
                </div>
              </div>
              <div className="space-y-2">
                {payments.length === 0 ? (
                  <div className="py-14 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-5 border border-amber-500/10">
                      <MdAttachMoney className="text-4xl text-amber-400/40" />
                    </div>
                    <p className="text-lg font-bold font-sans text-text-primary/50 tracking-tight mb-1">
                      No invoices yet
                    </p>
                    <p className="text-[10px] font-medium text-text-secondary/40 uppercase tracking-[0.15em]">
                      Your billing history will appear here
                    </p>
                  </div>
                ) : (
                  payments.map((p, i) => (
                    <div
                      key={p._id}
                      className="stagger-enter"
                      style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}
                    >
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-surface hover:bg-surface-hover border border-transparent hover:border-border/50 transition-all group">
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center ${(p.paymentStatus || p.status) === "paid" ? "bg-emerald-500/10 text-success" : "bg-accent-soft text-primary"}`}
                          >
                            <MdAttachMoney size={20} />
                          </div>
                          <div>
                            <p className="font-semibold text-text-primary text-sm leading-none mb-1">
                              {p.paymentMonth || p.month} {p.year}
                            </p>
                            <p className="text-[8px] font-medium text-text-secondary uppercase tracking-wider">
                              {(p.paymentStatus || p.status) === "paid"
                                ? `Paid on ${new Date(p.paidDate || p.updatedAt).toLocaleDateString()}`
                                : `${p.paymentStatus || p.status} — due ${new Date(p.dueDate).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold font-sans text-text-primary text-sm">
                            ₹{(p.totalAmount ?? p.amount)?.toLocaleString()}
                          </p>
                          <span
                            className={`badge mt-1 !text-[7px] ${
                              (p.paymentStatus || p.status) === "paid"
                                ? "badge-emerald"
                                : (p.paymentStatus || p.status) === "overdue"
                                  ? "badge-primary"
                                  : "badge-amber"
                            }`}
                          >
                            {p.paymentStatus || p.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Complaints */}
            <div
              className="arch-card p-6 md:p-7 animate-fade-in"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">
                    Support
                  </h3>
                  <p className="text-base font-bold font-display text-text-primary tracking-tight">
                    My Tickets
                  </p>
                </div>
                <Link
                  to="/tenant/complaints"
                  className="btn-ghost inline-flex items-center gap-1 text-xs p-2"
                >
                  View All <MdChevronRight size={14} />
                </Link>
              </div>
              <div className="space-y-2">
                {complaints.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-primary-light flex items-center justify-center mx-auto mb-4 border border-accent/10">
                      <MdReportProblem className="text-3xl text-primary/35" />
                    </div>
                    <p className="text-sm font-bold font-sans text-text-primary/50 tracking-tight mb-0.5">
                      All clear!
                    </p>
                    <p className="text-[9px] font-medium text-text-secondary/40 uppercase tracking-[0.12em]">
                      No support tickets raised
                    </p>
                  </div>
                ) : (
                  complaints.slice(0, 4).map((c, i) => (
                    <div
                      key={c._id}
                      className="stagger-enter"
                      style={{ animationDelay: `${Math.min(i * 0.06, 0.3)}s` }}
                    >
                      <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface hover:bg-surface-hover transition-all group border border-transparent hover:border-border/50">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            c.status === "resolved"
                              ? "bg-emerald-500/10 text-success"
                              : c.status === "in_progress"
                                ? "bg-secondary-light text-secondary"
                                : "bg-accent-soft text-primary"
                          }`}
                        >
                          <MdReportProblem size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-text-primary text-sm truncate">
                            {c.description}
                          </p>
                          <p className="text-[8px] text-text-secondary font-medium uppercase tracking-wider mt-0.5">
                            {c.category}
                          </p>
                        </div>
                        <span
                          className={`badge ${
                            c.status === "resolved"
                              ? "badge-emerald"
                              : c.status === "in_progress"
                                ? "badge-secondary"
                                : c.status === "pending"
                                  ? "badge-amber"
                                  : "badge-primary"
                          }`}
                        >
                          {c.status?.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Notifications (durable inbox) */}
            <div
              className="arch-card p-6 md:p-7 animate-fade-in"
              style={{ animationDelay: "0.3s" }}
            >
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">
                  Notifications
                </h3>
                {unreadCount > 0 ? (
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-[9px] font-bold text-primary hover:underline uppercase tracking-wider"
                  >
                    Mark all read ({unreadCount})
                  </button>
                ) : (
                  <MdNotifications className="text-text-tertiary" size={18} />
                )}
              </div>
              <div className="space-y-3">
                {inbox.length === 0 ? (
                  <div className="text-center py-10">
                    <div className="w-[68px] h-[68px] rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/10">
                      <MdCheckCircle className="text-3xl text-success/40" />
                    </div>
                    <p className="text-sm font-bold font-sans text-text-primary/50 tracking-tight">
                      All caught up!
                    </p>
                    <p className="text-[8px] text-text-secondary/30 font-medium uppercase tracking-[0.15em] mt-0.5">
                      No new notifications
                    </p>
                  </div>
                ) : (
                  inbox.map((n, i) => (
                    <button
                      key={n._id}
                      onClick={() => markNotificationRead(n._id)}
                      className={`w-full text-left flex gap-3 items-start stagger-enter transition-opacity ${
                        n.read ? "opacity-60" : ""
                      }`}
                      style={{ animationDelay: `${Math.min(i * 0.07, 0.3)}s` }}
                      aria-label={n.read ? "Read notification" : "Unread notification"}
                    >
                      {!n.read && (
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={`text-sm leading-snug ${n.read ? "font-medium text-text-secondary" : "font-semibold text-text-primary"}`}
                        >
                          {n.title}
                        </p>
                        <p className="text-[10px] text-text-secondary leading-snug mt-0.5">
                          {n.message}
                        </p>
                        <p className="text-[8px] text-text-secondary font-medium uppercase tracking-wider mt-0.5">
                          {new Date(n.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Room Shift Request — opens the dedicated request page */}
        <Link
          to="/tenant/room-shift"
          className="arch-card p-6 flex items-center justify-between group hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center">
              <MdSwapHoriz className="text-primary" size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-text-primary">
                Room Shift Request
              </h3>
              <p className="text-[10px] text-text-tertiary">Request to move to a different room</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-primary group-hover:translate-x-1 transition-transform">
            Request <MdChevronRight size={16} />
          </span>
        </Link>

        {/* Vacate Request */}
        <TenantVacateRequest />

        {/* ── Info Sections from .docx files ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Food Timings */}
          <div className="arch-card p-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <MdAccessTime className="text-amber-600" size={22} />
              </div>
              <div>
                <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">
                  Daily Schedule
                </h3>
                <p className="text-base font-bold font-display text-text-primary tracking-tight">
                  Food Timings
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {FOOD_TIMINGS.map(({ meal, time, emoji }) => (
                <div
                  key={meal}
                  className="flex items-center justify-between p-3 rounded-xl bg-amber-50/60 border border-amber-200/40"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{emoji}</span>
                    <span className="text-sm font-semibold text-text-primary">{meal}</span>
                  </div>
                  <span className="text-xs font-medium text-amber-700 bg-amber-100/80 px-2.5 py-1 rounded-lg font-mono">
                    {time}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10px] text-text-tertiary italic leading-relaxed border-t border-border/40 pt-3">
              ⚠️ After the above timings, food may not be available. Please plan accordingly.
            </p>
            <p className="mt-2 text-[10px] font-bold text-danger/80 uppercase tracking-wider">
              No Smoking • No Alcohol • No Drugs • No Spitting
            </p>
          </div>

          {/* Weekly Menu */}
          <div
            className="lg:col-span-2 arch-card p-6 animate-fade-in"
            style={{ animationDelay: "0.2s" }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <MdRestaurant className="text-emerald-600" size={22} />
              </div>
              <div>
                <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">
                  Sri Rama Hostel
                </h3>
                <p className="text-base font-bold font-display text-text-primary tracking-tight">
                  Weekly Menu
                </p>
              </div>
            </div>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs min-w-[520px]">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 px-2 text-[10px] font-bold text-text-tertiary uppercase tracking-wider w-12">
                      Day
                    </th>
                    <th className="text-left py-2 px-2 text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                      🍳 Breakfast
                    </th>
                    <th className="text-left py-2 px-2 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                      🍛 Lunch
                    </th>
                    <th className="text-left py-2 px-2 text-[10px] font-bold text-primary uppercase tracking-wider">
                      🌙 Dinner
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {WEEKLY_MENU.map(({ day, breakfast, lunch, dinner }, i) => {
                    const today = new Date().toLocaleDateString("en-US", { weekday: "short" });
                    const isToday = today === day;
                    return (
                      <tr
                        key={day}
                        className={`border-b border-border/30 transition-colors ${
                          isToday ? "bg-primary/[0.04]" : i % 2 === 0 ? "bg-black/[0.01]" : ""
                        }`}
                      >
                        <td className="py-2.5 px-2">
                          <span
                            className={`text-xs font-bold ${
                              isToday ? "text-primary" : "text-text-secondary"
                            }`}
                          >
                            {day}
                            {isToday && (
                              <span className="ml-1 text-[8px] bg-primary text-white px-1 py-0.5 rounded font-semibold">
                                Today
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-text-secondary leading-relaxed">
                          {breakfast}
                        </td>
                        <td className="py-2.5 px-2 text-text-secondary leading-relaxed">{lunch}</td>
                        <td className="py-2.5 px-2 text-text-secondary leading-relaxed">
                          {dinner}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] text-text-tertiary italic border-t border-border/40 pt-3">
              ** Note: Menu offerings may vary, and management reserves the right to make changes at
              any time.
            </p>
          </div>
        </div>

        {/* Hostel Rules — collapsible */}
        <RulesCard />
      </div>
    </>
  );
};

export default TenantDashboard;
