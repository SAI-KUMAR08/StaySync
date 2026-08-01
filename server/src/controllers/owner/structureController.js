import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { success } from "../../utils/apiResponse.js";
import { AppError } from "../../middleware/error.middleware.js";
import { emitOccupancyUpdate } from "../../utils/socketEvents.js";
import { Room, Bed, Floor, Hostel } from "../../models/index.js";
import { ownerFilter } from "../../utils/scope.js";
import * as occupancyService from "../../services/occupancyService.js";
import * as tempAllotmentService from "../../services/tempAllotmentService.js";
import { syncTenantRentForPricingChange } from "../../services/rentChangeService.js";
import { logActivity } from "../../services/activityService.js";

export const listHostels = asyncHandler(async (req, res) => {
  const hostels = await Hostel.find({ ownerId: req.user.id, isActive: true }).sort({
    createdAt: -1,
  });
  return success(res, hostels);
});

export const createHostel = asyncHandler(async (req, res) => {
  const { hostelName, address, city, contactPhone, totalFloors } = req.validated.body;
  const hostel = await Hostel.create({
    ownerId: req.user.id,
    name: hostelName.trim(),
    address: address?.trim(),
    city: city?.trim(),
    contactPhone: contactPhone?.trim(),
    totalFloors: totalFloors ?? 1,
    isActive: true,
  });
  return success(res, hostel, 201);
});

export const listFloors = asyncHandler(async (req, res) => {
  const floors = await Floor.find({ ...ownerFilter(req), isActive: true }).sort({ floorNumber: 1 });
  return success(res, floors);
});

export const getHostelStructure = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const ownerId =
    f.ownerId instanceof mongoose.Types.ObjectId
      ? f.ownerId
      : new mongoose.Types.ObjectId(f.ownerId);
  const hostelId =
    f.hostelId instanceof mongoose.Types.ObjectId
      ? f.hostelId
      : new mongoose.Types.ObjectId(f.hostelId);

  const structure = await Floor.aggregate([
    { $match: { ownerId, hostelId, isActive: true } },
    { $sort: { floorNumber: 1 } },
    {
      $lookup: {
        from: "rooms",
        let: { floorId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$floorId", "$$floorId"] },
                  { $eq: ["$ownerId", ownerId] },
                  { $eq: ["$hostelId", hostelId] },
                  { $eq: ["$isActive", true] },
                ],
              },
            },
          },
          { $sort: { roomNumber: 1 } },
          {
            $lookup: {
              from: "beds",
              let: { roomId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$roomId", "$$roomId"] },
                        { $eq: ["$ownerId", ownerId] },
                        { $eq: ["$hostelId", hostelId] },
                      ],
                    },
                  },
                },
                { $sort: { bedNumber: 1 } },
                {
                  $lookup: {
                    from: "tenants",
                    let: { tid: "$tenantId" },
                    pipeline: [
                      { $match: { $expr: { $eq: ["$_id", "$$tid"] } } },
                      {
                        $project: {
                          "personalInfo.name": 1,
                          "personalInfo.email": 1,
                          "personalInfo.phone": 1,
                          monthlyRent: 1,
                          isTemporary: 1,
                          _id: 1,
                        },
                      },
                    ],
                    as: "tenant",
                  },
                },
                { $addFields: { tenantId: { $arrayElemAt: ["$tenant", 0] } } },
                { $project: { tenant: 0 } },
              ],
              as: "beds",
            },
          },
        ],
        as: "rooms",
      },
    },
  ]);

  return success(res, { structure });
});

export const createFloor = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const body = req.validated.body || {};
  let floorName = body.floorName || body.name;
  let floorNumber = body.floorNumber ?? body.level;
  if (floorNumber === undefined) {
    const top = await Floor.findOne({ ...f, isActive: true }).sort({ floorNumber: -1 });
    floorNumber = (top?.floorNumber ?? 0) + 1;
  }
  if (!floorName) floorName = `Floor ${floorNumber}`;
  const floor = await Floor.create({ ...f, floorName, floorNumber });
  emitOccupancyUpdate(req, f.hostelId);
  return success(res, floor, 201);
});

export const deleteFloor = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const floor = await Floor.findOne({ _id: req.validated.params.id, ...f });
  if (!floor) throw new AppError("Floor not found", 404);

  const occupied = await Bed.countDocuments({
    ...f,
    floorId: floor._id,
    occupancyStatus: "occupied",
  });
  if (occupied > 0) throw new AppError("Cannot delete floor with occupied beds", 400);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Bed.deleteMany({ ...f, floorId: floor._id }, { session });
    floor.isActive = false;
    await floor.save({ session });
    await session.commitTransaction();
  } catch {
    await session.abortTransaction();
    throw new AppError("Failed to delete floor", 400);
  } finally {
    session.endSession();
  }
  emitOccupancyUpdate(req, f.hostelId);
  return success(res, { message: "Floor deleted" });
});

