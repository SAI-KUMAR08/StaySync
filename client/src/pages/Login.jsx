import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  MdEmail, MdLock,
  MdVpnKey, MdPerson, MdBusiness, MdArrowForward,
  MdVisibility, MdVisibilityOff, MdHome, MdArrowBack
} from "react-icons/md";
import toast from "react-hot-toast";

const Login = () => {
  const COUNTRY_CODES = [
    { code: "+91", label: "IN", flag: "🇮🇳" },
    { code: "+1", label: "US", flag: "🇺🇸" },
    { code: "+44", label: "UK", flag: "🇬🇧" },
    { code: "+61", label: "AU", flag: "🇦🇺" },
    { code: "+971", label: "UAE", flag: "🇦🇪" },
    { code: "+65", label: "SG", flag: "🇸🇬" },
  ];

  const [role, setRole] = useState("owner");
  const [email, setEmail] = useState("");

  // Tenant auth state
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [tenantFlow, setTenantFlow] = useState("phone"); // "phone" | "password" | "set-password"
  const [tenantPassword, setTenantPassword] = useState("");
  const [showTenantPassword, setShowTenantPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  // Owner OTP login state
  const [ownerOtpSent, setOwnerOtpSent] = useState(false);
  const [ownerOtp, setOwnerOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const { sendOwnerLoginOtp, verifyOwnerLoginOtp, checkTenantStatus, tenantPasswordLogin, setInitialPassword } = useAuth();
  const navigate = useNavigate();

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhone(raw);
    if (raw.length > 0 && raw.length !== 10) {
      setPhoneError("Must be exactly 10 digits");
    } else {
      setPhoneError("");
    }
  };

  const handleOwnerSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendOwnerLoginOtp(email);
      setOwnerOtpSent(true);
      toast.success("OTP sent to your email!");
    } catch (error) {
      // toast handled in context
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerVerifyOtp = async (e) => {
    e.preventDefault();
    if (ownerOtp.length !== 6) { toast.error("Please enter the 6-digit OTP"); return; }
    setLoading(true);
    try {
      await verifyOwnerLoginOtp(email, ownerOtp);
      navigate("/admin/dashboard");
    } catch (error) {
      // toast handled in context
    } finally {
      setLoading(false);
    }
  };

  const resetOwnerOtpState = () => {
    setOwnerOtpSent(false);
    setOwnerOtp("");
  };

  const fullPhone = () => countryCode + phone;

  // Step 1: Check tenant status
  const handleCheckPhone = async (e) => {
    e.preventDefault();
    if (phone.length !== 10) { setPhoneError("Must be exactly 10 digits"); return; }
    setLoading(true);
    try {
      const status = await checkTenantStatus(fullPhone());
      if (!status.exists) {
        toast.error("No resident found with this number");
        return;
      }
      if (status.hasPassword) {
        setTenantFlow("password");
      } else {
        // First time — go directly to set password
        setTenantFlow("set-password");
      }
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      console.error("Check phone error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Password login
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!tenantPassword) return;
    setLoading(true);
    try {
      await tenantPasswordLogin(fullPhone(), tenantPassword);
      navigate("/tenant/dashboard");
    } catch {
      // toast handled in context
    } finally {
      setLoading(false);
    }
  };

  // Set password (first time — no OTP needed)
  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      await setInitialPassword(fullPhone(), newPassword);
      navigate("/tenant/dashboard");
    } catch {
      // toast handled in context
    } finally {
      setLoading(false);
    }
  };

  const resetTenantState = () => {
    setTenantFlow("phone");
    setTenantPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPhone("");
    setPhoneError("");
    setShowNewPassword(false);
  };

  return (
    <div className="min-h-screen flex bg-background overflow-hidden relative">

      {/* ═══ LUXURY ANIMATED BACKGROUND ═══ */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Gradient overlay */}
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 20% 20%, rgba(92, 61, 46, 0.04) 0%, transparent 60%),
              radial-gradient(ellipse 60% 40% at 80% 80%, rgba(184, 134, 11, 0.03) 0%, transparent 50%),
              var(--color-background-deep)
            `
          }}
        />
        {/* Giant arch silhouette */}
        <svg className="absolute -top-40 -left-40 w-[700px] h-[700px] opacity-[0.025]" viewBox="0 0 700 700" fill="none">
          <path d="M550 700 C550 400, 380 100, 350 100 C320 100, 150 400, 150 700" stroke="#5C3D2E" strokeWidth="1.5" />
          <path d="M480 700 C480 470, 370 180, 350 180 C330 180, 220 470, 220 700" stroke="#5C3D2E" strokeWidth="1" />
          <path d="M410 700 C410 540, 340 260, 350 260 C360 260, 290 540, 290 700" stroke="#5C3D2E" strokeWidth="0.8" />
        </svg>
        {/* Floating decorative elements */}
        <div className="absolute top-[18%] right-[12%] w-24 h-24 rounded-full border border-primary/15 animate-float" style={{ animationDuration: '8s' }} />
        <div className="absolute top-[40%] right-[5%] w-16 h-16 rounded-full border border-accent/10 animate-float" style={{ animationDuration: '10s', animationDelay: '1s' }} />
        <div className="absolute bottom-[25%] left-[8%] w-20 h-20 rounded-full border border-primary/10 animate-float" style={{ animationDuration: '7s', animationDelay: '2s' }} />
        <div className="absolute top-[60%] left-[15%] w-12 h-12 rounded-full bg-primary/5 animate-float" style={{ animationDuration: '9s', animationDelay: '0.5s' }} />
        {/* Geometric jaali dots */}
        <div className="absolute top-1/4 right-[20%] w-48 h-48 opacity-[0.02]"
          style={{
            backgroundImage: 'radial-gradient(circle, #5C3D2E 1px, transparent 1px)',
            backgroundSize: '14px 14px'
          }}
        />
        <div className="absolute bottom-1/4 left-[5%] w-32 h-32 opacity-[0.02]"
          style={{
            backgroundImage: 'radial-gradient(circle, #B8860B 1px, transparent 1px)',
            backgroundSize: '10px 10px'
          }}
        />
      </div>

      {/* ═══ BRAND PANEL — Luxury brand experience ═══ */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden items-center justify-center p-16">
        {/* Subtle moving gradient */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            background: 'linear-gradient(-45deg, #5C3D2E, #B8860B, #5C3D2E, #B8860B)',
            backgroundSize: '400% 400%',
            animation: 'gradient-shift 15s ease infinite',
          }}
        />

        <div className="relative z-10 max-w-lg w-full">

          {/* Premium brand card */}
          <div className="bg-white/90 backdrop-blur-2xl rounded-[32px] shadow-elevated border border-white/30 overflow-hidden animate-tilt-in">
            {/* Decorative top gradient */}
            <div className="h-[3px] bg-gradient-to-r from-transparent via-primary to-accent via-primary to-transparent" />

            <div className="p-10 md:p-12">
              {/* Arched logo */}
              <div className="flex justify-center lg:justify-start mb-10">
                <div className="relative w-20 h-[90px] group">
                  <div className="absolute inset-0 bg-primary rounded-[10px] rounded-b-[24px] shadow-xl shadow-primary/30 group-hover:shadow-2xl group-hover:shadow-primary/40 transition-shadow duration-500">
                    <div className="absolute inset-0 rounded-[10px] rounded-b-[24px] bg-gradient-to-b from-white/10 to-transparent" />
                  </div>
                  <div className="absolute top-[3px] left-[5px] right-[5px] h-[6px] bg-white/15 rounded-t-[6px]"></div>
                  <MdHome className="text-3xl text-white absolute inset-0 m-auto z-10" />
                  {/* Glow ring */}
                  <div className="absolute -inset-4 rounded-full bg-primary/10 animate-glow-pulse pointer-events-none" />
                </div>
              </div>

              <h1 className="text-[2.75rem] md:text-[3.25rem] font-bold font-display text-text-primary tracking-tight leading-[1.03] mb-3 text-center lg:text-left">
                Sri Rama
              </h1>
              <p className="text-base text-text-secondary/80 font-medium mb-10 leading-relaxed text-center lg:text-left">
                Hostel management crafted with care — rent tracking, maintenance, and resident records under one roof.
              </p>

              {/* Feature highlights */}
              <div className="space-y-4">
                {[
                  { title: "Rent & billing", desc: "Monthly invoices, due reminders, payment history." },
                  { title: "Maintenance", desc: "Residents submit requests; you track and close them." },
                  { title: "Resident records", desc: "Room assignments, contact info, move-in dates." },
                ].map((item, i) => (
                  <div key={i} className="group flex items-start gap-4 p-3.5 rounded-[16px] hover:bg-primary/5 transition-all duration-300" style={{ animationDelay: `${i * 0.1 + 0.3}s` }}>
                    <div className="w-1 h-10 rounded-full bg-primary/30 mt-0.5 shrink-0 group-hover:h-12 transition-all duration-300" />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                      <p className="text-xs text-text-secondary/70 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Ornamental footer */}
              <div className="mt-10 pt-6 border-t border-border/40">
                <p className="text-[11px] text-text-tertiary/50 font-medium text-center italic font-display">
                  Built for hostel owners, by people who run hostels.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ LOGIN FORM — Premium glass card ═══ */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 md:p-12 relative z-10">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden text-center mb-12 animate-fade-in">
            <div className="relative w-16 h-[72px] flex items-center justify-center mx-auto mb-5">
              <div className="absolute inset-0 bg-primary rounded-[8px] rounded-b-[20px] shadow-xl shadow-primary/30">
                <div className="absolute inset-0 rounded-[8px] rounded-b-[20px] bg-gradient-to-b from-white/10 to-transparent" />
              </div>
              <div className="absolute top-[2px] left-[4px] right-[4px] h-[5px] bg-white/15 rounded-t-[5px]"></div>
              <MdHome className="text-xl text-white relative z-10" />
            </div>
            <h1 className="text-3xl font-bold font-display text-text-primary tracking-tight">
              Sri Rama
            </h1>
            <p className="text-[10px] text-text-secondary font-medium uppercase tracking-[0.2em] mt-1">
              Hostel Management
            </p>
          </div>

          {/* Desktop title */}
          <div className="hidden lg:block mb-10 animate-reveal" style={{ animationDelay: '0.2s' }}>
            <h2 className="text-[1.75rem] font-bold font-display tracking-tight mb-1 text-text-primary leading-[1.08]">Welcome back</h2>
            <p className="text-sm text-text-secondary">Sign in to your dashboard</p>
          </div>

          <div className="space-y-8" style={{ animation: 'reveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: '0.3s', opacity: 0 }}>

            {/* Role switcher */}
            <div className="flex bg-white p-1 rounded-[16px] gap-1 border border-border/60 shadow-sm">
              {[
                { key: "owner", label: "Owner", icon: MdBusiness },
                { key: "tenant", label: "Resident", icon: MdPerson },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setRole(key); resetOwnerOtpState(); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[14px] font-bold text-xs uppercase tracking-wider transition-all duration-300 ${
                    role === key
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'text-text-secondary/50 hover:text-text-secondary'
                  }`}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>

            {role === "owner" ? !ownerOtpSent ? (
              <form onSubmit={handleOwnerSendOtp} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="form-label">Work Email</label>
                  <div className="relative group">
                    <MdEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg group-focus-within:text-primary transition-colors" />
                    <input
                      required
                      type="email"
                      className="field-input pl-11"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  disabled={loading || !email}
                  type="submit"
                  className="btn-primary w-full py-4 text-sm"
                >
                  {loading ? "Sending OTP..." : "Send OTP to Email"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOwnerVerifyOtp} className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setOwnerOtpSent(false); setOwnerOtp(""); }}
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    <MdArrowBack size={18} />
                  </button>
                  <p className="text-xs text-text-secondary font-medium">
                    OTP sent to {email}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Verification Code</label>
                  <div className="relative">
                    <MdVpnKey className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                    <input
                      required
                      type="text"
                      maxLength="6"
                      className="field-input pl-11 tracking-[0.5em] text-center font-bold"
                      placeholder="000000"
                      value={ownerOtp}
                      onChange={(e) => setOwnerOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                </div>
                <button
                  disabled={loading || ownerOtp.length !== 6}
                  type="submit"
                  className="btn-primary w-full py-4 text-sm"
                >
                  {loading ? "Verifying..." : "Verify & Login"}
                </button>
                <button
                  type="button"
                  onClick={handleOwnerSendOtp}
                  disabled={loading}
                  className="w-full text-[10px] text-primary font-semibold hover:underline"
                >
                  Resend OTP
                </button>
              </form>
            ) : tenantFlow === "phone" ? (
              <form onSubmit={handleCheckPhone} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="form-label">Mobile Number</label>
                  <div className="flex gap-2">
                    <div className="relative shrink-0">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="field-select !pr-7 !pl-3 !w-[88px] text-center font-bold text-sm"
                      >
                        {COUNTRY_CODES.map((cc) => (
                          <option key={`${cc.code}-${cc.label}`} value={cc.code}>
                            {cc.flag} {cc.code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="relative flex-1">
                      <input
                        required
                        type="tel"
                        inputMode="numeric"
                        className="field-input font-mono tracking-wider text-center text-lg"
                        placeholder="0000000"
                        value={phone}
                        onChange={handlePhoneChange}
                      />
                    </div>
                  </div>
                  {phoneError && (
                    <p className="text-[10px] text-danger font-semibold mt-1 ml-1">{phoneError}</p>
                  )}
                </div>
                <button
                  disabled={loading || phone.length !== 10}
                  type="submit"
                  className="btn-primary w-full py-4 text-sm"
                >
                  {loading ? "Checking..." : "Continue"}
                </button>
              </form>

            ) : tenantFlow === "password" ? (
              <form onSubmit={handlePasswordLogin} className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setTenantFlow("phone"); setTenantPassword(""); setNewPassword(""); setConfirmPassword(""); }}
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    <MdArrowBack size={18} />
                  </button>
                  <p className="text-xs text-text-secondary font-medium">
                    {countryCode} {phone}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Password</label>
                  <div className="relative">
                    <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                    <input
                      required
                      type={showTenantPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="field-input pl-11 pr-11"
                      placeholder="Enter your password"
                      value={tenantPassword}
                      onChange={(e) => setTenantPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowTenantPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                      {showTenantPassword ? <MdVisibilityOff size={17} /> : <MdVisibility size={17} />}
                    </button>
                  </div>
                </div>
                <button
                  disabled={loading || !tenantPassword}
                  type="submit"
                  className="btn-primary w-full py-4 text-sm"
                >
                  {loading ? "Signing in..." : "Login"}
                </button>
              </form>

            ) : tenantFlow === "set-password" ? (
              <form onSubmit={handleSetPassword} className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setTenantFlow("phone"); resetTenantState(); }}
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    <MdArrowBack size={18} />
                  </button>
                  <div>
                    <p className="text-sm font-bold font-display text-text-primary">Set your password</p>
                    <p className="text-[10px] text-text-secondary">{countryCode} {phone}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="form-label">New Password</label>
                  <div className="relative">
                    <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                    <input
                      required
                      type={showNewPassword ? "text" : "password"}
                      className="field-input pl-11 pr-11"
                      placeholder="Min 8 chars, upper, lower, number"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                    >
                      {showNewPassword ? <MdVisibilityOff size={17} /> : <MdVisibility size={17} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Confirm Password</label>
                  <input
                    required
                    type="password"
                    className="field-input"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-[10px] text-danger font-semibold mt-1">Passwords do not match</p>
                  )}
                </div>
                <button
                  disabled={loading || !newPassword || newPassword !== confirmPassword}
                  type="submit"
                  className="btn-primary w-full py-4 text-sm"
                >
                  {loading ? "Setting up..." : "Set Password & Login"}
                </button>
              </form>

            ) : null}

            <div className="text-center pt-5 border-t border-border/40">
              <p className="text-xs text-text-secondary/50 font-medium">
                Own a hostel?{" "}
                <Link
                  to="/onboarding"
                  className="text-primary font-bold hover:text-primary-hover inline-flex items-center gap-1 transition-colors"
                >
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
