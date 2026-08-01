import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { MdNotifications, MdAdd, MdClose, MdAnnouncement, MdCheckCircle } from "react-icons/md";
import toast from "react-hot-toast";
import { getApiError } from "../utils/getApiError";
import ErrorRetry from "../components/ErrorRetry";
import Button from "../components/Button";

const TYPE_LABELS = {
  maintenance: "Maintenance",
  water_shutdown: "Water issue",
  emergency: "Emergency",
  general: "General",
  curfew: "Curfew",
  fee_reminder: "Fee reminder",
  system_incomplete_profile: "⚠ System Alert",
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

  const fetchNotices = async (opts) => {
    if (!user) return;
    setError(null);
    try {
      // opts is set when the auto-refresh hook fires a background refresh — that
      // must not flash the loading skeleton. Mount / socket refetches toggle it.
      if (!opts) setLoading(true);
      const url = user.role === "owner" ? "/owner/notices" : "/tenant/notices";
      const res = await api.get(url, opts);
      setNotices(res.data.data || []);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to load notices");
      toast.error(getApiError(error));
    } finally {
      if (!opts) setLoading(false);
    }
  };

  // Tenants: mark a notice read (server persists via readBy). Owner notices are
  // always "read" for display purposes.
  const markRead = async (id) => {
    if (user?.role !== "tenant") return;
    setNotices((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    try {
      await api.post(`/tenant/notices/${id}/read`);
    } catch {
      /* silent — optimistic update is enough */
    }
  };

  const markAllRead = async () => {
    if (user?.role !== "tenant") return;
    const unread = notices.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    setNotices((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await Promise.all(unread.map((n) => api.post(`/tenant/notices/${n._id}/read`)));
      toast.success("All notices marked as read");
    } catch {
      /* silent */
    }
  };

  const unreadCount = user?.role === "tenant" ? notices.filter((n) => !n.isRead).length : 0;

  useEffect(() => {
    fetchNotices();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchNotices is recreated each render; its inputs are all below
  }, [user?.id, user?.role, user?.hostelId]);

  useEffect(() => {
    if (!socket) return;
    const onNotice = (notice) => {
      setNotices((prev) => [notice, ...prev.filter((n) => n._id !== notice._id)]);
      if (user?.role === "tenant") {
        toast.success("New notice from hostel", { icon: "📢" });
      }
    };
    // A notice removed by the admin disappears from tenant/owner lists in real time.
    const onNoticeDeleted = (payload) => {
      if (payload?._id) {
        setNotices((prev) => prev.filter((n) => n._id !== payload._id));
      }
    };
    socket.on("notice_created", onNotice);
    socket.on("notice_deleted", onNoticeDeleted);
    return () => {
      socket.off("notice_created", onNotice);
      socket.off("notice_deleted", onNoticeDeleted);
    };
  }, [socket, user?.role]);

  // Socket-independent fallback (Vercel's serverless socket stub drops events):
  // refetch on tab visibility + poll while visible so new/deleted notices
  // surface without a manual reload.
  useAutoRefresh(fetchNotices);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    try {
      await api.post("/owner/notices", form);
      toast.success("Notice sent to all tenants");
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
            <div className="skeleton h-4 w-20" />
            <div className="skeleton h-5 w-44" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-28 mt-4" />
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
          <h2 className="section-title">
            Hostel <span className="highlight">Notices</span>
          </h2>
          <p className="section-sub">
            {user?.role === "owner"
              ? "Send updates to tenants (water, maintenance, etc.)"
              : "Messages from your hostel management"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "tenant" && unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="btn btn-ghost text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              <MdCheckCircle className="text-primary" size={15} />
              Mark all read ({unreadCount})
            </button>
          )}
          {user?.role === "owner" && (
            <Button onClick={() => setShowForm(true)} icon={MdAdd}>
              Post Notice
            </Button>
          )}
        </div>
      </header>

      {notices.length === 0 ? (
        <div className={`arch-card p-16 text-center border border-dashed border-border/60`}>
          <MdNotifications className="text-4xl mx-auto mb-4 opacity-20 text-text-secondary" />
          <p className="font-bold text-text-secondary/60">No notices yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notices.map((n, i) => {
            const isUnread = user?.role === "tenant" && !n.isRead;
            return (
              <div
                key={n._id}
                className="stagger-enter"
                style={{ animationDelay: `${Math.min(i * 0.06, 0.3)}s` }}
              >
                <article
                  role="button"
                  tabIndex={0}
                  onClick={() => markRead(n._id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      markRead(n._id);
                    }
                  }}
                  className={`arch-card p-6 md:p-7 cursor-pointer transition-all ${
                    n.type === "system_incomplete_profile"
                      ? "border-2 border-danger-border/40 bg-danger-bg/20"
                      : ""
                  } ${isUnread ? "border-l-[3px] border-l-primary bg-primary-light/40" : ""}`}
                >
                  <div className="flex justify-between items-start gap-4 mb-3">
                    <div className="flex items-start gap-2.5">
                      {isUnread && (
                        <span
                          className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0"
                          aria-label="Unread"
                        />
                      )}
                      <div>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider ${
                            n.type === "system_incomplete_profile" ? "text-danger" : "text-primary"
                          }`}
                        >
                          {TYPE_LABELS[n.type] || n.type}
                        </span>
                        <h3
                          className={`text-lg font-bold font-display mt-1 ${
                            n.type === "system_incomplete_profile"
                              ? "text-danger"
                              : isUnread
                                ? "text-text-primary"
                                : "text-text-secondary"
                          }`}
                        >
                          {n.title}
                        </h3>
                      </div>
                    </div>
                    {user?.role === "owner" && n.type !== "system_incomplete_profile" && (
                      <button
                        type="button"
                        onClick={() => handleDelete(n._id)}
                        className="text-text-secondary/30 hover:text-accent p-1.5 transition-colors"
                      >
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
            );
          })}
        </div>
      )}

      {/* Post Notice Modal */}
      {showForm && user?.role === "owner" && (
        <div className="modal-overlay">
          <form onSubmit={handleSubmit} className="modal-card max-w-lg p-6 md:p-7 space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold font-display text-text-primary tracking-tight">
                  Post Notice
                </h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">
                  Broadcast to tenants
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={`w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-accent hover:bg-accent-soft transition-all`}
              >
                <MdClose size={20} />
              </button>
            </div>
            <input
              required
              placeholder="Title (e.g. Washing machine not working)"
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <select
              className="field-select"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="general">General</option>
              <option value="maintenance">Maintenance</option>
              <option value="water_shutdown">Water problem</option>
              <option value="emergency">Emergency</option>
            </select>
            <textarea
              required
              rows={4}
              placeholder="Message for all tenants..."
              className="field"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
            <Button type="submit" fullWidth size="lg">
              Broadcast to Tenants
            </Button>
          </form>
        </div>
      )}
    </div>
  );
};

export default Notifications;
