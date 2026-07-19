import React, { useState, useRef, useEffect } from "react";
import { MdAdd, MdHome, MdCheck, MdKeyboardArrowDown } from "react-icons/md";
import api from "../api/axios";
import toast from "react-hot-toast";

const HostelSwitcher = ({ hostels, activeHostelId, onSwitch }) => {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({});
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Load occupancy stats for each hostel
  useEffect(() => {
    if (!open || hostels.length <= 1) return;
    hostels.forEach(async (h) => {
      if (stats[h._id]) return;
      try {
        const res = await api.get("/owner/occupancy", {
          headers: { "x-hostel-id": h._id },
        });
        setStats((prev) => ({ ...prev, [h._id]: res.data.data }));
      } catch {
        // silently ignore
      }
    });
  }, [open, hostels, stats]);

  const active = hostels.find((h) => h._id === activeHostelId);

  const createNew = async () => {
    const name = window.prompt("New hostel name");
    if (!name?.trim()) return;
    try {
      const created = await api.post("/owner/hostels", { hostelName: name.trim() });
      toast.success("Hostel created");
      await onSwitch(created.data.data._id);
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to create hostel");
    }
  };

  if (hostels.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface/80 border border-border text-xs font-medium">
        <MdHome className="text-primary shrink-0" size={16} />
        <span className="font-bold text-text-primary truncate max-w-[140px]">
          {active?.name || active?.hostelName || "My Hostel"}
        </span>
        <button
          onClick={createNew}
          className="ml-1 p-1 rounded-lg text-text-tertiary hover:text-primary hover:bg-primary/10 transition-all"
        >
          <MdAdd size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface/80 border border-border hover:border-primary/30 hover:bg-primary/[0.02] transition-all text-xs font-medium group"
      >
        <MdHome className="text-primary shrink-0" size={16} />
        <span className="font-bold text-text-primary truncate max-w-[120px]">
          {active?.name || active?.hostelName}
        </span>
        <MdKeyboardArrowDown
          size={14}
          className={`text-text-tertiary transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-surface border border-border rounded-2xl shadow-xl z-50 overflow-hidden animate-fade-in">
          <div className="px-4 py-3 border-b border-border/50">
            <p className="text-[8px] font-bold text-text-tertiary uppercase tracking-wider">
              Switch Hostel
            </p>
          </div>
          <div className="py-1 max-h-64 overflow-y-auto">
            {hostels.map((h) => {
              const isActive = h._id === activeHostelId;
              const s = stats[h._id];
              return (
                <button
                  key={h._id}
                  onClick={() => {
                    onSwitch(h._id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-primary/5 ${
                    isActive ? "bg-primary/[0.04]" : ""
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                      isActive
                        ? "bg-primary text-white"
                        : "bg-surface border border-border text-text-secondary"
                    }`}
                  >
                    {h.name?.[0]?.toUpperCase() || "H"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {h.name || h.hostelName}
                    </p>
                    {s && (
                      <p className="text-[9px] text-text-secondary font-medium">
                        {s.occupiedBeds ?? "—"} resident
                        {s.occupiedBeds !== 1 ? "s" : ""}
                        {s.availableBeds !== undefined
                          ? ` · ${s.availableBeds} free`
                          : ""}
                      </p>
                    )}
                  </div>
                  {isActive && (
                    <MdCheck className="text-primary shrink-0" size={16} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="border-t border-border/50 px-3 py-2">
            <button
              onClick={createNew}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold text-text-secondary hover:text-primary hover:bg-primary/5 transition-all uppercase tracking-wider"
            >
              <MdAdd size={14} /> New Hostel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostelSwitcher;
