import { useState, useCallback, useEffect } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import {
  MdPerson,
  MdEdit,
  MdSave,
  MdClose,
  MdLock,
  MdEmail,
  MdPhone,
  MdBusiness,
  MdMeetingRoom,
  MdBed,
  MdPeople,
  MdCheckCircle,
  MdVisibility,
  MdVisibilityOff,
  MdShield,
  MdHome,
} from "react-icons/md";
import ErrorRetry from "../components/ErrorRetry";

// ── Animated counter ──
const useAnimatedNumber = (target, duration = 900) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (target == null) return;
    let start = 0;
    const startTime = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      setDisplay(Math.round(start + target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return display;
};

const StatTile = ({ icon: Icon, label, value, color = "primary" }) => {
  const animated = useAnimatedNumber(Number(value) || 0);
  const colorMap = {
    primary: "bg-primary-light text-primary",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    indigo: "bg-indigo-50 text-indigo-600",
  };
  return (
    <div className="arch-card p-5 flex items-center gap-4">
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colorMap[color]}`}
      >
        <Icon size={22} />
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary">{label}</p>
        <p className="text-2xl font-bold font-numeric text-text-primary leading-none mt-0.5">
          {animated}
        </p>
      </div>
    </div>
  );
};

const AdminProfile = () => {
  const { user } = useAuth();

  // local copy of user info so we can update it after save without requiring context exposure
  const [localUser, setLocalUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Edit profile ──
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // ── Change password ──
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);

  const fetchStats = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get("/owner/dashboard");
      setStats(res.data.data?.stats || null);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load profile data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Seed localUser from auth context on mount
  useEffect(() => {
    if (user && !localUser) setLocalUser(user);
  }, [user, localUser]);

  const displayUser = localUser || user;

  // Seed form when localUser/user changes
  useEffect(() => {
    const u = localUser || user;
    if (u) setForm({ name: u.name || "", email: u.email || "", phone: u.phone || "" });
  }, [localUser, user]);

  // ── Validation ──
  const validateProfile = () => {
    const errors = {};
    if (!form.name.trim() || form.name.trim().length < 2)
      errors.name = "Name must be at least 2 characters";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errors.email = "Invalid email address";
    if (form.phone && !/^\d{10}$/.test(form.phone.trim()))
      errors.phone = "Phone must be exactly 10 digits";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!validateProfile()) return;
    setSaving(true);
    try {
      await api.patch("/auth/profile", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
      });
      // Refresh from /auth/me to get updated values
      const meRes = await api.get("/auth/me");
      if (meRes.data.data) setLocalUser(meRes.data.data);
      toast.success("Profile updated successfully!");
      setEditing(false);
      setFieldErrors({});
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.errors?.fieldErrors
        ? Object.values(data.errors.fieldErrors).flat().join(", ")
        : data?.message || "Failed to update profile";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwdForm.newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (
      !/[A-Z]/.test(pwdForm.newPassword) ||
      !/[a-z]/.test(pwdForm.newPassword) ||
      !/[0-9]/.test(pwdForm.newPassword)
    ) {
      toast.error("Password must contain uppercase, lowercase and a number");
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setPwdSaving(true);
    try {
      await api.patch("/auth/password", {
        currentPassword: pwdForm.currentPassword,
        newPassword: pwdForm.newPassword,
      });
      toast.success("Password changed! Please log in again on other devices.");
      setChangingPwd(false);
      setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to change password");
    } finally {
      setPwdSaving(false);
    }
  };

  if (error) return <ErrorRetry message={error} onRetry={fetchStats} />;
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-5" role="status">
        <div className="shimmer h-48 rounded-2xl" />
        <div className="shimmer h-36 rounded-2xl" />
        <div className="shimmer h-64 rounded-2xl" />
      </div>
    );
  }

  const initials = (displayUser?.name || user?.name || "A")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      {/* ── Hero Card ── */}
      <div className="arch-card p-7 md:p-8">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-primary/20 shrink-0">
              {initials}
            </div>
            <div>
              <h2 className="text-xl font-bold font-display text-text-primary leading-tight">
                {displayUser?.name || "Admin"}
              </h2>
              <p className="text-[10px] text-text-secondary font-semibold uppercase tracking-wider mt-0.5 flex items-center gap-1">
                <MdShield size={12} className="text-primary" />
                Hostel Admin
              </p>
              <p className="text-xs text-text-tertiary mt-1">{displayUser?.hostelName}</p>
            </div>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="btn btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
            >
              <MdEdit size={15} /> Edit Profile
            </button>
          )}
        </div>

        {/* ── View Mode ── */}
        {!editing && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { icon: MdPerson, label: "Full Name", value: displayUser?.name || "—" },
              { icon: MdEmail, label: "Email Address", value: displayUser?.email || "—" },
              { icon: MdPhone, label: "Mobile Number", value: displayUser?.phone || "—" },
              { icon: MdBusiness, label: "Hostel", value: displayUser?.hostelName || "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border/40"
              >
                <div className="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center shrink-0">
                  <Icon className="text-primary" size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-text-secondary/60">
                    {label}
                  </p>
                  <p className="text-sm font-medium text-text-primary truncate">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Edit Mode ── */}
        {editing && (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Full Name
                </label>
                <input
                  className={`field ${fieldErrors.name ? "!border-red-400" : ""}`}
                  placeholder="Full Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                {fieldErrors.name && (
                  <p className="text-[10px] text-red-600 font-medium ml-1">{fieldErrors.name}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Email Address
                </label>
                <input
                  type="email"
                  className={`field ${fieldErrors.email ? "!border-red-400" : ""}`}
                  placeholder="Email Address"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                {fieldErrors.email && (
                  <p className="text-[10px] text-red-600 font-medium ml-1">{fieldErrors.email}</p>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  className={`field ${fieldErrors.phone ? "!border-red-400" : ""}`}
                  placeholder="10-digit mobile"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                {fieldErrors.phone && (
                  <p className="text-[10px] text-red-600 font-medium ml-1">{fieldErrors.phone}</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary flex-1 py-3 text-sm inline-flex items-center justify-center gap-2"
              >
                <MdSave size={16} />
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setFieldErrors({});
                  setForm({
                    name: user?.name || "",
                    email: user?.email || "",
                    phone: user?.phone || "",
                  });
                }}
                className="btn btn-ghost py-3 text-sm inline-flex items-center gap-2"
              >
                <MdClose size={15} /> Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Hostel Room Stats ── */}
      {stats && (
        <div className="arch-card p-7 md:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center">
              <MdHome className="text-primary" size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-text-primary">
                Hostel Overview
              </h3>
              <p className="text-[10px] text-text-tertiary">{user?.hostelName}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              icon={MdMeetingRoom}
              label="Total Rooms"
              value={stats.totalRooms}
              color="primary"
            />
            <StatTile icon={MdBed} label="Total Beds" value={stats.totalBeds} color="indigo" />
            <StatTile
              icon={MdCheckCircle}
              label="Occupied Beds"
              value={stats.occupiedBeds}
              color="emerald"
            />
            <StatTile
              icon={MdPeople}
              label="Active Tenants"
              value={stats.totalTenants}
              color="amber"
            />
          </div>

          {/* Occupancy bar */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                Occupancy Rate
              </p>
              <span className="text-sm font-bold text-primary">
                {stats.occupancyPercentage ?? 0}%
              </span>
            </div>
            <div className="h-2.5 bg-border/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-700"
                style={{ width: `${stats.occupancyPercentage ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[9px] text-text-tertiary">
                {stats.availableBeds ?? 0} beds available
              </span>
              <span className="text-[9px] text-text-tertiary">
                {stats.occupiedBeds ?? 0} / {stats.totalBeds ?? 0} occupied
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Password ── */}
      <div className="arch-card p-7 md:p-8">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <MdLock className="text-red-500" size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-text-primary">
                Change Password
              </h3>
              <p className="text-[10px] text-text-tertiary">Update your admin account password</p>
            </div>
          </div>
          {!changingPwd && (
            <button
              onClick={() => setChangingPwd(true)}
              className="btn btn-ghost text-xs py-2 px-4 inline-flex items-center gap-1.5 border border-border"
            >
              <MdLock size={14} /> Change Password
            </button>
          )}
        </div>

        {changingPwd && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            {/* Current password */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                Current Password
              </label>
              <div className="relative">
                <MdLock
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
                  size={17}
                />
                <input
                  required
                  type={showCurrent ? "text" : "password"}
                  className="field pl-11 pr-11"
                  placeholder="Current password"
                  value={pwdForm.currentPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                >
                  {showCurrent ? <MdVisibilityOff size={17} /> : <MdVisibility size={17} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                New Password
              </label>
              <div className="relative">
                <MdLock
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
                  size={17}
                />
                <input
                  required
                  type={showNew ? "text" : "password"}
                  className="field pl-11 pr-11"
                  placeholder="Min 8 chars, upper, lower, number"
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                >
                  {showNew ? <MdVisibilityOff size={17} /> : <MdVisibility size={17} />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                Confirm New Password
              </label>
              <div className="relative">
                <MdLock
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
                  size={17}
                />
                <input
                  required
                  type={showConfirm ? "text" : "password"}
                  className="field pl-11 pr-11"
                  placeholder="Repeat new password"
                  value={pwdForm.confirmPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                >
                  {showConfirm ? <MdVisibilityOff size={17} /> : <MdVisibility size={17} />}
                </button>
              </div>
              {pwdForm.confirmPassword && pwdForm.newPassword !== pwdForm.confirmPassword && (
                <p className="text-[10px] text-red-500 ml-1">Passwords do not match</p>
              )}
            </div>

            {/* Strength hint */}
            <p className="text-[10px] text-text-tertiary ml-1">
              Must be at least 8 characters with one uppercase letter, one lowercase letter, and one
              number.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={pwdSaving}
                className="btn btn-primary flex-1 py-3 text-sm inline-flex items-center justify-center gap-2"
              >
                <MdSave size={16} />
                {pwdSaving ? "Updating…" : "Update Password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChangingPwd(false);
                  setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                }}
                className="btn btn-ghost py-3 text-sm inline-flex items-center gap-2"
              >
                <MdClose size={15} /> Cancel
              </button>
            </div>
          </form>
        )}

        {!changingPwd && (
          <p className="text-xs text-text-tertiary/70">
            Use a strong password with at least 8 characters including uppercase, lowercase, and
            numbers. After changing your password, you will be signed out from all other devices.
          </p>
        )}
      </div>
    </div>
  );
};

export default AdminProfile;
