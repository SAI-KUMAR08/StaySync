import React, { useState, useRef, useEffect } from "react";
import { MdAdd, MdCheck, MdKeyboardArrowDown } from "react-icons/md";
import api from "../api/axios";
import toast from "react-hot-toast";

const HostelSwitcher = ({ hostels, activeHostelId, onSwitch }) => {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({});
  const ref = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Animate the dropdown
  useEffect(() => {
    if (!animRef.current) return;
    if (open) {
      animRef.current.style.opacity = "1";
      animRef.current.style.transform = "translateY(0) scale(1)";
    } else {
      animRef.current.style.opacity = "0";
      animRef.current.style.transform = "translateY(-4px) scale(0.97)";
    }
  }, [open]);

  // Prefetch stats when dropdown opens
  useEffect(() => {
    if (!open || hostels.length <= 1) return;
    let cancelled = false;
    hostels.forEach(async (h) => {
      if (cancelled || stats[h._id]) return;
      try {
        const res = await api.get("/owner/occupancy", {
          headers: { "x-hostel-id": h._id },
        });
        if (!cancelled) setStats((prev) => ({ ...prev, [h._id]: res.data.data }));
      } catch { /* ignore */ }
    });
    return () => { cancelled = true; };
  }, [open, hostels, stats]);

  const active = hostels.find((h) => h._id === activeHostelId);

  const createNew = async () => {
    const name = window.prompt("New hostel name");
    if (!name?.trim()) return;
    try {
      const res = await api.post("/owner/hostels", { hostelName: name.trim() });
      toast.success("Hostel created");
      await onSwitch(res.data.data._id);
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to create hostel");
    }
  };

  // Single hostel — compact display
  if (hostels.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/50 border border-border/60">
        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary">
            {active?.name?.[0]?.toUpperCase() || "H"}
          </span>
        </div>
        <span className="text-sm font-semibold text-text-primary">
          {active?.name || active?.hostelName || "My Hostel"}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/50 border border-border/60 hover:border-border hover:bg-white transition-all text-sm group"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary">
            {active?.name?.[0]?.toUpperCase() || "H"}
          </span>
        </div>
        <span className="font-semibold text-text-primary truncate max-w-[110px]">
          {active?.name || active?.hostelName}
        </span>
        <MdKeyboardArrowDown
          size={16}
          className={`text-text-tertiary transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      <div
        ref={animRef}
        role="listbox"
        className="absolute right-0 top-full mt-2 w-72 bg-white border border-border rounded-xl shadow-lg z-50 overflow-hidden origin-top-right transition-all duration-200"
        style={{ opacity: 0, transform: "translateY(-4px) scale(0.97)" }}
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-border/40">
          <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
            Switch hostel
          </p>
        </div>

        {/* List */}
        <div className="py-1 max-h-72 overflow-y-auto">
          {hostels.map((h) => {
            const isActive = h._id === activeHostelId;
            const s = stats[h._id];
            return (
              <button
                key={h._id}
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onSwitch(h._id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all relative ${
                  isActive
                    ? "bg-primary/[0.04]"
                    : "hover:bg-black/[0.02]"
                }`}
              >
                {/* Left accent bar for active */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />
                )}

                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                    isActive
                      ? "bg-primary text-white"
                      : "bg-black/[0.04] text-text-secondary"
                  }`}
                >
                  {h.name?.[0]?.toUpperCase() || "H"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {h.name || h.hostelName}
                    </p>
                    {isActive && (
                      <span className="text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  {s ? (
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      {s.occupiedBeds ?? 0} resident{s.occupiedBeds !== 1 ? "s" : ""}
                      {s.availableBeds !== undefined
                        ? ` · ${s.availableBeds} bed${s.availableBeds !== 1 ? "s" : ""} free`
                        : ""}
                      {s.totalBeds
                        ? ` · ${Math.round((s.occupiedBeds / s.totalBeds) * 100)}% full`
                        : ""}
                    </p>
                  ) : (
                    <p className="text-[11px] text-text-tertiary/50 mt-0.5">
                      Loading stats...
                    </p>
                  )}
                </div>

                {isActive && (
                  <MdCheck className="text-primary shrink-0" size={18} />
                )}
              </button>
            );
          })}
        </div>

        {/* New Hostel */}
        <div className="border-t border-border/40">
          <button
            onClick={createNew}
            className="w-full flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-text-tertiary hover:text-primary hover:bg-primary/5 transition-all"
          >
            <MdAdd size={15} /> New Hostel
          </button>
        </div>
      </div>
    </div>
  );
};

export default HostelSwitcher;
