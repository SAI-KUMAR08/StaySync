import React, { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  MdReportProblem, MdCheckCircle, MdHourglassEmpty, MdAdd,
  MdSearch, MdChevronRight, MdClose, MdFlag
} from "react-icons/md";
import toast from "react-hot-toast";

const PriorityBadge = ({ priority }) => {
  const colors = {
    high: "bg-rose-50 text-rose-700 border-rose-200/50",
    emergency: "bg-rose-50 text-rose-700 border-rose-200/50",
    medium: "bg-orange-50 text-orange-700 border-orange-200/50",
    low: "bg-blue-50 text-blue-700 border-blue-200/50",
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
  }, [statusFilter, search, user]);

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
  }, [socket, user]);

  const fetchComplaints = async () => {
    if (!user) return;
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div>
          <div className="section-tag mb-3">
            <MdReportProblem /> Support
          </div>
          <h2 className="section-title">Support <span>Desk</span></h2>
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
        <div className="flex gap-2">
          {[
            { id: "", label: "All" },
            { id: "pending", label: "Pending" },
            { id: "in_progress", label: "In Progress" },
            { id: "resolved", label: "Resolved" },
          ].map(({ id, label }) => (
            <button key={id || "all"} onClick={() => setStatusFilter(id)}
              className={`px-5 py-3 rounded-2xl font-bold text-[10px] uppercase tracking-wider transition-all ${
                (statusFilter === id) ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-card text-text-secondary/60 border border-border/60 hover:border-primary/30'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {complaints?.map((c, i) => (
          <div key={c._id} className="stagger-enter" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="bento-card p-6 flex flex-col group h-full">
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
                  <div className="w-9 h-9 rounded-xl bg-[#F5F5F4] flex items-center justify-center font-bold text-text-secondary/50 border border-border/50">
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
                      <button onClick={() => handleStatusUpdate(c._id, "in_progress")} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-500 hover:text-white transition-all"><MdHourglassEmpty size={16} /></button>
                    )}
                    {c.status !== 'resolved' && (
                      <button onClick={() => handleStatusUpdate(c._id, "resolved")} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-500 hover:text-white transition-all"><MdCheckCircle size={16} /></button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {(!complaints || complaints.length === 0) && (
          <div className="col-span-full py-20 text-center">
            <p className="font-medium text-text-secondary/60 uppercase tracking-wider text-[10px]">No tickets found matching your criteria</p>
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
              <button onClick={() => setShowModal(false)} className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-rose-500 hover:bg-rose-50 transition-all">
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
