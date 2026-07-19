import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  MdDashboard, MdPeople, MdReportProblem,
  MdPayment, MdNotifications, MdLogout, MdMenu, MdClose,
  MdLayers, MdAnnouncement, MdHome, MdAttachMoney, MdRestaurant,
  MdChevronRight, MdSearch, MdMoreVert,
} from "react-icons/md";
import HostelSwitcher from "../components/HostelSwitcher";

const ROUTE_PREFETCH = {
  "/admin/dashboard": () => import("../pages/AdminDashboard"),
  "/admin/inventory": () => import("../pages/RoomManagement"),
  "/admin/tenants": () => import("../pages/TenantManagement"),
  "/admin/complaints": () => import("../pages/Complaints"),
  "/admin/payments": () => import("../pages/Payments"),
  "/admin/expenses": () => import("../pages/Expenses"),
  "/admin/meal-timings": () => import("../pages/MealTimings"),
  "/admin/notifications": () => import("../pages/Notifications"),
  "/tenant/dashboard": () => import("../pages/TenantDashboard"),
  "/tenant/complaints": () => import("../pages/Complaints"),
  "/tenant/payments": () => import("../pages/Payments"),
  "/tenant/meal-timings": () => import("../pages/MealTimings"),
  "/tenant/notifications": () => import("../pages/Notifications"),
};

const NAV_GROUPS = {
  owner: [
    { group: "Overview", items: [
      { to: "/admin/dashboard", icon: MdDashboard, label: "Dashboard" },
    ]},
    { group: "Management", items: [
      { to: "/admin/inventory", icon: MdLayers, label: "Inventory" },
      { to: "/admin/tenants", icon: MdPeople, label: "Residents" },
      { to: "/admin/complaints", icon: MdReportProblem, label: "Support" },
    ]},
    { group: "Finance", items: [
      { to: "/admin/payments", icon: MdPayment, label: "Payments" },
      { to: "/admin/expenses", icon: MdAttachMoney, label: "Expenses" },
    ]},
    { group: "Settings", items: [
      { to: "/admin/meal-timings", icon: MdRestaurant, label: "Meals" },
      { to: "/admin/notifications", icon: MdAnnouncement, label: "Notices" },
    ]},
  ],
  manager: [
    { group: "Overview", items: [
      { to: "/admin/dashboard", icon: MdDashboard, label: "Dashboard" },
    ]},
    { group: "Management", items: [
      { to: "/admin/inventory", icon: MdLayers, label: "Inventory" },
      { to: "/admin/tenants", icon: MdPeople, label: "Residents" },
      { to: "/admin/complaints", icon: MdReportProblem, label: "Support" },
    ]},
    { group: "Settings", items: [
      { to: "/admin/notifications", icon: MdAnnouncement, label: "Notices" },
    ]},
  ],
  tenant: [
    { group: "Overview", items: [
      { to: "/tenant/dashboard", icon: MdDashboard, label: "My Space" },
    ]},
    { group: "Support", items: [
      { to: "/tenant/complaints", icon: MdReportProblem, label: "Support" },
      { to: "/tenant/payments", icon: MdPayment, label: "Payments" },
    ]},
    { group: "Settings", items: [
      { to: "/tenant/meal-timings", icon: MdRestaurant, label: "Meals" },
      { to: "/tenant/notifications", icon: MdAnnouncement, label: "Notices" },
    ]},
  ],
};

const DashboardLayout = () => {
  const { user, hostels, switchHostel, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setSidebarOpen(false); }, [location]);

  const roleKey = user?.role === "owner" ? "owner" : user?.role === "manager" ? "manager" : "tenant";
  const navGroups = NAV_GROUPS[roleKey] || [];

  const getPageLabel = () => {
    for (const g of navGroups) {
      for (const item of g.items) {
        if (location.pathname === item.to) return item.label;
      }
    }
    return "Dashboard";
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-screen bg-background">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/30 z-40 lg:hidden" />
      )}

      {/* ═══ SIDEBAR ═══ */}
      <aside className={`
        fixed top-0 left-0 h-full z-50
        bg-white border-r border-border
        flex flex-col
        transition-all duration-300 ease-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0 lg:w-60
      `}>
        {/* Brand */}
        <div className="px-5 h-14 flex items-center gap-3 border-b border-border flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <MdHome className="text-white" size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary leading-tight">Sri Rama</p>
            <p className="text-[9px] text-text-tertiary font-medium uppercase tracking-wider">Hostel Manager</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-text-tertiary hover:text-text-primary">
            <MdClose size={18} />
          </button>
        </div>

        {/* Hostel Switcher */}
        {user?.role === "owner" && hostels?.length > 0 && (
          <div className="px-3 pt-3 pb-2 border-b border-border flex-shrink-0">
            <HostelSwitcher hostels={hostels} activeHostelId={user?.hostelId} onSwitch={switchHostel} />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map((group) => (
            <div key={group.group}>
              <p className="px-3 mb-1.5 text-[9px] font-semibold text-text-tertiary uppercase tracking-widest">
                {group.group}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onMouseEnter={() => ROUTE_PREFETCH[item.to]?.()}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative group ${
                        active
                          ? "bg-primary-light text-primary font-semibold"
                          : "text-text-secondary hover:text-text-primary hover:bg-neutral-50"
                      }`}
                    >
                      <item.icon size={18} className={active ? "text-primary" : "text-text-tertiary"} />
                      <span>{item.label}</span>
                      {active && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-tertiary hover:text-danger hover:bg-danger-bg transition-all w-full"
          >
            <MdLogout size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="lg:ml-60 min-h-screen flex flex-col">

        {/* ═══ TOP NAVBAR ═══ */}
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-lg border-b border-border">
          <div className="flex items-center justify-between px-4 lg:px-6 h-14 max-w-[1440px] mx-auto w-full">

            {/* Left */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-neutral-100 transition-all"
              >
                <MdMenu size={20} />
              </button>
              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                <span className="font-medium">{user?.role === "owner" ? "Owner" : user?.role === "manager" ? "Manager" : "Resident"}</span>
                <MdChevronRight size={12} />
                <span className="font-semibold text-text-secondary">{getPageLabel()}</span>
              </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-2">
              {user?.role === "owner" && hostels?.length > 0 && (
                <div className="hidden md:flex">
                  <HostelSwitcher hostels={hostels} activeHostelId={user?.hostelId} onSwitch={switchHostel} />
                </div>
              )}
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-semibold text-xs shadow-sm">
                {user?.name?.[0]?.toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 lg:px-6 py-6 max-w-[1440px] mx-auto w-full">
          <Outlet />
        </main>
      </div>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-border px-2 pb-safe">
        <div className="flex items-center justify-around h-14">
          {(() => {
            const allItems = navGroups.flatMap(g => g.items);
            const visible = allItems.slice(0, 5);
            return visible.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all ${
                    active ? "text-primary" : "text-text-tertiary"
                  }`}
                >
                  <item.icon size={20} />
                  <span className="text-[9px] font-semibold uppercase tracking-wider">{item.label}</span>
                </Link>
              );
            });
          })()}
        </div>
      </nav>
    </div>
  );
};

export default DashboardLayout;
