import { MdClose, MdArrowForward, MdArrowBack, MdPeople, MdSwapHoriz } from "react-icons/md";
import { COUNTRY_CODES } from "../../utils/phone";
import Button from "../Button";

/** Inline field error helper */
function FieldError({ fieldErrors, name }) {
  return fieldErrors[name] ? (
    <p className="text-[10px] text-danger font-semibold mt-1 ml-1">{fieldErrors[name]}</p>
  ) : null;
}

/**
 * Multi-step tenant onboarding / bed-reassignment modal.
 * State lives in the parent (TenantManagement); this component is purely presentational.
 */
const TenantOnboardModal = ({
  showModal,
  onClose,
  step,
  setStep,
  reassigningTenant,
  isTemporary,
  setIsTemporary,
  preferredSharing,
  setPreferredSharing,
  formData,
  setFormData,
  countryCode,
  setCountryCode,
  phoneError,
  setPhoneError,
  fieldErrors,
  setFieldErrors,
  structure,
  selectedSharing,
  onSharingSelect,
  submitError,
  onSubmit,
}) => {
  if (!showModal) return null;

  const validateForm = () => {
    const errs = {};
    // The bed-reassign path doesn't require personal-info fields — the tenant
    // already has them on record. Only validate them for new onboarding.
    if (!reassigningTenant) {
      if (!formData.aadhaarNumber || !/^\d{12}$/.test(formData.aadhaarNumber))
        errs.aadhaarNumber = "Aadhaar Number must contain exactly 12 digits";
      if (!formData.address || !formData.address.trim()) errs.address = "Address is required";
      if (!formData.emergencyContact || !/^\d{10}$/.test(formData.emergencyContact))
        errs.emergencyContact = "Emergency Contact must contain exactly 10 digits";
    }
    // Mobile and Emergency Contact must not be the same.
    if (
      formData.phone &&
      formData.emergencyContact &&
      formData.phone === formData.emergencyContact
    ) {
      errs.emergencyContact = "Emergency Contact Number must be different from the Mobile Number.";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmitWrapper = () => {
    if (!validateForm()) return;
    onSubmit();
  };

  // Room types (sharing capacities) that currently have at least one available
  // room — full/inactive/unavailable types are not shown.
  const availableTypes = [1, 2, 3, 4, 6].filter((type) =>
    structure.some((f) =>
      f.rooms.some((r) => r.sharingType === type && r.occupiedBeds < r.totalBeds)
    )
  );

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-xl max-h-[90vh] flex flex-col">
        <div className="p-6 md:p-7 border-b border-border/60 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-lg shadow-md shadow-primary/20`}
            >
              {step}
            </div>
            <div>
              <h4 className="text-lg font-bold font-display text-text-primary tracking-tight">
                {reassigningTenant ? "Reassign Bed" : "Onboard Tenant"}
              </h4>
              <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">
                {step === 1
                  ? "Basic Information"
                  : step === 2
                    ? "Room Type Preferences"
                    : "Confirm Assignment"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-primary hover:bg-primary-light transition-all border border-transparent hover:border-accent/20`}
          >
            <MdClose size={20} />
          </button>
        </div>

        <div className="p-6 md:p-7 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                    Full Name
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="John Doe"
                    className="field"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                    Mobile Number
                  </label>
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
                        className="field font-mono tracking-wider text-center text-lg"
                        placeholder="0000000000"
                        value={formData.phone}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
                          setFormData({ ...formData, phone: raw });
                          if (raw.length > 0 && raw.length !== 10) {
                            setPhoneError("Must be exactly 10 digits");
                          } else {
                            setPhoneError("");
                          }
                        }}
                      />
                    </div>
                  </div>
                  {phoneError && (
                    <p className="text-[9px] text-danger font-bold mt-1 ml-1">{phoneError}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Email (optional)
                </label>
                <input
                  type="email"
                  className="field"
                  placeholder="tenant@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Aadhaar Number *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="field"
                  placeholder="Enter 12-digit Aadhaar"
                  maxLength={12}
                  value={formData.aadhaarNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 12);
                    setFormData({ ...formData, aadhaarNumber: val });
                    if (fieldErrors.aadhaarNumber)
                      setFieldErrors({ ...fieldErrors, aadhaarNumber: "" });
                  }}
                />
                <FieldError fieldErrors={fieldErrors} name="aadhaarNumber" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Address *
                </label>
                <textarea
                  className="field min-h-[60px]"
                  placeholder="Enter full address"
                  value={formData.address}
                  onChange={(e) => {
                    setFormData({ ...formData, address: e.target.value });
                    if (fieldErrors.address) setFieldErrors({ ...fieldErrors, address: "" });
                  }}
                />
                <FieldError fieldErrors={fieldErrors} name="address" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Emergency Contact Number *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="field"
                  placeholder="Enter 10-digit emergency contact"
                  maxLength={10}
                  value={formData.emergencyContact}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setFormData({ ...formData, emergencyContact: val });
                    if (fieldErrors.emergencyContact)
                      setFieldErrors({ ...fieldErrors, emergencyContact: "" });
                  }}
                />
                <FieldError fieldErrors={fieldErrors} name="emergencyContact" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Joining Date
                </label>
                <input
                  type="date"
                  className="field"
                  value={formData.joiningDate}
                  onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                />
              </div>

              {/* ID Proof Upload */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  ID Proof (Aadhaar / PAN / Voter ID)
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("border-primary");
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("border-primary");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("border-primary");
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => setFormData({ ...formData, idProof: reader.result });
                      reader.readAsDataURL(file);
                    }
                  }}
                  className={`border-2 border-dashed border-border/60 rounded-2xl p-6 text-center cursor-pointer hover:border-primary/40 transition-all bg-surface/30`}
                  onClick={() => document.getElementById("idProofInput").click()}
                >
                  {formData.idProof ? (
                    <div className="relative inline-block">
                      <img
                        src={formData.idProof}
                        alt="ID Proof"
                        className={`max-h-28 mx-auto rounded-xl`}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData({ ...formData, idProof: "" });
                        }}
                        className={`absolute -top-2 -right-2 w-6 h-6 bg-danger text-white rounded-full text-xs font-bold hover:scale-110 transition-all`}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div
                        className={`w-12 h-12 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center`}
                      >
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                          />
                        </svg>
                      </div>
                      <p className="text-xs text-text-secondary/60 font-medium">
                        Drag & drop an image here, or{" "}
                        <span className="text-primary font-bold">browse</span>
                      </p>
                      <p className="text-[8px] text-text-secondary/40">JPG, PNG or PDF</p>
                    </div>
                  )}
                  <input
                    id="idProofInput"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => setFormData({ ...formData, idProof: reader.result });
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>
              </div>

              {/* ── Security Deposit ── */}
              {!reassigningTenant && (
                <div className="pt-4 border-t border-border/40 space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 cursor-pointer group">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={formData.securityDepositPaid}
                        aria-label="Security Deposit"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            securityDepositPaid: !formData.securityDepositPaid,
                          })
                        }
                        className={`relative w-10 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer ${
                          formData.securityDepositPaid
                            ? "bg-primary shadow-sm shadow-primary/30"
                            : "bg-white/10"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                            formData.securityDepositPaid ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                      <div>
                        <p className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">
                          Security Deposit
                        </p>
                        <p className="text-[9px] text-text-secondary font-medium">
                          Fixed at ₹1,000 —{" "}
                          {formData.securityDepositPaid
                            ? "collected from tenant"
                            : "not yet collected — will be added to first bill"}
                        </p>
                      </div>
                    </div>
                    <div className="pl-[52px]">
                      <p className="text-sm font-bold text-text-primary">₹1,000</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 🆕 Temporary Allotment Toggle */}
              {!reassigningTenant && (
                <div className="pt-4 border-t border-border/40 space-y-4">
                  <div className="flex items-center gap-3 cursor-pointer group">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isTemporary}
                      aria-label="Temporary Allotment"
                      onClick={() => {
                        setIsTemporary(!isTemporary);
                        if (!isTemporary) setPreferredSharing(null);
                      }}
                      className={`relative w-10 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer ${
                        isTemporary ? "bg-primary shadow-sm shadow-primary/30" : "bg-white/10"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                          isTemporary ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <div>
                      <p className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">
                        Temporary Allotment
                      </p>
                      <p className="text-[9px] text-text-secondary font-medium">
                        Assign to any available room while waiting for preferred room
                      </p>
                    </div>
                  </div>

                  {/* 🆕 Preferred Sharing Selector */}
                  {isTemporary && (
                    <div className="space-y-1.5 animate-slide-down pl-[52px]">
                      <label className="text-[9px] font-bold font-sans text-primary uppercase tracking-wider ml-1">
                        Waiting for room type
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4, 6].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setPreferredSharing(type)}
                            className={`py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-wider border-2 transition-all ${
                              preferredSharing === type
                                ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                                : "bg-surface text-text-secondary border-border/60 hover:border-primary/30"
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={() => setStep(2)}
                disabled={isTemporary && !preferredSharing}
                fullWidth
                className="mt-4"
                icon={MdArrowForward}
                iconPosition="right"
              >
                Continue
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <p className="text-text-secondary/70 font-medium text-center mb-2 text-xs uppercase tracking-wider">
                Select Room Capacity
              </p>
              {availableTypes.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {availableTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => onSharingSelect(type)}
                      className={`p-6 rounded-3xl border-2 border-border/50 hover:border-primary/40 hover:bg-primary/[0.02] transition-all group text-left`}
                    >
                      <MdPeople className="text-3xl text-border mb-3 group-hover:text-primary/40 transition-colors" />
                      <p className="text-lg font-bold font-display text-text-primary">
                        {type} Sharing
                      </p>
                      <p className="text-[9px] font-medium text-text-secondary uppercase tracking-wider mt-1">
                        {
                          structure
                            .flatMap((f) => f.rooms)
                            .filter((r) => r.sharingType === type && r.occupiedBeds < r.totalBeds)
                            .length
                        }{" "}
                        Rooms Available
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-text-secondary/40 font-medium uppercase tracking-wider italic text-xs">
                  No room types available at the moment
                </div>
              )}
              <button
                onClick={() => setStep(1)}
                className="w-full text-text-secondary/50 font-medium uppercase tracking-wider text-[10px] hover:text-text-secondary transition-colors mt-2 flex items-center justify-center gap-1"
              >
                <MdArrowBack /> Go Back
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {isTemporary && (
                <div
                  className={`p-4 rounded-2xl bg-primary-light border border-primary/20 flex items-start gap-3`}
                >
                  <MdSwapHoriz className="text-2xl text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-200">Temporary Assignment</p>
                    <p className="text-[10px] text-primary/80 font-medium">
                      You'll be placed in an available room of the selected type right away. When a{" "}
                      {preferredSharing}-sharing room opens up, you'll be moved automatically.
                    </p>
                  </div>
                </div>
              )}
              <p className="text-text-secondary/70 font-medium text-center mb-2 text-xs uppercase tracking-wider">
                Confirm Assignment
              </p>
              <div
                className={`p-5 rounded-3xl border-2 border-primary/30 bg-primary/[0.02] text-center`}
              >
                <p className="text-lg font-bold font-display text-text-primary">
                  {selectedSharing} Sharing
                </p>
                <p className="text-[9px] font-medium text-text-secondary uppercase tracking-tight mt-1">
                  An available room and bed of this type will be assigned automatically
                </p>
              </div>
              {submitError && (
                <p className="text-[11px] text-danger font-semibold text-center bg-danger/5 px-3 py-2 rounded-lg border border-danger/10">
                  {submitError}
                </p>
              )}
              <div className="pt-2 space-y-3">
                <Button
                  onClick={handleSubmitWrapper}
                  disabled={
                    !formData.name ||
                    !formData.phone ||
                    formData.phone.length !== 10 ||
                    !formData.sharingType
                  }
                  fullWidth
                  size="xl"
                >
                  {isTemporary ? "Finalize Temporary Assignment" : "Finalize Onboarding"}
                </Button>
                <button
                  onClick={() => setStep(2)}
                  className="w-full text-text-secondary/50 font-medium uppercase tracking-wider text-[10px] hover:text-text-secondary transition-colors flex items-center justify-center gap-1"
                >
                  <MdArrowBack /> Change Sharing
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TenantOnboardModal;
