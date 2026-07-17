import React, { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  MdNotifications,
  MdAdd,
  MdClose,
  MdAnnouncement,
} from "react-icons/md";
import toast from "react-hot-toast";
import { getApiError } from "../utils/getApiError";
import ErrorRetry from "../components/ErrorRetry";

const TYPE_LABELS = {
  maintenance: "Maintenance",
  water_shutdown: "Water issue",
  emergency: "Emergency",
  general: "General",
  curfew: "Curfew",
  fee_reminder: "Fee reminder",
};

const Notifications = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "general",
    priority: "medium",
  });

  const fetchNotices = async () => {
    if (!user) return;
    setError(null);
    try {
      setLoading(true);
      const url = user.role === "owner" ? "/owner/notices" : "/tenant/notices";
      const res = await api.get(url);
      setNotices(res.data.data || []);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to load notices");
      toast.error(getApiError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, [user?.id, user?.role, user?.hostelId]);

  useEffect(() => {
    if (!socket) return;
    const onNotice = (notice) => {
      setNotices((prev) => [notice, ...prev.filter((n) => n._id !== notice._id)]);
      if (user?.role === "tenant") {
        toast.success("New notice from hostel", { icon: "📢" });
      }
    };
    socket.on("notice_created", onNotice);
    return () => socket.off("notice_created", onNotice);
  }, [socket, user?.role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    try {
      await api.post("/owner/notices", form);
      toast.success("Notice sent to all residents");
      setShowForm(false);
      setForm({ title: "", message: "", type: "general", priority: "medium" });
      fetchNotices();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this notice?")) return;
    try {
      await api.delete(`/owner/notices/${id}`);
      toast.success("Notice removed");
      fetchNotices();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  if (error) return <ErrorRetry message={error} onRetry={fetchNotices} />;
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4" role="status" aria-label="Loading notices">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="arch-card p-7 space-y-4">
            <div className="shimmer h-4 w-20" />
            <div className="shimmer h-5 w-44" />
            <div className="shimmer h-4 w-full" />
            <div className="shimmer h-4 w-3/4" />
            <div className="shimmer h-3 w-28 mt-4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
        <div>
          <div className="section-ornament-diamond mb-3">
            <MdAnnouncement /> Notices
          </div>
          <h2 className="section-title">Hostel <span className="highlight">Notices</span></h2>
          <p className="section-sub">
            {user?.role === "owner"
              ? "Send updates to residents (water, maintenance, etc.)"
              : "Messages from your hostel management"}
          </p>
        </div>
        {user?.role === "owner" && (
          <button type="button" onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
            <MdAdd size={18} /> Post Notice
          </button>
        )}
      </header>

      {notices.length === 0 ? (
        <div className="arch-card p-16 text-center border border-dashed border-border/60">
          <MdNotifications className="text-4xl mx-auto mb-4 opacity-20 text-text-secondary" />
          <p className="font-bold text-text-secondary/60">No notices yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notices.map((n, i) => (
            <div key={n._id} className="stagger-enter" style={{ animationDelay: `${Math.min(i * 0.06, 0.3)}s` }}>
              <article className="arch-card p-6 md:p-7">
                <div className="flex justify-between items-start gap-4 mb-3">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-primary">
                      {TYPE_LABELS[n.type] || n.type}
                    </span>
                    <h3 className="text-lg font-bold font-display text-text-primary mt-1">{n.title}</h3>
                  </div>
                  {user?.role === "owner" && (
                    <button type="button" onClick={() => handleDelete(n._id)} className="text-text-secondary/30 hover:text-accent p-1.5 transition-colors">
                      <MdClose size={20} />
                    </button>
                  )}
                </div>
                <p className="text-text-secondary leading-relaxed">{n.message}</p>
                <p className="text-[9px] text-text-secondary/50 font-medium uppercase tracking-wider mt-4">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </article>
            </div>
          ))}
        </div>
      )}

      {/* Post Notice Modal */}
      {showForm && user?.role === "owner" && (
        <div className="modal-overlay">
          <form onSubmit={handleSubmit} className="modal-card max-w-lg p-6 md:p-7 space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold font-display text-text-primary tracking-tight">Post Notice</h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">Broadcast to residents</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-accent hover:bg-accent-soft transition-all">
                <MdClose size={20} />
              </button>
            </div>
            <input required placeholder="Title (e.g. Washing machine not working)" className="field-input"
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select className="field-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="general">General</option>
              <option value="maintenance">Maintenance</option>
              <option value="water_shutdown">Water problem</option>
              <option value="emergency">Emergency</option>
            </select>
            <textarea required rows={4} placeholder="Message for all residents..." className="field-textarea"
              value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            <button type="submit" className="btn-primary w-full">
              Broadcast to Residents
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default Notifications;
