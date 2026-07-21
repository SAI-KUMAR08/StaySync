import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MdAdd, MdCheck, MdKeyboardArrowDown, MdSearch, MdApartment, MdClose } from "react-icons/md";
import api from "../api/axios";
import toast from "react-hot-toast";

// ── Mini avatar using theme primary color ──
const HostelAvatar = ({ name, size = "sm", className = "" }) => {
  const initial = (name || "H")[0].toUpperCase();
  const dims = size === "sm" ? "w-7 h-7 text-[11px]" : "w-9 h-9 text-sm";
  return (
    <div
      className={`${dims} rounded-lg bg-primary text-white flex items-center justify-center font-bold shrink-0 ${className}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
};

const HostelSwitcher = ({ hostels, activeHostelId, onSwitch }) => {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);
  const ref = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
        setFocusIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus search input when dropdown mounts
  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [open]);

  // Prefetch occupancy stats when dropdown opens
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
      } catch { /* silent */ }
    });
    return () => { cancelled = true; };
  }, [open, hostels, stats]);

  const active = hostels.find((h) => h._id === activeHostelId);

  // Filtered list based on search
  const filtered = useMemo(() => {
    if (!search.trim()) return hostels;
    const q = search.toLowerCase();
    return hostels.filter(
      (h) =>
        (h.name || h.hostelName || "").toLowerCase().includes(q) ||
        (h.address || "").toLowerCase().includes(q) ||
        (h.city || "").toLowerCase().includes(q)
    );
  }, [hostels, search]);

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

  const selectHostel = useCallback(
    (id) => {
      onSwitch(id);
      setOpen(false);
      setSearch("");
      setFocusIdx(-1);
    },
    [onSwitch]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (!open) return;
      const len = filtered.length;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusIdx((prev) => {
            const next = prev < len - 1 ? prev + 1 : 0;
            // Scroll into view
            const item = listRef.current?.children[next];
            item?.scrollIntoView({ block: "nearest" });
            return next;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusIdx((prev) => {
            const next = prev > 0 ? prev - 1 : len - 1;
            const item = listRef.current?.children[next];
            item?.scrollIntoView({ block: "nearest" });
            return next;
          });
          break;
        case "Enter":
          e.preventDefault();
          if (focusIdx >= 0 && focusIdx < len) {
            selectHostel(filtered[focusIdx]._id);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setSearch("");
          setFocusIdx(-1);
          break;
      }
    },
    [open, filtered, focusIdx, selectHostel]
  );

  // ── Single hostel — compact pill ──
  if (hostels.length <= 1) {
    return (
      <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white border border-border/60 shadow-sm">
        <HostelAvatar name={active?.name || active?.hostelName} size="sm" />
        <span className="text-sm font-semibold text-text-primary">
          {active?.name || active?.hostelName || "My Hostel"}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {/* ═══ Trigger ═══ */}
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (open) { setSearch(""); setFocusIdx(-1); }
        }}
        className="group flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white border border-border/60 shadow-sm hover:shadow-md hover:border-border transition-all duration-200 text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch hostel"
      >
        <HostelAvatar name={active?.name || active?.hostelName} size="sm" />
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

      {/* ═══ Dropdown — conditionally rendered so it does NOT intercept events when closed ═══ */}
      {open && (
      <div
        role="listbox"
        onKeyDown={handleKeyDown}
        className="absolute right-0 top-full mt-2 w-80 bg-white border border-border/80 rounded-2xl shadow-xl shadow-black/[0.08] z-50 overflow-hidden origin-top-right animate-slide-down"
      >
        {/* ── Header ── */}
        <div className="px-4 pt-3 pb-2.5 border-b border-border/40">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              Switch hostel
            </p>
            <span className="text-[10px] font-medium text-text-tertiary/60 bg-black/[0.04] px-2 py-0.5 rounded-full">
              {hostels.length}
            </span>
          </div>
          {/* Search */}
          <div className="relative">
            <MdSearch
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary/50 pointer-events-none"
            />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setFocusIdx(-1); }}
              onKeyDown={handleKeyDown}
              placeholder="Search hostels..."
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border/60 bg-black/[0.02] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all text-text-primary placeholder:text-text-tertiary/40"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary/40 hover:text-text-tertiary transition-colors"
                tabIndex={-1}
              >
                <MdClose size={13} />
              </button>
            )}
          </div>
        </div>

        {/* ── List ── */}
        <div
          ref={listRef}
          className="py-1 max-h-80 overflow-y-auto overscroll-contain"
          role="listbox"
          aria-label="Hostels"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <MdApartment className="text-2xl mx-auto mb-2 text-text-tertiary/20" />
              <p className="text-sm font-medium text-text-tertiary/60">No matching hostels</p>
              <p className="text-[10px] text-text-tertiary/40 mt-0.5">Try a different search term</p>
            </div>
          ) : (
            filtered.map((h, i) => {
              const isActive = h._id === activeHostelId;
              const isFocused = i === focusIdx;
              const raw = stats[h._id];
              // `/owner/occupancy` returns an array of room objects — aggregate to summary
              const s = Array.isArray(raw)
                ? raw.reduce(
                    (acc, r) => ({
                      occupiedBeds: acc.occupiedBeds + (r.occupied || 0),
                      totalBeds: acc.totalBeds + (r.capacity || 0),
                      availableBeds: acc.availableBeds + (r.available || 0),
                    }),
                    { occupiedBeds: 0, totalBeds: 0, availableBeds: 0 }
                  )
                : raw;
              const occupancyPct = s?.totalBeds
                ? Math.round((s.occupiedBeds / s.totalBeds) * 100)
                : null;

              return (
                <button
                  key={h._id}
                  ref={(el) => {
                    if (isFocused && el) el.scrollIntoView({ block: "nearest" });
                  }}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => selectHostel(h._id)}
                  onMouseEnter={() => setFocusIdx(i)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-all relative ${
                    isActive
                      ? "bg-primary/[0.04]"
                      : isFocused
                      ? "bg-black/[0.03]"
                      : "hover:bg-black/[0.02]"
                  }`}
                >
                  {/* Left accent for active */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-full bg-primary" />
                  )}

                  {/* Avatar */}
                  <HostelAvatar
                    name={h.name || h.hostelName}
                    size="md"
                    className={isActive ? "ring-2 ring-primary/20 ring-offset-1 ring-offset-white" : ""}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {h.name || h.hostelName}
                      </p>
                      {isActive && (
                        <span className="shrink-0 text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>

                    {/* Address/City */}
                    {(h.address || h.city) && (
                      <p className="text-[11px] text-text-tertiary/60 mt-0.5 truncate">
                        {[h.address, h.city].filter(Boolean).join(", ")}
                      </p>
                    )}

                    {/* Occupancy stats */}
                    <div className="flex items-center gap-3 mt-1.5">
                      {s ? (
                        <>
                          <span className="text-[10px] font-medium text-text-tertiary/70">
                            <span className="font-semibold text-text-secondary">{s.occupiedBeds ?? 0}</span> resident{+s.occupiedBeds !== 1 ? "s" : ""}
                          </span>
                          {s.availableBeds !== undefined && (
                            <span className="text-[10px] font-medium text-text-tertiary/70">
                              <span className="font-semibold text-text-secondary">{s.availableBeds}</span> free
                            </span>
                          )}
                          {occupancyPct !== null && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                occupancyPct >= 90
                                  ? "text-emerald-600 bg-emerald-50"
                                  : occupancyPct >= 50
                                  ? "text-amber-600 bg-amber-50"
                                  : "text-text-tertiary/60 bg-black/[0.04]"
                              }`}
                            >
                              {occupancyPct}%
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-text-tertiary/40 italic">Loading stats...</span>
                      )}
                    </div>
                  </div>

                  {/* Active checkmark */}
                  {isActive && (
                    <div className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <MdCheck className="text-primary" size={14} />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* ── New Hostel ── */}
        <div className="border-t border-border/40 px-3 py-2">
          <button
            onClick={createNew}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-text-tertiary hover:text-primary hover:bg-primary/5 transition-all border border-transparent hover:border-primary/10"
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
