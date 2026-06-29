import React, { useEffect, useState } from "react";
import api from "../api/axios";
import {
  MdMeetingRoom, MdHotel, MdAddCircle, MdEdit,
  MdClose, MdAttachMoney, MdOutlineAcUnit, MdOutlineWbSunny,
  MdLayers, MdSearch, MdFilterList, MdAdd, MdDelete,
  MdChevronLeft, MdChevronRight, MdCheckCircle, MdPeople, MdHome
} from "react-icons/md";
import { toast } from "react-hot-toast";
import { normalizeStructure } from "../utils/normalizeStructure";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

const RoomManagement = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [structure, setStructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [formData, setFormData] = useState({
    number: "",
    floorId: "",
    sharingType: 2,
    price: 4500,
    type: "Non-AC"
  });

  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [setupFloors, setSetupFloors] = useState([]);
  const [setupLoading, setSetupLoading] = useState(false);

  const startSetupWizard = () => {
    setSetupFloors([{ number: 1, rooms: [] }]);
    setSetupStep(1);
    setIsSettingUp(true);
  };

  const addSetupFloor = () => {
    setSetupFloors([...setupFloors, { number: setupFloors.length + 1, rooms: [] }]);
  };

  const removeSetupFloor = () => {
    if (setupFloors.length > 1) {
      setSetupFloors(setupFloors.slice(0, -1));
    }
  };

  const addSetupRoom = (floorIdx) => {
    const newFloors = [...setupFloors];
    const floorNum = newFloors[floorIdx].number;
    const roomCount = newFloors[floorIdx].rooms.length + 1;
    newFloors[floorIdx].rooms.push({
      number: `${floorNum}${String(roomCount).padStart(2, '0')}`,
      sharingType: 2,
      price: 5000,
      isAC: false
    });
    setSetupFloors(newFloors);
  };

  const updateSetupRoom = (floorIdx, roomIdx, field, value) => {
    const newFloors = [...setupFloors];
    newFloors[floorIdx].rooms[roomIdx][field] = value;
    setSetupFloors(newFloors);
  };

  const removeSetupRoom = (floorIdx, roomIdx) => {
    const newFloors = [...setupFloors];
    newFloors[floorIdx].rooms.splice(roomIdx, 1);
    setSetupFloors(newFloors);
  };

  const handleSetupSubmit = async () => {
    setSetupLoading(true);
    try {
      await api.post("/owner/setup", { floors: setupFloors });
      toast.success("Hostel structure initialized successfully!");
      setIsSettingUp(false);
      setSetupFloors([]);
      setSetupStep(1);
      fetchStructure();
    } catch (error) {
      toast.error(error.response?.data?.message || "Setup failed. Please check your inputs.");
    } finally {
      setSetupLoading(false);
    }
  };

  useEffect(() => {
    fetchStructure();
  }, [user?.hostelId]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchStructure();
    socket.on("occupancy_update", refresh);
    socket.on("tenant_assigned", refresh);
    socket.on("tenant_removed", refresh);
    return () => {
      socket.off("occupancy_update", refresh);
      socket.off("tenant_assigned", refresh);
      socket.off("tenant_removed", refresh);
    };
  }, [socket, user?.hostelId]);

  const fetchStructure = async () => {
    try {
      setLoading(true);
      const res = await api.get("/owner/structure");
      setStructure(normalizeStructure(res.data.data.structure || []));
    } catch (error) {
      toast.error("Failed to fetch room structure.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRoom) {
        const payload = { monthlyRent: formData.price };
        // Only send sharingType/type if they changed
        if (formData.sharingType !== editingRoom.sharingType) {
          payload.sharingType = formData.sharingType;
        }
        if (formData.type !== editingRoom.type) {
          payload.type = formData.type;
        }
        await api.patch(`/owner/rooms/${editingRoom._id}`, payload);
        toast.success("Room updated successfully");
      }
      setShowModal(false);
      setEditingRoom(null);
      fetchStructure();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    }
  };

  const handleAddFloor = async () => {
    try {
      await api.post("/owner/floors");
      toast.success("New floor added successfully");
      fetchStructure();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to add floor");
    }
  };

  const handleBedDoubleClick = async (bed) => {
    const tenantId = bed.tenantId?._id || bed.tenantId;
    if (bed.status !== "occupied" || !tenantId) return;
    try {
      const res = await api.get(`/owner/tenants/${tenantId}`);
      const t = res.data.data || res.data;
      if (t) {
        setSelectedTenant({
          ...t,
          name: t.name || t.personalInfo?.name || "",
          phone: t.phone || t.personalInfo?.phone || "",
          email: t.email || t.personalInfo?.email || "",
        });
      }
    } catch (error) {
      toast.error("Failed to load tenant details");
    }
  };

  if (loading) return (
    <div className="space-y-8" role="status" aria-label="Loading inventory">
      <div className="flex items-center gap-6 px-2">
        <div className="shimmer h-9 w-28 rounded-2xl" />
        <div className="h-[2px] flex-1 bg-border rounded-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bento-card overflow-hidden">
            <div className="p-7 pb-5 space-y-4">
              <div className="shimmer h-5 w-28" />
              <div className="shimmer h-3 w-18" />
              <div className="shimmer h-5 w-24 mt-2" />
            </div>
            <div className="grid grid-cols-2 p-7 py-5 bg-background/50 space-y-2">
              <div className="shimmer h-4 w-14" />
              <div className="shimmer h-4 w-14" />
            </div>
            <div className="p-7 pt-5">
              <div className="flex gap-3">
                {[...Array(3)].map((_, j) => <div key={j} className="shimmer w-12 h-12 rounded-2xl" />)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
        <div>
          <div className="section-tag mb-3">
            <MdLayers /> Facility Inventory
          </div>
          <h2 className="section-title">Inventory <span>Management</span></h2>
          <p className="section-sub">Manage floors, rooms, and unit-level specifications.</p>
          <div className="flex flex-wrap gap-4 mt-3 text-[9px] font-medium uppercase tracking-wider text-text-secondary/70">
            <span className="inline-flex items-center gap-1.5"><span className="status-dot-occupied" /> Occupied</span>
            <span className="inline-flex items-center gap-1.5"><span className="status-dot-available" /> Available</span>
            <span className="text-text-secondary/40">Double-click for tenant info</span>
          </div>
        </div>
      </div>

      {structure.length === 0 ? (
        isSettingUp ? (
          setupStep === 1 ? (
            <div className="space-y-8 animate-slide-up">
              <div className="bento-card p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-black font-sans text-text-primary tracking-tight">Hostel Floor Setup</h3>
                    <p className="text-xs text-text-secondary/60 font-medium uppercase tracking-wider mt-1">Step 1: Configure Floors</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={removeSetupFloor}
                      disabled={setupFloors.length <= 1}
                      className="px-4 py-2 bg-surface hover:bg-background disabled:opacity-50 text-text-secondary text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                    >
                      Remove Floor
                    </button>
                    <button
                      onClick={addSetupFloor}
                      className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1"
                    >
                      <MdAdd size={14} /> Add Floor
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {setupFloors.map((f) => (
                    <div key={f.number} className="bg-background/50 p-5 rounded-3xl border border-border/50 text-center">
                      <p className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">Floor</p>
                      <p className="text-3xl font-black text-primary mt-1">{f.number}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-4">
                <button onClick={() => setIsSettingUp(false)} className="btn-secondary px-8">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const newFloors = [...setupFloors];
                    newFloors.forEach((floor) => {
                      if (floor.rooms.length === 0) {
                        floor.rooms = [{
                          number: `${floor.number}01`,
                          sharingType: 2,
                          price: 5000,
                          isAC: false
                        }];
                      }
                    });
                    setSetupFloors(newFloors);
                    setSetupStep(2);
                  }}
                  className="btn-primary px-8 flex items-center gap-2"
                >
                  Configure Rooms <MdChevronRight size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-slide-up">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bento-card p-7 gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-primary text-white flex items-center justify-center">
                    <MdLayers size={22} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black font-sans text-text-primary tracking-tight">Hostel Structure</h3>
                    <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider mt-1">Step 2: Add Rooms & Beds</p>
                  </div>
                </div>
                <button onClick={addSetupFloor} className="bg-text-primary text-white px-5 py-2.5 rounded-2xl font-bold flex items-center gap-2 hover:opacity-90 transition-all text-xs uppercase tracking-wider">
                  <MdAdd size={14} /> Add Floor
                </button>
              </div>

              <div className="space-y-5">
                {setupFloors.map((floor, fIdx) => (
                  <div key={fIdx} className="bento-card p-7 space-y-5">
                    <div className="flex justify-between items-center border-b border-border/50 pb-5">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-full bg-text-primary text-white flex items-center justify-center font-bold text-sm">
                          {floor.number}
                        </span>
                        <h4 className="font-bold text-text-primary">Floor Details</h4>
                      </div>
                      <button onClick={() => addSetupRoom(fIdx)} className="btn-ghost flex items-center gap-1.5">
                        <MdAdd size={16} /> New Room
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {floor.rooms.map((room, rIdx) => (
                        <div key={rIdx} className="p-5 rounded-2xl border border-border/50 bg-surface space-y-4 relative group hover:bg-card hover:shadow-lg transition-all">
                          <button
                            onClick={() => removeSetupRoom(fIdx, rIdx)}
                            className="absolute top-3 right-3 text-text-secondary/30 hover:text-[#C62828] opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <MdDelete size={18} />
                          </button>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                              <label className="text-[8px] uppercase font-bold text-text-secondary tracking-wider">Room Name / No.</label>
                              <input type="text" className="w-full bg-transparent border-b border-border/60 focus:border-primary outline-none py-2 font-semibold text-text-primary text-sm"
                                value={room.number} onChange={(e) => updateSetupRoom(fIdx, rIdx, "number", e.target.value)} />
                            </div>
                            <div>
                              <label className="text-[8px] uppercase font-bold text-text-secondary tracking-wider">Sharing</label>
                              <select className="w-full bg-transparent border-b border-border/60 focus:border-primary outline-none py-2 font-semibold text-text-primary text-sm"
                                value={room.sharingType} onChange={(e) => updateSetupRoom(fIdx, rIdx, "sharingType", parseInt(e.target.value) || 1)}>
                                {[1,2,3,4,6].map(n => <option key={n} value={n}>{n} Bed</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[8px] uppercase font-bold text-text-secondary tracking-wider">Monthly Rent</label>
                              <input type="number" className="w-full bg-transparent border-b border-border/60 focus:border-primary outline-none py-2 font-semibold text-text-primary text-sm"
                                value={room.price} onChange={(e) => updateSetupRoom(fIdx, rIdx, "price", parseInt(e.target.value) || 0)} />
                            </div>
                            <div className="col-span-2">
                              <label className="text-[8px] uppercase font-bold text-text-secondary tracking-wider">Type</label>
                              <select className="w-full bg-transparent border-b border-border/60 focus:border-primary outline-none py-2 font-semibold text-text-primary text-sm"
                                value={room.isAC} onChange={(e) => updateSetupRoom(fIdx, rIdx, "isAC", e.target.value === 'true')}>
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
                <button onClick={() => setSetupStep(1)} className="btn-secondary w-1/4 flex items-center justify-center gap-2">
                  <MdChevronLeft size={20} /> Back
                </button>
                <button disabled={setupLoading || setupFloors.length === 0} onClick={handleSetupSubmit} className="btn-primary flex-1 py-4 flex items-center justify-center gap-3">
                  {setupLoading ? "Initializing..." : "Finalize & Launch"} <MdCheckCircle size={20} />
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="bento-card p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-3xl bg-surface flex items-center justify-center mb-6">
              <MdMeetingRoom className="text-4xl text-text-secondary/30" />
            </div>
            <h3 className="text-xl font-black font-sans text-text-primary tracking-tight">Empty Inventory</h3>
            <p className="text-text-secondary font-medium max-w-xs mt-3 mb-6">Start by running the setup wizard to define your hostel's floors and rooms.</p>
            <button onClick={startSetupWizard} className="btn-primary px-8 flex items-center gap-2">
              Configure floors and beds <MdChevronRight size={18} />
            </button>
          </div>
        )
      ) : (
        structure.map((floor) => (
          <section key={floor._id} className="space-y-6 animate-slide-up">
            <div className="flex items-center gap-5 px-2">
              <div className="bg-primary text-white px-6 py-2.5 rounded-2xl text-[9px] font-black font-sans uppercase tracking-[0.15em] shadow-lg shadow-text-primary/10">
                Floor {floor.number}
              </div>
              <div className="h-[1px] flex-1 bg-border/80 rounded-full"></div>
              <p className="text-[9px] font-medium text-text-secondary uppercase tracking-wider">{floor.rooms.length} Units</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
              {floor.rooms.map((room, i) => (
                <div key={room._id} className="stagger-enter" style={{ animationDelay: `${i * 0.06}s` }}>
                  <div className="bento-card overflow-hidden group">

                    {/* Specs Header */}
                    <div className="p-6 pb-5 relative">
                      <div className="flex justify-between items-start mb-5">
                        <div className="space-y-1">
                          <h4 className="text-xl font-black font-sans text-text-primary tracking-tight">Room {room.number}</h4>
                          <div className="flex items-center gap-2">
                            <span className={`badge ${room.type === 'AC' ? 'badge-primary' : 'badge-slate'}`}>
                              {room.type}
                            </span>
                            <span className="text-[8px] font-bold text-text-secondary/50 uppercase tracking-wider">{room.sharingType} Bed</span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setEditingRoom(room);
                            setFormData({ number: room.number, floorId: floor._id, sharingType: room.sharingType, price: room.price, type: room.type || "Non-AC" });
                            setShowModal(true);
                          }}
                          className="w-9 h-9 flex items-center justify-center bg-card text-text-secondary/40 hover:text-primary hover:bg-primary/5 transition-all rounded-xl border border-border/60"
                        >
                          <MdEdit size={16} />
                        </button>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-black text-text-primary tracking-tight">₹{room.price?.toLocaleString()}</span>
                        <span className="text-[8px] font-medium text-text-secondary/60 uppercase tracking-wider">/ month</span>
                      </div>
                    </div>

                    {/* Occupancy Bar */}
                    <div className="grid grid-cols-2 px-6 py-5 bg-surface border-y border-border/40">
                      <div className="space-y-0.5">
                        <p className="text-[8px] font-bold text-text-secondary uppercase tracking-wider">Occupied</p>
                        <p className="text-xl font-black text-[#C62828]">{room.occupiedBeds}</p>
                      </div>
                      <div className="space-y-0.5 border-l border-border/40 pl-6">
                        <p className="text-[8px] font-bold text-text-secondary uppercase tracking-wider">Vacant</p>
                        <p className="text-xl font-black text-emerald-500">{room.totalBeds - room.occupiedBeds}</p>
                      </div>
                    </div>

                    {/* Bed Layout */}
                    <div className="p-6 pt-5">
                      <div className="flex flex-wrap gap-2.5">
                        {room.beds.map((bed) => {
                          const isOccupied = bed.status === "occupied";
                          return (
                          <div
                            key={bed._id}
                            title={
                              isOccupied
                                ? `Bed ${bed.bedLabel || bed.number} — ${bed.tenantId?.name || bed.tenantId?.personalInfo?.name || "Occupied"} (double-click for details)`
                                : `Bed ${bed.bedLabel || bed.number} — Available`
                            }
                            onDoubleClick={() => handleBedDoubleClick(bed)}
                            className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
                              isOccupied
                                ? "bg-[#C62828] text-white shadow-[0_2px_8px_rgba(198,40,40,0.3)] cursor-pointer hover:scale-105"
                                : "bg-[#2E7D32] text-white shadow-[0_2px_8px_rgba(46,125,50,0.3)]"
                            }`}
                          >
                            {isOccupied ? (
                              <span className="text-[10px] font-black leading-none">
                                {(bed.tenantId?.name || bed.tenantId?.personalInfo?.name || "T").charAt(0).toUpperCase()}
                              </span>
                            ) : (
                              <MdHotel size={16} />
                            )}
                            <span className="text-[6px] font-bold uppercase tracking-wider leading-none truncate max-w-[44px] px-0.5">
                              {isOccupied ? ((bed.tenantId?.name || bed.tenantId?.personalInfo?.name)?.split(" ")?.[0] || "Busy") : "Open"}
                            </span>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {/* Edit Room Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-md p-7">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-xl font-black font-sans text-text-primary tracking-tight uppercase">
                  Update Pricing
                </h3>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider mt-1">Room Pricing</p>
              </div>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 flex items-center justify-center bg-surface text-text-secondary/50 hover:text-text-primary rounded-xl transition-all">
                <MdClose size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="form-label">Room No.</label>
                  <input type="text" disabled value={formData.number} className="field-input opacity-50" />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">AC Type</label>
                  <select value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="field-select">
                    <option value="Non-AC">Non-AC</option>
                    <option value="AC">AC</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Monthly Rent (₹)</label>
                <div className="relative">
                  <MdAttachMoney className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/30 text-lg" />
                  <input type="number" required value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) || "" })}
                    className="field-input pl-10" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Sharing Capacity</label>
                <select value={formData.sharingType}
                  onChange={(e) => setFormData({ ...formData, sharingType: parseInt(e.target.value) })}
                  className="field-select">
                  {[1, 2, 3, 4, 6].map(n => (
                    <option key={n} value={n}>{n} Bed{ n > 1 ? 's' : '' }</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn-primary w-full py-4 text-sm">
                {editingRoom ? "Save Configuration" : "Save"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tenant QuickView Modal */}
      {selectedTenant && (
        <div className="modal-overlay" onClick={() => setSelectedTenant(null)}>
          <div className="bento-card max-w-sm w-full p-8 border border-border/60 shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedTenant(null)} className="absolute top-6 right-6 w-9 h-9 flex items-center justify-center bg-surface text-text-secondary/50 hover:text-text-primary rounded-2xl transition-all">
              <MdClose size={18} />
            </button>

            <div className="flex flex-col items-center text-center space-y-4 mb-6">
              <div className="w-20 h-20 rounded-full bg-primary p-0.5 shadow-md">
                <div className="w-full h-full rounded-full bg-card flex items-center justify-center text-2xl font-black text-text-primary">
                  {selectedTenant.name?.[0]?.toUpperCase()}
                </div>
              </div>
              <div>
                <h3 className="text-xl font-black font-sans text-text-primary tracking-tight">{selectedTenant.name}</h3>
                <p className="text-[9px] font-bold text-primary uppercase tracking-wider mt-1">Resident</p>
              </div>
            </div>

            <div className="space-y-3 bg-surface p-5 rounded-2xl border border-border/50">
              {[
                { label: "Mobile", value: selectedTenant.phone },
                { label: "Room", value: selectedTenant.roomId?.roomNumber || "—" },
                { label: "Bed", value: selectedTenant.bedId?.bedLabel || "—" },
                { label: "Email", value: selectedTenant.email },
                { label: "Rent", value: `₹${selectedTenant.monthlyRent?.toLocaleString()} /mo`, highlight: true },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="flex justify-between items-center pb-3 border-b border-border/30 last:border-b-0 last:pb-0">
                  <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">{label}</span>
                  <span className={`text-sm ${highlight ? 'font-black text-text-primary' : 'font-semibold text-text-primary'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomManagement;
