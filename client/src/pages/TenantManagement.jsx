import { useEffect, useState, useMemo, useCallback } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { MdAdd, MdSearch, MdPeople } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { normalizeStructure } from "../utils/normalizeStructure";
import { normalizePhone } from "../utils/phone";
import { mapTenantForDisplay } from "../utils/tenantDisplay";
import { getApiError } from "../utils/getApiError";
import Button from "../components/Button";
import ConfirmModal from "../components/ConfirmModal";
import { useSocket } from "../context/SocketContext";
import { useDebounce } from "../hooks/useDebounce";
import TenantTable from "../components/tenants/TenantTable";
import TenantOnboardModal from "../components/tenants/TenantOnboardModal";

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  aadhaarNumber: "",
  address: "",
  emergencyContact: "",
  joiningDate: new Date().toISOString().split("T")[0],
  floorId: "",
  roomId: "",
  bedId: "",
  rentAmount: 0,
  idProof: "",
  offlineBookingForm: "",
  securityDepositPaid: false,
  securityDepositAmount: 0,
};

const TenantManagement = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [tenants, setTenants] = useState([]);
  const [structure, setStructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [filter, setFilter] = useState("");

  const [step, setStep] = useState(1);
  const [submitError, setSubmitError] = useState("");
  const [selectedSharing, setSelectedSharing] = useState(null);

  // 🆕 Temporary allotment states
  const [isTemporary, setIsTemporary] = useState(false);
  const [preferredSharing, setPreferredSharing] = useState(null);

  const [formData, setFormData] = useState(EMPTY_FORM);

  const [fieldErrors, setFieldErrors] = useState({});
  const [reassigningTenant, setReassigningTenant] = useState(null);
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneError, setPhoneError] = useState("");
  const [vacatingTenant, setVacatingTenant] = useState(null);

  const handleReassignStart = (tenant) => {
    const name = tenant.name || tenant.personalInfo?.name || "";
    const phone = tenant.phone || tenant.personalInfo?.phone || "";
    setFormData({
      name,
      phone,
      aadhaarNumber: tenant.aadhaarNumber || "",
      address: tenant.address || "",
      emergencyContact: tenant.emergencyContact || "",
      joiningDate: tenant.joinDate
        ? tenant.joinDate.split("T")[0]
        : new Date().toISOString().split("T")[0],
      floorId: tenant.floorId?._id || "",
      roomId: tenant.roomId?._id || "",
      bedId: tenant.bedId?._id || "",
      rentAmount: tenant.monthlyRent || 0,
      securityDepositPaid: false,
      securityDepositAmount: 0,
    });
    setReassigningTenant(tenant);
    setStep(2);
    setSubmitError("");
    setFieldErrors({});
    setShowModal(true);
  };

  const fetchTenants = useCallback(async () => {
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
  }, [debouncedSearch, filter]);

  const fetchStructure = useCallback(async () => {
    try {
      const res = await api.get("/owner/structure");
      setStructure(normalizeStructure(res.data.data.structure || []));
    } catch (error) {
      console.error(error);
    }
  }, []);
  useEffect(() => {
    fetchTenants();
    fetchStructure();
  }, [fetchTenants, fetchStructure, user?.hostelId]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      fetchTenants();
      fetchStructure();
    };
    socket.on("occupancy_update", refresh);
    socket.on("tenant_assigned", refresh);
    socket.on("tenant_removed", refresh);
    socket.on("tenant_updated", refresh);
    socket.on("vacate_request_created", refresh);
    socket.on("vacate_request_updated", refresh);
    // Profile approval updates name/phone/email on the tenant record — refresh the list.
    socket.on("profile_request_updated", refresh);
    return () => {
      socket.off("occupancy_update", refresh);
      socket.off("tenant_assigned", refresh);
      socket.off("tenant_removed", refresh);
      socket.off("tenant_updated", refresh);
      socket.off("vacate_request_created", refresh);
      socket.off("vacate_request_updated", refresh);
      socket.off("profile_request_updated", refresh);
    };
  }, [socket, fetchTenants, fetchStructure]);

  const handleSharingSelect = (type) => {
    setSelectedSharing(type);
    setFormData({ ...formData, sharingType: type });
    setStep(3);
  };

  const handleSubmit = async () => {
    setSubmitError("");
    setFieldErrors({});
    if (!formData.sharingType) return toast.error("Please select a room type");
    if (formData.phone.length !== 10) return toast.error("Phone must be exactly 10 digits");
    try {
      const fullPhone = countryCode + formData.phone;
      const phone = normalizePhone(fullPhone);
      if (reassigningTenant) {
        await api.post(`/owner/tenants/${reassigningTenant._id}/assign-bed`, {
          sharingType: formData.sharingType,
          ...(formData.idProof ? { idProof: formData.idProof } : {}),
          ...(formData.offlineBookingForm
            ? { offlineBookingForm: formData.offlineBookingForm }
            : {}),
          ...(isTemporary ? { isTemporary, preferredSharing } : {}),
        });
        toast.success("Tenant moved to an available room of the selected type successfully!");
      } else {
        await api.post("/owner/tenants", {
          name: formData.name,
          phone,
          ...(formData.email ? { email: formData.email } : {}),
          aadhaarNumber: formData.aadhaarNumber,
          address: formData.address,
          emergencyContact: formData.emergencyContact,
          sharingType: formData.sharingType,
          monthlyRent: formData.rentAmount,
          joinDate: formData.joiningDate,
          isTemporary,
          ...(formData.idProof ? { idProof: formData.idProof } : {}),
          ...(formData.offlineBookingForm
            ? { offlineBookingForm: formData.offlineBookingForm }
            : {}),
          ...(isTemporary && preferredSharing ? { preferredSharing } : {}),
          isSecurityDepositPaid: formData.securityDepositPaid,
          securityDepositDate: formData.securityDepositPaid ? new Date().toISOString() : null,
        });
        toast.success(
          isTemporary ? "Tenant onboarded temporarily!" : "Tenant onboarded successfully!"
        );
      }
      setShowModal(false);
      setReassigningTenant(null);
      setIsTemporary(false);
      setPreferredSharing(null);
      setStep(1);
      fetchTenants();
      fetchStructure();
    } catch (error) {
      const data = error.response?.data;
      const msg = getApiError(error);
      setSubmitError(msg);
      // Parse backend field-level errors
      if (data?.errors?.fieldErrors) {
        const parsed = {};
        for (const [key, msgs] of Object.entries(data.errors.fieldErrors)) {
          if (msgs?.length) parsed[key] = msgs[0];
        }
        setFieldErrors(parsed);
        // Duplicate mobile number renders inline below the Mobile Number field.
        if (parsed.phone) setPhoneError(parsed.phone);
      }
      toast.error(msg);
    }
  };

  // Open the vacating confirmation modal for a tenant.
  const handleVacateClick = (tenant) => setVacatingTenant(tenant);

  // Confirm vacating: deactivate + free the room/bed, then offer Undo.
  const confirmVacate = async () => {
    if (!vacatingTenant) return;
    try {
      await api.delete(`/owner/tenants/${vacatingTenant._id}`);
      const tenantId = vacatingTenant._id;
      setVacatingTenant(null);
      fetchTenants();
      fetchStructure();
      // Bottom-right success toast with Undo (do not say "removed" — retained 15 days).
      toast(
        (t) => (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Tenant vacated successfully.</span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                toast.dismiss(t.id);
                handleUndoVacate(tenantId);
              }}
            >
              Undo
            </button>
          </div>
        ),
        { position: "bottom-right", duration: 10000 }
      );
    } catch {
      toast.error("Failed to vacate tenant");
      setVacatingTenant(null);
    }
  };

  // Undo vacating: real backend reversal, restoring the previous room/bed when still available.
  const handleUndoVacate = async (id) => {
    try {
      const res = await api.post(`/owner/tenants/${id}/undo-vacate`);
      toast.success(res.data?.data?.message || "Vacating undone");
      fetchTenants();
      fetchStructure();
    } catch (error) {
      toast.error(error.response?.data?.message || "Undo failed");
    }
  };

  // 🆕 Temporary tenants analysis
  // Temporary tenants display as active — they are currently living in the hostel
  const displayTenants = useMemo(() => tenants, [tenants]);

  const openAddTenant = () => {
    setFormData(EMPTY_FORM);
    setReassigningTenant(null);
    setIsTemporary(false);
    setPreferredSharing(null);
    setStep(1);
    setShowModal(true);
  };

  if (loading)
    return (
      <div className="space-y-5" role="status" aria-label="Loading tenants">
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
            <MdPeople /> Tenants
          </div>
          <h2 className="section-title">
            Tenant <span>Management</span>
          </h2>
          <p className="section-sub">
            Manage tenant lifecycle, unit assignments, and temporary allotments
          </p>
        </div>
        <Button onClick={openAddTenant} icon={MdAdd}>
          Add Tenant
        </Button>
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
            <button
              key={id || "all"}
              onClick={() => setFilter(id)}
              className={`px-4 py-2.5 rounded-xl text-[9px] font-bold font-sans uppercase tracking-wider transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                filter === id
                  ? "bg-primary text-white shadow-md shadow-primary/20"
                  : "text-text-secondary/60 hover:text-text-secondary hover:bg-surface-hover/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <TenantTable
        tenants={displayTenants}
        onView={(tenant) => navigate(`/admin/tenants/${tenant._id}`)}
        onReassign={handleReassignStart}
        onDelete={handleVacateClick}
      />

      {/* Multi-Step Onboarding Modal */}
      <TenantOnboardModal
        showModal={showModal}
        onClose={() => {
          setShowModal(false);
          setReassigningTenant(null);
        }}
        step={step}
        setStep={setStep}
        reassigningTenant={reassigningTenant}
        isTemporary={isTemporary}
        setIsTemporary={setIsTemporary}
        preferredSharing={preferredSharing}
        setPreferredSharing={setPreferredSharing}
        formData={formData}
        setFormData={setFormData}
        countryCode={countryCode}
        setCountryCode={setCountryCode}
        phoneError={phoneError}
        setPhoneError={setPhoneError}
        fieldErrors={fieldErrors}
        setFieldErrors={setFieldErrors}
        structure={structure}
        selectedSharing={selectedSharing}
        onSharingSelect={handleSharingSelect}
        submitError={submitError}
        onSubmit={handleSubmit}
      />

      {/* Vacating confirmation modal */}
      {vacatingTenant && (
        <ConfirmModal
          title="Confirm Tenant Vacating"
          confirmLabel="Confirm Vacating"
          cancelLabel="Cancel"
          onCancel={() => setVacatingTenant(null)}
          onConfirm={confirmVacate}
        >
          <p>
            Are you sure you want to mark{" "}
            <span className="font-bold text-text-primary">
              {vacatingTenant.name || vacatingTenant.personalInfo?.name || "this tenant"}
            </span>{" "}
            as vacated? Their room allocation will be released, and their tenant information will
            remain retained for 15 days before becoming eligible for permanent deletion.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
};

export default TenantManagement;
