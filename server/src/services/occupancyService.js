import mongoose from "mongoose";
import { Room, Bed, Tenant, RoomAssignmentHistory, Payment } from "../models/index.js";

export async function recalculateRoomOccupancy(roomId, session = null) {
  const opts = session ? { session } : {};
  const room = await Room.findById(roomId).session(session || null);
  if (!room) throw new Error("Room not found");

  const occupiedCount = await Bed.countDocuments(
    { roomId, ownerId: room.ownerId, hostelId: room.hostelId, occupancyStatus: "occupied" },
    opts
  );

  room.occupiedBeds = occupiedCount;
  room.availableBeds = Math.max(0, room.capacity - occupiedCount);
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

export async function assignTenantToBed({ ownerId, hostelId, tenantId, bedId, session }) {
  const tenant = await Tenant.findOne({ _id: tenantId, ownerId, hostelId }).session(session);
  if (!tenant) throw new Error("Tenant not found");

  const hadPrevious = !!tenant.bedId;

  if (tenant.bedId && tenant.bedId.toString() !== bedId.toString()) {
    await freeTenantBed(tenant, session);
  }

  const duplicate = await Bed.findOne({
    tenantId,
    ownerId,
    hostelId,
    _id: { $ne: bedId },
    occupancyStatus: "occupied",
  }).session(session);
  if (duplicate) throw new Error("Tenant already assigned to another bed");

  // Check if bed exists and room hasn't reached capacity BEFORE claiming
  const bedDoc = await Bed.findOne({ _id: bedId, ownerId, hostelId, occupancyStatus: { $ne: "maintenance" } }).session(session);
  if (!bedDoc) throw new Error("Bed not found");

  const room = await Room.findOne({ _id: bedDoc.roomId, ownerId, hostelId }).session(session);
  if (!room) throw new Error("Room not found");

  const occupiedInRoom = await Bed.countDocuments(
    { roomId: room._id, ownerId, hostelId, occupancyStatus: "occupied" },
    { session }
  );
  if (occupiedInRoom >= room.capacity) {
    throw new Error("Room is at full capacity");
  }

  // Atomically claim the bed
  const bed = await Bed.findOneAndUpdate(
    { _id: bedId, ownerId, hostelId, occupancyStatus: { $ne: "maintenance" }, $or: [{ tenantId: null }, { tenantId }] },
    { $set: { occupancyStatus: "occupied", tenantId } },
    { new: true, session }
  );
  if (!bed) throw new Error("Bed not found or unavailable");

  tenant.roomId = room._id;
  tenant.bedId = bed._id;
  tenant.floorId = room.floorId ?? null;
  // Always update tenant's monthlyRent to match the assigned bed pricing or room pricing if configured
  tenant.monthlyRent = bed.pricing || bed.monthlyRent || room.pricing || room.monthlyRent || tenant.monthlyRent;
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

export async function freeTenantBed(tenant, session = null) {
  if (!tenant.bedId) return null;
  const opts = session ? { session } : {};
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
    opts
  );

  // 2. Proration Logic for Checkout
  const joinDate = new Date(tenant.joinDate || tenant.createdAt);
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
    }).sort({ dueDate: -1 }).session(session || null);

    if (unpaidPayment) {
      unpaidPayment.amount = proratedAmount;
      unpaidPayment.totalAmount = proratedAmount + (unpaidPayment.fineAmount || 0);
      unpaidPayment.notes = `${unpaidPayment.notes || ""} (Prorated checkout: ${activeDays}/${totalPeriodDays} days active)`;
      await unpaidPayment.save(opts);
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
    await bed.save(opts);
    await recalculateRoomOccupancy(bed.roomId, session);
  }

  tenant.roomId = null;
  tenant.bedId = null;
  tenant.floorId = null;
  await tenant.save(opts);
  return bed;
}

export async function updateBedStatus({ ownerId, hostelId, bedId, status }) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const bed = await Bed.findOne({ _id: bedId, ownerId, hostelId }).session(session);
    if (!bed) throw new Error("Bed not found");

    if (bed.tenantId && (status === "available" || status === "maintenance")) {
      const tenant = await Tenant.findById(bed.tenantId).session(session);
      if (tenant) {
        await freeTenantBed(tenant, session);
      }
      bed.tenantId = null;
    }

    if (status === "occupied" && !bed.tenantId) {
      throw new Error("Cannot mark bed occupied without a tenant assignment");
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
  const rooms = await Room.find({ ownerId, hostelId, isActive: true });
  const beds = await Bed.find({ ownerId, hostelId });

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.occupiedBeds > 0).length;
  const vacantRooms = totalRooms - occupiedRooms;
  const totalBeds = beds.length;
  const occupiedBeds = beds.filter((b) => b.occupancyStatus === "occupied").length;
  const availableBeds = totalBeds - occupiedBeds;
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
