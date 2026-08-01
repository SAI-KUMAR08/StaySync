import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MdAdd,
  MdCheck,
  MdKeyboardArrowDown,
  MdSearch,
  MdApartment,
  MdClose,
  MdMoreVert,
  MdDelete,
  MdWarning,
} from "react-icons/md";
import api from "../api/axios";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

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
  const { refreshHostels } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);

  // Hostel options menu state (three dots)
  const [activeMenuHostelId, setActiveMenuHostelId] = useState(null);

  // Create hostel modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newHostelName, setNewHostelName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Delete confirmation modal state
  const [deletingHostel, setDeletingHostel] = useState(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
        setActiveMenuHostelId(null);
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

  const openCreateModal = () => {
    setNewHostelName("");
    setIsCreateModalOpen(true);
    setOpen(false);
  };

  const executeCreateHostel = async () => {
    if (!newHostelName.trim()) return;
    setIsCreating(true);
    try {
      const res = await api.post("/owner/hostels", { hostelName: newHostelName.trim() });
      toast.success("Hostel created successfully");
      setIsCreateModalOpen(false);
      setNewHostelName("");
      setOpen(false);
      if (refreshHostels) await refreshHostels();
      await onSwitch(res.data.data._id);
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to create hostel");
    } finally {
      setIsCreating(false);
    }
  };

  const selectHostel = useCallback(
    (id) => {
      onSwitch(id);
      setOpen(false);
      setSearch("");
      setFocusIdx(-1);
      setActiveMenuHostelId(null);
    },
    [onSwitch]
  );

  const handleDeleteClick = (e, hostel) => {
    e.stopPropagation();
    setActiveMenuHostelId(null);
    if (hostels.length <= 1) {
      toast.error("Cannot delete hostel. You must have at least one active hostel.");
      return;
    }
    setDeletingHostel({
      _id: hostel._id,
      name: hostel.name || hostel.hostelName || "Hostel",
    });
    setConfirmInput("");
  };

  const executeDeleteHostel = async () => {
    if (!deletingHostel) return;
    const expected = `delete hostel ${deletingHostel.name}`;
    if (confirmInput.trim() !== expected) return;

    setIsDeleting(true);
    try {
      const res = await api.delete(`/owner/hostels/${deletingHostel._id}`);
      toast.success(`Hostel '${deletingHostel.name}' deleted successfully`);
      const targetId = deletingHostel._id;
      setDeletingHostel(null);
      setConfirmInput("");
      setOpen(false);

      const updatedHostels = refreshHostels ? await refreshHostels() : [];
      if (targetId === activeHostelId) {
        const nextId = res.data.data?.nextHostelId || (updatedHostels && updatedHostels[0]?._id);
        if (nextId) {
          await onSwitch(nextId);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete hostel");
    } finally {
      setIsDeleting(false);
    }
  };

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
          setActiveMenuHostelId(null);
          break;
      }
    },
    [open, filtered, focusIdx, selectHostel]
  );

  const renderCreateModal = () => {
    if (!isCreateModalOpen) return null;
    const isValid = Boolean(newHostelName.trim());

    return (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in text-left"
        onClick={() => {
          if (!isCreating) {
            setIsCreateModalOpen(false);
            setNewHostelName("");
          }
        }}
      >
        <div
          className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-border/80 origin-center animate-scale-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <MdApartment size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Create New Hostel</h3>
              <p className="text-xs text-text-tertiary mt-0.5">
                Set up a new hostel property to manage
              </p>
            </div>
          </div>

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isValid && !isCreating) executeCreateHostel();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label className="block text-xs text-text-secondary font-medium">
                Hostel Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={newHostelName}
                onChange={(e) => setNewHostelName(e.target.value)}
                placeholder="e.g. Sri Rama Mens PG 2"
                autoFocus
                className="w-full px-3.5 py-2.5 text-xs border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-text-primary placeholder:text-text-tertiary/40"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isCreating}
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setNewHostelName("");
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:bg-black/5 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValid || isCreating}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 active:scale-[0.98] transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-1.5"
              >
                {isCreating ? "Creating..." : "Create Hostel"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderDeleteModal = () => {
    if (!deletingHostel) return null;
    const expectedString = `delete hostel ${deletingHostel.name}`;
    const isValid = confirmInput.trim() === expectedString;

    return (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in text-left"
        onClick={() => {
          if (!isDeleting) {
            setDeletingHostel(null);
            setConfirmInput("");
          }
        }}
      >
        <div
          className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-border/80 origin-center animate-scale-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-danger/10 text-danger flex items-center justify-center shrink-0">
              <MdWarning size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Delete Hostel</h3>
              <p className="text-xs text-text-tertiary mt-0.5">This action requires confirmation</p>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="p-3.5 bg-danger/5 border border-danger/20 rounded-xl text-xs text-danger leading-relaxed mb-4">
            Are you sure you want to delete <strong>{deletingHostel.name}</strong>? This action{" "}
            <strong>cannot be undone</strong>.
          </div>

          {/* Prompt */}
          <div className="space-y-2 mb-6">
            <label className="block text-xs text-text-secondary font-medium leading-relaxed">
              To confirm, type{" "}
              <strong className="font-mono select-all text-text-primary bg-black/5 px-1.5 py-0.5 rounded">
                {expectedString}
              </strong>{" "}
              in the box below:
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={expectedString}
              autoFocus
              className="w-full px-3.5 py-2.5 text-xs border border-border rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-danger/20 focus:border-danger transition-all text-text-primary placeholder:text-text-tertiary/40"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setDeletingHostel(null);
                setConfirmInput("");
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:bg-black/5 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!isValid || isDeleting}
              onClick={executeDeleteHostel}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-danger text-white hover:bg-danger/90 active:scale-[0.98] transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-1.5"
            >
              {isDeleting ? "Deleting..." : "Delete this hostel"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Single hostel — compact pill ──
  if (hostels.length <= 1) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white border border-border/60 shadow-sm hover:shadow-md hover:cursor-pointer transition-all"
          aria-label="Hostel options"
        >
          <HostelAvatar name={active?.name || active?.hostelName} size="sm" />
          <span className="text-sm font-semibold text-text-primary">
            {active?.name || active?.hostelName || "My Hostel"}
          </span>
          <MdKeyboardArrowDown
            size={16}
            className={`text-text-tertiary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-border/80 rounded-2xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-text-primary">
                  {active?.name || active?.hostelName}
                </p>
                <p className="text-[10px] text-text-tertiary mt-0.5">Active Hostel</p>
              </div>

              {/* Options button */}
              {active && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuHostelId((prev) => (prev === active._id ? null : active._id));
                    }}
                    className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
                    title="Hostel options"
                  >
                    <MdMoreVert size={16} />
                  </button>
                  {activeMenuHostelId === active._id && (
                    <div
                      className="absolute right-0 top-7 w-36 bg-white border border-border/80 rounded-xl shadow-lg z-50 py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(e, active)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-danger font-medium hover:bg-danger/5 transition-colors"
                      >
                        <MdDelete size={14} />
                        Delete Hostel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-3 py-2">
              <button
                onClick={openCreateModal}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-text-tertiary hover:text-primary hover:bg-primary/5 transition-all border border-transparent hover:border-primary/10"
              >
                <MdAdd size={14} /> New Hostel
              </button>
            </div>
          </div>
        )}
        {renderCreateModal()}
        {renderDeleteModal()}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {/* ═══ Trigger ═══ */}
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (open) {
            setSearch("");
            setFocusIdx(-1);
            setActiveMenuHostelId(null);
          }
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

      {/* ═══ Dropdown ═══ */}
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFocusIdx(-1);
                }}
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
                <p className="text-[10px] text-text-tertiary/40 mt-0.5">
                  Try a different search term
                </p>
              </div>
            ) : (
              filtered.map((h, i) => {
                const isActive = h._id === activeHostelId;
                const isFocused = i === focusIdx;
                const isMenuOpen = activeMenuHostelId === h._id;
                return (
                  <div key={h._id} className="relative">
                    <button
                      ref={(el) => {
                        if (isFocused && el) el.scrollIntoView({ block: "nearest" });
                      }}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => selectHostel(h._id)}
                      onMouseEnter={() => setFocusIdx(i)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-all relative pr-10 ${
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
                        className={
                          isActive ? "ring-2 ring-primary/20 ring-offset-1 ring-offset-white" : ""
                        }
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
                      </div>

                      {/* Active checkmark */}
                      {isActive && (
                        <div className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                          <MdCheck className="text-primary" size={14} />
                        </div>
                      )}
                    </button>

                    {/* Three Dots Action Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuHostelId((prev) => (prev === h._id ? null : h._id));
                      }}
                      className="absolute right-3 top-3.5 p-1 rounded-lg text-text-tertiary/60 hover:text-text-primary hover:bg-black/5 transition-colors z-10"
                      title="Hostel options"
                    >
                      <MdMoreVert size={16} />
                    </button>

                    {/* Popover options menu */}
                    {isMenuOpen && (
                      <div
                        className="absolute right-3 top-10 w-36 bg-white border border-border/80 rounded-xl shadow-lg z-50 py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => handleDeleteClick(e, h)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-danger font-medium hover:bg-danger/5 transition-colors"
                        >
                          <MdDelete size={14} />
                          Delete Hostel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* ── New Hostel ── */}
          <div className="border-t border-border/40 px-3 py-2">
            <button
              onClick={openCreateModal}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-text-tertiary hover:text-primary hover:bg-primary/5 transition-all border border-transparent hover:border-primary/10"
            >
              <MdAdd size={14} /> New Hostel
            </button>
          </div>
        </div>
      )}

      {renderCreateModal()}
      {renderDeleteModal()}
    </div>
  );
};

export default HostelSwitcher;
