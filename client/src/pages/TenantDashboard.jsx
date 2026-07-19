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

const StatCard = ({ label, value, sub, icon: Icon, color }) => {
  
  return (
    <div className={`card card-lg group`}>
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-5 shadow-md`}>
        <Icon className="text-2xl text-white" />
      </div>
      <h3 className="text-text-secondary text-[8px] font-bold font-sans uppercase tracking-[0.15em] mb-1.5">{label}</h3>
      <p className="text-2xl font-bold font-numeric text-text-primary tracking-tight">{value}</p>
      <p className="text-[8px] text-text-secondary font-medium mt-1 uppercase tracking-tight">{sub}</p>
    </div>
  );
};

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
      <div className={`shimmer h-24 w-full rounded-2xl`} />
      <div className="grid grid-cols-5 gap-5">
        {[...Array(5)].map((_, i) => <div key={i} className={`shimmer h-40 rounded-2xl`} />)}
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-16">
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
              <span className="text-[8px] font-bold uppercase tracking-wider text-success bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/10">
                Verified Resident
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Stats */}
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
                <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">Financials</h3>
                <p className="text-base font-bold font-display text-text-primary tracking-tight">Recent Invoices</p>
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
                  <p className="text-lg font-bold font-sans text-text-primary/50 tracking-tight mb-1">No invoices yet</p>
                  <p className="text-[10px] font-medium text-text-secondary/40 uppercase tracking-[0.15em]">Your billing history will appear here</p>
                </div>
              ) : (
                payments.map((p, i) => (
                  <div key={p._id} className="stagger-enter" style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}>
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-surface hover:bg-surface-hover border border-transparent hover:border-border/50 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${(p.paymentStatus || p.status) === 'paid' ? 'bg-emerald-500/10 text-success' : 'bg-accent-soft text-primary'}`}>
                          <MdAttachMoney size={20} />
                        </div>
                        <div>
                          <p className="font-semibold text-text-primary text-sm leading-none mb-1">{p.paymentMonth || p.month} {p.year}</p>
                          <p className="text-[8px] font-medium text-text-secondary uppercase tracking-wider">
                            {(p.paymentStatus || p.status) === 'paid' ? `Paid on ${new Date(p.paidDate || p.updatedAt).toLocaleDateString()}` : `${p.paymentStatus || p.status} — due ${new Date(p.dueDate).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold font-sans text-text-primary text-sm">₹{p.amount?.toLocaleString()}</p>
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
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary-light flex items-center justify-center mx-auto mb-4 border border-accent/10">
                    <MdReportProblem className="text-3xl text-primary/35" />
                  </div>
                  <p className="text-sm font-bold font-sans text-text-primary/50 tracking-tight mb-0.5">All clear!</p>
                  <p className="text-[9px] font-medium text-text-secondary/40 uppercase tracking-[0.12em]">No support tickets raised</p>
                </div>
              ) : (
                complaints.slice(0, 4).map((c, i) => (
                  <div key={c._id} className="stagger-enter" style={{ animationDelay: `${Math.min(i * 0.06, 0.3)}s` }}>
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface hover:bg-surface-hover transition-all group border border-transparent hover:border-border/50">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        c.status === 'resolved' ? 'bg-emerald-500/10 text-success' :
                        c.status === 'in_progress' ? 'bg-secondary-light text-secondary' :
                        'bg-accent-soft text-primary'
                      }`}>
                        <MdReportProblem size={18} />
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
                <div className="text-center py-10">
                  <div className="w-[68px] h-[68px] rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/10">
                    <MdCheckCircle className="text-3xl text-success/40" />
                  </div>
                  <p className="text-sm font-bold font-sans text-text-primary/50 tracking-tight">All caught up!</p>
                  <p className="text-[8px] text-text-secondary/30 font-medium uppercase tracking-[0.15em] mt-0.5">No new notifications</p>
                </div>
              ) : (
                notifications.map((n, i) => (
                  <div key={n._id} className="flex gap-3 items-start stagger-enter" style={{ animationDelay: `${Math.min(i * 0.07, 0.3)}s` }}>
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
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
