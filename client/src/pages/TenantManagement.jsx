import React, { useEffect, useState, useMemo } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import {
  MdAdd, MdDelete, MdPhone, MdCalendarToday,
  MdSearch, MdFilterList, MdClose, MdPeople, MdHotel,
  MdCheckCircle, MdArrowForward, MdArrowBack, MdHome,
  MdSwapHoriz, MdInfo, MdOpenInNew
} from "react-icons/md";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { normalizeStructure, getAvailableRooms } from "../utils/normalizeStructure";
import { normalizePhone } from "../utils/phone";
import { mapTenantForDisplay } from "../utils/tenantDisplay";
import { getApiError } from "../utils/getApiError";
import ErrorRetry from "../components/ErrorRetry";
import { useSocket } from "../context/SocketContext";
import { useDebounce } from "../hooks/useDebounce";


const TenantManagement = () => {
  const COUNTRY_CODES = [
    { code: "+91", label: "IN", flag: "🇮🇳" },
    { code: "+1", label: "US", flag: "🇺🇸" },
    { code: "+44", label: "UK", flag: "🇬🇧" },
    { code: "+61", label: "AU", flag: "🇦🇺" },
    { code: "+971", label: "UAE", flag: "🇦🇪" },
    { code: "+65", label: "SG", flag: "🇸🇬" },
  ];

  const { user } = useAuth();
  const { socket } = useSocket();
  
  const [tenants, setTenants] = useState([]);
  const [structure, setStructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [filter, setFilter] = useState("");

  const [step, setStep] = useState(1);
  const [selectedSharing, setSelectedSharing] = useState(null);

  // 🆕 Temporary allotment states
  const [isTemporary, setIsTemporary] = useState(false);
  const [preferredSharing, setPreferredSharing] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    joiningDate: new Date().toISOString().split('T')[0],
    floorId: "",
    roomId: "",
    bedId: "",
    rentAmount: 0,
    idProof: "",
  });

  const [reassigningTenant, setReassigningTenant] = useState(null);
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneError, setPhoneError] = useState("");

  const handleReassignStart = (tenant) => {
    const name = tenant.name || tenant.personalInfo?.name || "";
    const phone = tenant.phone || tenant.personalInfo?.phone || "";
    setFormData({
      name,
      phone,
      joiningDate: tenant.joinDate ? tenant.joinDate.split('T')[0] : new Date().toISOString().split('T')[0],
      floorId: tenant.floorId?._id || "",
      roomId: tenant.roomId?._id || "",
      bedId: tenant.bedId?._id || "",
      rentAmount: tenant.monthlyRent || 0
    });
    setReassigningTenant(tenant);
    setStep(2);
    setShowModal(true);
  };

  useEffect(() => {
    fetchTenants();
    fetchStructure();
  }, [debouncedSearch, filter, user?.hostelId]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      fetchTenants();
      fetchStructure();
    };
    socket.on("occupancy_update", refresh);
    socket.on("tenant_assigned", refresh);
    socket.on("tenant_removed", refresh);
    return () => {
      socket.off("occupancy_update", refresh);
      socket.off("tenant_assigned", refresh);
      socket.off("tenant_removed", refresh);
    };
  }, [socket, user?.hostelId]);

  const fetchTenants = async () => {
    setError(null);
    try {
      const res = await api.get(`/owner/tenants?search=${debouncedSearch}&status=${filter}`);
      const list = Array.isArray(res.data.data) ? res.data.data : [];
      setTenants(list.map(mapTenantForDisplay));
    } catch (error) {
      setError(error.response?.data?.message || "Failed to load tenants");
      toast.error(getApiError(error));
    } finally {
      setLoading(false);
    }
  };

  const fetchStructure = async () => {
    try {
      const res = await api.get("/owner/structure");
      setStructure(normalizeStructure(res.data.data.structure || []));
    } catch (error) {
      console.error(error);
    }
  };

  const handleSharingSelect = (type) => {
    setSelectedSharing(type);
    setStep(3);
  };

  const handleRoomSelect = (room) => {
    setFormData({
      ...formData,
      floorId: room.floorId?._id,
      roomId: room._id,
      rentAmount: room.price,
      bedId: ""
    });
    setStep(4);
  };

  const handleSubmit = async () => {
    if (!formData.bedId) return toast.error("Please select a bed");
    if (formData.phone.length !== 10) return toast.error("Phone must be exactly 10 digits");
    try {
      const fullPhone = countryCode + formData.phone;
      const phone = normalizePhone(fullPhone);
      if (reassigningTenant) {
        await api.post(`/owner/tenants/${reassigningTenant._id}/assign-bed`, {
          bedId: formData.bedId,
          ...(formData.idProof ? { idProof: formData.idProof } : {}),
          ...(isTemporary ? { isTemporary, preferredSharing } : {})
        });
        toast.success("Resident's bed reassigned successfully!");
      } else {
        await api.post("/owner/tenants", {
          name: formData.name,
          phone,
          email: `${phone}@residents.local`,
          floorId: formData.floorId,
          roomId: formData.roomId,
          bedId: formData.bedId,
          monthlyRent: formData.rentAmount,
          joinDate: formData.joiningDate,
          isTemporary,
          ...(formData.idProof ? { idProof: formData.idProof } : {}),
          ...(isTemporary && preferredSharing ? { preferredSharing } : {}),
        });
        toast.success(isTemporary ? "Resident onboarded temporarily!" : "Resident onboarded successfully!");
      }
      setShowModal(false);
      setReassigningTenant(null);
      setIsTemporary(false);
      setPreferredSharing(null);
      setStep(1);
      fetchTenants();
      fetchStructure();
    } catch (error) {
      const msg = getApiError(error);
      if (error.response?.status === 409 && msg.toLowerCase().includes("number")) {
        toast.error("Tenant already registered with this number");
      } else {
        toast.error(msg);
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to remove this resident?")) return;
    try {
      await api.delete(`/owner/tenants/${id}`);
      toast.success("Resident removed");
      fetchTenants();
      fetchStructure();
    } catch (error) {
      toast.error("Failed to remove resident");
    }
  };

  const availableRooms = useMemo(
    () => getAvailableRooms(structure, selectedSharing),
    [structure, selectedSharing]
  );

  // 🆕 One-click convert to permanent
  const handleConvertToPermanent = async (tenant) => {
    try {
      const res = await api.post(`/owner/tenants/${tenant._id}/convert-permanent`);
      toast.success(res.data.data?.message || "Resident converted to permanent!");
      fetchTenants();
      fetchStructure();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to convert to permanent");
    }
  };

  // 🆕 Quick fix: directly move temp tenant to preferred room type
  const handleFixTempTenant = (tenant) => {
    const preferred = tenant.preferredSharing;
    if (!preferred) {
      toast.error("This tenant has no preferred room type set");
      return;
    }
    const rooms = getAvailableRooms(structure, preferred);
    if (rooms.length === 0) {
      toast.error(`No ${preferred}-sharing rooms available yet`);
      return;
    }
    // Pre-fill form from tenant
    setFormData({
      name: tenant.name || tenant.personalInfo?.name || "",
      phone: tenant.phone || tenant.personalInfo?.phone || "",
      joiningDate: tenant.joinDate ? tenant.joinDate.split('T')[0] : new Date().toISOString().split('T')[0],
      floorId: tenant.floorId?._id || "",
      roomId: tenant.roomId?._id || "",
      bedId: tenant.bedId?._id || "",
      rentAmount: tenant.monthlyRent || 0
    });
    setReassigningTenant(tenant);
    setSelectedSharing(preferred);
    setStep(3); // Skip directly to room selection
    setShowModal(true);
  };

  // 🆕 Check if a tenant has waiting room type
  const roomAvailabilityMap = useMemo(() => {
    const map = {};
    for (const f of structure) {
      for (const r of f.rooms) {
        if (r.occupiedBeds < r.totalBeds) {
          map[r.sharingType] = true;
        }
      }
    }
    return map;
  }, [structure]);

  const hasPreferredRoomAvailable = (tenant) => {
    if (!tenant.preferredSharing) return false;
    return !!roomAvailabilityMap[tenant.preferredSharing];
  };

  // 🆕 Temporary tenants analysis
  const { tempTenants, regularTenants } = useMemo(() => ({
    tempTenants: tenants.filter(t => t.isTemporary),
    regularTenants: tenants.filter(t => !t.isTemporary),
  }), [tenants]);

  if (loading) return (
    <div className="space-y-5" role="status" aria-label="Loading residents">
      <div className="card card-lg overflow-hidden">
        <div className="bg-background/80 border-b border-border/60 px-6 py-4">
          <div className="flex gap-12">
            <div className="skeleton h-3 w-14" />
            <div className="skeleton h-3 w-18" />
            <div className="skeleton h-3 w-10" />
            <div className="skeleton h-3 w-10" />
          </div>
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="px-6 py-4 border-b border-border/40 flex items-center gap-12">
            <div className="flex items-center gap-4 flex-1">
              <div className={`skeleton w-9 h-9 rounded-xl`} />
              <div className="space-y-2">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton h-3 w-18" />
              </div>
            </div>
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-4 w-14" />
            <div className={`skeleton h-5 w-12 rounded-full`} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div>
          <div className="section-ornament-diamond mb-3">
            <MdPeople /> Residents
          </div>
          <h2 className="section-title">Resident <span>Management</span></h2>
          <p className="section-sub">Manage resident lifecycle, unit assignments, and temporary allotments</p>
        </div>
        <button
          onClick={() => {
            setFormData({ name: "", phone: "", joiningDate: new Date().toISOString().split('T')[0], floorId: "", roomId: "", bedId: "", rentAmount: 0, idProof: "" });
            setReassigningTenant(null);
            setIsTemporary(false);
            setPreferredSharing(null);
            setStep(1);
            setShowModal(true);
          }}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <MdAdd size={18} /> Add Resident
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40 text-lg" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            className="field pl-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={`flex gap-1.5 bg-surface/50 p-1 rounded-2xl`}>
          {[
            { id: "", label: "All" },
            { id: "active", label: "Active" },
            { id: "inactive", label: "Inactive" },
            { id: "temporary", label: "Temporary" },
          ].map(({ id, label }) => (
            <button key={id || "all"} onClick={() => setFilter(id)}
              className={`px-4 py-2.5 rounded-xl text-[9px] font-bold font-sans uppercase tracking-wider transition-all ${
                filter === id
                  ? "bg-primary text-white shadow-md shadow-primary/20"
                  : "text-text-secondary/60 hover:text-text-secondary hover:bg-surface-hover/50"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 🆕 Temporary Allotments Section */}
      {tempTenants.length > 0 && (
        <div className="card card-lg-accent p-5">
          <div className="flex items-center gap-2 mb-5">
            <MdSwapHoriz className="text-2xl text-primary" />
            <div>
              <h3 className="font-bold font-display text-text-primary text-base tracking-tight">
                Temporary Allotments ({tempTenants.length})
              </h3>
              <p className="text-[9px] text-text-secondary font-medium">
                These residents are waiting for their preferred room to become available
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tempTenants.map(t => {
              const roomReady = hasPreferredRoomAvailable(t);
              return (
                <div key={t._id} className={`p-4 rounded-2xl bg-surface border border-border/50 hover:shadow-md transition-all`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center text-xs font-bold`}>
                        {t.name?.[0] || 'T'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-text-primary leading-none">{t.name}</p>
                        <p className="text-[9px] text-text-secondary font-medium">Room {t.roomDetails?.roomId?.number} (temp)</p>
                      </div>
                    </div>
                    <span className="badge-amber text-[8px]">Temporary</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-text-secondary font-medium uppercase tracking-wider">
                      Waiting for: <strong className="text-primary">{t.preferredSharing || '?'}-sharing</strong>
                    </span>
                    {roomReady && (
                      <span className="flex items-center gap-1 text-emerald-400 font-bold uppercase tracking-wider">
                        <MdCheckCircle size={12} /> Room Available
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleConvertToPermanent(t)}
                      disabled={!roomReady}
                      className={`flex-1 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase tracking-wider hover:bg-emerald-500/20 border border-emerald-500/15 transition-all flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed`}
                    >
                      <MdCheckCircle size={14} /> {roomReady ? "Make Permanent" : "No Room Available"}
                    </button>
                    {roomReady && (
                      <button
                        onClick={() => handleFixTempTenant(t)}
                        className={`px-3 py-2.5 rounded-xl bg-primary-light text-primary text-[9px] font-bold uppercase tracking-wider hover:bg-primary/20 border border-primary/15 transition-all`}
                        title="Manually select a specific room"
                      >
                        <MdHotel size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card card-lg overflow-hidden overflow-x-auto">
        <table className="heritage-table">
          <thead>
            <tr>
              <th>Resident</th>
              <th>Hostel</th>
              <th>Assignment</th>
              <th>Rent</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {regularTenants?.map((tenant, i) => (
              <tr key={tenant._id} className="stagger-enter" style={{ animationDelay: `${Math.min(i * 0.04, 0.3)}s` }}>
                <td>
                  <div className="flex items-center gap-3.5">
                    <Link to={`/admin/tenants/${tenant._id}`} className="flex items-center gap-3.5 group">
                      <div className={`w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm`}>
                        {(tenant.name?.[0] || "T").toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-text-primary text-sm group-hover:text-primary transition-colors inline-flex items-center gap-1">
                          {tenant.name} <MdOpenInNew className="text-text-tertiary/30 text-xs opacity-0 group-hover:opacity-100 transition-opacity" />
                        </p>
                        <p className="text-[10px] text-text-secondary font-medium">{tenant.phone}</p>
                      </div>
                    </Link>
                  </div>
                </td>
                <td>
                  <p className="text-sm font-semibold text-text-primary">{tenant.hostelName || "—"}</p>
                </td>
                <td>
                  <p className="text-sm font-semibold text-text-primary">Room {tenant.roomDetails?.roomId?.number}</p>
                  <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">Floor {tenant.roomDetails?.floorId?.number} • Bed {tenant.roomDetails?.bedId?.number}</p>
                </td>
                <td>
                  <p className="text-sm font-bold text-text-primary">₹{tenant.rentAmount?.toLocaleString()}</p>
                  <p className="text-[9px] text-text-secondary font-medium uppercase tracking-tight">Monthly</p>
                </td>
                <td>
                  <span className={`badge ${tenant.status === "active" ? "badge-emerald" : "badge-slate"}`}>
                    {tenant.status}
                  </span>
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => handleReassignStart(tenant)}
                      className={`p-2 text-text-secondary/50 hover:text-primary hover:bg-primary/5 rounded-xl transition-all`}
                    >
                      <MdHotel size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(tenant._id)}
                      className={`p-2 text-text-secondary/50 hover:text-primary hover:bg-primary-light rounded-xl transition-all`}
                    >
                      <MdDelete size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {/* 🆕 Show temporary tenants in table */}
            {tempTenants.length > 0 && tempTenants.map((tenant, i) => (
              <tr key={tenant._id} className="stagger-enter bg-primary-light" style={{ animationDelay: `${Math.min(i * 0.04, 0.3)}s` }}>
                <td>
                  <div className="flex items-center gap-3.5">
                    <Link to={`/admin/tenants/${tenant._id}`} className="flex items-center gap-3.5 group">
                      <div className={`w-9 h-9 rounded-xl bg-primary-light text-primary/80 flex items-center justify-center font-bold text-sm`}>
                        {(tenant.name?.[0] || "T").toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-text-primary text-sm group-hover:text-primary transition-colors inline-flex items-center gap-1">
                          {tenant.name} <MdOpenInNew className="text-text-tertiary/30 text-xs opacity-0 group-hover:opacity-100 transition-opacity" />
                        </p>
                        <p className="text-[10px] text-text-secondary font-medium">{tenant.phone}</p>
                      </div>
                    </Link>
                  </div>
                </td>
                <td>
                  <p className="text-sm font-semibold text-text-primary">{tenant.hostelName || "—"}</p>
                </td>
                <td>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Room {tenant.roomDetails?.roomId?.number}</p>
                    <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">Temp • Waiting for {tenant.preferredSharing || '?'}-sharing</p>
                  </div>
                </td>
                <td>
                  <p className="text-sm font-bold text-text-primary">₹{tenant.rentAmount?.toLocaleString()}</p>
                  <p className="text-[9px] text-text-secondary font-medium uppercase tracking-tight">Monthly</p>
                </td>
                <td>
                  <span className="badge-amber">Temporary</span>
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {hasPreferredRoomAvailable(tenant) && (
                      <button
                        onClick={() => handleConvertToPermanent(tenant)}
                        className={`p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all`}
                        title="Make Permanent"
                      >
                        <MdCheckCircle size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => handleReassignStart(tenant)}
                      className={`p-2 text-text-secondary/50 hover:text-primary hover:bg-primary/5 rounded-xl transition-all`}
                    >
                      <MdHotel size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(tenant._id)}
                      className={`p-2 text-text-secondary/50 hover:text-primary hover:bg-primary-light rounded-xl transition-all`}
                    >
                      <MdDelete size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan="6" className="px-6 py-16 text-center">
                  <MdPeople className="text-4xl mx-auto mb-3 opacity-20 text-text-secondary" />
                  <p className="text-text-secondary/60 font-medium italic">No residents found matching your criteria.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Multi-Step Onboarding Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-xl max-h-[90vh] flex flex-col">
            <div className="p-6 md:p-7 border-b border-border/60 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-lg shadow-md shadow-primary/20`}>
                  {step}
                </div>
                <div>
                  <h4 className="text-lg font-bold font-display text-text-primary tracking-tight">
                    {reassigningTenant ? "Reassign Bed" : "Onboard Resident"}
                  </h4>
                  <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">{
                    step === 1 ? "Basic Information" :
                    step === 2 ? "Room Type Preferences" :
                    step === 3 ? "Select Available Unit" :
                    "Assign Specific Bed"
                  }</p>
                </div>
              </div>
              <button onClick={() => { setShowModal(false); setReassigningTenant(null); }} className={`w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-primary hover:bg-primary-light transition-all border border-transparent hover:border-accent/20`}>
                <MdClose size={20} />
              </button>
            </div>

            <div className="p-6 md:p-7 overflow-y-auto flex-1">
              {step === 1 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Full Name</label>
                      <input required type="text" placeholder="John Doe" className="field"
                        value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Mobile Number</label>
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
                              setFormData({...formData, phone: raw});
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
                    <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Joining Date</label>
                    <input type="date" className="field"
                      value={formData.joiningDate} onChange={(e) => setFormData({...formData, joiningDate: e.target.value})} />
                  </div>

                  {/* ID Proof Upload */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">ID Proof (Aadhaar / PAN / Voter ID)</label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary'); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove('border-primary'); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-primary');
                        const file = e.dataTransfer.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => setFormData({...formData, idProof: reader.result});
                          reader.readAsDataURL(file);
                        }
                      }}
                      className={`border-2 border-dashed border-border/60 rounded-2xl p-6 text-center cursor-pointer hover:border-primary/40 transition-all bg-surface/30`}
                      onClick={() => document.getElementById('idProofInput').click()}
                    >
                      {formData.idProof ? (
                        <div className="relative inline-block">
                          <img src={formData.idProof} alt="ID Proof" className={`max-h-28 mx-auto rounded-xl`} />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFormData({...formData, idProof: ""}); }}
                            className={`absolute -top-2 -right-2 w-6 h-6 bg-danger text-white rounded-full text-xs font-bold hover:scale-110 transition-all`}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className={`w-12 h-12 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center`}>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                          </div>
                          <p className="text-xs text-text-secondary/60 font-medium">Drag & drop an image here, or <span className="text-primary font-bold">browse</span></p>
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
                            reader.onload = () => setFormData({...formData, idProof: reader.result});
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* 🆕 Temporary Allotment Toggle */}
                  {!reassigningTenant && (
                    <div className="pt-4 border-t border-border/40 space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div
                          onClick={() => {
                            setIsTemporary(!isTemporary);
                            if (!isTemporary) setPreferredSharing(null);
                          }}
                          className={`relative w-10 h-6 rounded-full transition-all duration-300 ${
                            isTemporary ? 'bg-primary shadow-sm shadow-primary/30' : 'bg-white/10'
                          }`}
                        >
                          <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                            isTemporary ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">Temporary Allotment</p>
                          <p className="text-[9px] text-text-secondary font-medium">Assign to any available room while waiting for preferred room</p>
                        </div>
                      </label>

                      {/* 🆕 Preferred Sharing Selector */}
                      {isTemporary && (
                        <div className="space-y-1.5 animate-slide-down pl-[52px]">
                          <label className="text-[9px] font-bold font-sans text-primary uppercase tracking-wider ml-1">
                            Waiting for room type
                          </label>
                          <div className="grid grid-cols-4 gap-2">
                            {[1, 2, 3, 4, 6].map(type => (
                              <button key={type} type="button" onClick={() => setPreferredSharing(type)}
                                className={`py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-wider border-2 transition-all ${
                                  preferredSharing === type
                                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                                    : 'bg-surface text-text-secondary border-border/60 hover:border-primary/30'
                                }`}>
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <button onClick={() => setStep(2)} disabled={isTemporary && !preferredSharing}
                    className="btn-primary w-full flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed">
                    Continue <MdArrowForward size={18} />
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <p className="text-text-secondary/70 font-medium text-center mb-2 text-xs uppercase tracking-wider">Select Room Capacity</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4, 6].map(type => (
                      <button key={type} onClick={() => handleSharingSelect(type)} className={`p-6 rounded-3xl border-2 border-border/50 hover:border-primary/40 hover:bg-primary/[0.02] transition-all group text-left`}>
                        <MdPeople className="text-3xl text-border mb-3 group-hover:text-primary/40 transition-colors" />
                        <p className="text-lg font-bold font-display text-text-primary">{type} Sharing</p>
                        <p className="text-[9px] font-medium text-text-secondary uppercase tracking-wider mt-1">
                          {structure.flatMap(f => f.rooms).filter(r => r.sharingType === type && r.occupiedBeds < r.totalBeds).length} Rooms Available
                        </p>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setStep(1)} className="w-full text-text-secondary/50 font-medium uppercase tracking-wider text-[10px] hover:text-text-secondary transition-colors mt-2 flex items-center justify-center gap-1">
                    <MdArrowBack /> Go Back
                  </button>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <p className="text-text-secondary/70 font-medium text-center mb-2 text-xs uppercase tracking-wider">Available Units ({selectedSharing} Sharing)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
                    {availableRooms.map(room => (
                      <button key={room._id} onClick={() => handleRoomSelect(room)} className={`p-5 rounded-3xl border-2 border-border/50 hover:border-primary/40 hover:bg-primary/[0.02] transition-all text-left`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className="badge-primary">ROOM {room.number}</span>
                          <span className="text-[9px] font-medium text-text-secondary uppercase">Floor {room.floorNumber}</span>
                        </div>
                        <p className="text-lg font-bold text-text-primary tracking-tight">₹{room.price}/mo</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <div className="flex -space-x-1">
                            {[...Array(room.totalBeds)].map((_, i) => (
                              <div key={i} className={`w-2.5 h-2.5 rounded-full border-2 border-card ${i < room.occupiedBeds ? 'bg-accent/60' : 'bg-emerald-400'}`}></div>
                            ))}
                          </div>
                          <span className="text-[9px] font-medium text-text-secondary uppercase tracking-tight">{room.totalBeds - room.occupiedBeds} Beds Free</span>
                        </div>
                      </button>
                    ))}
                    {availableRooms.length === 0 && <div className="col-span-2 py-12 text-center text-text-secondary/40 font-medium uppercase tracking-wider italic text-xs">No matching rooms available</div>}
                  </div>
                  <button onClick={() => setStep(2)} className="w-full text-text-secondary/50 font-medium uppercase tracking-wider text-[10px] hover:text-text-secondary transition-colors mt-2 flex items-center justify-center gap-1">
                    <MdArrowBack /> Change Sharing
                  </button>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  {isTemporary && (
                    <div className={`p-4 rounded-2xl bg-primary-light border border-primary/20 flex items-start gap-3`}>
                      <MdSwapHoriz className="text-2xl text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-amber-200">Temporary Assignment</p>
                        <p className="text-[10px] text-primary/80 font-medium">Select any available bed. When a {preferredSharing}-sharing room opens up, you can move this resident.</p>
                      </div>
                    </div>
                  )}
                  <p className="text-text-secondary/70 font-medium text-center mb-2 text-xs uppercase tracking-wider">Select Specific Bed</p>
                  <div className="flex flex-wrap gap-4 justify-center">
                    {structure.flatMap(f => f.rooms).find(r => r._id === formData.roomId)?.beds
                      .map(bed => (
                        <button
                          key={bed._id}
                          disabled={bed.status === 'occupied'}
                          onClick={() => setFormData({...formData, bedId: bed._id})}
                          className={`w-20 h-20 rounded-3xl border-2 flex flex-col items-center justify-center transition-all relative ${
                            bed.status === 'occupied'
                              ? 'bg-surface border-border/40 text-text-secondary/30 cursor-not-allowed'
                              : formData.bedId === bed._id
                                ? 'bg-primary border-primary text-white shadow-xl shadow-primary/30'
                                : 'bg-card border-border/60 text-text-secondary/40 hover:border-primary/30 hover:text-primary/60'
                          }`}
                        >
                          <MdHotel size={24} />
                          <span className="text-[10px] font-bold mt-1">Bed {bed.number}</span>
                          {formData.bedId === bed._id && <MdCheckCircle className={`absolute -top-2 -right-2 text-xl text-primary bg-card rounded-full`} />}
                        </button>
                      ))}
                  </div>
                  <div className="pt-4 space-y-3">
                    <button
                      onClick={handleSubmit}
                      disabled={!formData.name || !formData.phone || formData.phone.length !== 10 || !formData.bedId}
                      className="btn-primary w-full py-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTemporary ? "Finalize Temporary Assignment" : "Finalize Onboarding"}
                    </button>
                    <button onClick={() => setStep(3)} className="w-full text-text-secondary/50 font-medium uppercase tracking-wider text-[10px] hover:text-text-secondary transition-colors flex items-center justify-center gap-1">
                      <MdArrowBack /> Choose Different Room
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantManagement;
