import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import {
  MdAdd, MdDelete, MdChevronRight, MdChevronLeft,
  MdCheckCircle, MdMeetingRoom, MdBusiness,
  MdLayers, MdAccountCircle, MdVisibility, MdVisibilityOff, MdHome
} from "react-icons/md";
import toast from "react-hot-toast";

const Step1Information = ({ formData, setFormData, onNext }) => {
  const [showPassword, setShowPassword] = useState(false);

  const isPasswordValid = (pwd) => {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(pwd);
  };

  return (
  <div className="space-y-8 animate-slide-up">
    <div className="arch-card p-8 space-y-7">
      <div className="flex items-center gap-4 mb-2">
        <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <MdBusiness size={22} />
        </div>
        <div>
          <h3 className="text-lg font-bold font-sans text-text-primary tracking-tight">Organization Profile</h3>
          <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">Base Identity</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Hostel Name</label>
          <input type="text" className="field-input" placeholder="e.g. Sri Rama Hostel"
            value={formData.hostelName} onChange={(e) => setFormData({ ...formData, hostelName: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Owner Name</label>
          <input type="text" className="field-input" placeholder="Your Full Name"
            value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Work Email</label>
          <input type="email" className="field-input" placeholder="owner@example.com"
            value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Contact Phone</label>
          <input type="tel" className="field-input" placeholder="10-digit Mobile"
            value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Hostel Type</label>
          <div className="grid grid-cols-3 gap-3">
            {['Boys', 'Girls', 'Co-living'].map(type => (
              <button key={type} type="button" onClick={() => setFormData({ ...formData, hostelType: type })}
                className={`py-3 rounded-xl text-[9px] font-bold uppercase tracking-wider border-2 transition-all ${
                  formData.hostelType === type ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-card text-text-secondary/50 border-border/60 hover:border-border'
                }`}>
                {type}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 relative">
          <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Account Password</label>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} className="field-input pr-12" placeholder="Min 8 chars, 1 uppercase, 1 special"
              value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/40 hover:text-text-secondary">
              {showPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
            </button>
          </div>
          {formData.password && !isPasswordValid(formData.password) && (
            <p className="text-[9px] text-accent font-bold mt-1 ml-1">Requires 8+ chars, uppercase, lowercase, number & special char.</p>
          )}
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Physical Address</label>
          <textarea className="field-input" placeholder="Complete physical location details..."
            value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })}></textarea>
        </div>
      </div>
    </div>
    <div className="space-y-5">
      <button onClick={onNext}
        disabled={!formData.name || !formData.email || !formData.phone || !isPasswordValid(formData.password) || !formData.hostelName || !formData.address}
        className="btn-primary w-full py-4 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
        Continue to Structure <MdChevronRight size={22} />
      </button>

      <div className="text-center">
        <p className="text-xs text-text-secondary/60 font-medium">
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-semibold hover:text-primary-hover inline-flex items-center gap-1 transition-colors">
            Login here <MdChevronRight size={14} />
          </Link>
        </p>
      </div>
    </div>
  </div>
  );
};

const Step2HostelConfig = ({ formData, onNext, onBack }) => (
  <div className="space-y-8 animate-slide-up">
    <div className="arch-card p-8 space-y-5">
      <h3 className="text-lg font-bold font-sans text-text-primary tracking-tight">Hostel Configuration</h3>
      <p className="text-sm text-text-secondary">Confirm operational settings before mapping floors and rooms.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
        <div><span className="text-text-secondary font-bold uppercase text-[9px] tracking-wider">Hostel</span><p className="font-bold text-text-primary">{formData.hostelName}</p></div>
        <div><span className="text-text-secondary font-bold uppercase text-[9px] tracking-wider">Type</span><p className="font-bold text-text-primary">{formData.hostelType}</p></div>
        <div className="md:col-span-2"><span className="text-text-secondary font-bold uppercase text-[9px] tracking-wider">Address</span><p className="font-bold text-text-primary">{formData.address}</p></div>
      </div>
    </div>
    <div className="flex gap-4">
      <button onClick={onBack} className="btn-secondary w-1/4 flex items-center justify-center gap-2"><MdChevronLeft size={20} /> Back</button>
      <button onClick={onNext} className="btn-primary flex-1 py-4">Continue to Floors <MdChevronRight size={22} /></button>
    </div>
  </div>
);

const Step3Floors = ({ floors, setFloors, onNext, onBack }) => {
  const addFloor = () => {
    setFloors([...floors, { number: floors.length + 1, rooms: [] }]);
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="arch-card p-7 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold font-sans text-text-primary tracking-tight">Floor Configuration</h3>
          <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider mt-1">{floors.length} floor(s) defined</p>
        </div>
        <button onClick={addFloor} className="btn-primary-sm flex items-center gap-1.5">
          <MdAdd size={16} /> Next Floor
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {floors.map((f) => (
          <div key={f.number} className="arch-card p-5 text-center">
            <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">Floor</p>
            <p className="text-3xl font-black text-primary">{f.number}</p>
            <p className="text-[9px] text-text-secondary/60 mt-1">{f.rooms.length} rooms</p>
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <button onClick={onBack} className="btn-secondary w-1/4 flex items-center justify-center gap-2"><MdChevronLeft size={20} /> Back</button>
        <button onClick={onNext} disabled={floors.length === 0} className="btn-primary flex-1 py-4 disabled:opacity-50">Configure Rooms <MdChevronRight size={22} /></button>
      </div>
    </div>
  );
};

const Step4Rooms = ({ floors, setFloors, onSubmit, onBack, loading }) => {
  const addFloor = () => {
    setFloors([...floors, { number: floors.length + 1, rooms: [] }]);
  };

  const addRoom = (floorIdx) => {
    const newFloors = [...floors];
    newFloors[floorIdx].rooms.push({
      number: `${floors[floorIdx].number}${String(newFloors[floorIdx].rooms.length + 1).padStart(2, '0')}`,
      sharingType: 2,
      price: 5000,
      isAC: false
    });
    setFloors(newFloors);
  };

  const updateRoom = (floorIdx, roomIdx, field, value) => {
    const newFloors = [...floors];
    newFloors[floorIdx].rooms[roomIdx][field] = value;
    setFloors(newFloors);
  };

  const removeRoom = (floorIdx, roomIdx) => {
    const newFloors = [...floors];
    newFloors[floorIdx].rooms.splice(roomIdx, 1);
    setFloors(newFloors);
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center arch-card p-7 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <MdLayers size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold font-sans text-text-primary tracking-tight">Hostel Structure</h3>
            <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">Floor & Room Mapping</p>
          </div>
        </div>
        <button onClick={addFloor} className="btn-primary-sm flex items-center gap-1.5">
          <MdAdd size={16} /> Add Floor
        </button>
      </div>

      <div className="space-y-5">
        {floors.map((floor, fIdx) => (
          <div key={fIdx} className="arch-card p-7 space-y-5">
            <div className="flex justify-between items-center border-b border-border/50 pb-5">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-text-primary text-white flex items-center justify-center font-bold text-sm">
                  {floor.number}
                </span>
                <h4 className="font-bold text-text-primary">Floor Details</h4>
              </div>
              <button onClick={() => addRoom(fIdx)} className="ghost-button flex items-center gap-1.5">
                <MdAdd size={16} /> New Room
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {floor.rooms.map((room, rIdx) => (
                <div key={rIdx} className="p-5 rounded-2xl border border-border/50 bg-surface space-y-4 relative group hover:bg-card hover:shadow-lg transition-all">
                  <button onClick={() => removeRoom(fIdx, rIdx)} className="absolute top-3 right-3 text-text-secondary/30 hover:text-accent opacity-0 group-hover:opacity-100 transition-all">
                    <MdDelete size={18} />
                  </button>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-[8px] uppercase font-bold text-text-secondary tracking-wider">Room Name / No.</label>
                      <input type="text" className="w-full bg-transparent border-b border-border/60 focus:border-primary outline-none py-2 font-semibold text-text-primary text-sm"
                        value={room.number} onChange={(e) => updateRoom(fIdx, rIdx, "number", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[8px] uppercase font-bold text-text-secondary tracking-wider">Sharing</label>
                      <select className="w-full bg-transparent border-b border-border/60 focus:border-primary outline-none py-2 font-semibold text-text-primary text-sm"
                        value={room.sharingType} onChange={(e) => updateRoom(fIdx, rIdx, "sharingType", parseInt(e.target.value) || "")}>
                        {[1,2,3,4,6].map(n => <option key={n} value={n}>{n} Bed</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[8px] uppercase font-bold text-text-secondary tracking-wider">Monthly Rent</label>
                      <input type="number" className="w-full bg-transparent border-b border-border/60 focus:border-primary outline-none py-2 font-semibold text-text-primary text-sm"
                        value={room.price} onChange={(e) => updateRoom(fIdx, rIdx, "price", parseInt(e.target.value) || "")} />
                    </div>
                    <div>
                      <label className="text-[8px] uppercase font-bold text-text-secondary tracking-wider">Type</label>
                      <select className="w-full bg-transparent border-b border-border/60 focus:border-primary outline-none py-2 font-semibold text-text-primary text-sm"
                        value={room.isAC} onChange={(e) => updateRoom(fIdx, rIdx, "isAC", e.target.value === 'true')}>
                        <option value="false">Non-AC</option>
                        <option value="true">AC</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {[...Array(room.sharingType)].map((_, i) => (
                      <div key={i} className="w-6 h-6 bg-card text-text-secondary/50 rounded-lg flex items-center justify-center border border-border/50 group-hover:text-primary/50 group-hover:border-primary/20 transition-all shadow-sm">
                        <MdMeetingRoom size={14} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {floor.rooms.length === 0 && (
                <div className="col-span-full py-8 text-center border-2 border-dashed border-border/50 rounded-2xl text-text-secondary/40 font-medium italic text-sm">
                  No rooms added to this floor yet.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 pt-6">
        <button onClick={onBack} className="btn-secondary w-1/4 flex items-center justify-center gap-2">
          <MdChevronLeft size={20} /> Back
        </button>
        <button disabled={loading || floors.length === 0} onClick={onSubmit} className="btn-primary flex-1 py-4 flex items-center justify-center gap-3">
          {loading ? "Initializing..." : "Finalize & Launch"} <MdCheckCircle size={22} />
        </button>
      </div>
    </div>
  );
};

const OwnerOnboarding = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const { loginVerifiedOwner } = useAuth();
  const navigate = useNavigate();
  const cooldownRef = useRef(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    hostelName: "",
    hostelType: "Boys",
    address: ""
  });

  const [floors, setFloors] = useState([]);

  const startCooldown = () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setCooldown(60);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleStep1Submit = async () => {
    setOtpLoading(true);
    try {
      const res = await api.post("/auth/owner/send-otp", formData);
      toast.success("Verification code sent to your email!");
      setShowOtpModal(true);
      startCooldown();
    } catch (error) {
      const msg = error.response?.data?.message || error.message || "Failed to send OTP";
      const details = error.response?.data?.errors?.fieldErrors;
      if (details) {
        const fieldMsgs = Object.values(details).flat().join(", ");
        toast.error(`${msg}: ${fieldMsgs}`, { duration: 6000 });
      } else {
        toast.error(msg, { duration: 5000 });
      }
      console.error("Send OTP error:", error.response?.data || error.message);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setOtpLoading(true);
    try {
      const res = await api.post("/auth/owner/verify-otp", {
        email: formData.email,
        otp,
      });
      await loginVerifiedOwner(res.data.data.user, res.data.data.accessToken);
      toast.success("Email verified successfully!");
      setShowOtpModal(false);
      setStep(2);
    } catch (error) {
      toast.error(error.response?.data?.message || "Invalid or expired OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0) return;
    setOtpLoading(true);
    try {
      const res = await api.post("/auth/owner/send-otp", formData);
      toast.success("Verification code resent!");
      startCooldown();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Failed to resend code");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await api.post("/owner/setup", { floors });
      toast.success("Hostel Platform Initialized Successfully!");
      navigate("/admin/dashboard");
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Setup failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-12 px-6 relative overflow-hidden">
      {/* Decorative */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-primary/[0.04] rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-32 -left-32 w-[600px] h-[600px] bg-accent/[0.04] rounded-full blur-[120px]"></div>
      </div>

      <div className="max-w-4xl w-full mx-auto relative z-10 space-y-10">
        <div className="text-center space-y-3">
          <div className="section-ornament-diamond inline-flex mb-3">
            <MdBusiness /> Partner Onboarding
          </div>
          <h1 className="text-4xl md:text-5xl font-bold font-sans text-text-primary tracking-tighter">
            Build your <span className="text-primary">Digital Command Center</span>
          </h1>
          <p className="text-text-secondary font-medium text-lg max-w-2xl mx-auto">
            {["Owner profile", "Hostel setup", "Floor mapping", "Room & bed setup"][step - 1]}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
          {[
            { id: 1, label: "Owner", icon: MdAccountCircle },
            { id: 2, label: "Hostel", icon: MdBusiness },
            { id: 3, label: "Floors", icon: MdLayers },
            { id: 4, label: "Rooms", icon: MdMeetingRoom },
          ].map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                step >= s.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-card text-text-secondary/40 border border-border/60"
              }`}>
                <s.icon size={20} />
              </div>
              <span className={`text-xs font-bold uppercase tracking-wider hidden sm:inline ${step >= s.id ? "text-primary" : "text-text-secondary/40"}`}>{s.label}</span>
            </div>
          ))}
        </div>

        {step === 1 && <Step1Information formData={formData} setFormData={setFormData} onNext={handleStep1Submit} />}
        {step === 2 && <Step2HostelConfig formData={formData} onBack={() => setStep(1)} onNext={() => { if (floors.length === 0) setFloors([{ number: 1, rooms: [] }]); setStep(3); }} />}
        {step === 3 && <Step3Floors floors={floors} setFloors={setFloors} onBack={() => setStep(2)} onNext={() => setStep(4)} />}
        {step === 4 && <Step4Rooms floors={floors} setFloors={setFloors} onBack={() => setStep(3)} onSubmit={handleSubmit} loading={loading} />}
      </div>

      {/* OTP Verification Modal */}
      {showOtpModal && (
        <div className="modal-overlay">
          <div className="arch-card max-w-md w-full p-8 border border-border/60 shadow-2xl space-y-7 animate-scale-in">
            <div className="text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary">
                <MdCheckCircle size={28} />
              </div>
              <h3 className="text-xl font-bold font-sans text-text-primary tracking-tight">Verify Your Identity</h3>
              <p className="text-text-secondary text-sm font-medium">
                We've sent a 6-digit verification code to <span className="font-bold text-text-primary">{formData.email}</span>.
              </p>
            </div>

            <div className="space-y-4">
              <input type="text" maxLength="6" placeholder="000000" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-surface border border-transparent p-5 rounded-2xl outline-none focus:bg-card focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all font-black text-center text-text-primary tracking-[1em] text-lg" />

              <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider pl-1">
                <button type="button" onClick={handleResendOtp} disabled={cooldown > 0 || otpLoading}
                  className="text-primary disabled:text-text-secondary/30 hover:underline">
                  Resend Code
                </button>
                {cooldown > 0 && <span className="text-text-secondary/50">Resend in {cooldown}s</span>}
              </div>
            </div>

            <div className="flex gap-4">
              <button type="button" onClick={() => setShowOtpModal(false)} className="btn-secondary w-1/3 py-4">
                Cancel
              </button>
              <button type="button" onClick={handleVerifyOtp} disabled={otp.length !== 6 || otpLoading}
                className="btn-primary flex-1 py-4 disabled:opacity-50">
                {otpLoading ? "Verifying..." : "Verify & Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OwnerOnboarding;
