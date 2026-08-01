import mongoose from "mongoose";
import { Room, Bed, Tenant, RoomAssignmentHistory, Payment } from "../models/index.js";
import { AppError } from "../middleware/error.middleware.js";

/**
 * Filter fragment for beds that may be auto-claimed right now.
 * A bed with a future `holdUntil` (held after a bed-shift approval so the admin
 * can still undo) is excluded until the hold expires.
 */
export function availableBedFilter(now = new Date()) {
  return { $or: [{ holdUntil: null }, { holdUntil: { $lte: now } }] };
}

export async function recalculateRoomOccupancy(roomId, session = null) {
  const opts = session ? { session } : {};
  const room = await Room.findById(roomId).session(session || null);
  if (!room) throw new Error("Room not found");

  const [occupiedCount, maintenanceCount] = await Promise.all([
    Bed.countDocuments(
      { roomId, ownerId: room.ownerId, hostelId: room.hostelId, occupancyStatus: "occupied" },
      opts
    ),
    Bed.countDocuments(
      { roomId, ownerId: room.ownerId, hostelId: room.hostelId, occupancyStatus: "maintenance" },
      opts
    ),
  ]);

  room.occupiedBeds = occupiedCount;
  // Maintenance beds are neither available nor occupied — don't count them as free.
  room.availableBeds = Math.max(0, room.capacity - occupiedCount - maintenanceCount);
  await room.save(opts);
  return room;
}

export async function syncBedsForRoom(room, session = null) {
  const opts = session ? { session } : {};
  const existingBeds = await Bed.countDocuments(
    { roomId: room._id, ownerId: room.ownerId, hostelId: room.hostelId },
    opts
  );

  if (existingBeds < room.capacity) {
    const toCreate = [];
    for (let i = existingBeds + 1; i <= room.capacity; i++) {
      toCreate.push({
        ownerId: room.ownerId,
        hostelId: room.hostelId,
        floorId: room.floorId,
        roomId: room._id,
        bedNumber: `Bed ${i}`,
        occupancyStatus: "available",
        pricing: room.pricing || room.monthlyRent || 0,
      });
    }
    if (toCreate.length) await Bed.insertMany(toCreate, opts);
  } else if (existingBeds > room.capacity) {
    const extraBeds = await Bed.find({
      roomId: room._id,
      ownerId: room.ownerId,
      hostelId: room.hostelId,
      occupancyStatus: "available",
      tenantId: null,
    })
      .sort({ createdAt: -1 })
      .limit(existingBeds - room.capacity)
      .session(session || null);

    for (const bed of extraBeds) {
      await bed.deleteOne(opts);
    }
  }

  return recalculateRoomOccupancy(room._id, session);
}

/**
 * Randomly pick an available bed in an active room of the given sharing type
 * that still has free capacity. Returns the bed (with `roomId`), or null.
 */
export async function selectRandomAvailableBedForType({ ownerId, hostelId, sharingType, session }) {
  const rows = await Bed.aggregate([
    {
      $match: {
        ownerId,
        hostelId,
        occupancyStatus: "available",
        tenantId: null,
        $or: [{ holdUntil: null }, { holdUntil: { $lte: new Date() } }],
      },
    },
    {
      $lookup: {
        from: "rooms",
        localField: "roomId",
        foreignField: "_id",
        as: "room",
      },
    },
    { $unwind: "$room" },
    {
      $match: {
        "room.ownerId": ownerId,
        "room.hostelId": hostelId,
        "room.isActive": true,
        "room.capacity": sharingType,
        $expr: { $lt: ["$room.occupiedBeds", "$room.capacity"] },
      },
    },
    { $sample: { size: 1 } },
  ]).session(session || null);
  return rows[0] ?? null;
}

