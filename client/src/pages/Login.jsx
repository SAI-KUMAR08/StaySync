import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { COUNTRY_CODES } from "../utils/phone";
import { MdLock, MdVisibility, MdVisibilityOff, MdHome } from "react-icons/md";

// Password strength policy — matches server strongPassword (validators/auth.js):
// min 8 chars, at least one uppercase, one lowercase, one number.
const passwordStrengthError =
  "Password must be at least 8 characters with at least one uppercase letter, one lowercase letter, and one number";

const Login = () => {
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tenantFlow, setTenantFlow] = useState("phone");
  const [tenantPassword, setTenantPassword] = useState("");
  const [showTenantPassword, setShowTenantPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const { checkTenantStatus, tenantPasswordLogin, setInitialPassword, loadingStates } = useAuth();
  const navigate = useNavigate();

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhone(raw);
    if (loginError) setLoginError("");
    if (raw.length > 0 && raw.length !== 10) setPhoneError("Must be exactly 10 digits");
    else setPhoneError("");
  };

  const handleCheckPhone = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoading(true);
    try {
      const data = await checkTenantStatus(fullPhone());
      if (!data.exists) {
        setLoginError("Tenant with this mobile number does not exist.");
        return;
      }
      if (data.hasPassword) setTenantFlow("password");
      else setTenantFlow("set-password");
    } catch (error) {
      setLoginError(
        error.response?.status === 404
          ? "Tenant with this mobile number does not exist."
          : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await tenantPasswordLogin(fullPhone(), tenantPassword);
      navigate("/tenant/dashboard");
    } catch (error) {
      setLoginError(error.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSetInitialPassword = async (e) => {
    e.preventDefault();
    setNewPasswordError("");
    setConfirmPasswordError("");
    // Inline validation below the respective fields (no browser alerts).
    const passOk =
      newPassword.length >= 8 &&
      /[a-z]/.test(newPassword) &&
      /[A-Z]/.test(newPassword) &&
      /[0-9]/.test(newPassword);
    if (!passOk) {
      setNewPasswordError(passwordStrengthError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await setInitialPassword(fullPhone(), newPassword);
      navigate("/tenant/dashboard");
    } catch (error) {
      setLoginError(error.response?.data?.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  const fullPhone = () => countryCode + phone;

  const resetFlow = () => {
    setTenantFlow("phone");
    setLoginError("");
    setTenantPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNewPasswordError("");
    setConfirmPasswordError("");
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
              <MdHome className="text-2xl text-white" />
            </div>
            <h1 className="text-4xl font-bold font-display text-text-primary tracking-tight leading-[1.08] mb-2">
              Sri Rama
            </h1>
            <p className="text-sm text-text-secondary font-medium mb-7 leading-relaxed">
              Hostel management for real life — rent tracking, maintenance requests, and tenant
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
                  desc: "Tenants submit requests; you track and close them.",
                },
                { title: "Tenant records", desc: "Room assignments, contact info, move-in dates." },
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
              Tenant Login
            </h2>
            <p className="text-sm text-text-secondary">Sign in with your phone number</p>
          </div>

          <div className="space-y-8">
            {tenantFlow === "phone" && (
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
                  disabled={loading || loadingStates.checkStatus || phone.length !== 10}
                  type="submit"
                  className="btn btn-primary w-full py-4"
                >
                  {loadingStates.checkStatus ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />{" "}
                      Checking...
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>
                {loginError && (
                  <p className="text-[10px] text-danger font-semibold mt-3 text-center">
                    {loginError}
                  </p>
                )}
              </form>
            )}

            {tenantFlow === "password" && (
              <form onSubmit={handlePasswordLogin} className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-text-secondary font-medium">
                    Welcome back! {fullPhone()}
                  </p>
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    Not you?
                  </button>
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Password</label>
                  <div className="relative">
                    <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                    <input
                      required
                      type={showTenantPassword ? "text" : "password"}
                      className="field-input pl-11 pr-11"
                      placeholder="Enter your password"
                      value={tenantPassword}
                      onChange={(e) => setTenantPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowTenantPassword(!showTenantPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                    >
                      {showTenantPassword ? (
                        <MdVisibilityOff size={18} />
                      ) : (
                        <MdVisibility size={18} />
                      )}
                    </button>
                  </div>
                </div>
                <button
                  disabled={loading || !tenantPassword}
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
                {loginError && (
                  <p className="text-[10px] text-danger font-semibold mt-3 text-center">
                    {loginError}
                  </p>
                )}
              </form>
            )}

            {tenantFlow === "set-password" && (
              <form onSubmit={handleSetInitialPassword} className="space-y-5" noValidate>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-text-secondary font-medium">
                    Create your password for {fullPhone()}
                  </p>
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    Not you?
                  </button>
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Create New Password</label>
                  <div className="relative">
                    <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                    <input
                      required
                      type={showNewPassword ? "text" : "password"}
                      className="field-input pl-11 pr-11"
                      placeholder="At least 8 characters"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (newPasswordError) setNewPasswordError("");
                      }}
                      aria-invalid={!!newPasswordError}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                    </button>
                  </div>
                  {newPasswordError && (
                    <p className="text-[10px] text-danger font-semibold mt-1 ml-1" role="alert">
                      {newPasswordError}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Confirm Password</label>
                  <div className="relative">
                    <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-lg" />
                    <input
                      required
                      type={showConfirmPassword ? "text" : "password"}
                      className="field-input pl-11 pr-11"
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (confirmPasswordError) setConfirmPasswordError("");
                      }}
                      aria-invalid={!!confirmPasswordError}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
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
                <button
                  disabled={loading || !newPassword || !confirmPassword}
                  type="submit"
                  className="btn btn-primary w-full py-4"
                >
                  {loading ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />{" "}
                      Creating...
                    </>
                  ) : (
                    "Create Password & Login"
                  )}
                </button>
                {loginError && (
                  <p className="text-[10px] text-danger font-semibold mt-3 text-center">
                    {loginError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={resetFlow}
                  className="w-full text-[10px] text-text-tertiary font-medium hover:text-text-primary"
                >
                  Use different number
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
