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

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* ═══ DESKTOP SIDE RAIL ═══ */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-full z-50 flex-col items-center py-5 px-3 gap-1 bg-surface/90 backdrop-blur-xl border-r border-border">
        {/* Brand */}
        <Link
          to={links[0]?.to || "/"}
          className="w-11 h-11 rounded-[14px] bg-primary flex items-center justify-center mb-6 shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-105 transition-all duration-300"
        >
          <MdHome className="text-xl text-white" />
        </Link>

        <div className="w-8 h-px bg-border mb-3" />

        {/* Nav items */}
        <div className="flex-1 flex flex-col items-center gap-1.5">
          {links.map((link) => {
            const active = location.pathname === link.to;
            return (
              <div key={link.to} className="relative group">
                <Link
                  to={link.to}
                  className={`flex items-center justify-center w-11 h-11 rounded-[14px] transition-all duration-300 ${
                    active
                      ? "bg-primary text-white"
                      : "text-text-tertiary hover:text-text-primary hover:bg-white/[0.04]"
                  }`}
                >
                  <link.icon className={`text-xl transition-all duration-300 ${active ? "scale-110" : ""}`} />
                </Link>
                {active && (
                  <div className="absolute -left-[14px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-primary shadow-[0_0_6px_rgba(92,61,46,0.3)]" />
                )}
                {/* Tooltip */}
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="bg-surface text-text-primary text-[10px] font-bold font-sans uppercase tracking-wider px-3 py-2 rounded-[14px] whitespace-nowrap shadow-xl border border-border">
                    {link.label}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-surface" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="w-8 h-px bg-border mb-2" />

        {/* Logout */}
        <div className="relative group">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="flex items-center justify-center w-11 h-11 rounded-[14px] text-text-tertiary hover:text-accent hover:bg-accent/10 transition-all"
          >
            <MdLogout className="text-lg" />
          </button>
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="bg-surface text-text-primary text-[10px] font-bold font-sans uppercase tracking-wider px-3 py-2 rounded-[14px] whitespace-nowrap shadow-xl border border-border">
              Sign Out
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-surface" />
            </div>
          </div>
        </div>
      </nav>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="lg:hidden fixed bottom-4 left-4 right-4 z-50 bg-white/85 backdrop-blur-xl border border-black/5 px-2 py-2 shadow-2xl shadow-black/30">
        <div className="flex items-center justify-around">
          {links.slice(0, 5).map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-[14px] transition-all ${
                  active ? "text-primary bg-primary/10" : "text-text-tertiary"
                }`}
              >
                <link.icon size={20} />
                <span className="text-[6px] font-bold uppercase tracking-wider">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ═══ MOBILE SIDEBAR ═══ */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full w-72 bg-surface/95 backdrop-blur-xl z-50 transform transition-all duration-300 ease-out shadow-2xl shadow-black/40 border-r border-border ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-6 pb-4 border-b border-border flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[14px] bg-primary flex items-center justify-center shadow-lg">
              <MdHome className="text-lg text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black font-sans text-white leading-none">
                Sri Rama
              </h1>
              <p className="text-[8px] text-text-secondary/50 uppercase tracking-[0.15em] font-bold mt-0.5">
                Hostel Management
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 text-text-tertiary hover:text-white rounded-xl hover:bg-white/5 transition-all"
          >
            <MdClose size={18} />
          </button>
        </div>

        {user?.role === "owner" && hostels?.length > 0 && (
          <div className="px-5 pt-4 pb-2 space-y-2.5">
            <p className="text-[7px] text-text-secondary/50 font-bold uppercase tracking-[0.15em] ml-1">
              Active Hostel
            </p>
            {hostels.length > 1 ? (
              <select
                value={user?.hostelId || ""}
                onChange={(e) => switchHostel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-white/5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {hostels.map((h) => (
                  <option key={h._id} value={h._id} className="bg-surface text-white">
                    {h.hostelName}
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-4 py-2.5 rounded-xl border border-border bg-white/5 text-sm font-medium text-white/60">
                <span className="text-white font-bold">{hostels?.[0]?.hostelName || "My Hostel"}</span>
              </div>
            )}
            <button
              onClick={createNewHostel}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-white/[0.03] text-sm font-medium text-text-secondary/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-xs"
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
                  ? "bg-primary/10 text-primary font-bold"
                  : "text-text-secondary/50 hover:text-white hover:bg-white/5"
              }`}
            >
              <link.icon className="text-xl" />
              <span className="text-sm">{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-text-secondary/50 hover:text-accent hover:bg-accent/5 rounded-xl transition-all text-sm"
          >
            <MdLogout className="text-lg" /> Sign Out
          </button>
        </div>
      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="lg:pl-[68px] pb-28 lg:pb-0 transition-all duration-300 relative z-10">

        {/* Page header */}
        <header
          className={`sticky top-0 z-20 transition-all duration-300 ${
            scrolled
              ? "bg-background/80 backdrop-blur-xl border-b border-border"
              : "bg-transparent"
          }`}
        >
          <div className="flex items-center justify-between px-4 md:px-8 lg:px-10 py-4 max-w-[1440px] mx-auto">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary transition-all"
              >
                <MdMenu size={18} />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-light text-primary flex items-center justify-center">
                  {(() => {
                    const Icon = activeLink?.icon || MdDashboard;
                    return <Icon size={18} />;
                  })()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-text-secondary/50">
                    <span className="font-medium uppercase tracking-wider">
                      {user?.role === "owner" ? "Owner" : user?.role === "manager" ? "Manager" : "Resident"}
                    </span>
                    <MdChevronRight size={10} />
                    <span className="font-bold text-text-secondary">{getPageTitle()}</span>
                  </div>
                  <h2 className="text-xl font-black font-sans text-text-primary tracking-tight leading-tight">
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
                      className="px-3 py-2 rounded-xl border border-border bg-surface/80 text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {hostels.map((h) => (
                        <option key={h._id} value={h._id} className="bg-surface text-white">
                          {h.hostelName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-3 py-2 rounded-xl border border-border bg-surface/80 text-xs font-medium text-text-primary flex items-center gap-1.5">
                      <span className="text-text-secondary/60">Hostel:</span>
                      <span className="font-bold">{hostels?.[0]?.hostelName || "My Hostel"}</span>
                    </div>
                  )}
                  <button
                    onClick={createNewHostel}
                    className="p-2 rounded-xl border border-border bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-all"
                  >
                    <MdAdd size={16} />
                  </button>
                </div>
              )}
              {/* User avatar */}
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-xs shadow-md">
                {user?.name?.[0]?.toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="px-4 md:px-8 lg:px-10 py-6 max-w-[1440px] mx-auto">
          <div className="animate-tilt-in">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
