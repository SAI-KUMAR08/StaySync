import React, { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  MdReportProblem, MdCheckCircle, MdHourglassEmpty, MdAdd,
  MdSearch, MdChevronRight, MdClose, MdFlag
} from "react-icons/md";
import toast from "react-hot-toast";
import ErrorRetry from "../components/ErrorRetry";

const PriorityBadge = ({ priority }) => {
  const colors = {
    high: "bg-primary-light text-primary border-primary/20",
    emergency: "bg-primary-light text-primary border-primary/20",
    medium: "bg-primary-light text-primary border-primary/20",
    low: "bg-primary-light text-primary border-primary/20",
  };
  const key = (priority || "medium").toLowerCase();
  return (
    <span className={`px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-wider border ${colors[key] || colors.medium}`}>
      {priority}
    </span>
  );
};

const Complaints = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formData, setFormData] = useState({
    category: "maintenance",
    description: "",
    priority: "medium"
  });

  useEffect(() => {
    if (!user) return;
    fetchComplaints();
  }, [statusFilter, search, user?.id, user?.role]);

  useEffect(() => {
    if (!socket || !user) return;
    socket.on("complaint_created", (newComplaint) => {
      if (!newComplaint) return;
      const tId = newComplaint.tenantId?._id || newComplaint.tenantId;
      if (user.role === "owner" || tId === user.id) {
        setComplaints((prev) => [newComplaint, ...prev]);
        if (user.role === "owner") {
          toast.success("New Support Ticket Received");
        }
      }
    });

    socket.on("complaint_updated", (updatedComplaint) => {
      setComplaints((prev) => prev.map((c) => c._id === updatedComplaint._id ? { ...c, ...updatedComplaint } : c));
      if (user.role === "tenant") {
        toast.success(`Ticket Status Updated: ${updatedComplaint.status}`);
      }
    });

    return () => {
      socket.off("complaint_created");
      socket.off("complaint_updated");
    };
  }, [socket, user?.id, user?.role]);

  const fetchComplaints = async () => {
    if (!user) return;
    setError(null);
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const base = user.role === "owner" ? "/owner/complaints" : "/tenant/complaints";
      const url = params.toString() ? `${base}?${params}` : base;
      const res = await api.get(url);
      setComplaints(res.data.data || res.data || []);
    } catch (error) {
      console.error(error);
      setError(error.response?.data?.message || "Failed to load complaints");
      toast.error("Failed to load complaints");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      await api.patch(`/owner/complaints/${id}`, { status });
      toast.success(`Ticket marked as ${status}`);
      fetchComplaints();
    } catch (error) {
      toast.error("Update failed");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.description.trim()) {
      toast.error("Please describe the issue");
      return;
    }
    try {
      const labels = {
        maintenance: "Maintenance",
        electrical: "Electrical",
        water: "Water",
        wifi: "WiFi",
        cleaning: "Cleaning",
        food: "Food",
        others: "Others",
      };
      await api.post("/tenant/complaints", {
        title: labels[formData.category] || "Support request",
        description: formData.description.trim(),
        category: formData.category,
        priority: formData.priority,
      });
      toast.success("Ticket raised successfully");
      setShowModal(false);
      setFormData({ category: "maintenance", description: "", priority: "medium" });
      fetchComplaints();
    } catch (error) {
      const data = error.response?.data;
      const fieldMsg = data?.errors?.fieldErrors
        ? Object.values(data.errors.fieldErrors).flat().join(", ")
        : null;
      toast.error(fieldMsg || data?.message || "Submission failed");
    }
  };

  if (error && complaints.length === 0) return <ErrorRetry message={error} onRetry={fetchComplaints} />;
  if (loading && complaints.length === 0) return (
    <div role="status" aria-label="Loading tickets">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bento-card p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div className="shimmer h-5 w-18 rounded-lg" />
              <div className="shimmer h-4 w-12 rounded-lg" />
            </div>
            <div className="space-y-2">
              <div className="shimmer h-3 w-28" />
              <div className="shimmer h-4 w-full" />
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-border/40">
              <div className="flex items-center gap-3">
                <div className="shimmer w-9 h-9 rounded-xl" />
                <div className="shimmer h-3 w-14" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 animate-slide-up-big">
        <div>
          <div className="section-tag mb-3">
            <MdReportProblem /> Support
          </div>
          <h2 className="section-title">Support <span className="highlight">Desk</span></h2>
          <p className="section-sub">Monitor and resolve resident issues</p>
        </div>
        {user?.role === "tenant" && (
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 text-sm">
            <MdAdd size={18} /> Raise Ticket
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40 text-lg" />
          <input type="text" placeholder="Search by ticket ID or description..."
            className="field-input pl-11"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2" role="group" aria-label="Filter by status">
          {[
            { id: "", label: "All" },
            { id: "pending", label: "Pending" },
            { id: "in_progress", label: "In Progress" },
            { id: "resolved", label: "Resolved" },
          ].map(({ id, label }) => (
            <button key={id || "all"} onClick={() => setStatusFilter(id)}
              className={`relative px-5 py-3 rounded-2xl font-bold text-[10px] uppercase tracking-wider transition-all duration-300 ${
                (statusFilter === id)
                  ? 'text-primary border border-primary/30 scale-105 shadow-sm shadow-primary/5'
                  : 'bg-card text-text-secondary/60 border border-border/60 hover:border-primary/30 hover:text-text-primary/80'
              }`}>
              {label}
              {statusFilter === id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[calc(100%-24px)] h-[3px] bg-primary/30 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {complaints?.map((c, i) => (
          <div key={c._id} className="stagger-enter" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className={`bento-card p-6 flex flex-col group h-full relative overflow-hidden border-l-[3px] ${
              c.priority === 'high' || c.priority === 'emergency' ? 'border-l-primary' :
              c.priority === 'low' ? 'border-l-primary/60' : 'border-l-primary'
            }`}>
              <div className="flex justify-between items-start mb-5">
                <span className={`badge ${
                  c.status === 'pending' ? 'badge-amber' :
                  ['assigned', 'in_progress'].includes(c.status) ? 'badge-primary' : 'badge-emerald'
                }`}>
                  {c.status?.replace("_", " ")}
                </span>
                <PriorityBadge priority={c.priority} />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-bold text-text-secondary/60 uppercase tracking-[0.15em]">{c.category}</span>
                  <span className="text-border">•</span>
                  <span className="text-[9px] font-semibold text-primary tracking-wider">#{c._id.slice(-6).toUpperCase()}</span>
                </div>
                <p className="text-text-primary font-medium leading-relaxed mb-4">{c.description}</p>
              </div>

              <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center font-bold text-text-secondary/50 border border-border/50">
                    {c.tenantId?.name?.[0]?.toUpperCase() || c.tenantId?.personalInfo?.name?.[0]?.toUpperCase() || 'T'}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-primary leading-none mb-0.5">{c.tenantId?.name || c.tenantId?.personalInfo?.name || 'Resident'}</p>
                    <p className="text-[8px] text-text-secondary font-medium uppercase tracking-wider">Room {c.roomId?.roomNumber || c.tenantId?.roomId?.roomNumber || 'N/A'}</p>
                  </div>
                </div>

                {user.role === "owner" && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {c.status === 'pending' && (
                      <button onClick={() => handleStatusUpdate(c._id, "in_progress")} className="p-2 bg-primary-light text-primary rounded-xl hover:bg-secondary hover:text-white transition-all"><MdHourglassEmpty size={16} /></button>
                    )}
                    {c.status !== 'resolved' && (
                      <button onClick={() => handleStatusUpdate(c._id, "resolved")} className="p-2 bg-green-500/10 text-green-700 rounded-xl hover:bg-emerald-500 hover:text-white transition-all"><MdCheckCircle size={16} /></button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {(!complaints || complaints.length === 0) && (
          <div className="col-span-full py-24 text-center relative overflow-hidden">
            {/* Playful floating icon arrangement */}
            <div className="relative inline-block mb-8">
              {/* Background soft glow */}
              <div className="absolute -inset-10 bg-primary/5 rounded-full blur-2xl" />

              {/* Main center icon — the ticket/report */}
              <div className="relative z-10 w-24 h-24 rounded-[28px] bg-surface border border-border/30 flex items-center justify-center shadow-xl">
                <MdReportProblem className="text-4xl text-primary/35" />
              </div>

              {/* Floating satellite icons */}
              <div className="absolute -top-5 -left-9 w-11 h-11 rounded-xl bg-primary-light flex items-center justify-center border border-accent/10" style={{ animationDuration: '4s' }}>
                <MdFlag className="text-lg text-accent/40" />
              </div>
              <div className="absolute -bottom-5 -right-7 w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center border border-secondary/10" style={{ animationDuration: '5s', animationDelay: '0.6s' }}>
                <MdCheckCircle className="text-base text-secondary/40" />
              </div>
              <div className="absolute top-1 -right-14 w-9 h-9 rounded-xl bg-primary-light flex items-center justify-center border border-primary/10" style={{ animationDuration: '3.5s', animationDelay: '1.2s' }}>
                <MdHourglassEmpty className="text-base text-primary/40" />
              </div>
              <div className="absolute -bottom-3 -left-11 w-8 h-8 rounded-xl bg-card flex items-center justify-center border border-border/50" style={{ animationDuration: '4.5s', animationDelay: '0.3s' }}>
                <MdAdd className="text-sm text-text-tertiary/40" />
              </div>
            </div>

            <p className="text-xl font-black font-sans text-text-primary/45 tracking-tight mb-2">
              {statusFilter || search ? 'No matching tickets' : 'No tickets yet'}
            </p>
            <p className="text-[10px] font-medium text-text-secondary/40 uppercase tracking-[0.2em]">
              {statusFilter || search ? 'Try adjusting your filters or search terms' : 'All issues have been resolved'}
            </p>

            {/* Decorative bottom gradient line */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-48 h-px bg-black/5" />
          </div>
        )}
      </div>

      {/* Modal - Raise Ticket */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-md">
            <div className="p-6 border-b border-border/60 flex justify-between items-center">
              <div>
                <h4 className="text-lg font-black font-sans text-text-primary tracking-tight">Report Issue</h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">Support Ticket</p>
              </div>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-primary hover:bg-primary-light transition-all">
                <MdClose size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Category</label>
                <select className="field-select" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>
                  <option value="maintenance">Maintenance</option>
                  <option value="electrical">Electrical</option>
                  <option value="water">Water</option>
                  <option value="wifi">WiFi</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="food">Food</option>
                  <option value="others">Others</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Priority Level</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "low", label: "Low" },
                    { id: "medium", label: "Medium" },
                    { id: "high", label: "High" },
                  ].map(({ id, label }) => (
                    <button key={id} type="button" onClick={() => setFormData({...formData, priority: id})}
                      className={`py-3 rounded-xl text-[9px] font-bold uppercase tracking-wider border-2 transition-all ${
                        formData.priority === id ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-card text-text-secondary/50 border-border/60 hover:border-border'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Issue Description</label>
                <textarea required className="field-textarea h-28"
                  placeholder="Provide details about the problem..."
                  value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})}></textarea>
              </div>
              <button type="submit" className="btn-primary w-full">
                Submit Support Ticket
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Complaints;
