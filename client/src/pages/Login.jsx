import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { COUNTRY_CODES } from "../utils/phone";
import { MdLock, MdVisibility, MdVisibilityOff, MdHome, MdPhone } from "react-icons/md";

// Password strength policy — matches server strongPassword (validators/auth.js):
// min 8 chars, at least one uppercase, one lowercase, one number.
const passwordStrengthError =
  "Password must be at least 8 characters with at least one uppercase letter, one lowercase letter, and one number";

const Login = () => {
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [loginError, setLoginError] = useState("");

  // "idle" | "checking" | "has-password" | "no-password"
  const [phoneStatus, setPhoneStatus] = useState("idle");

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  const [loading, setLoading] = useState(false);

  const { checkTenantStatus, tenantPasswordLogin, setInitialPassword, loadingStates } = useAuth();
  const navigate = useNavigate();

  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const checkRef = useRef(null); // debounce timer

  const fullPhone = () => countryCode + phone;

  // ── Auto-check when phone hits 10 digits ──────────────────────────────────
  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhone(raw);
    setLoginError("");
    setPhoneStatus("idle");
    setPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setConfirmPasswordError("");

    if (raw.length > 0 && raw.length !== 10) {
      setPhoneError("Must be exactly 10 digits");
    } else {
      setPhoneError("");
    }

    if (raw.length === 10) {
      // debounce 300 ms
      clearTimeout(checkRef.current);
      checkRef.current = setTimeout(() => checkPhone(countryCode + raw), 300);
    }
  };

  const checkPhone = async (full) => {
    setPhoneStatus("checking");
    setLoginError("");
    try {
      const data = await checkTenantStatus(full);
      if (!data.exists) {
        setLoginError("Resident with this mobile number does not exist.");
        setPhoneStatus("idle");
      } else if (data.hasPassword) {
        setPhoneStatus("has-password");
        setTimeout(() => passwordRef.current?.focus(), 80);
      } else {
        setPhoneStatus("no-password");
        setTimeout(() => passwordRef.current?.focus(), 80);
      }
    } catch (err) {
      setLoginError(
        err.response?.status === 404
          ? "Resident with this mobile number does not exist."
          : "Something went wrong"
      );
      setPhoneStatus("idle");
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    setPasswordError("");
    setConfirmPasswordError("");

    if (phoneStatus === "has-password") {
      if (!password) return;
      setLoading(true);
      try {
        await tenantPasswordLogin(fullPhone(), password);
        navigate("/tenant/dashboard");
      } catch (err) {
        setLoginError(err.response?.data?.message || "Login failed. Check your password.");
      } finally {
        setLoading(false);
      }
    } else if (phoneStatus === "no-password") {
      // Validate password strength
      const passOk =
        password.length >= 8 &&
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /[0-9]/.test(password);
      if (!passOk) {
        setPasswordError(passwordStrengthError);
        return;
      }
      if (password !== confirmPassword) {
        setConfirmPasswordError("Passwords do not match");
        return;
      }
      setLoading(true);
      try {
        await setInitialPassword(fullPhone(), password);
        navigate("/tenant/dashboard");
      } catch (err) {
        setLoginError(err.response?.data?.message || "Failed to create password");
      } finally {
        setLoading(false);
      }
    }
  };

  // Focus confirm-password when it appears
  useEffect(() => {
    if (phoneStatus === "no-password" && password.length >= 8) {
      // small nudge — user can still tab there naturally
    }
  }, [phoneStatus, password]);

  const isChecking = phoneStatus === "checking" || loadingStates.checkStatus;
  const showPasswordField = phoneStatus === "has-password" || phoneStatus === "no-password";
  const showConfirmField = phoneStatus === "no-password";
  const canSubmit =
    !loading &&
    phone.length === 10 &&
    showPasswordField &&
    password.length > 0 &&
    (!showConfirmField || confirmPassword.length > 0);

  const submitLabel = phoneStatus === "no-password" ? "Create Password & Sign In" : "Sign In";

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
              <MdHome className="text-2xl text-white" />
            </div>
            <h1 className="text-4xl font-bold font-display text-text-primary tracking-tight leading-[1.08] mb-2">
              Sri Rama
            </h1>
            <p className="text-sm text-text-secondary font-medium mb-7 leading-relaxed">
              Hostel management for real life — rent tracking, maintenance requests, and resident
              records under one roof.
            </p>
            <div className="space-y-3.5">
              {[
                {
                  title: "Rent & billing",
                  desc: "Monthly invoices, due reminders, payment history.",
                },
                {
                  title: "Maintenance",
                  desc: "Residents submit requests; you track and close them.",
                },
                {
                  title: "Resident records",
                  desc: "Room assignments, contact info, move-in dates.",
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
              <MdHome className="text-2xl text-white" />
            </div>
            <h1 className="text-3xl font-bold font-display text-text-primary tracking-tight">
              Sri Rama
            </h1>
            <p className="text-[10px] text-text-secondary font-medium uppercase tracking-[0.15em] mt-1">
              Hostel Management
            </p>
          </div>

          <div className="hidden lg:block mb-10">
            <h2 className="text-[1.75rem] font-bold font-display tracking-tight mb-1 text-text-primary leading-[1.08]">
              Resident Login
            </h2>
            <p className="text-sm text-text-secondary">Sign in with your phone number</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* ── Mobile Number ── */}
            <div className="space-y-1.5">
              <label className="form-label">Mobile Number</label>
              <div className="flex gap-2">
                <div className="relative shrink-0">
                  <select
                    value={countryCode}
                    onChange={(e) => {
                      setCountryCode(e.target.value);
                      if (phone.length === 10) {
                        clearTimeout(checkRef.current);
                        checkRef.current = setTimeout(
                          () => checkPhone(e.target.value + phone),
                          300
                        );
                      }
                    }}
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
                  <MdPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    className="field-input pl-11 font-mono tracking-wider text-lg"
                    placeholder="0000000000"
                    value={phone}
                    onChange={handlePhoneChange}
                    autoFocus
                  />
                  {/* Checking spinner inside the input */}
                  {isChecking && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  )}
                  {/* Check mark when resolved */}
                  {!isChecking && showPasswordField && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-primary text-base font-bold">
                      ✓
                    </span>
                  )}
                </div>
              </div>
              {phoneError && (
                <p className="text-[10px] text-danger font-semibold mt-1 ml-1">{phoneError}</p>
              )}
            </div>

            {/* ── Password ── */}
            <div
              className="space-y-1.5 transition-all duration-300"
              style={{
                opacity: showPasswordField ? 1 : 0.35,
                pointerEvents: showPasswordField ? "auto" : "none",
              }}
            >
              <label className="form-label">
                {phoneStatus === "no-password" ? "Create Password" : "Password"}
              </label>
              <div className="relative">
                <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                <input
                  ref={passwordRef}
                  required={showPasswordField}
                  type={showPassword ? "text" : "password"}
                  className="field-input pl-11 pr-11"
                  placeholder={
                    phoneStatus === "no-password" ? "At least 8 characters" : "Enter your password"
                  }
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError("");
                    if (loginError) setLoginError("");
                  }}
                  aria-invalid={!!passwordError}
                  tabIndex={showPasswordField ? 0 : -1}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={showPasswordField ? 0 : -1}
                >
                  {showPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                </button>
              </div>
              {passwordError && (
                <p className="text-[10px] text-danger font-semibold mt-1 ml-1" role="alert">
                  {passwordError}
                </p>
              )}
            </div>

            {/* ── Confirm Password (only for new accounts) ── */}
            <div
              className="overflow-hidden transition-all duration-300"
              style={{
                maxHeight: showConfirmField ? "120px" : "0px",
                opacity: showConfirmField ? 1 : 0,
              }}
            >
              <div className="space-y-1.5 pt-1">
                <label className="form-label">Confirm Password</label>
                <div className="relative">
                  <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                  <input
                    ref={confirmRef}
                    required={showConfirmField}
                    type={showConfirmPassword ? "text" : "password"}
                    className="field-input pl-11 pr-11"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (confirmPasswordError) setConfirmPasswordError("");
                    }}
                    aria-invalid={!!confirmPasswordError}
                    tabIndex={showConfirmField ? 0 : -1}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    tabIndex={showConfirmField ? 0 : -1}
                  >
                    {showConfirmPassword ? (
                      <MdVisibilityOff size={18} />
                    ) : (
                      <MdVisibility size={18} />
                    )}
                  </button>
                </div>
                {confirmPasswordError && (
                  <p className="text-[10px] text-danger font-semibold mt-1 ml-1" role="alert">
                    {confirmPasswordError}
                  </p>
                )}
              </div>
            </div>

            {/* ── Helper label for new accounts ── */}
            {phoneStatus === "no-password" && (
              <p className="text-[11px] text-primary/80 font-medium -mt-1">
                👋 First time? Create a password to access your account.
              </p>
            )}

            {/* ── Error ── */}
            {loginError && (
              <p className="text-[10px] text-danger font-semibold text-center" role="alert">
                {loginError}
              </p>
            )}

            {/* ── Submit ── */}
            <button type="submit" disabled={!canSubmit} className="btn btn-primary w-full py-4">
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  {phoneStatus === "no-password" ? "Creating..." : "Signing in..."}
                </>
              ) : (
                submitLabel
              )}
            </button>

            {/* ── Change number ── */}
            {showPasswordField && (
              <button
                type="button"
                onClick={() => {
                  setPhone("");
                  setPhoneStatus("idle");
                  setPassword("");
                  setConfirmPassword("");
                  setPasswordError("");
                  setConfirmPasswordError("");
                  setLoginError("");
                }}
                className="w-full text-[11px] text-text-tertiary font-medium hover:text-text-primary transition-colors"
              >
                Use a different number
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
