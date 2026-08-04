import { useSearchParams } from "react-router-dom";
import AdminBedShiftRequests from "../components/AdminBedShiftRequests";
import AdminVacateRequests from "../components/AdminVacateRequests";
import AdminProfileRequests from "../components/AdminProfileRequests";
import { MdSwapHoriz, MdMeetingRoom, MdPerson } from "react-icons/md";

const REQUEST_TYPES = [
  { id: "shift", label: "Room Shift", icon: MdSwapHoriz, Component: AdminBedShiftRequests },
  { id: "vacate", label: "Vacate", icon: MdMeetingRoom, Component: AdminVacateRequests },
  { id: "profile", label: "Profile Edit", icon: MdPerson, Component: AdminProfileRequests },
];

const AdminRequests = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get("type");
  const active = REQUEST_TYPES.some((t) => t.id === typeParam) ? typeParam : "shift";

  const selectType = (id) => {
    setSearchParams(id === "shift" ? {} : { type: id }, { replace: true });
  };

  const { Component } = REQUEST_TYPES.find((t) => t.id === active) || REQUEST_TYPES[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-1.5 rounded-full bg-primary" />
        <h2 className="text-lg font-bold font-display text-text-primary">Requests</h2>
        <p className="text-[10px] text-text-tertiary hidden sm:inline">Review resident requests</p>
      </div>

      {/* Type filter — same pill style as the Tenants page */}
      <div className="flex flex-wrap gap-2">
        {REQUEST_TYPES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => selectType(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              active === id
                ? "bg-primary text-white shadow-sm"
                : "bg-white text-text-tertiary hover:text-text-primary border border-border/40"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <Component />
    </div>
  );
};

export default AdminRequests;
