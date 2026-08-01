import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  MdEmail,
  MdLock,
  MdVpnKey,
  MdBusiness,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";
import toast from "react-hot-toast";

const AdminLogin = () => {
  const [method, setMethod] = useState("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, sendOwnerLoginOtp, verifyOwnerLoginOtp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setInterval(() => setOtpCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [otpCooldown]);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendOwnerLoginOtp(email);
      setOtpSent(true);
      setOtpCooldown(15);
      toast.success("OTP sent to your email!");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Enter 6-digit OTP");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await verifyOwnerLoginOtp(email, otp);
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background overflow-hidden relative">
      {/* ═══ BRAND PANEL ═══ */}
      <div
        className="hidden lg:flex lg:w-[55%] relative overflow-hidden items-center justify-center p-16"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 30% 30%, rgba(107, 143, 113, 0.06) 0%, transparent 80%)`,
          backgroundColor: "var(--color-background-deep)",
        }}
      >
        <div
          className="absolute w-[400px] h-[400px] -top-24 -left-24 opacity-[0.04]"
          style={{ background: "radial-gradient(circle at 40% 40%, #6B8F71, transparent 70%)" }}
        />
        <div className="relative z-10 max-w-md w-full">
          <div className="bg-white rounded-2xl p-10 shadow-lg border border-border">
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mb-8">
              <MdBusiness className="text-2xl text-white" />
            </div>
            <h1 className="text-4xl font-bold font-display text-text-primary tracking-tight leading-[1.08] mb-2">
              Sri Rama
            </h1>
            <p className="text-sm text-text-secondary font-medium mb-7 leading-relaxed">
              Complete hostel management platform — rooms, tenants, payments, and reports all in one
              place.
            </p>
            <div className="space-y-3.5">
              {[
                { title: "Room Management", desc: "Floors, rooms, beds — full inventory control." },
                { title: "Tenant Management", desc: "Onboard, track, and manage residents." },
                {
                  title: "Payments & Reports",
                  desc: "Rent tracking, expenses, and financial overview.",
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary/60 mt-2 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-text-primary">{item.title}</p>
                    <p className="text-xs text-text-secondary/70">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-xs text-text-secondary/50 font-medium text-center">
                Built for hostel owners, by people who run hostels.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ LOGIN FORM ═══ */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 md:p-12 relative z-10">
        <div className="w-full max-w-sm animate-slide-up">
          {/* Mobile brand */}
          <div className="lg:hidden text-center mb-12">
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-md">
              <MdBusiness className="text-2xl text-white" />
            </div>
            <h1 className="text-3xl font-bold font-display text-text-primary tracking-tight">
              Sri Rama
            </h1>
            <p className="text-[10px] text-text-secondary font-medium uppercase tracking-[0.15em] mt-1">
              Admin Portal
            </p>
          </div>

          <div className="hidden lg:block mb-10">
            <h2 className="text-[1.75rem] font-bold font-display tracking-tight mb-1 text-text-primary leading-[1.08]">
              Admin Login
            </h2>
            <p className="text-sm text-text-secondary">Sign in to manage your hostel</p>
          </div>

          {/* Method toggle */}
          <div className="flex bg-white p-1 rounded-[16px] gap-1 border border-border/60 shadow-sm mb-8">
            <button
              onClick={() => {
                setMethod("password");
                setOtpSent(false);
                setOtp("");
                setError("");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[14px] font-bold text-xs uppercase tracking-wider transition-all duration-300 ${
                method === "password"
                  ? "bg-primary text-white shadow-md shadow-primary/30"
                  : "text-text-secondary/50 hover:text-text-secondary"
              }`}
            >
              <MdLock size={15} /> Password
            </button>
            <button
              onClick={() => {
                setMethod("otp");
                setOtpSent(false);
                setOtp("");
                setError("");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[14px] font-bold text-xs uppercase tracking-wider transition-all duration-300 ${
                method === "otp"
                  ? "bg-primary text-white shadow-md shadow-primary/30"
                  : "text-text-secondary/50 hover:text-text-secondary"
              }`}
            >
              <MdVpnKey size={15} /> OTP
            </button>
          </div>

          {method === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-5">
              <div className="space-y-1.5">
                <label className="form-label">Admin Email</label>
                <div className="relative group">
                  <MdEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                  <input
                    required
                    type="email"
                    className="field-input pl-11"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter admin email"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Password</label>
                <div className="relative">
                  <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    className="field-input pl-11 pr-11"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                  >
                    {showPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                  </button>
                </div>
              </div>
              <button
                disabled={loading || !password}
                type="submit"
                className="btn btn-primary w-full py-4"
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />{" "}
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
              {error && (
                <p className="text-[10px] text-danger font-semibold mt-3 text-center">{error}</p>
              )}
            </form>
          )}

          {method === "otp" && !otpSent && (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div className="space-y-1.5">
                <label className="form-label">Admin Email</label>
                <div className="relative group">
                  <MdEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                  <input
                    required
                    type="email"
                    className="field-input pl-11"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter admin email"
                  />
                </div>
              </div>
              <button
                disabled={loading || otpCooldown > 0}
                type="submit"
                className="btn btn-primary w-full py-4"
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />{" "}
                    Sending...
                  </>
                ) : otpCooldown > 0 ? (
                  `Resend in ${otpCooldown}s`
                ) : (
                  "Send OTP to Email"
                )}
              </button>
            </form>
          )}

          {method === "otp" && otpSent && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setError("");
                  }}
                  className="text-text-tertiary hover:text-text-primary"
                >
                  <MdVpnKey size={18} />
                </button>
                <p className="text-xs text-text-secondary font-medium">OTP sent to {email}</p>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Verification Code</label>
                <div className="relative">
                  <MdVpnKey className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    className="field-input pl-11 tracking-[0.5em] text-center font-bold text-2xl"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </div>
              </div>
              <button
                disabled={loading || otp.length !== 6}
                type="submit"
                className="btn btn-primary w-full py-4"
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />{" "}
                    Verifying...
                  </>
                ) : (
                  "Verify & Login"
                )}
              </button>
              {error && (
                <p className="text-[10px] text-danger font-semibold mt-3 text-center">{error}</p>
              )}
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || otpCooldown > 0}
                className="w-full text-[10px] text-primary font-semibold hover:underline"
              >
                {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend OTP"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
