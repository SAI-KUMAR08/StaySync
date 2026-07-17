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

      {/* Decorative background — arch motif */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Large arch silhouette left */}
        <svg className="absolute -top-32 -left-32 w-[600px] h-[600px] opacity-[0.03]" viewBox="0 0 600 600" fill="none">
          <path d="M500 600 C500 350, 350 80, 300 80 C250 80, 100 350, 100 600" stroke="#5C3D2E" strokeWidth="1.5" />
          <path d="M420 600 C420 400, 320 160, 300 160 C280 160, 180 400, 180 600" stroke="#5C3D2E" strokeWidth="1" />
          <path d="M340 600 C340 460, 290 240, 300 240 C310 240, 260 460, 260 600" stroke="#5C3D2E" strokeWidth="0.8" />
        </svg>
        {/* Jaali dots right */}
        <div className="absolute top-1/3 right-[8%] w-32 h-32 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle, #5C3D2E 1px, transparent 1px)',
            backgroundSize: '10px 10px'
          }}
        />
        {/* Floating orb bottom */}
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.025]"
          style={{ background: 'radial-gradient(circle, #5C3D2E, transparent 70%)' }}
        />
      </div>

      {/* ═══ BRAND PANEL — Heritage arched portal ═══ */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden items-center justify-center p-16"
        style={{
          background: `
            radial-gradient(ellipse 100% 60% at 30% 20%, rgba(92, 61, 46, 0.04) 0%, transparent 70%),
            var(--color-background-deep)
          `
        }}
      >
        {/* Large decorative arch */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[500px] h-[500px] opacity-[0.04]">
          <svg viewBox="0 0 500 500" fill="none" className="w-full h-full">
            <path d="M350 500 C350 300, 275 100, 250 100 C225 100, 150 300, 150 500" stroke="#5C3D2E" strokeWidth="1.5" />
            <path d="M400 500 C400 250, 290 60, 250 60 C210 60, 100 250, 100 500" stroke="#5C3D2E" strokeWidth="1" />
          </svg>
        </div>

        {/* Floating decorative circles */}
        <div className="absolute top-1/4 right-[15%] w-16 h-16 rounded-full border border-primary/10 animate-float" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-1/3 left-[10%] w-10 h-10 rounded-full border border-primary/10 animate-float" style={{ animationDuration: '8s', animationDelay: '1s' }} />

        {/* Content */}
        <div className="relative z-10 max-w-md w-full">
          {/* Arched card with decorative top */}
          <div className="bg-white rounded-[28px] shadow-float border border-border/50 overflow-hidden relative">
            {/* Decorative arch gradient at top */}
            <div className="h-2 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

            <div className="p-10">
              {/* Logo with arch motif */}
              <div className="relative w-16 h-[72px] flex items-center justify-center mb-8 mx-auto lg:mx-0">
                <div className="absolute inset-0 bg-primary rounded-[10px] rounded-b-[20px] shadow-lg shadow-primary/25"></div>
                <div className="absolute top-[3px] left-[4px] right-[4px] h-[6px] bg-white/10 rounded-t-[6px]"></div>
                <MdHome className="text-2xl text-white relative z-10" />
              </div>

              <h1 className="text-4xl font-bold font-display text-text-primary tracking-tight leading-[1.08] mb-2 text-center lg:text-left">
                Sri Rama
              </h1>
              <p className="text-sm text-text-secondary font-medium mb-8 leading-relaxed text-center lg:text-left">
                Hostel management for real life — rent tracking, maintenance requests, and resident records under one roof.
              </p>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3 p-3 rounded-[16px] bg-background/50">
                  <div className="w-[3px] h-8 rounded-full bg-primary/40 mt-1 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-text-primary">Rent & billing</p>
                    <p className="text-xs text-text-secondary/70">Monthly invoices, due reminders, payment history.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-[16px] bg-background/50">
                  <div className="w-[3px] h-8 rounded-full bg-primary/40 mt-1 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-text-primary">Maintenance</p>
                    <p className="text-xs text-text-secondary/70">Residents submit requests; you track and close them.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-[16px] bg-background/50">
                  <div className="w-[3px] h-8 rounded-full bg-primary/40 mt-1 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-text-primary">Resident records</p>
                    <p className="text-xs text-text-secondary/70">Room assignments, contact info, move-in dates.</p>
                  </div>
                </div>
              </div>

              {/* Ornamental divider */}
              <div className="ornamental-divider mb-6">
                <div className="ornament"><span></span><span></span><span></span></div>
              </div>

              <p className="text-[10px] text-text-tertiary/50 font-medium text-center italic font-display">
                Built for hostel owners, by people who run hostels.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ LOGIN FORM ═══ */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 md:p-12 relative z-10">
        <div className="w-full max-w-sm animate-tilt-in">

          {/* Mobile brand — with arch */}
          <div className="lg:hidden text-center mb-12">
            <div className="relative w-14 h-[60px] flex items-center justify-center mx-auto mb-4">
              <div className="absolute inset-0 bg-primary rounded-[8px] rounded-b-[16px] shadow-md shadow-primary/20"></div>
              <div className="absolute top-[2px] left-[3px] right-[3px] h-[5px] bg-white/10 rounded-t-[5px]"></div>
              <MdHome className="text-xl text-white relative z-10" />
            </div>
            <h1 className="text-3xl font-bold font-display text-text-primary tracking-tight">
              Sri Rama
            </h1>
            <p className="text-[10px] text-text-secondary font-medium uppercase tracking-[0.15em] mt-1">
              Hostel Management
            </p>
          </div>

          {/* Desktop title */}
          <div className="hidden lg:block mb-10">
            <h2 className="text-[1.75rem] font-bold font-display tracking-tight mb-1 text-text-primary leading-[1.08]">Sign in</h2>
            <p className="text-sm text-text-secondary">to your hostel dashboard</p>
          </div>

          <div className="space-y-8">

            {/* Role switcher — pill design */}
            <div className="flex bg-surface p-1 rounded-[16px] gap-1 border border-border shadow-sm">
              {[
                { key: "owner", label: "Owner", icon: MdBusiness },
                { key: "tenant", label: "Resident", icon: MdPerson },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setRole(key); resetOwnerOtpState(); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[14px] font-bold text-xs uppercase tracking-wider transition-all duration-300 ${
                    role === key
                      ? 'bg-primary text-white shadow-md shadow-primary/25'
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
                  <div className="relative">
                    <MdEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
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
              /* ═══ Step 1: Phone input ═══ */
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
              /* ═══ Password login ═══ */
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
              /* ═══ First-time set password ═══ */
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
