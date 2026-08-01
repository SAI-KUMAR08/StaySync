import { MdDelete, MdHotel, MdPeople } from "react-icons/md";
import { getVacateState } from "../../utils/vacate";

/**
 * Read-only tenant list table.
 * Row click → onView(tenant); action buttons → onReassign(tenant) / onDelete(id).
 */
const TenantTable = ({ tenants, onView, onReassign, onDelete }) => {
  return (
    <div className="card card-lg overflow-hidden overflow-x-auto">
      <table className="heritage-table">
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Hostel</th>
            <th>Assignment</th>
            <th>Rent</th>
            <th>Status</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {tenants.map((tenant, i) => (
            <tr
              key={tenant._id}
              className="stagger-enter cursor-pointer"
              style={{ animationDelay: `${Math.min(i * 0.04, 0.3)}s` }}
              onClick={() => onView(tenant)}
            >
              <td>
                <div className="flex items-center gap-3.5">
                  <div className="flex items-center gap-3.5 group">
                    <div
                      className={`w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm`}
                    >
                      {(tenant.name?.[0] || "T").toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary text-sm group-hover:text-primary transition-colors inline-flex items-center gap-1">
                        {tenant.name}
                        {tenant.isTemporary && (
                          <span className="text-[8px] text-amber-600 font-bold uppercase tracking-wider bg-amber-50 px-1.5 py-0.5 rounded ml-1">
                            Temporary
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-text-secondary font-medium">{tenant.phone}</p>
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <p className="text-sm font-semibold text-text-primary">
                  {tenant.hostelName || "—"}
                </p>
              </td>
              <td>
                <p className="text-sm font-semibold text-text-primary">
                  Room {tenant.roomDetails?.roomId?.number}
                </p>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">
                  Floor {tenant.roomDetails?.floorId?.number} • Bed{" "}
                  {tenant.roomDetails?.bedId?.number}
                </p>
              </td>
              <td>
                <p className="text-sm font-bold text-text-primary">
                  ₹{tenant.rentAmount?.toLocaleString()}
                </p>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-tight">
                  Monthly
                </p>
              </td>
              <td>
                <span
                  className={`badge ${tenant.isActive === false ? "badge-slate" : "badge-emerald"}`}
                >
                  {tenant.isActive === false ? "inactive" : "active"}
                </span>
              </td>
              <td className="text-right">
                <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const v = getVacateState(tenant);
                    // Explain WHY the Vacate action is unavailable so the admin
                    // never has to calculate the waiting period themselves.
                    const vacateTitle = !v.blocked
                      ? "Vacate tenant"
                      : v.status === "approved"
                        ? `Vacating available on ${v.eligibleDate.toLocaleDateString()}`
                        : v.status === "pending"
                          ? "Vacate request pending approval — vacating unlocks after approval"
                          : v.status === "rejected"
                            ? "Vacate request was rejected — a new request is required"
                            : v.status === "completed"
                              ? "Vacate request already processed"
                              : "A tenant can only be vacated after an approved vacate request";
                    return (
                      <>
                        {v.blocked && v.status === "approved" && (
                          <span className="text-[8px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                            Vacate {v.eligibleDate.toLocaleDateString()}
                          </span>
                        )}
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => onReassign(tenant)}
                            className="p-2 text-text-secondary/50 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                            title="Reassign room"
                            aria-label="Reassign room"
                          >
                            <MdHotel size={18} />
                          </button>
                          <button
                            onClick={() => onDelete(tenant)}
                            disabled={v.blocked}
                            title={vacateTitle}
                            aria-label={vacateTitle}
                            className={`p-2 rounded-xl transition-all ${
                              v.blocked
                                ? "text-text-tertiary/25 cursor-not-allowed"
                                : "text-text-secondary/50 hover:text-primary hover:bg-primary-light"
                            }`}
                          >
                            <MdDelete size={18} />
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </td>
            </tr>
          ))}
          {tenants.length === 0 && (
            <tr>
              <td colSpan="6" className="px-6 py-16 text-center">
                <MdPeople className="text-4xl mx-auto mb-3 opacity-20 text-text-secondary" />
                <p className="text-text-secondary/60 font-medium italic">
                  No tenants found matching your criteria.
                </p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default TenantTable;