export const setupHostel = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const { floors } = req.validated.body; // Array of floors, each with rooms

  // Refuse to re-run setup while tenants are assigned — deleting the structure
  // underneath occupied beds would strand tenants.
  const occupiedBeds = await Bed.countDocuments({ ...f, tenantId: { $ne: null } });
  if (occupiedBeds > 0) {
    throw new AppError("Cannot re-run setup while tenants are assigned", 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Optional: Delete existing setup if re-running
    await Floor.deleteMany(f, { session });
    await Room.deleteMany(f, { session });
    await Bed.deleteMany(f, { session });

    for (const floorData of floors) {
      const floor = await Floor.create(
        [{ ...f, floorName: `Floor ${floorData.number}`, floorNumber: floorData.number }],
        { session }
      );
      if (!floor || floor.length === 0) {
        throw new Error(`Failed to create floor level ${floorData.number}`);
      }

      for (const roomData of floorData.rooms) {
        const room = await Room.create(
          [
            {
              ...f,
              roomNumber: roomData.number,
              floor: floorData.number,
              floorId: floor[0]._id,
              capacity: roomData.sharingType,
              pricing: roomData.price,
              roomType: roomData.isAC ? "AC" : "Non-AC",
              amenities: roomData.isAC ? ["AC"] : ["Non-AC"],
              availableBeds: roomData.sharingType,
              occupiedBeds: 0,
            },
          ],
          { session }
        );

        if (!room || room.length === 0) {
          throw new Error(`Failed to create room ${roomData.number}`);
        }

        await occupancyService.syncBedsForRoom(room[0], session);
      }
    }
    await session.commitTransaction();
    return success(res, { message: "Hostel setup complete" }, 201);
  } catch (e) {
    await session.abortTransaction();
    console.error("[setupHostel]", e);
    throw new AppError("Hostel setup failed", 400);
  } finally {
    session.endSession();
  }
});

export const listRooms = asyncHandler(async (req, res) => {
  const rooms = await Room.find({ ...ownerFilter(req), isActive: true })
    .populate("floorId", "floorName floorNumber")
    .sort({ roomNumber: 1 });
  return success(res, rooms);
});

export const createRoom = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const { roomNumber, floor, floorId, pricing, monthlyRent, capacity, amenities } =
    req.validated.body;

  const effectivePricing = pricing ?? monthlyRent ?? 0;
  let floorLevel = floor;
  let resolvedFloorId = floorId ?? null;
  if (floorId) {
    const floorDoc = await Floor.findOne({ _id: floorId, ...f, isActive: true });
    if (!floorDoc) throw new AppError("Floor not found", 404);
    floorLevel = floorDoc.floorNumber;
    resolvedFloorId = floorDoc._id;
  }

  const room = await Room.create({
    ...f,
    roomNumber,
    floor: floorLevel,
    floorId: resolvedFloorId,
    capacity,
    pricing: effectivePricing,
    roomType: amenities?.includes("AC") ? "AC" : "Non-AC",
    amenities: amenities ?? [],
    availableBeds: capacity,
    occupiedBeds: 0,
  });
  await occupancyService.syncBedsForRoom(room);
  await logActivity({
    ...f,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "room_created",
    entityType: "room",
    entityId: room._id,
  });
  // New beds are new availability — serve the waiting queue.
  tempAllotmentService
    .processWaitingQueue({ ownerId: f.ownerId, hostelId: f.hostelId, io: req.app.get("io") })
    .catch(() => {});
  emitOccupancyUpdate(req, f.hostelId);
  return success(res, room, 201);
});

export const updateRoom = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const room = await Room.findOne({ _id: req.validated.params.id, ...f });
  if (!room) throw new AppError("Room not found", 404);

  const { pricing, monthlyRent, sharingType, type, amenities } = req.validated.body;
  if (sharingType !== undefined) {
    if (sharingType < room.occupiedBeds) {
      throw new AppError(
        `Cannot reduce capacity to ${sharingType}: room currently has ${room.occupiedBeds} occupied bed(s)`,
        400
      );
    }
    room.capacity = sharingType;
  }
  const effectivePricing = pricing ?? monthlyRent;
  // Capture the price BEFORE the update so a room price change can be cascaded
  // to tenants whose beds inherited the old room price (their bed pricing equals
  // the old room price), while leaving beds with a custom price untouched.
  const oldRoomPricing = room.pricing;
  const priceChanged = effectivePricing !== undefined && effectivePricing !== room.pricing;
  if (effectivePricing !== undefined) room.pricing = effectivePricing;
  if (type !== undefined) room.roomType = type;
  if (amenities !== undefined) room.amenities = amenities;
  await room.save();
  await occupancyService.syncBedsForRoom(room);

  // A room price change cascades to the tenants of this room. The room rent is
  // the single source of truth: EVERY occupied tenant in the room follows the
  // new room rent, regardless of the bed's stored (possibly stale) price. Beds
  // that inherited the old room rate (pricing 0 or equal to the old room price)
  // also track the new room rate so the bed-level price view stays consistent.
  if (priceChanged) {
    const io = req.app.get("io");
    const occupiedBeds = await Bed.find({
      ...f,
      roomId: room._id,
      occupancyStatus: "occupied",
      tenantId: { $ne: null },
    });
    // Each tenant's rent update is independent — run them concurrently instead
    // of serial round-trips (a 20-bed room was 20 awaited DB hops per edit).
    await Promise.all(
      occupiedBeds.map((bed) =>
        syncTenantRentForPricingChange({
          ownerId: f.ownerId,
          hostelId: f.hostelId,
          tenantId: bed.tenantId,
          newRent: room.pricing,
          location: `Room ${room.roomNumber}`,
          io,
        })
      )
    );
    await Bed.updateMany(
      { ...f, roomId: room._id, $or: [{ pricing: oldRoomPricing }, { pricing: 0 }] },
      { $set: { pricing: room.pricing } }
    );
  }
  // Capacity correction may have created new beds — serve the waiting queue.
  tempAllotmentService
    .processWaitingQueue({ ownerId: f.ownerId, hostelId: f.hostelId, io: req.app.get("io") })
    .catch(() => {});
  emitOccupancyUpdate(req, f.hostelId);
  return success(res, room);
});

