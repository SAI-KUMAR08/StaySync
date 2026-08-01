import { MdSwapHoriz, MdCheckCircle, MdHotel } from "react-icons/md";

/**
 * Section listing tenants on temporary allotment (waiting for their preferred
 * room type to open up). Renders nothing when there are no temporary tenants.
 * `roomReadyFor(tenant)` returns whether a preferred room is currently available.
 */
const TemporaryAllotments = ({ tenants, onConvertToPermanent, onFixTempTenant, roomReadyFor }) => {
  const temporary = tenants.filter((t) => t.isTemporary);
  if (temporary.length === 0) return null;

  return (
    <div className="card card-lg-accent p-5">
      <div className="flex items-center gap-2 mb-5">
        <MdSwapHoriz className="text-2xl text-primary" />
        <div>
          <h3 className="font-bold font-display text-text-primary text-base tracking-tight">
            Temporary Allotments ({temporary.length})
          </h3>
          <p className="text-[9px] text-text-secondary font-medium">
            These tenants are waiting for their preferred room to become available
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {temporary.map((t) => {
          const roomReady = roomReadyFor(t);
          return (
            <div
              key={t._id}
              className={`p-4 rounded-2xl bg-surface border border-border/50 hover:shadow-md transition-all`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center text-xs font-bold`}
                  >
                    {t.name?.[0] || "T"}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary leading-none">{t.name}</p>
                    <p className="text-[9px] text-text-secondary font-medium">
                      Room {t.roomDetails?.roomId?.number} (temp)
                    </p>
                  </div>
                </div>
                <span className="badge-amber text-[8px]">Temporary</span>
              </div>
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-text-secondary font-medium uppercase tracking-wider">
                  Waiting for:{" "}
                  <strong className="text-primary">{t.preferredSharing || "?"}-sharing</strong>
                </span>
                {roomReady && (
                  <span className="flex items-center gap-1 text-emerald-400 font-bold uppercase tracking-wider">
                    <MdCheckCircle size={12} /> Room Available
                  </span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => onConvertToPermanent(t)}
                  disabled={!roomReady}
                  className={`flex-1 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase tracking-wider hover:bg-emerald-500/20 border border-emerald-500/15 transition-all flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <MdCheckCircle size={14} /> {roomReady ? "Make Permanent" : "No Room Available"}
                </button>
                {roomReady && (
                  <button
                    onClick={() => onFixTempTenant(t)}
                    className={`px-3 py-2.5 rounded-xl bg-primary-light text-primary text-[9px] font-bold uppercase tracking-wider hover:bg-primary/20 border border-primary/15 transition-all`}
                    title="Manually select a specific room"
                  >
                    <MdHotel size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TemporaryAllotments;
