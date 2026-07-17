import React, { useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import {
  MdMeetingRoom, MdAttachMoney, MdNotifications,
  MdReportProblem, MdBed, MdChevronRight, MdHistory,
  MdAssignment, MdEvent, MdShield, MdCheckCircle
} from "react-icons/md";
import { Link } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import ErrorRetry from "../components/ErrorRetry";
import toast from "react-hot-toast";

const StatCard = ({ label, value, sub, icon: Icon, color }) => (
  <div className="arch-card p-6 md:p-7 group relative overflow-hidden">
    <div className={`relative w-12 h-[54px] flex items-center justify-center mb-5`}>
      <div className={`absolute inset-0 ${color} rounded-[8px] rounded-b-[16px] shadow-lg`}></div>
      <div className="absolute top-[2px] left-[3px] right-[3px] h-[5px] bg-white/10 rounded-t-[5px]"></div>
      <Icon className="text-2xl text-white relative z-10" />
    </div>
    <h3 className="text-text-secondary text-[8px] font-bold font-sans uppercase tracking-[0.15em] mb-1.5">{label}</h3>
    <p className="text-2xl font-bold font-display text-text-primary tracking-tight">{value}</p>
    <p className="text-[8px] text-text-secondary font-medium mt-1 uppercase tracking-tight">{sub}</p>
  </div>
);

const TenantDashboard = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [payments, setPayments] = useState([]);
  const [roomDetails, setRoomDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const overdueDues = payments.reduce((sum, p) => sum + ((p.paymentStatus || p.status) === "overdue" ? (p.totalAmount || p.amount) : 0), 0);
  const unpaidDues = payments.reduce((sum, p) => sum + ((p.paymentStatus || p.status) !== "paid" && (p.paymentStatus || p.status) !== "overdue" ? (p.totalAmount || p.amount) : 0), 0);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [notifRes, compRes, payRes, roomRes] = await Promise.all([
        api.get("/tenant/notifications?limit=5"),
        api.get("/tenant/complaints"),
        api.get("/tenant/payments"),
        api.get("/tenant/room").catch(() => null),
      ]);
      setNotifications(notifRes.data.data || []);
      setComplaints(compRes.data.data || []);
      setPayments(payRes.data.data?.payments || []);
      setRoomDetails(roomRes?.data?.data || null);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load dashboard");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    const handlers = {
      payment_completed: () => fetchData(),
      complaint_updated: () => fetchData(),
      new_notification: () => fetchData(),
    };
    Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn));
    return () => {
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn));
    };
  }, [socket, fetchData]);

  if (error) return <ErrorRetry message={error} onRetry={fetchData} />;
  if (loading) return (
    <div className="space-y-5">
      <div className="shimmer h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-5 gap-5">
        {[...Array(5)].map((_, i) => <div key={i} className="shimmer h-40 rounded-2xl" />)}
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-16">
      {/* Profile header — arch card */}
      <header className="arch-card p-7 md:p-9 animate-slide-up-big relative overflow-hidden">
        <div className="flex items-center gap-5 relative">
          <div className="relative w-16 h-[72px] flex items-center justify-center">
            <div className="absolute inset-0 bg-primary rounded-[10px] rounded-b-[18px] shadow-md shadow-primary/20"></div>
            <div className="absolute top-[3px] left-[4px] right-[4px] h-[6px] bg-white/10 rounded-t-[6px]"></div>
            <span className="text-white font-bold font-display text-2xl relative z-10">
              {user?.name?.[0]?.toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-text-primary tracking-tight">
              {user?.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-text-secondary">{user?.phone}</span>
              <span className="w-1 h-1 rounded-full bg-text-tertiary" />
              <span className="text-[8px] font-bold uppercase tracking-wider text-success bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/10">
                Verified Resident
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Stats - staggered */}
      <div className="stagger-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
        {[
          { label: "Assigned Unit", value: `Room ${roomDetails?.room?.roomNumber || roomDetails?.room?.number || user?.roomDetails?.roomId?.number || 'N/A'}`, sub: `Floor ${roomDetails?.room?.floor || roomDetails?.floorId?.number || roomDetails?.floorId?.floorNumber || user?.roomDetails?.floorId?.number || '0'}`, icon: MdMeetingRoom, color: "bg-primary" },
          { label: "Base Rent", value: `₹${(roomDetails?.room?.pricing || roomDetails?.room?.monthlyRent || user?.rentAmount || 0).toLocaleString()}`, sub: "Monthly cycle", icon: MdAttachMoney, color: "bg-emerald-600" },
          { label: "Overdue", value: `₹${overdueDues.toLocaleString()}`, sub: `${payments.filter((p) => (p.paymentStatus || p.status) === "overdue").length} month(s)`, icon: MdAssignment, color: "bg-primary" },
          { label: "Unpaid", value: `₹${unpaidDues.toLocaleString()}`, sub: `${payments.filter((p) => (p.paymentStatus || p.status) !== "paid" && (p.paymentStatus || p.status) !== "overdue").length} bill(s)`, icon: MdAttachMoney, color: "bg-amber-600" },
          { label: "Support", value: complaints.filter(c => c.status !== 'resolved').length, sub: "Active tickets", icon: MdReportProblem, color: "bg-zinc-600" },
        ].map((card, i) => (
          <div key={card.label} className={i % 2 === 0 ? 'stagger-left' : 'stagger-right'} style={{ animationDelay: `${Math.min(i * 0.08, 0.3)}s` }}>
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
              <div className="relative w-10 h-[44px] flex items-center justify-center">
                <div className="absolute inset-0 bg-primary/10 rounded-[6px] rounded-b-[14px]"></div>
                <div className="absolute top-[2px] left-[2px] right-[2px] h-[4px] bg-primary/10 rounded-t-[4px]"></div>
                <MdHistory className="text-xl text-primary relative z-10" />
              </div>
            </div>
            <div className="space-y-2">
              {payments.length === 0 ? (
                <div className="py-14 text-center relative">
                  <div className="relative inline-block mb-5">
                    <div className="w-20 h-20 rounded-[24px] bg-amber-500/10 flex items-center justify-center border border-amber-500/10">
                      <MdAttachMoney className="text-4xl text-amber-400/40" />
                    </div>
                  </div>
                  <p className="text-lg font-bold font-display text-text-primary/50 tracking-tight mb-1">No invoices yet</p>
                  <p className="text-[10px] font-medium text-text-secondary/40 uppercase tracking-[0.15em]">Your billing history will appear here</p>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-px bg-black/5" />
                </div>
              ) : (
                payments.map((p, i) => (
                  <div key={p._id} className="stagger-enter" style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}>
                    <div className="flex items-center justify-between p-4 rounded-[16px] bg-surface hover:bg-surface-hover border border-transparent hover:border-border/50 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className={`relative w-10 h-[44px] flex items-center justify-center ${(p.paymentStatus || p.status) === 'paid' ? '' : ''}`}>
                          <div className={`absolute inset-0 rounded-[6px] rounded-b-[14px] ${(p.paymentStatus || p.status) === 'paid' ? 'bg-emerald-500/10' : 'bg-accent-soft'}`}></div>
                          <div className={`absolute top-[2px] left-[2px] right-[2px] h-[4px] rounded-t-[4px] ${(p.paymentStatus || p.status) === 'paid' ? 'bg-emerald-500/10' : 'bg-accent-soft'}`}></div>
                          <MdAttachMoney className={`text-lg relative z-10 ${(p.paymentStatus || p.status) === 'paid' ? 'text-success' : 'text-primary'}`} />
                        </div>
                        <div>
                          <p className="font-semibold text-text-primary text-sm leading-none mb-1">{p.paymentMonth || p.month} {p.year}</p>
                          <p className="text-[8px] font-medium text-text-secondary uppercase tracking-wider">
                            {(p.paymentStatus || p.status) === 'paid' ? `Paid on ${new Date(p.paidDate || p.updatedAt).toLocaleDateString()}` : `${p.paymentStatus || p.status} — due ${new Date(p.dueDate).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold font-display text-text-primary text-sm">₹{p.amount?.toLocaleString()}</p>
                        <span className={`badge mt-1 !text-[7px] ${
                          (p.paymentStatus || p.status) === 'paid' ? 'badge-emerald' : (p.paymentStatus || p.status) === 'overdue' ? 'badge-primary' : 'badge-amber'
                        }`}>
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
          <div className="arch-card p-6 md:p-7 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">Support</h3>
                <p className="text-base font-bold font-display text-text-primary tracking-tight">My Tickets</p>
              </div>
              <Link to="/tenant/complaints" className="btn-ghost inline-flex items-center gap-1 text-xs p-2">
                View All <MdChevronRight size={14} />
              </Link>
            </div>
            <div className="space-y-2">
              {complaints.length === 0 ? (
                <div className="py-12 text-center relative">
                  <div className="relative inline-block mb-4">
                    <div className="w-16 h-16 rounded-[20px] bg-primary-light flex items-center justify-center border border-accent/10">
                      <MdReportProblem className="text-3xl text-primary/35" />
                    </div>
                  </div>
                  <p className="text-sm font-bold font-display text-text-primary/50 tracking-tight mb-0.5">All clear!</p>
                  <p className="text-[9px] font-medium text-text-secondary/40 uppercase tracking-[0.12em]">No support tickets raised</p>
                </div>
              ) : (
                complaints.slice(0, 4).map((c, i) => (
                  <div key={c._id} className="stagger-enter" style={{ animationDelay: `${Math.min(i * 0.06, 0.3)}s` }}>
                    <div className="flex items-center gap-3 p-3 rounded-[16px] bg-surface hover:bg-surface-hover transition-all group border border-transparent hover:border-border/50">
                      <div className={`relative w-9 h-[40px] flex items-center justify-center ${c.status === 'resolved' ? '' : ''}`}>
                        <div className={`absolute inset-0 rounded-[5px] rounded-b-[12px] ${
                          c.status === 'resolved' ? 'bg-emerald-500/10' :
                          c.status === 'in_progress' ? 'bg-secondary-light' :
                          'bg-accent-soft'
                        }`}></div>
                        <div className={`absolute top-[2px] left-[2px] right-[2px] h-[3px] rounded-t-[3px] ${
                          c.status === 'resolved' ? 'bg-emerald-500/10' :
                          c.status === 'in_progress' ? 'bg-secondary-light' :
                          'bg-accent-soft'
                        }`}></div>
                        <MdReportProblem className={`text-base relative z-10 ${
                          c.status === 'resolved' ? 'text-success' :
                          c.status === 'in_progress' ? 'text-secondary' :
                          'text-primary'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-text-primary text-sm truncate">{c.description}</p>
                        <p className="text-[8px] text-text-secondary font-medium uppercase tracking-wider mt-0.5">{c.category}</p>
                      </div>
                      <span className={`badge ${
                        c.status === 'resolved' ? 'badge-emerald' :
                        c.status === 'in_progress' ? 'badge-secondary' :
                        c.status === 'pending' ? 'badge-amber' : 'badge-primary'
                      }`}>
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
          {/* Notifications */}
          <div className="arch-card p-6 md:p-7 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">Activity</h3>
              <MdNotifications className="text-text-tertiary" size={18} />
            </div>
            <div className="space-y-3">
              {notifications.length === 0 ? (
                <div className="text-center py-10 relative">
                  <div className="relative w-[68px] h-[68px] mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full bg-emerald-500/5 animate-ripple" />
                    <div className="relative w-[68px] h-[68px] rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/10">
                      <MdCheckCircle className="text-3xl text-success/40" />
                    </div>
                  </div>
                  <p className="text-sm font-bold font-display text-text-primary/50 tracking-tight">All caught up!</p>
                  <p className="text-[8px] text-text-secondary/30 font-medium uppercase tracking-[0.15em] mt-0.5">No new notifications</p>
                </div>
              ) : (
                notifications.map((n, i) => (
                  <div key={n._id} className="flex gap-3 items-start stagger-enter" style={{ animationDelay: `${Math.min(i * 0.07, 0.3)}s` }}>
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0 shadow-[0_0_4px_rgba(92,61,46,0.4)]" />
                    <div>
                      <p className="text-sm font-medium text-text-primary leading-snug">{n.message || n.title}</p>
                      <p className="text-[8px] text-text-secondary font-medium uppercase tracking-wider mt-0.5">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantDashboard;
