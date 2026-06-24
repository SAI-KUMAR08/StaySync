import React, { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import {
  MdMeetingRoom, MdAttachMoney, MdNotifications,
  MdReportProblem, MdBed, MdChevronRight, MdHistory,
  MdAssignment, MdEvent, MdShield
} from "react-icons/md";
import { Link } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import toast from "react-hot-toast";

const StatCard = ({ label, value, sub, icon: Icon, color }) => (
  <div className="bento-card p-6 md:p-7 group relative overflow-hidden">
    <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-${color}/[0.04] to-transparent rounded-full -mr-16 -mt-16 pointer-events-none`} />
    <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500 shadow-lg`}>
      <Icon className="text-2xl text-white" />
    </div>
    <h3 className="text-text-secondary text-[8px] font-bold font-sans uppercase tracking-[0.15em] mb-1.5">{label}</h3>
    <p className="text-2xl font-black font-sans text-text-primary tracking-tight">{value}</p>
    <p className="text-[8px] text-text-secondary font-medium mt-1 uppercase tracking-tight">{sub}</p>
  </div>
);

const TenantDashboard = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    if (!socket) return;
    const onNotice = (notice) => {
      setNotifications((prev) => [notice, ...prev.filter((n) => n._id !== notice._id)]);
      toast.success("New hostel notice", { icon: "📢" });
    };
    socket.on("notice_created", onNotice);
    return () => socket.off("notice_created", onNotice);
  }, [socket]);

  const fetchData = async () => {
    try {
      const [notifRes, compRes, payRes] = await Promise.all([
        api.get("/tenant/notices"), api.get("/tenant/complaints"), api.get("/tenant/payments")
      ]);
      setNotifications(notifRes.data?.data || []);
      setComplaints((compRes.data?.data || []).slice(0, 3));
      const payData = payRes.data.data ?? {};
      const payList = [...(payData.grouped?.overdue ?? []), ...(payData.grouped?.unpaid ?? []), ...(payData.payments ?? []).filter((p) => p.status === "paid")];
      setPayments(payList.slice(0, 8).map((p) => ({ ...p, fine: p.fineAmount ?? 0 })));
    } catch (error) { console.error(error);
    } finally { setLoading(false); }
  };

  const handleMarkAsRead = async (noticeId) => {
    try {
      await api.post(`/tenant/notices/${noticeId}/read`);
      setNotifications((prev) => prev.map((n) => n._id === noticeId ? { ...n, readBy: [...(n.readBy || []), user.id] } : n));
    } catch (error) { console.error(error); }
  };

  const overdueDues = payments.filter((p) => p.status === "overdue").reduce((s, p) => s + p.amount + (p.fine || 0), 0);
  const unpaidDues = payments.filter((p) => p.status === "unpaid").reduce((s, p) => s + p.amount + (p.fine || 0), 0);

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bento-card p-7 space-y-4">
          <div className="shimmer w-12 h-12 rounded-2xl" />
          <div className="shimmer h-3 w-20" />
          <div className="shimmer h-7 w-24 mt-1" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Hello Section */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
        <div>
          <h2 className="section-title">Hi, {user?.name?.split?.(" ")?.[0] || "Resident"}! 👋</h2>
          <p className="section-sub">Your stay at <span className="font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{user?.hostelName || "your hostel"}</span> is managed here.</p>
        </div>
        <div className="flex items-center gap-3 bg-card p-2 pr-5 rounded-full border border-border/50 shadow-sm">
          <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white"><MdShield size={18} /></div>
          <div>
            <p className="text-[8px] font-medium text-text-secondary uppercase tracking-wider leading-none mb-0.5">Status</p>
            <p className="text-xs font-bold text-emerald-600">Verified Resident</p>
          </div>
        </div>
      </header>

      {/* Stats — 3 + 2 bento */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
        {[
          { label: "Assigned Unit", value: `Room ${user?.roomDetails?.roomId?.number || 'N/A'}`, sub: `Floor ${user?.roomDetails?.floorId?.number || '0'}`, icon: MdMeetingRoom, color: "bg-gradient-to-br from-primary to-violet-600" },
          { label: "Base Rent", value: `₹${user?.rentAmount?.toLocaleString() || 0}`, sub: "Monthly cycle", icon: MdAttachMoney, color: "bg-emerald-600" },
          { label: "Overdue", value: `₹${overdueDues.toLocaleString()}`, sub: `${payments.filter((p) => p.status === "overdue").length} month(s)`, icon: MdAssignment, color: "bg-rose-600" },
          { label: "Unpaid", value: `₹${unpaidDues.toLocaleString()}`, sub: `${payments.filter((p) => p.status === "unpaid").length} bill(s)`, icon: MdAttachMoney, color: "bg-amber-600" },
          { label: "Support", value: complaints.filter(c => c.status !== 'resolved').length, sub: "Active tickets", icon: MdReportProblem, color: "bg-zinc-600" },
        ].map((card, i) => (
          <div key={card.label} className="stagger-enter" style={{ animationDelay: `${i * 0.08}s` }}>
            <StatCard {...card} />
          </div>
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Invoices */}
          <div className="bento-card p-6 md:p-7">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">Financials</h3>
                <p className="text-base font-black font-sans text-text-primary tracking-tight">Recent Invoices</p>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-50 text-text-secondary/50"><MdHistory size={20} /></div>
            </div>
            <div className="space-y-2">
              {payments.map((p, i) => (
                <div key={p._id} className="stagger-enter" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-[#FAFAFA] hover:bg-white border border-transparent hover:border-border/50 hover:shadow-sm transition-all group">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${p.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        <MdAttachMoney />
                      </div>
                      <div>
                        <p className="font-semibold text-text-primary text-sm leading-none mb-1">{p.month} {p.year}</p>
                        <p className="text-[8px] font-medium text-text-secondary uppercase tracking-wider">
                          {p.status === 'paid' ? `Paid on ${new Date(p.paidDate || p.updatedAt).toLocaleDateString()}` : `${p.status} — due ${new Date(p.dueDate).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black text-text-primary">₹{(p.amount + (p.fine || 0)).toLocaleString()}</p>
                      <span className={`badge ${p.status === 'paid' ? 'badge-emerald' : 'badge-amber'}`}>{p.status}</span>
                    </div>
                  </div>
                </div>
              ))}
              {payments.length === 0 && <div className="py-12 text-center text-text-secondary/40 font-medium italic">No financial history yet.</div>}
            </div>
          </div>

          {/* Complaints */}
          <div className="bento-card p-6 md:p-7">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">Support Desk</h3>
                <p className="text-base font-black font-sans text-text-primary tracking-tight">Active Tickets</p>
              </div>
              <Link to="/tenant/complaints" className="w-9 h-9 rounded-xl bg-primary/8 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all">
                <MdChevronRight size={20} />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {complaints.map((c, i) => (
                <div key={c._id} className="stagger-enter" style={{ animationDelay: `${i * 0.07}s` }}>
                  <div className="p-5 rounded-2xl border border-border/50 bg-[#FAFAFA] hover:bg-white hover:border-border hover:shadow-sm transition-all duration-300">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[8px] font-bold uppercase tracking-wider text-primary bg-primary-light px-2 py-1 rounded-lg">{c.category}</span>
                      <span className={`badge ${c.status === 'resolved' ? 'badge-emerald' : c.status === 'in_progress' ? 'badge-primary' : 'badge-amber'}`}>
                        {c.status?.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-text-primary line-clamp-2 mb-3 min-h-[2.5rem] leading-relaxed">{c.description}</p>
                    <div className="flex items-center justify-between text-[8px] text-text-secondary font-medium uppercase tracking-wider pt-3 border-t border-border/40">
                      <span className="flex items-center gap-1"><MdEvent size={10} /> {new Date(c.createdAt).toLocaleDateString()}</span>
                      <span>#{c._id.slice(-6).toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              ))}
              {complaints.length === 0 && <div className="col-span-2 py-12 text-center text-text-secondary/40 font-medium italic">All quiet — no active issues.</div>}
            </div>
          </div>
        </div>

        {/* Notices Panel */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-6 md:p-7 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden h-full">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/[0.04] rounded-full -mr-20 -mt-20 pointer-events-none" />
            <div className="flex justify-between items-center mb-8 relative z-10">
              <div>
                <h3 className="text-[8px] font-bold text-white/40 uppercase tracking-[0.2em]">Notices</h3>
                <p className="text-base font-black font-sans text-white tracking-tight">From management</p>
              </div>
              <Link to="/tenant/notifications" className="w-9 h-9 rounded-xl bg-white/8 text-white/40 flex items-center justify-center hover:bg-white/15 hover:text-white transition-all">
                <MdNotifications size={18} />
              </Link>
            </div>
            <div className="space-y-6 relative z-10">
              {notifications.map((n, i) => {
                const isUnread = !n.readBy?.includes(user?.id);
                return (
                  <div key={n._id} onClick={() => isUnread && handleMarkAsRead(n._id)}
                    className="stagger-enter" style={{ animationDelay: `${i * 0.07}s` }}>
                    <div className={`relative pl-5 pb-2 border-l-2 border-white/[0.08] last:pb-0 ${isUnread ? 'cursor-pointer' : ''} group transition-all`}>
                      <div className={`absolute -left-[7px] top-0 w-3.5 h-3.5 rounded-full border-[3px] transition-all ${
                        isUnread ? 'bg-accent border-zinc-900 shadow-[0_0_12px_rgba(244,63,94,0.5)]' : 'bg-white/20 border-zinc-900'
                      }`} />
                      <div className="pt-0.5">
                        <p className={`text-sm font-semibold mb-1 transition-colors ${isUnread ? 'text-white' : 'text-white/50 group-hover:text-white/70'}`}>{n.title}</p>
                        <p className={`text-sm font-normal mb-2 leading-relaxed transition-colors ${isUnread ? 'text-white/70' : 'text-white/40 group-hover:text-white/50'}`}>{n.message}</p>
                        <p className="text-[7px] text-white/30 font-medium uppercase tracking-wider">
                          {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {notifications.length === 0 && (
                <div className="text-center py-16 opacity-30">
                  <MdNotifications size={52} className="mx-auto mb-3 opacity-20" />
                  <p className="text-[8px] font-bold uppercase tracking-wider text-white/40">Inbox is clear</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantDashboard;
