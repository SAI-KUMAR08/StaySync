import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  MdDashboard, MdPeople, MdReportProblem,
  MdPayment, MdNotifications, MdLogout, MdMenu, MdClose,
  MdLayers, MdAnnouncement, MdAdd, MdHome, MdAttachMoney,
  MdChevronRight, MdMoreVert, MdFingerprint
} from "react-icons/md";
import api from "../api/axios";
import toast from "react-hot-toast";

// ── Route prefetching — preload JS chunks on hover ──
const ROUTE_PREFETCH = {
  "/admin/dashboard": () => import("../pages/AdminDashboard"),
  "/admin/inventory": () => import("../pages/RoomManagement"),
  "/admin/tenants": () => import("../pages/TenantManagement"),
  "/admin/complaints": () => import("../pages/Complaints"),
  "/admin/payments": () => import("../pages/Payments"),
  "/admin/expenses": () => import("../pages/Expenses"),
  "/admin/notifications": () => import("../pages/Notifications"),
  "/tenant/dashboard": () => import("../pages/TenantDashboard"),
  "/tenant/complaints": () => import("../pages/Complaints"),
  "/tenant/payments": () => import("../pages/Payments"),
  "/tenant/notifications": () => import("../pages/Notifications"),
};

const ROUTE_DATA_PREFETCH = {
  "/admin/dashboard": ["/owner/dashboard"],
  "/admin/tenants": ["/owner/tenants"],
  "/admin/inventory": ["/owner/structure"],
  "/admin/complaints": ["/owner/complaints"],
  "/admin/payments": ["/owner/payments"],
  "/admin/expenses": ["/owner/expenses/summary"],
  "/tenant/dashboard": ["/tenant/notifications?limit=5"],
  "/tenant/complaints": ["/tenant/complaints"],
  "/tenant/payments": ["/tenant/payments"],
};

const NAV_ITEMS = {
  owner: [
    { to: "/admin/dashboard", icon: MdDashboard, label: "Overview" },
    { to: "/admin/inventory", icon: MdLayers, label: "Inventory" },
    { to: "/admin/tenants", icon: MdPeople, label: "Residents" },
    { to: "/admin/complaints", icon: MdReportProblem, label: "Support" },
    { to: "/admin/payments", icon: MdPayment, label: "Payments" },
    { to: "/admin/expenses", icon: MdAttachMoney, label: "Expenses" },
    { to: "/admin/notifications", icon: MdAnnouncement, label: "Notices" },
  ],
  manager: [
    { to: "/admin/dashboard", icon: MdDashboard, label: "Overview" },
    { to: "/admin/inventory", icon: MdLayers, label: "Inventory" },
    { to: "/admin/tenants", icon: MdPeople, label: "Residents" },
    { to: "/admin/complaints", icon: MdReportProblem, label: "Support" },
    { to: "/admin/notifications", icon: MdAnnouncement, label: "Notices" },
  ],
  tenant: [
    { to: "/tenant/dashboard", icon: MdDashboard, label: "My Space" },
    { to: "/tenant/complaints", icon: MdReportProblem, label: "Support" },
    { to: "/tenant/payments", icon: MdPayment, label: "Payments" },
    { to: "/tenant/notifications", icon: MdAnnouncement, label: "Notices" },
  ],
};

