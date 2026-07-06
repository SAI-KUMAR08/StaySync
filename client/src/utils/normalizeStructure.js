export function normalizeStructure(structure = []) {
  return (structure || []).map((floor) => ({
    ...floor,
    number: floor?.floorNumber ?? floor?.level ?? floor?.number,
    name: floor?.floorName ?? floor?.name,
    rooms: (floor?.rooms || []).map((room) => {
      const capacity = room?.capacity ?? room?.sharingType ?? room?.totalBeds ?? 0;
      const occupiedBeds =
        room?.occupiedBeds ??
        (room?.beds || []).filter((b) => b?.status === "occupied").length;
      return {
        ...room,
        number: room?.roomNumber ?? room?.number,
        sharingType: capacity,
        price: room?.pricing ?? room?.monthlyRent ?? room?.price ?? 0,
        totalBeds: capacity,
        occupiedBeds,
        type: room?.roomType ?? (room?.amenities?.includes("AC") ? "AC" : room?.type || "Non-AC"),
        beds: (room?.beds || []).map((bed) => ({
          ...bed,
          status: bed?.occupancyStatus ?? bed?.status ?? "available",
          number: bed?.bedNumber ?? bed?.bedLabel ?? bed?.number,
          tenantId: bed?.tenantId || null,
        })),
      };
    }),
  }));
}

export function getAvailableRooms(structure, sharingType) {
  return (structure || []).flatMap((floor) =>
    floor.rooms
      .filter((r) => r.sharingType === sharingType && r.occupiedBeds < r.totalBeds)
      .map((r) => ({ ...r, floorNumber: floor.number, floorId: floor }))
  );
}