export async function assignTenantToBed({
  ownerId,
  hostelId,
  tenantId,
  bedId,
  roomId,
  sharingType,
  session,
}) {
  const tenant = await Tenant.findOne({ _id: tenantId, ownerId, hostelId }).session(session);
  if (!tenant) throw new Error("Tenant not found");

  const hadPrevious = !!tenant.bedId;

  // Room-type allocation (no bedId/roomId): pick a random available room+bed of
  // the requested type, then fall through to the explicit-bed claim path.
  if (sharingType && !bedId && !roomId) {
    if (tenant.bedId) {
      await freeTenantBed(tenant, session, { prorate: false });
    }
    const candidate = await selectRandomAvailableBedForType({
      ownerId,
      hostelId,
      sharingType,
      session,
    });
    if (!candidate) throw new AppError("No beds available for this room type", 400);
    bedId = candidate._id;
  }

  // Auto-assign (roomId given, no bedId): free the tenant's previous bed first
  // (no rent proration for a shift), then claim an available bed in the room.
  if (roomId && !bedId) {
    if (tenant.bedId) {
      await freeTenantBed(tenant, session, { prorate: false });
    }

    const room = await Room.findOne({ _id: roomId, ownerId, hostelId, isActive: true }).session(
      session
    );
    if (!room) throw new AppError("Room not found", 404);

    const occupiedInRoom = await Bed.countDocuments(
      { roomId: room._id, ownerId, hostelId, occupancyStatus: "occupied" },
      { session }
    );
    if (occupiedInRoom >= room.capacity) {
      throw new AppError("Room is at full capacity", 400);
    }

    // Atomically claim the first available bed in the room — prevents both
    // double-allocation and assigning an occupied (or held) bed.
    const bed = await Bed.findOneAndUpdate(
      {
        roomId: room._id,
        ownerId,
        hostelId,
        occupancyStatus: "available",
        tenantId: null,
        ...availableBedFilter(),
      },
      { $set: { occupancyStatus: "occupied", tenantId, holdUntil: null } },
      { new: true, session }
    );
    if (!bed) throw new AppError("No beds available in the selected room", 400);

    tenant.roomId = room._id;
    tenant.bedId = bed._id;
    tenant.floorId = room.floorId ?? null;
    tenant.needsReassignment = false;
    tenant.monthlyRent =
      room.pricing || room.monthlyRent || bed.pricing || bed.monthlyRent || tenant.monthlyRent;
    await tenant.save({ session });

    await RoomAssignmentHistory.create(
      [
        {
          ownerId: tenant.ownerId,
          hostelId: tenant.hostelId,
          tenantId: tenant._id,
          floorId: room.floorId,
          roomId: room._id,
          bedId: bed._id,
          action: hadPrevious ? "bed_shift" : "check_in",
          monthlyRent: tenant.monthlyRent,
          date: new Date(),
        },
      ],
      { session }
    );

    await recalculateRoomOccupancy(room._id, session);
    return { tenant, bed, room };
  }

  if (tenant.bedId && tenant.bedId.toString() !== bedId.toString()) {
    // Shift (not a check-out): don't prorate the tenant's rent mid-cycle.
    await freeTenantBed(tenant, session, { prorate: false });
  }

  const duplicate = await Bed.findOne({
    tenantId,
    ownerId,
    hostelId,
    _id: { $ne: bedId },
    occupancyStatus: "occupied",
  }).session(session);
  if (duplicate) throw new Error("Tenant already assigned to another bed");

  // Check if bed exists and is not in maintenance
  const bedDoc = await Bed.findOne({
    _id: bedId,
    ownerId,
    hostelId,
    occupancyStatus: { $ne: "maintenance" },
  }).session(session);
  if (!bedDoc) throw new Error("Bed not found");

  const room = await Room.findOne({ _id: bedDoc.roomId, ownerId, hostelId }).session(session);
  if (!room) throw new Error("Room not found");

  // Atomically claim the bed AND check room capacity in the same operation.
  // Use findOneAndUpdate with a filter that checks the bed is still available
  // AND room hasn't hit capacity. The room capacity check is done via the
  // pre-increment count, but the atomic claim on the bed prevents double-allocation.
  const occupiedInRoom = await Bed.countDocuments(
    { roomId: room._id, ownerId, hostelId, occupancyStatus: "occupied" },
    { session }
  );
  if (occupiedInRoom >= room.capacity) {
    throw new Error("Room is at full capacity");
  }

  // Atomically claim the bed — the $or clause prevents concurrent claims.
  // Held beds (holdUntil in the future) can't be auto-claimed.
  const bed = await Bed.findOneAndUpdate(
    {
      _id: bedId,
      ownerId,
      hostelId,
      occupancyStatus: "available",
      tenantId: null,
      ...availableBedFilter(),
    },
    { $set: { occupancyStatus: "occupied", tenantId, holdUntil: null } },
    { new: true, session }
  );
  if (!bed) throw new Error("Bed not found or already claimed by another tenant");

  tenant.roomId = room._id;
  tenant.bedId = bed._id;
  tenant.floorId = room.floorId ?? null;
  tenant.needsReassignment = false;
  // Always update tenant's monthlyRent — the room rent is authoritative (falls
  // back to the bed price only when the room has no configured rent).
  tenant.monthlyRent =
    room.pricing || room.monthlyRent || bed.pricing || bed.monthlyRent || tenant.monthlyRent;
  await tenant.save({ session });

  // History log for check_in or bed_shift
  await RoomAssignmentHistory.create(
    [
      {
        ownerId: tenant.ownerId,
        hostelId: tenant.hostelId,
        tenantId: tenant._id,
        floorId: room.floorId,
        roomId: room._id,
        bedId: bed._id,
        action: hadPrevious ? "bed_shift" : "check_in",
        monthlyRent: tenant.monthlyRent,
        date: new Date(),
      },
    ],
    { session }
  );

  await recalculateRoomOccupancy(room._id, session);
  return { tenant, bed, room };
}