const DashboardLayout = () => {
  const { user, hostels, switchHostel, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setSidebarOpen(false);
    setShowUserMenu(false);
  }, [location]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const createNewHostel = async () => {
    const name = window.prompt("New hostel name");
    if (!name?.trim()) return;
    try {
      const created = await api.post("/owner/hostels", { hostelName: name.trim() });
      toast.success("Hostel created");
      await switchHostel(created.data.data._id);
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to create hostel");
    }
  };

  const roleKey = user?.role === "owner" ? "owner" : user?.role === "manager" ? "manager" : "tenant";
  const links = NAV_ITEMS[roleKey] || [];

  const getPageTitle = () => {
    const path = location.pathname.split("/").pop();
    const match = links.find((l) => l.to.endsWith(path));
    return match?.label || path.charAt(0).toUpperCase() + path.slice(1);
  };

  const activeLink = links.find((l) => location.pathname === l.to);

  return (
    <div className="min-h-screen bg-background relative">

      {/* Decorative background elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #5C3D2E, transparent 70%)' }}
        />
        <div className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #5C3D2E, transparent 70%)' }}
        />
        {/* Ornamental arch silhouette — top right */}
        <svg className="absolute -top-20 -right-20 w-96 h-96 opacity-[0.02]" viewBox="0 0 400 400" fill="none">
          <path d="M350 400 C350 200, 250 50, 200 50 C150 50, 50 200, 50 400" stroke="#5C3D2E" strokeWidth="2" />
          <path d="M300 400 C300 240, 220 120, 200 120 C180 120, 100 240, 100 400" stroke="#5C3D2E" strokeWidth="1.5" />
        </svg>
        {/* Jaali-inspired pattern dots */}
        <div className="absolute top-1/4 right-[15%] w-24 h-24 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle, #5C3D2E 1px, transparent 1px)',
            backgroundSize: '8px 8px'
          }}
        />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* ═══ DESKTOP SIDE RAIL — Arched brand motif ═══ */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-full z-50 flex-col items-center py-6 px-3 gap-1 bg-surface/80 backdrop-blur-xl border-r border-border">
        {/* Brand — arched brand plate */}
        <Link
          to={links[0]?.to || "/"}
          className="relative w-12 h-14 flex items-center justify-center mb-7"
        >
          {/* Arch-shaped brand background */}
          <div className="absolute inset-0 bg-primary rounded-[10px] rounded-b-[18px] shadow-lg shadow-primary/25"></div>
          {/* Inner arch highlight */}
          <div className="absolute top-1 left-[3px] right-[3px] h-[6px] bg-white/10 rounded-t-[8px]"></div>
          <MdHome className="text-xl text-white relative z-10" />
        </Link>

        <div className="w-6 h-px bg-gradient-to-r from-transparent via-border to-transparent mb-4" />

        {/* Nav items */}
        <div className="flex-1 flex flex-col items-center gap-1.5">
          {links.map((link) => {
            const active = location.pathname === link.to;
            return (
              <div key={link.to} className="relative group">
                <Link
                  to={link.to}
                  onMouseEnter={() => {
                    ROUTE_PREFETCH[link.to]?.();
                    ROUTE_DATA_PREFETCH[link.to]?.forEach(url => {
                      api.get(url).catch(() => {});
                    });
                  }}
                  className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-300 ${
                    active
                      ? "bg-primary text-white shadow-md shadow-primary/25"
                      : "text-text-tertiary hover:text-text-primary hover:bg-black/[0.03]"
                  }`}
                >
                  <link.icon className={`text-xl transition-all duration-300 ${active ? "scale-110" : ""}`} />
                </Link>
                {active && (
                  <div className="absolute -left-[14px] top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-primary shadow-[0_0_8px_rgba(92,61,46,0.3)]" />
                )}
                {/* Tooltip */}
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="bg-surface text-text-primary text-[10px] font-bold font-body uppercase tracking-wider px-4 py-2.5 rounded-[14px] whitespace-nowrap shadow-xl border border-border/60">
                    {link.label}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-surface" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="w-6 h-px bg-gradient-to-r from-transparent via-border to-transparent mb-3" />

        {/* Logout */}
        <div className="relative group">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="flex items-center justify-center w-11 h-11 rounded-xl text-text-tertiary hover:text-primary hover:bg-primary/10 transition-all"
          >
            <MdLogout className="text-lg" />
          </button>
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="bg-surface text-text-primary text-[10px] font-bold font-body uppercase tracking-wider px-4 py-2.5 rounded-[14px] whitespace-nowrap shadow-xl border border-border/60">
              Sign Out
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-surface" />
            </div>
          </div>
        </div>
      </nav>

      {/* ═══ MOBILE BOTTOM NAV — glass pill ═══ */}
      <nav className="lg:hidden fixed bottom-5 left-4 right-4 z-50 bg-white/90 backdrop-blur-2xl border border-white/20 px-3 py-2.5 shadow-2xl shadow-black/20 rounded-[20px]">
        <div className="flex items-center justify-around">
          {links.slice(0, 5).map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-[14px] transition-all ${
                  active ? "text-white bg-primary shadow-md shadow-primary/20" : "text-text-tertiary"
                }`}
              >
                <link.icon size={19} />
                <span className="text-[6px] font-bold uppercase tracking-widest">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ═══ MOBILE SIDEBAR — arched header ═══ */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full w-72 bg-surface/95 backdrop-blur-2xl z-50 transform transition-transform duration-300 ease-out shadow-2xl shadow-black/30 border-r border-border ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand header with arch motif */}
        <div className="relative p-6 pb-5 overflow-hidden">
          {/* Decorative arch at top */}
          <div className="absolute -top-12 -left-12 -right-12 h-32 bg-primary/5 rounded-[50%]"></div>
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-14 flex items-center justify-center">
                <div className="absolute inset-0 bg-primary rounded-[8px] rounded-b-[16px] shadow-lg"></div>
                <div className="absolute top-1 left-[3px] right-[3px] h-[5px] bg-white/10 rounded-t-[6px]"></div>
                <MdHome className="text-lg text-white relative z-10" />
              </div>
              <div>
                <h1 className="text-lg font-bold font-display text-text-primary leading-none">
                  Sri Rama
                </h1>
                <p className="text-[7px] text-text-secondary/50 uppercase tracking-[0.2em] font-semibold mt-0.5">
                  Hostel Management
                </p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-text-tertiary hover:text-text-primary rounded-xl hover:bg-black/[0.03] transition-all"
            >
              <MdClose size={18} />
            </button>
          </div>
        </div>

        {user?.role === "owner" && hostels?.length > 0 && (
          <div className="px-5 pt-2 pb-3 space-y-2.5 border-b border-border/50">
            <p className="text-[6px] text-text-tertiary/60 font-bold uppercase tracking-[0.15em] ml-1">
              Active Hostel
            </p>
            {hostels.length > 1 ? (
              <select
                value={user?.hostelId || ""}
                onChange={(e) => switchHostel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-[14px] border border-border bg-black/[0.02] text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {hostels.map((h) => (
                  <option key={h._id} value={h._id} className="bg-surface text-text-primary">
                    {h.name || h.hostelName}
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-4 py-2.5 rounded-[14px] border border-border bg-black/[0.02] text-sm font-medium text-text-secondary">
                <span className="text-text-primary font-bold">{hostels?.[0]?.name || hostels?.[0]?.hostelName || "My Hostel"}</span>
              </div>
            )}
            <button
              onClick={createNewHostel}
              className="w-full px-4 py-2.5 rounded-[14px] border border-border bg-black/[0.02] text-sm font-medium text-text-secondary/60 hover:text-text-primary hover:bg-black/[0.04] transition-all flex items-center justify-center gap-2 text-xs"
            >
              <MdAdd size={14} /> New Hostel
            </button>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`flex items-center gap-4 px-4 py-3 rounded-[14px] transition-all ${
                location.pathname === link.to
                  ? "bg-primary text-white font-semibold shadow-md shadow-primary/20"
                  : "text-text-secondary/50 hover:text-text-primary hover:bg-black/[0.03]"
              }`}
            >
              <link.icon className="text-xl" />
              <span className="text-sm">{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border/50">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-text-secondary/50 hover:text-primary hover:bg-primary/5 rounded-[14px] transition-all text-sm"
          >
            <MdLogout className="text-lg" /> Sign Out
          </button>
        </div>
      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="lg:pl-[68px] pb-28 lg:pb-0 transition-[padding] duration-300 relative z-10">

        {/* Page header */}
        <header
          className={`sticky top-0 z-20 transition-all duration-300 ${
            scrolled
              ? "bg-background/80 backdrop-blur-2xl border-b border-border/60"
              : "bg-transparent"
          }`}
        >
          <div className="flex items-center justify-between px-4 md:px-8 lg:px-10 py-4 max-w-[1440px] mx-auto">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2.5 rounded-[14px] bg-surface border border-border text-text-secondary hover:text-text-primary transition-all"
              >
                <MdMenu size={18} />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[14px] bg-primary/10 text-primary flex items-center justify-center">
                  {(() => {
                    const Icon = activeLink?.icon || MdDashboard;
                    return <Icon size={19} />;
                  })()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary/60">
                    <span className="font-medium uppercase tracking-wider">
                      {user?.role === "owner" ? "Owner" : user?.role === "manager" ? "Manager" : "Resident"}
                    </span>
                    <MdChevronRight size={10} />
                    <span className="font-semibold text-text-secondary">{getPageTitle()}</span>
                  </div>
                  <h2 className="text-xl font-bold font-display text-text-primary tracking-tight leading-tight">
                    {getPageTitle()}
                  </h2>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {user?.role === "owner" && hostels?.length > 0 && (
                <div className="hidden md:flex items-center gap-2">
                  {hostels.length > 1 ? (
                    <select
                      value={user?.hostelId || ""}
                      onChange={(e) => switchHostel(e.target.value)}
                      className="px-4 py-2.5 rounded-[14px] border border-border bg-surface/80 text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
                    >
                      {hostels.map((h) => (
                        <option key={h._id} value={h._id} className="bg-surface text-white">
                          {h.name || h.hostelName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-4 py-2 rounded-[14px] border border-border bg-surface/80 text-xs font-medium text-text-primary flex items-center gap-1.5">
                      <span className="text-text-tertiary/60">Hostel:</span>
                      <span className="font-bold">{hostels?.[0]?.name || hostels?.[0]?.hostelName || "My Hostel"}</span>
                    </div>
                  )}
                  <button
                    onClick={createNewHostel}
                    className="p-2.5 rounded-[14px] border border-border bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-all"
                  >
                    <MdAdd size={16} />
                  </button>
                </div>
              )}
              {/* User avatar */}
              <div className="relative w-9 h-9 rounded-[12px] bg-primary flex items-center justify-center text-white font-bold text-xs shadow-md shadow-primary/20">
                {user?.name?.[0]?.toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="px-4 md:px-8 lg:px-10 py-6 max-w-[1440px] mx-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
