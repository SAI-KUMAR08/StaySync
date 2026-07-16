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
    { code: "+1", label: "CA", flag: "🇨🇦" },
  ];

  const [role, setRole] = useState("owner");
  const [email, setEmail] = useState("");

  // Tenant auth state
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [tenantFlow, setTenantFlow] = useState("phone"); // "phone" | "password" | "otp" | "set-password" | "forgot-password"
  const [tenantPassword, setTenantPassword] = useState("");
  const [showTenantPassword, setShowTenantPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  // Owner OTP login state
  const [ownerOtpSent, setOwnerOtpSent] = useState(false);
  const [ownerOtp, setOwnerOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const { sendOwnerLoginOtp, verifyOwnerLoginOtp, sendOTP, tenantLogin, checkTenantStatus, tenantPasswordLogin, setTenantPassword: setPwd, sendForgotOtp, resetTenantPassword } = useAuth();
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
        // First time — send OTP to set password
        setTenantFlow("otp");
        handleSendOtp();
      }
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      console.error("Check phone error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Send OTP for first-time password setup
  const handleSendOtp = async () => {
    setLoading(true);
    try {
      const res = await sendOTP(fullPhone());
      setOtpSent(true);
      toast.success("OTP sent to your phone!");
    } catch {
      // toast handled in context
    } finally { setLoading(false); }
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

  // Set password with OTP verification
  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (otp.length !== 6) { toast.error("Please enter the 6-digit OTP"); return; }
    setLoading(true);
    try {
      await setPwd(fullPhone(), otp, newPassword);
      navigate("/tenant/dashboard");
    } catch {
      // toast handled in context
    } finally {
      setLoading(false);
    }
  };

  // Send forgot password OTP to email
  const handleSendForgotOtp = async (e) => {
    e.preventDefault();
    if (phone.length !== 10) { setPhoneError("Must be exactly 10 digits"); return; }
    setLoading(true);
    try {
      const res = await sendForgotOtp(fullPhone());
      setOtpSent(true);
    } catch { } finally { setLoading(false); }
  };

  // Reset password after forgot OTP
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      await resetTenantPassword(fullPhone(), otp, newPassword);
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
    setOtp("");
    setOtpSent(false);
    setPhone("");
    setPhoneError("");
    setShowNewPassword(false);
  };

  const passwordStrength = (pwd) => {
    const checks = [/[a-z]/, /[A-Z]/, /[0-9]/, /[@$!%*?&]/, pwd.length >= 8];
    return checks.filter(Boolean).length; // simplified
  };

  return (
    <div className="min-h-screen flex bg-background overflow-hidden relative">

      {/* ═══ BRAND PANEL — Warm, grounded ═══ */}
      <div
        className="hidden lg:flex lg:w-[55%] relative overflow-hidden items-center justify-center p-16"
        style={{
          background: `
            radial-gradient(ellipse 90% 70% at 30% 30%, rgba(92, 61, 46, 0.06) 0%, transparent 80%),
            var(--color-background-deep)
          `
        }}
      >
        {/* Single organic accent — subtle, static */}
        <div
          className="absolute w-[400px] h-[400px] -top-24 -left-24 opacity-[0.04]"
          style={{
            background: 'radial-gradient(circle at 40% 40%, #5C3D2E, transparent 70%)',
          }}
        />
        <div
          className="absolute w-[320px] h-[320px] -bottom-16 -right-16 opacity-[0.03]"
          style={{
            background: 'radial-gradient(circle at 60% 60%, #5C3D2E, transparent 70%)',
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-md w-full">
          <div className="bg-white rounded-2xl p-10 shadow-card-md border border-border">
            {/* Logo — simple, no glow */}
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mb-8">
              <MdHome className="text-2xl text-white" />
            </div>

            <h1 className="text-4xl font-black font-sans text-text-primary tracking-tight leading-[1.08] mb-2">
              Sri Rama
            </h1>
            <p className="text-sm text-text-secondary font-medium mb-7 leading-relaxed">
              Hostel management for real life — rent tracking, maintenance requests, and resident records under one roof.
            </p>

            <div className="space-y-3.5">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary/60 mt-2 shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-text-primary">Rent & billing</p>
                  <p className="text-xs text-text-secondary/70">Monthly invoices, due reminders, payment history.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary/60 mt-2 shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-text-primary">Maintenance</p>
                  <p className="text-xs text-text-secondary/70">Residents submit requests; you track and close them.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary/60 mt-2 shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-text-primary">Resident records</p>
                  <p className="text-xs text-text-secondary/70">Room assignments, contact info, move-in dates.</p>
                </div>
              </div>
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
        <div className="w-full max-w-sm animate-tilt-in">

          {/* Mobile brand */}
          <div className="lg:hidden text-center mb-12">
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-md">
              <MdHome className="text-2xl text-white" />
            </div>
            <h1 className="text-3xl font-black font-sans text-text-primary tracking-tight">
              Sri Rama
            </h1>
            <p className="text-[10px] text-text-secondary font-medium uppercase tracking-[0.15em] mt-1">
              Hostel Management
            </p>
          </div>

          {/* Desktop title */}
          <div className="hidden lg:block mb-10">
            <h2 className="text-[1.75rem] font-black font-sans tracking-tight mb-1 text-text-primary leading-[1.08]">Sign in</h2>
            <p className="text-sm text-text-secondary">to your hostel dashboard</p>
          </div>

          <div className="space-y-8">

            {/* Role switcher */}
            <div className="flex bg-surface p-1 rounded-[14px] gap-1 border border-border">
              {[
                { key: "owner", label: "Owner", icon: MdBusiness },
                { key: "tenant", label: "Resident", icon: MdPerson },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setRole(key); setOtpSent(false); resetOwnerOtpState(); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[12px] font-bold text-xs uppercase tracking-wider transition-all ${
                    role === key
                      ? 'bg-primary text-white shadow-lg shadow-primary/25'
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
                        placeholder="0000000000"
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

            ) : tenantFlow === "otp" ? (
              /* ═══ OTP Verification for password setup ═══ */
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setTenantFlow("phone"); resetTenantState(); }}
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    <MdArrowBack size={18} />
                  </button>
                  <p className="text-xs text-text-secondary font-medium">
                    Verify {countryCode} {phone}
                  </p>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={loading}
                    className="ml-auto text-[10px] text-primary font-semibold hover:underline"
                  >
                    Resend OTP
                  </button>
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
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                </div>
                <button
                  disabled={loading || otp.length !== 6}
                  type="button"
                  onClick={() => { if (otp.length === 6) setTenantFlow("set-password"); }}
                  className="btn-primary w-full py-4 text-sm"
                >
                  {loading ? "Verifying..." : "Verify OTP & Continue"}
                </button>
                {otpSent && (
                  <p className="text-[10px] text-text-secondary/60 text-center">OTP sent to your phone. Check SMS for the verification code.</p>
                )}
              </div>

            ) : tenantFlow === "password" ? (
              /* ═══ Step 2a: Password login ═══ */
              <form onSubmit={handlePasswordLogin} className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setTenantFlow("phone"); setTenantPassword(""); }}
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
                <div className="flex justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => { setTenantFlow("forgot-password"); setOtp(""); setOtpSent(false); setNewPassword(""); setConfirmPassword(""); }}
                    className="text-primary font-semibold hover:underline"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTenantFlow("phone"); resetTenantState(); }}
                    className="text-text-secondary/50 hover:text-text-secondary"
                  >
                    Use OTP instead
                  </button>
                </div>
              </form>

            ) : tenantFlow === "set-password" ? (
              /* ═══ Step 2b: First-time set password ═══ */
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
                    <p className="text-sm font-bold font-sans text-text-primary">Set your password</p>
                    <p className="text-[10px] text-text-secondary">{countryCode} {phone}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="form-label">Verification Code (OTP)</label>
                  <div className="relative">
                    <MdVpnKey className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                    <input
                      required
                      type="text"
                      maxLength="6"
                      className="field-input pl-11 tracking-[0.5em] text-center font-bold"
                      placeholder="000000"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={loading}
                    className="text-[10px] text-primary font-semibold hover:underline mt-1"
                  >
                    Resend OTP
                  </button>
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
                  disabled={loading || !newPassword || newPassword !== confirmPassword || otp.length !== 6}
                  type="submit"
                  className="btn-primary w-full py-4 text-sm"
                >
                  {loading ? "Setting up..." : "Set Password & Login"}
                </button>
              </form>

            ) : (
              /* ═══ Step 2c: Forgot password ═══ */
              <form onSubmit={otpSent ? handleResetPassword : handleSendForgotOtp} className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setTenantFlow("password"); setOtpSent(false); setOtp(""); setNewPassword(""); setConfirmPassword(""); }}
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    <MdArrowBack size={18} />
                  </button>
                  <p className="text-xs text-text-secondary font-medium">
                    Reset password for {countryCode} {phone}
                  </p>
                </div>

                {!otpSent ? (
                  <>
                    <p className="text-sm text-text-secondary">An OTP will be sent to your registered email address.</p>
                    <button
                      disabled={loading}
                      type="submit"
                      className="btn-primary w-full py-4 text-sm"
                    >
                      {loading ? "Sending..." : "Send OTP to Email"}
                    </button>
                  </>
                ) : (
                  <>
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
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => { setOtpSent(false); setOtp(""); handleSendForgotOtp(); }}
                        className="text-[10px] text-primary font-semibold hover:underline mt-1"
                      >
                        Resend OTP
                      </button>
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
                      disabled={loading || otp.length !== 6 || !newPassword || newPassword !== confirmPassword}
                      type="submit"
                      className="btn-primary w-full py-4 text-sm"
                    >
                      {loading ? "Resetting..." : "Reset Password & Login"}
                    </button>
                  </>
                )}
              </form>
            )}

            <div className="text-center pt-4 border-t border-border/50">
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
