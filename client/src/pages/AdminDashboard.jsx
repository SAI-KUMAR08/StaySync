import React, { useEffect, useState } from "react";
import api from "../api/axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from "recharts";
import {
  MdPeople, MdReportProblem,
  MdAttachMoney, MdCheckCircle, MdNotificationsActive, MdArrowForward,
  MdQueryStats, MdHome, MdTrendingUp, MdWarning, MdReceipt
} from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const HeroStat = ({ title, value, icon: Icon, subValue, trend, to }) => {
  const content = (
    <div className="bento-card-glow p-6 md:p-8 relative overflow-hidden col-span-1 md:col-span-2 row-span-1 group">
    <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-gradient-to-br from-primary/[0.06] to-accent/[0.04] pointer-events-none group-hover:scale-150 transition-transform duration-700" />
    <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-primary/[0.03] pointer-events-none group-hover:scale-150 transition-transform duration-700 delay-150" />
    <div className="flex items-start justify-between mb-4">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-xl shadow-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
        <Icon className="text-2xl text-white" />
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${trend.startsWith('+') ? 'text-emerald-600' : 'text-rose-600'} bg-emerald-50 px-2.5 py-1 rounded-full`}>
          <MdTrendingUp size={12} /> {trend}
        </div>
      )}
    </div>
    <h3 className="text-text-secondary text-[9px] font-bold font-sans uppercase tracking-[0.15em] mb-1">{title}</h3>
    <div className="flex items-baseline gap-2">
      <span className="text-4xl font-black font-sans text-text-primary tracking-tight">{value}</span>
      {subValue && <span className="text-text-secondary font-medium text-xs">{subValue}</span>}
    </div>
  </div>
  );
  return to ? <Link to={to} className="block cursor-pointer">{content}</Link> : content;
};

const MiniStat = ({ title, value, icon: Icon, color }) => (
  <div className="bento-card p-5 flex items-center gap-4">
    <div className={`w-11 h-11 rounded-2xl ${color} flex items-center justify-center shadow-lg`}>
      <Icon className="text-xl text-white" />
    </div>
    <div>
      <p className="text-[8px] font-bold font-sans text-text-secondary uppercase tracking-[0.15em] leading-none mb-1">{title}</p>
      <p className="text-xl font-black font-sans text-text-primary tracking-tight">{value}</p>
    </div>
  </div>
);

const SUPPORT_FILTERS = [
  { id: "", label: "All open" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "resolved", label: "Resolved" },
];

const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [supportFilter, setSupportFilter] = useState("");
  const { socket } = useSocket();

  const fetchComplaints = async (status) => {
    const url = status ? `/owner/complaints?status=${status}` : "/owner/complaints";
    const complaintsRes = await api.get(url);
    let list = complaintsRes.data.data || [];
    if (!status) list = list.filter((c) => !["resolved", "closed"].includes(c.status));
    setActivities(list.slice(0, 5));
  };

  const fetchData = async () => {
    try {
      const statsRes = await api.get("/owner/dashboard");
      setStats(statsRes.data.data.stats || null);
      await fetchComplaints(supportFilter);
    } catch (error) { console.error(error);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [user?.hostelId]);
  useEffect(() => { if (!loading) fetchComplaints(supportFilter); }, [supportFilter]);

  useEffect(() => {
    if (!socket) return;
    const h = (e, m) => { toast.success(m, { icon: "🔔" }); fetchData(); };
    socket.on("tenant_assigned", (d) => h(d, d.message));
    socket.on("tenant_removed", (d) => h(d, d.message));
    socket.on("payment_completed", (d) => h(d, d.message));
    socket.on("occupancy_update", () => fetchData());
    socket.on("complaint_created", () => fetchComplaints(supportFilter));
    socket.on("complaint_updated", () => fetchComplaints(supportFilter));
    return () => { ["tenant_assigned","tenant_removed","payment_completed","occupancy_update","complaint_created","complaint_updated"].forEach(e => socket.off(e)); };
  }, [socket, supportFilter]);

  if (loading || !stats) return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`bento-card p-6 space-y-4 ${i === 0 ? 'md:col-span-2' : ''}`}>
            <div className="shimmer w-12 h-12 rounded-2xl" />
            <div className="shimmer h-3 w-20" />
            <div className="shimmer h-8 w-32 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-16">
      {/* BentoTM Header */}
      <header>
        <div className="section-tag mb-3"><MdQueryStats size={12} /> Pulse</div>
        <h2 className="section-title">Live <span className="highlight">Overview</span></h2>
        <p className="text-text-secondary font-medium mt-1">Real-time health and occupancy metrics for your facility.</p>
      </header>

      {/* 🎨 Bento Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <HeroStat title="Total Residents" value={stats.totalTenants} icon={MdPeople} trend="+4.2%" subValue="Active" to="/admin/tenants" />

        {user?.role === "owner" ? [
          { title: "Monthly Collection", value: `₹${(stats.monthlyRevenue ?? 0).toLocaleString()}`, icon: MdReceipt, color: "bg-emerald-600" },
          { title: "Overdue", value: stats.overdueTenants ?? 0, icon: MdWarning, color: "bg-rose-600" },
          { title: "Unpaid", value: stats.unpaidPayments ?? 0, icon: MdAttachMoney, color: "bg-amber-600" },
        ].map(card => (
          <MiniStat key={card.title} title={card.title} value={card.value} icon={card.icon} color={card.color} />
        )) : [
          { title: "Occupancy Rate", value: `${stats.occupancyPercentage ?? 0}%`, icon: MdHome, color: "bg-emerald-600" },
          { title: "Available Beds", value: stats.availableBeds ?? 0, icon: MdHome, color: "bg-amber-600" },
          { title: "Open Tickets", value: stats.activeComplaints, icon: MdReportProblem, color: "bg-zinc-600" },
        ].map(card => (
          <MiniStat key={card.title} title={card.title} value={card.value} icon={card.icon} color={card.color} />
        ))}

        <MiniStat title="Open Tickets" value={stats.activeComplaints} icon={MdReportProblem} color="bg-zinc-600" />
      </div>

      {/* Support Tickets — bento card */}
      <div className="bento-card p-6 md:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h3 className="text-sm font-bold font-sans text-text-primary uppercase tracking-[0.15em]">Support Tickets</h3>
          <Link to="/admin/complaints" className="btn-ghost inline-flex items-center gap-1.5 text-xs">
            Full Desk <MdArrowForward size={13} />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          {SUPPORT_FILTERS.map(({ id, label }) => (
            <button key={id || "all"} onClick={() => setSupportFilter(id)}
              className={`px-4 py-2 rounded-xl text-[8px] font-bold font-sans uppercase tracking-wider transition-all ${
                supportFilter === id ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-zinc-100/80 text-text-secondary hover:bg-zinc-100'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          {activities.length === 0 ? (
            <div className="py-16 text-center">
              <MdCheckCircle className="text-5xl mx-auto mb-3 text-zinc-200" />
              <p className="font-medium text-text-secondary/50 text-xs uppercase tracking-wider">Zero unresolved tickets</p>
            </div>
          ) : (
            activities.map((activity, i) => (
              <div key={activity._id} className="stagger-enter" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-[#FAFAFA] transition-all group">
                  <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                    <MdNotificationsActive size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-primary text-sm leading-tight mb-0.5 truncate">{activity.description}</p>
                    <p className="text-[8px] text-text-secondary font-medium uppercase tracking-wider">
                      {activity.tenantId?.name || "Resident"} • {new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="badge-rose shrink-0">
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