export async function freeTenantBed(tenant, session = null, opts = {}) {
  if (!tenant.bedId) return null;
  const dbOpts = session ? { session } : {};
  const prorate = opts.prorate !== false;
  const today = new Date();

  // 1. Room check_out Assignment History log
  await RoomAssignmentHistory.create(
    [
      {
        ownerId: tenant.ownerId,
        hostelId: tenant.hostelId,
        tenantId: tenant._id,
        floorId: tenant.floorId,
        roomId: tenant.roomId,
        bedId: tenant.bedId,
        action: "check_out",
        monthlyRent: tenant.monthlyRent,
        date: today,
      },
    ],
    dbOpts
  );

  // 2. Proration Logic for Checkout (skipped for shifts — rent keeps its amount)
  if (prorate) {
    const joinDate = new Date(tenant.moveInDate || tenant.joinDate || tenant.createdAt);
    const cycleDay = joinDate.getDate();

    let periodStart = new Date(today.getFullYear(), today.getMonth(), cycleDay);
    if (periodStart > today) {
      periodStart.setMonth(periodStart.getMonth() - 1);
    }

    let periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const totalPeriodDays = Math.round((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
    const activeDays = Math.max(1, Math.round((today - periodStart) / (1000 * 60 * 60 * 24)));

    if (activeDays < totalPeriodDays && tenant.monthlyRent > 0) {
      const proratedAmount = Math.round((activeDays / totalPeriodDays) * tenant.monthlyRent);

      const unpaidPayment = await Payment.findOne({
        tenantId: tenant._id,
        paymentStatus: { $in: ["unpaid", "overdue"] },
      })
        .sort({ dueDate: -1 })
        .session(session || null);

      if (unpaidPayment) {
        unpaidPayment.amount = proratedAmount;
        unpaidPayment.totalAmount = proratedAmount + (unpaidPayment.fineAmount || 0);
        unpaidPayment.notes = `${unpaidPayment.notes || ""} (Prorated checkout: ${activeDays}/${totalPeriodDays} days active)`;
        await unpaidPayment.save(dbOpts);
      }
    }
  }

  // 3. Free the Bed status
  const bed = await Bed.findOne({
    _id: tenant.bedId,
    ownerId: tenant.ownerId,
    hostelId: tenant.hostelId,
  }).session(session || null);

  if (bed) {
    bed.occupancyStatus = "available";
    bed.tenantId = null;
    await bed.save(dbOpts);
    await recalculateRoomOccupancy(bed.roomId, session);
  }

  tenant.roomId = null;
  tenant.bedId = null;
  tenant.floorId = null;
  await tenant.save(dbOpts);
  return bed;
}

export async function updateBedStatus({ ownerId, hostelId, bedId, status }) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const bed = await Bed.findOne({ _id: bedId, ownerId, hostelId }).session(session);
    if (!bed) throw new AppError("Bed not found", 400);

    if (bed.tenantId && (status === "available" || status === "maintenance")) {
      const tenant = await Tenant.findById(bed.tenantId).session(session);
      if (tenant) {
        // Bed-status change is a shift, not a checkout — never prorate the rent.
        await freeTenantBed(tenant, session, { prorate: false });
      }
      bed.tenantId = null;
    }

    if (status === "occupied" && !bed.tenantId) {
      throw new AppError("Cannot mark bed occupied without a tenant assignment", 400);
    }

    bed.occupancyStatus = status;
    await bed.save({ session });
    await recalculateRoomOccupancy(bed.roomId, session);
    await session.commitTransaction();
    return bed;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function getOccupancySummary(ownerId, hostelId) {
  const [totalRooms, occupiedRooms, totalBeds, occupiedBeds, maintenanceBeds] = await Promise.all([
    Room.countDocuments({ ownerId, hostelId, isActive: true }),
    Room.countDocuments({ ownerId, hostelId, isActive: true, occupiedBeds: { $gt: 0 } }),
    Bed.countDocuments({ ownerId, hostelId }),
    Bed.countDocuments({ ownerId, hostelId, occupancyStatus: "occupied" }),
    Bed.countDocuments({ ownerId, hostelId, occupancyStatus: "maintenance" }),
  ]);

  const vacantRooms = totalRooms - occupiedRooms;
  // Maintenance beds are neither available nor occupied — don't count them as free.
  const availableBeds = totalBeds - occupiedBeds - maintenanceBeds;
  const occupancyPercentage = totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  return {
    totalRooms,
    occupiedRooms,
    vacantRooms,
    totalBeds,
    occupiedBeds,
    availableBeds,
    occupancyPercentage,
  };
}
