import TenantBedShift from "../components/TenantBedShift";

const TenantRoomShift = () => {
  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-20">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-1.5 rounded-full bg-primary" />
        <h2 className="text-lg font-bold font-display text-text-primary">Room Shift Request</h2>
        <p className="text-[10px] text-text-tertiary hidden sm:inline">
          Request to move to a different room
        </p>
      </div>
      <TenantBedShift />
    </div>
  );
};

export default TenantRoomShift;
