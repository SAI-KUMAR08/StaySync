import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  MdEmail, MdLock, MdLogin, MdPhone,
  MdVpnKey, MdPerson, MdBusiness, MdArrowForward,
  MdVisibility, MdVisibilityOff, MdHome
} from "react-icons/md";
import toast from "react-hot-toast";

const Login = () => {
  const [role, setRole] = useState("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, sendOTP, tenantLogin } = useAuth();
  const navigate = useNavigate();

  const handleOwnerSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
      navigate("/admin/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await sendOTP(phone);
      setOtpSent(true);
      if (res?.otp) {
        setOtp(res.otp);
        toast.success(`Use OTP: ${res.otp}`, { icon: "🧪" });
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleTenantLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await tenantLogin(phone, otp);
      toast.success("Welcome to your digital home!");
      navigate("/tenant/dashboard");
    } catch (error) {
      toast.error("Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* LEFT — Creative Brand Panel */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-[#09090B] via-[#1C0A2B] to-[#2D0A3E] relative overflow-hidden items-center justify-center p-16">
        {/* Animated geometric decorations */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] left-[10%] w-80 h-80 rounded-full bg-primary/[0.08] blur-[100px] animate-pulse-soft" />
          <div className="absolute bottom-[15%] right-[5%] w-96 h-96 rounded-full bg-accent/[0.06] blur-[120px] animate-pulse-soft" style={{ animationDelay: '1.5s' }} />
          <div className="absolute top-[45%] right-[20%] w-56 h-56 rounded-full bg-cyan-500/[0.04] blur-[80px] animate-pulse-soft" style={{ animationDelay: '3s' }} />

          {/* Floating geometric shapes — creative set */}
          <svg className="absolute top-[18%] left-[8%] w-20 h-20 text-primary/15 animate-float" viewBox="0 0 100 100">
            <polygon points="50,0 100,50 50,100 0,50" fill="currentColor" />
          </svg>
          <svg className="absolute bottom-[20%] right-[12%] w-24 h-24 text-accent/12 animate-float-delayed" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="currentColor" opacity="0.4" />
          </svg>
          <svg className="absolute top-[55%] left-[15%] w-14 h-14 text-cyan-500/15 animate-drift" viewBox="0 0 100 100">
            <rect x="10" y="10" width="80" height="80" rx="18" fill="currentColor" />
          </svg>
          <svg className="absolute top-[28%] right-[22%] w-16 h-16 text-violet-400/15 animate-float" viewBox="0 0 100 100" style={{ animationDelay: '2s' }}>
            <polygon points="50,5 95,35 80,90 20,90 5,35" fill="currentColor" />
          </svg>
          {/* Extra floating dots */}
          <div className="absolute top-[35%] left-[30%] w-2 h-2 rounded-full bg-white/30 animate-breathe" />
          <div className="absolute top-[65%] right-[35%] w-1.5 h-1.5 rounded-full bg-accent/40 animate-breathe" style={{ animationDelay: '1.2s' }} />
          <div className="absolute top-[20%] right-[40%] w-3 h-3 rounded-full bg-primary/30 animate-breathe" style={{ animationDelay: '2.4s' }} />
        </div>

        <div className="relative z-10 max-w-lg">
          <div className="glass-dark rounded-[3rem] p-10 backdrop-blur-2xl">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-8 shadow-2xl shadow-primary/30">
              <MdHome className="text-3xl text-white" />
            </div>
            <h1 className="text-5xl font-black font-sans text-white tracking-tight leading-[1.1] mb-4">
              <span className="bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent">Stay</span>Sync
            </h1>
            <p className="text-lg text-white/60 font-medium mb-6 leading-relaxed">
              Complete hostel management platform — from room allocation to rent collection, all in one place.
            </p>
            <div className="flex flex-wrap gap-3">
              {["Smart Billing", "Real-time Reports", "Digital Rent Collection"].map(f => (
                <span key={f} className="px-3 py-1.5 rounded-xl bg-white/[0.06] text-white/50 text-[10px] font-bold uppercase tracking-wider border border-white/[0.06]">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT — Login Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 md:p-10 bg-[#FAFAFA]">
        <div className="w-full max-w-sm animate-slide-up">
          {/* Mobile brand (shown on small screens) */}
          <div className="lg:hidden text-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4 shadow-xl shadow-primary/20">
              <MdHome className="text-2xl text-white" />
            </div>
            <h1 className="text-3xl font-black font-sans text-text-primary tracking-tight">
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Stay</span>Sync
            </h1>
            <p className="text-[10px] text-text-secondary font-medium uppercase tracking-[0.15em] mt-1">Smart Hostel Management Platform</p>
          </div>

          <div className="space-y-7">
            {/* Role Switcher — Creative pill tabs */}
            <div className="flex bg-zinc-100/80 p-1 rounded-2xl gap-1">
              <button onClick={() => { setRole("owner"); setOtpSent(false); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                  role === 'owner' ? 'bg-card text-primary shadow-sm shadow-zinc-200/50' : 'text-text-secondary/50 hover:text-text-secondary'
                }`}>
                <MdBusiness size={15} /> Owner
              </button>
              <button onClick={() => { setRole("tenant"); setOtpSent(false); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                  role === 'tenant' ? 'bg-card text-primary shadow-sm shadow-zinc-200/50' : 'text-text-secondary/50 hover:text-text-secondary'
                }`}>
                <MdPerson size={15} /> Resident
              </button>
            </div>

            {role === "owner" ? (
              <form onSubmit={handleOwnerSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Work Email</label>
                  <div className="relative">
                    <MdEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/30 text-lg" />
                    <input required type="email" className="field-input pl-11" placeholder="name@company.com"
                      value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Password</label>
                  <div className="relative">
                    <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/30 text-lg" />
                    <input required type={showPassword ? "text" : "password"} autoComplete="current-password"
                      className="field-input pl-11 pr-11" placeholder="Enter your password"
                      value={password} onChange={(e) => setPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/30 hover:text-text-secondary transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <MdVisibilityOff size={17} /> : <MdVisibility size={17} />}
                    </button>
                  </div>
                </div>
                <button disabled={loading} type="submit" className="btn-primary w-full py-4 text-sm">
                  {loading ? "Signing in..." : "Access Dashboard"}
                </button>
              </form>
            ) : (
              <form onSubmit={otpSent ? handleTenantLogin : handleSendOTP} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Mobile Number</label>
                  <div className="relative">
                    <MdPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/30 text-lg" />
                    <input required disabled={otpSent} type="tel" className="field-input pl-11 disabled:opacity-50"
                      placeholder="+91 00000 00000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
                {otpSent && (
                  <div className="space-y-1.5 animate-slide-up">
                    <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Verification Code</label>
                    <div className="relative">
                      <MdVpnKey className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/30 text-lg" />
                      <input required type="text" maxLength="6" className="field-input pl-11 tracking-[0.5em] text-center font-bold"
                        placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value)} />
                    </div>
                    <button type="button" onClick={() => setOtpSent(false)} className="text-[9px] text-primary font-semibold hover:underline mt-1 ml-1">Change number?</button>
                  </div>
                )}
                <button disabled={loading} type="submit" className="btn-primary w-full py-4 text-sm">
                  {loading ? "Please wait..." : otpSent ? "Verify & Enter" : "Get Verification Code"}
                </button>
              </form>
            )}

            <div className="text-center pt-3 border-t border-border/50">
              <p className="text-xs text-text-secondary/50 font-medium">
                Own a hostel?{" "}
                <Link to="/onboarding" className="text-primary font-bold hover:text-primary-hover inline-flex items-center gap-1 transition-colors">
                  Register here <MdArrowForward size={13} />
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