export const deleteRoom = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const room = await Room.findOne({ _id: req.validated.params.id, ...f });
  if (!room) throw new AppError("Room not found", 404);
  const occupied = await Bed.countDocuments({
    ...f,
    roomId: room._id,
    occupancyStatus: "occupied",
  });
  if (occupied > 0) throw new AppError("Cannot delete room with occupied beds", 400);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Bed.deleteMany({ ...f, roomId: room._id }, { session });
    room.isActive = false;
    await room.save({ session });
    await session.commitTransaction();
  } catch {
    await session.abortTransaction();
    throw new AppError("Failed to delete room", 400);
  } finally {
    session.endSession();
  }
  emitOccupancyUpdate(req, f.hostelId);
  return success(res, { message: "Room deleted" });
});

export const listBeds = asyncHandler(async (req, res) => {
  const query = { ...ownerFilter(req) };
  if (req.query.roomId) query.roomId = req.query.roomId;
  const beds = await Bed.find(query)
    .populate("tenantId", "personalInfo.name personalInfo.email")
    .populate("roomId", "roomNumber")
    .sort({ bedNumber: 1 });
  return success(res, beds);
});

export const updateBed = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const { status, bedLabel, monthlyRent, bedNumber, pricing } = req.validated.body;

  // Use actual DB field names
  const effectiveBedNumber = bedNumber || bedLabel;
  const effectivePricing = pricing ?? monthlyRent;

  if (status) {
    if (effectiveBedNumber !== undefined || effectivePricing !== undefined) {
      throw new AppError(
        "Status changes must be performed separately from label/price updates",
        400
      );
    }
    const bed = await occupancyService.updateBedStatus({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      bedId: req.validated.params.id,
      status,
    });
    // A bed released to "available" may satisfy a waiting request.
    if (bed?.occupancyStatus === "available") {
      tempAllotmentService
        .processWaitingQueue({ ownerId: f.ownerId, hostelId: f.hostelId, io: req.app.get("io") })
        .catch(() => {});
    }
    emitOccupancyUpdate(req, f.hostelId);
    return success(res, bed);
  }

  // Fetch the bed first so we can detect whether the price actually changed and
  // read the occupying tenant — the label-only path must not touch tenant rent.
  const bed = await Bed.findOne({ _id: req.validated.params.id, ...f });
  if (!bed) throw new AppError("Bed not found", 404);

  const updateFields = {};
  if (effectiveBedNumber) updateFields.bedNumber = effectiveBedNumber;

  // Pricing path: sync the occupying tenant's rent to the new bed price and send
  // a `rent_changed` notice, only when the effective price genuinely changes
  // (avoids spam on unchanged saves). Bed status toggling is handled above.
  if (effectivePricing !== undefined && effectivePricing !== bed.pricing) {
    updateFields.pricing = effectivePricing;
    if (bed.tenantId) {
      await syncTenantRentForPricingChange({
        ownerId: f.ownerId,
        hostelId: f.hostelId,
        tenantId: bed.tenantId,
        newRent: effectivePricing,
        location: bed.bedNumber || bed.bedLabel || "Bed",
        io: req.app.get("io"),
      });
    }
  }

  const updatedBed = await Bed.findOneAndUpdate(
    { _id: bed._id, ...f },
    { $set: updateFields },
    { new: true }
  );
  if (!updatedBed) throw new AppError("Bed not found", 404);
  return success(res, updatedBed);
});

export const getHostel = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const hostel = await Hostel.findOne({ ownerId: f.ownerId, _id: f.hostelId });
  if (!hostel) throw new AppError("Hostel not found", 404);
  return success(res, hostel);
});

export const updateHostel = asyncHandler(async (req, res) => {
  const f = ownerFilter(req);
  const hostel = await Hostel.findOneAndUpdate(
    { ownerId: f.ownerId, _id: f.hostelId },
    { $set: req.validated.body },
    { new: true, runValidators: true }
  );
  if (!hostel) throw new AppError("Hostel not found", 404);
  return success(res, hostel);
});
