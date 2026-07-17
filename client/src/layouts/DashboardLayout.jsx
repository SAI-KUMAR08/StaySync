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

      {/* ═══ ANIMATED BACKGROUND ═══ */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Large arch glow */}
        <svg className="absolute -top-40 -right-40 w-[600px] h-[600px] opacity-[0.025]" viewBox="0 0 600 600" fill="none">
          <path d="M500 600 C500 350, 350 80, 300 80 C250 80, 100 350, 100 600" stroke="#5C3D2E" strokeWidth="1.5" />
          <path d="M420 600 C420 400, 320 160, 300 160 C280 160, 180 400, 180 600" stroke="#5C3D2E" strokeWidth="1" />
        </svg>
        {/* Warm gradient orbs */}
        <div className="absolute -top-32 -left-32 w-[400px] h-[400px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #5C3D2E, transparent 70%)' }}
        />
        <div className="absolute bottom-1/4 right-[10%] w-[200px] h-[200px] rounded-full opacity-[0.015]"
          style={{ background: 'radial-gradient(circle, #B8860B, transparent 70%)' }}
        />
        {/* Geometric pattern */}
        <div className="absolute top-1/3 right-[8%] w-40 h-40 opacity-[0.02]"
          style={{
            backgroundImage: 'radial-gradient(circle, #5C3D2E 1px, transparent 1px)',
            backgroundSize: '12px 12px'
          }}
        />
        {/* Floating decorative rings */}
        <div className="absolute top-[15%] left-[60%] w-20 h-20 rounded-full border border-primary/10 animate-float" style={{ animationDuration: '7s' }} />
        <div className="absolute bottom-[20%] left-[5%] w-14 h-14 rounded-full border border-accent/10 animate-float" style={{ animationDuration: '9s', animationDelay: '2s' }} />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* ═══ DESKTOP SIDE RAIL — Luxury glass panel ═══ */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-full z-50 flex-col items-center py-6 px-3 gap-1 bg-white/70 backdrop-blur-2xl border-r border-white/20 shadow-[2px_0_40px_rgba(0,0,0,0.04)]">
        {/* Brand — arched logo plate with glow */}
        <div className="relative mb-8 group">
          <Link to={links[0]?.to || "/"} className="block">
            <div className="relative w-14 h-[66px] flex items-center justify-center">
              {/* Arch background */}
              <div className="absolute inset-0 bg-primary rounded-[8px] rounded-b-[20px] shadow-lg shadow-primary/30 group-hover:shadow-xl group-hover:shadow-primary/40 transition-shadow duration-500">
                {/* Gradient overlay */}
                <div className="absolute inset-0 rounded-[8px] rounded-b-[20px] bg-gradient-to-b from-white/10 to-transparent" />
              </div>
              {/* Inner arch highlight */}
              <div className="absolute top-[3px] left-[4px] right-[4px] h-[6px] bg-white/15 rounded-t-[5px]" />
              <MdHome className="text-xl text-white relative z-10 group-hover:scale-105 transition-transform duration-300" />
            </div>
          </Link>
          {/* Glow ring */}
          <div className="absolute -inset-3 rounded-full bg-primary/5 animate-glow-pulse pointer-events-none" />
        </div>

        {/* Decorative divider */}
        <div className="w-8 h-px bg-gradient-to-r from-transparent via-border to-transparent mb-4" />

        {/* Nav items */}
        <div className="flex-1 flex flex-col items-center gap-2">
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
                  className={`nav-item ${active ? 'active' : ''}`}
                >
                  <link.icon className={`text-xl transition-all duration-300 ${active ? "scale-110" : ""}`} />
                </Link>
                {active && <div className="nav-indicator" />}
                {/* Tooltip */}
                <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-4px] group-hover:translate-x-0">
                  <div className="bg-white text-text-primary text-[10px] font-bold font-body uppercase tracking-widest px-4 py-2.5 rounded-[14px] whitespace-nowrap shadow-xl border border-border/40 backdrop-blur-2xl">
                    {link.label}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="w-8 h-px bg-gradient-to-r from-transparent via-border to-transparent mb-3" />

        {/* Logout */}
        <div className="relative group">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="flex items-center justify-center w-11 h-11 rounded-[14px] text-text-tertiary hover:text-primary hover:bg-primary/10 transition-all duration-300"
          >
            <MdLogout className="text-lg" />
          </button>
          <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-4px] group-hover:translate-x-0">
            <div className="bg-white text-text-primary text-[10px] font-bold font-body uppercase tracking-widest px-4 py-2.5 rounded-[14px] whitespace-nowrap shadow-xl border border-border/40 backdrop-blur-2xl">
              Sign Out
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-white" />
            </div>
          </div>
        </div>
      </nav>

      {/* ═══ MOBILE BOTTOM NAV — Premium glass pill ═══ */}
      <nav className="lg:hidden fixed bottom-5 left-4 right-4 z-50 bg-white/85 backdrop-blur-2xl border border-white/30 px-3 py-2.5 shadow-2xl shadow-black/15 rounded-[20px]">
        <div className="flex items-center justify-around">
          {links.slice(0, 5).map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-[14px] transition-all duration-300 ${
                  active ? "text-white bg-primary shadow-md shadow-primary/25" : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                <link.icon size={19} />
                <span className="text-[6px] font-bold uppercase tracking-widest">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ═══ MOBILE SIDEBAR — Glass panel ═══ */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full w-72 bg-white/90 backdrop-blur-2xl z-50 transform transition-transform duration-300 ease-out shadow-2xl shadow-black/20 border-r border-white/30 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand section */}
        <div className="relative p-6 pb-5 overflow-hidden">
          <div className="absolute -top-16 -left-16 -right-16 h-40 bg-primary/5 rounded-[50%]" />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-[56px] flex items-center justify-center">
                <div className="absolute inset-0 bg-primary rounded-[7px] rounded-b-[18px] shadow-lg"></div>
                <div className="absolute top-[2px] left-[3px] right-[3px] h-[5px] bg-white/15 rounded-t-[4px]"></div>
                <MdHome className="text-lg text-white relative z-10" />
              </div>
              <div>
                <h1 className="text-lg font-bold font-display text-text-primary leading-none">
                  Sri Rama
                </h1>
                <p className="text-[7px] text-text-tertiary/60 uppercase tracking-[0.2em] font-semibold mt-0.5">
                  Hostel Management
                </p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-text-tertiary hover:text-text-primary rounded-[12px] hover:bg-black/[0.03] transition-all"
            >
              <MdClose size={18} />
            </button>
          </div>
        </div>

        {user?.role === "owner" && hostels?.length > 0 && (
          <div className="px-5 pt-2 pb-3 space-y-2.5 border-b border-border/40">
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
              className={`flex items-center gap-4 px-4 py-3 rounded-[14px] transition-all duration-300 ${
                location.pathname === link.to
                  ? "bg-primary text-white font-semibold shadow-md shadow-primary/25"
                  : "text-text-secondary/50 hover:text-text-primary hover:bg-black/[0.03]"
              }`}
            >
              <link.icon className="text-xl" />
              <span className="text-sm">{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border/40">
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
          className={`sticky top-0 z-20 transition-all duration-500 ${
            scrolled
              ? "bg-background/80 backdrop-blur-2xl border-b border-border/40 shadow-sm"
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
                <div className="relative w-10 h-[46px] flex items-center justify-center">
                  <div className="absolute inset-0 bg-primary/10 rounded-[6px] rounded-b-[14px]"></div>
                  <div className="absolute top-[2px] left-[2px] right-[2px] h-[4px] bg-primary/10 rounded-t-[4px]"></div>
                  {(() => {
                    const Icon = activeLink?.icon || MdDashboard;
                    return <Icon size={19} className="text-primary relative z-10" />;
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
                      className="px-4 py-2.5 rounded-[14px] border border-border bg-white/60 backdrop-blur-xl text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
                    >
                      {hostels.map((h) => (
                        <option key={h._id} value={h._id} className="bg-surface text-white">
                          {h.name || h.hostelName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-4 py-2 rounded-[14px] border border-border bg-white/60 backdrop-blur-xl text-xs font-medium text-text-primary flex items-center gap-1.5">
                      <span className="text-text-tertiary/60">Hostel:</span>
                      <span className="font-bold">{hostels?.[0]?.name || hostels?.[0]?.hostelName || "My Hostel"}</span>
                    </div>
                  )}
                  <button
                    onClick={createNewHostel}
                    className="p-2.5 rounded-[14px] border border-border bg-white/60 backdrop-blur-xl hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-all"
                  >
                    <MdAdd size={16} />
                  </button>
                </div>
              )}
              {/* User avatar with ring */}
              <div className="relative w-9 h-9 group cursor-pointer">
                <div className="absolute inset-0 rounded-[12px] bg-primary/20 animate-glow-pulse group-hover:opacity-0 transition-opacity" />
                <div className="relative w-full h-full rounded-[12px] bg-primary flex items-center justify-center text-white font-bold text-xs shadow-md shadow-primary/25">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
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
