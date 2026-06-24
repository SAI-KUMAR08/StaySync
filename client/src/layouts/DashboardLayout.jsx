import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  MdDashboard, MdGridView, MdPeople, MdReportProblem,
  MdPayment, MdNotifications, MdLogout, MdMenu, MdClose,
  MdLayers, MdAnnouncement, MdAdd, MdHome, MdAttachMoney
} from "react-icons/md";
import api from "../api/axios";
import toast from "react-hot-toast";

const NAV_ITEMS = {
  owner: [
    { to: "/admin/dashboard", icon: MdDashboard, label: "Overview" },
    { to: "/admin/inventory", icon: MdLayers, label: "Rooms & Beds" },
    { to: "/admin/tenants", icon: MdPeople, label: "Residents" },
    { to: "/admin/complaints", icon: MdReportProblem, label: "Support" },
    { to: "/admin/payments", icon: MdPayment, label: "Financials" },
    { to: "/admin/expenses", icon: MdAttachMoney, label: "Expenses" },
    { to: "/admin/notifications", icon: MdAnnouncement, label: "Notices" },
  ],
  manager: [
    { to: "/admin/dashboard", icon: MdDashboard, label: "Overview" },
    { to: "/admin/inventory", icon: MdLayers, label: "Rooms & Beds" },
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

const NavRailItem = ({ to, icon: Icon, label, active, onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <div className="relative">
      <Link
        to={to}
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`relative flex items-center justify-center w-11 h-11 rounded-2xl transition-all duration-300 group ${
          active
            ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105"
            : "text-zinc-500 hover:text-white hover:bg-white/[0.07]"
        }`}
      >
        <Icon className={`text-xl transition-all duration-300 ${active ? 'scale-110' : 'group-hover:scale-110 group-hover:text-white'}`} />
        {active && <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-accent shadow-[0_0_8px_rgba(244,63,94,0.6)]" />}
      </Link>
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="bg-zinc-900 text-white text-[10px] font-bold font-sans uppercase tracking-wider px-3 py-2 rounded-xl whitespace-nowrap shadow-xl">
            {label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-900" />
          </div>
        </div>
      )}
    </div>
  );
};

const DashboardLayout = () => {
  const { user, hostels, switchHostel, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setSidebarOpen(false);
    setShowUserMenu(false);
  }, [location]);

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
    const match = links.find(l => l.to.endsWith(path));
    return match?.label || path.charAt(0).toUpperCase() + path.slice(1);
  };

  const activeLink = links.find(l => location.pathname === l.to);

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-40 lg:hidden" />
      )}

      {/* 🚀 DESKTOP: Creative Floating Icon Rail */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-full z-50 flex-col items-center py-5 px-2.5 gap-1 bg-gradient-to-b from-zinc-900/95 to-zinc-950/95 backdrop-blur-2xl border-r border-white/[0.03]">
        {/* Brand pill with glow */}
        <Link to={links[0]?.to || "/"} className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-5 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-110 transition-all duration-300 group">
          <MdHome className="text-xl text-white group-hover:scale-110 transition-transform" />
        </Link>

        <div className="w-8 h-px bg-white/[0.06] mb-3"></div>

        <div className="flex-1 flex flex-col items-center gap-1.5">
          {links.map((link) => (
            <NavRailItem
              key={link.to}
              to={link.to}
              icon={link.icon}
              label={link.label}
              active={location.pathname === link.to}
            />
          ))}
        </div>

        <div className="w-8 h-px bg-white/[0.04] mb-2"></div>

        {/* Logout */}
        <div className="relative group">
          <button onClick={() => { logout(); navigate("/login"); }}
            className="flex items-center justify-center w-11 h-11 rounded-2xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
            <MdLogout className="text-lg" />
          </button>
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-zinc-900 text-white text-[10px] font-bold font-sans uppercase tracking-wider px-3 py-2 rounded-xl whitespace-nowrap shadow-xl">
              Sign Out
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-900" />
            </div>
          </div>
        </div>
      </nav>

      {/* 🚀 MOBILE: Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass-dark backdrop-blur-2xl border-t border-white/10 px-2 py-2">
        <div className="flex items-center justify-around">
          {links.slice(0, 5).map((link) => (
            <Link key={link.to} to={link.to}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all ${
                location.pathname === link.to ? 'text-primary' : 'text-white/40'
              }`}>
              <link.icon size={20} />
              <span className="text-[7px] font-bold uppercase tracking-wider">{link.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* 🚀 MOBILE: Slide-out sidebar (for hostel switching / full nav) */}
      <aside className={`lg:hidden fixed top-0 left-0 h-full w-72 bg-sidebar text-white z-50 transform transition-all duration-300 shadow-2xl ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="p-6 pb-4 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
              <MdHome className="text-lg text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black font-sans text-white leading-none"><span className="text-accent">Stay</span>Sync</h1>
              <p className="text-[8px] text-white/30 uppercase tracking-[0.15em] font-bold mt-0.5">Smart Hostel Management</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-2 text-white/30 hover:text-white rounded-xl hover:bg-white/5 transition-all">
            <MdClose size={18} />
          </button>
        </div>

        {user?.role === "owner" && hostels?.length > 0 && (
          <div className="px-5 pt-4 pb-2 space-y-2.5">
            <p className="text-[7px] text-white/30 font-bold uppercase tracking-[0.15em] ml-1">Active Hostel</p>
            {hostels.length > 1 ? (
              <select value={user?.hostelId || ""} onChange={(e) => switchHostel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-primary/50">
                {hostels.map((h) => <option key={h._id} value={h._id} className="text-gray-900 bg-white">{h.hostelName}</option>)}
              </select>
            ) : (
              <div className="px-4 py-2.5 rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-white/70">
                <span className="text-white font-bold">{hostels?.[0]?.hostelName || "My Hostel"}</span>
              </div>
            )}
            <button onClick={createNewHostel} className="w-full px-4 py-2.5 rounded-2xl border border-white/10 bg-white/8 text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-xs">
              <MdAdd size={14} /> New Hostel
            </button>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {links.map((link) => (
            <Link key={link.to} to={link.to}
              className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all ${
                location.pathname === link.to ? 'bg-primary/15 text-primary font-bold' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}>
              <link.icon className="text-xl" />
              <span className="text-sm">{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-white/5">
          <button onClick={() => { logout(); navigate("/login"); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-white/30 hover:text-rose-400 hover:bg-rose-500/10 rounded-2xl transition-all text-sm">
            <MdLogout className="text-lg" /> Sign Out
          </button>
        </div>
      </aside>

      {/* 📐 MAIN CONTENT */}
      <div className="lg:pl-[72px] pb-20 lg:pb-0 transition-all duration-300">
        {/* Glass Header */}
        <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-2xl border-b border-border/40">
          <div className="flex items-center justify-between px-4 md:px-8 lg:px-10 py-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl bg-white border border-border/60 text-text-secondary hover:bg-background transition-all shadow-sm">
                <MdMenu size={18} />
              </button>
              <div>
                <div className="flex items-center gap-2 text-text-secondary/50 text-[10px]">
                  <span className="font-medium uppercase tracking-wider">{user?.role === "owner" ? "Owner" : user?.role === "manager" ? "Manager" : "Resident"}</span>
                  <span className="w-1 h-1 bg-zinc-200 rounded-full" />
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent font-bold">{getPageTitle()}</span>
                </div>
                <h2 className="text-lg font-black font-sans text-text-primary tracking-tight">{getPageTitle()}</h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {user?.role === "owner" && hostels?.length > 0 && (
                <div className="hidden md:flex items-center gap-2">
                  {hostels.length > 1 ? (
                    <select value={user?.hostelId || ""} onChange={(e) => switchHostel(e.target.value)}
                      className="px-3.5 py-2 rounded-2xl border border-border/60 bg-white/80 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-xs">
                      {hostels.map((h) => <option key={h._id} value={h._id}>{h.hostelName}</option>)}
                    </select>
                  ) : (
                    <div className="px-3.5 py-2 rounded-2xl border border-border/60 bg-white/80 text-xs font-medium text-text-primary flex items-center gap-1.5">
                      <span className="text-text-secondary/60">Hostel:</span>
                      <span className="font-bold">{hostels?.[0]?.hostelName || "My Hostel"}</span>
                    </div>
                  )}
                  <button onClick={createNewHostel} className="p-2 rounded-xl border border-border/60 bg-white/80 text-text-secondary hover:bg-background transition-all text-xs">
                    <MdAdd size={16} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-bold text-text-primary leading-none mb-0.5">{user?.name}</p>
                  <p className="text-[8px] text-text-secondary font-medium uppercase tracking-wider">
                    {user?.role === "owner" ? "Owner" : user?.role === "manager" ? "Manager" : "Resident"}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm shadow-md shadow-primary/20">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 md:p-8 lg:p-10" key={location.pathname}>
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
