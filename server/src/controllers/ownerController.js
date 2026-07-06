import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { success } from "../utils/apiResponse.js";
import { AppError } from "../middleware/error.middleware.js";
import { emitTenantAssigned, emitTenantRemoved, emitOccupancyUpdate } from "../utils/socketEvents.js";
import {
  Room, Bed, Tenant, Complaint, Payment, Notice, Hostel, BedShiftRequest, Floor, Owner, RoomAssignmentHistory,
} from "../models/index.js";
import { ownerFilter } from "../utils/scope.js";
import { generateTemporaryPassword } from "../utils/password.js";
import * as occupancyService from "../services/occupancyService.js";
import * as analyticsService from "../services/analyticsService.js";
import { getSlaDueAt } from "../services/authService.js";
import { logActivity } from "../services/activityService.js";
import { syncHostelPaymentStatuses, ensureTenantRentInvoices } from "../services/paymentService.js";
import { normalizePhone } from "../utils/phone.js";
import { escapeRegex } from "../utils/regex.js";

const filter = (req) => ownerFilter(req);

export const listHostels = asyncHandler(async (req, res) => {
  const hostels = await Hostel.find({ ownerId: req.user.id, isActive: true }).sort({ createdAt: -1 });
  return success(res, hostels);
});

export const createHostel = asyncHandler(async (req, res) => {
  const { hostelName, address, city, contactPhone, totalFloors } = req.validated.body;
  const hostel = await Hostel.create({
    ownerId: req.user.id,
    hostelName: hostelName.trim(),
    address: address?.trim(),
    city: city?.trim(),
    contactPhone: contactPhone?.trim(),
    totalFloors: totalFloors ?? 1,
    isActive: true,
  });
  return success(res, hostel, 201);
});

export const listFloors = asyncHandler(async (req, res) => {
  const floors = await Floor.find({ ...filter(req), isActive: true }).sort({ floorNumber: 1 });
  return success(res, floors);
});



export const getHostelStructure = asyncHandler(async (req, res) => {
  const f = filter(req);
  const floors = await Floor.find({ ...f, isActive: true }).sort({ floorNumber: 1 });
  
  const structure = [];
  for (const floor of floors) {
    const rooms = await Room.find({ floorId: floor._id, ...f, isActive: true }).sort({ roomNumber: 1 });
    const roomsWithBeds = [];
    for (const room of rooms) {
      const beds = await Bed.find({ roomId: room._id, ...f })
        .sort({ bedNumber: 1 })
        .populate("tenantId", "name email phone");
      roomsWithBeds.push({ ...room.toObject(), beds });
    }
    structure.push({ ...floor.toObject(), rooms: roomsWithBeds });
  }

  return success(res, { structure });
});

export const createFloor = asyncHandler(async (req, res) => {
  const f = filter(req);
  let { name, level } = req.validated.body || {};
  if (level === undefined) {
    const top = await Floor.findOne({ ...f, isActive: true }).sort({ floorNumber: -1 });
    level = (top?.level ?? 0) + 1;
  }
  if (!name) name = `Floor ${level}`;
  const floor = await Floor.create({ ...f, name, level });
  emitOccupancyUpdate(req, f.hostelId);
  return success(res, floor, 201);
});

export const setupHostel = asyncHandler(async (req, res) => {
  const f = filter(req);
  const { floors } = req.body; // Array of floors, each with rooms

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Optional: Delete existing setup if re-running
    await Floor.deleteMany(f, { session });
    await Room.deleteMany(f, { session });
    await Bed.deleteMany(f, { session });

    for (const floorData of floors) {
      const floor = await Floor.create([{ ...f, name: `Floor ${floorData.number}`, level: floorData.number }], { session });
      if (!floor || floor.length === 0) {
        throw new Error(`Failed to create floor level ${floorData.number}`);
      }
      
      for (const roomData of floorData.rooms) {
        const room = await Room.create([{
          ...f,
          roomNumber: roomData.number,
          floor: floorData.number,
          floorId: floor[0]._id,
          capacity: roomData.sharingType,
          monthlyRent: roomData.price,
          roomType: roomData.isAC ? "AC" : "Non-AC",
          amenities: roomData.isAC ? ["AC"] : ["Non-AC"],
          availableBeds: roomData.sharingType,
          occupiedBeds: 0,
        }], { session });

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
    throw new AppError(e.message, 400);
  } finally {
    session.endSession();
  }
});

export const getOccupancy = asyncHandler(async (req, res) => {
  const occupancy = await analyticsService.getOccupancyAnalytics(req.user.id, req.user.hostelId);
  return success(res, occupancy);
});

export const getDashboard = asyncHandler(async (req, res) => {
  const f = filter(req);
  const resolvedOwnerId = req.user.role === "manager" ? req.user.ownerId : req.user.id;

  await syncHostelPaymentStatuses(resolvedOwnerId, f.hostelId);
  const [stats, occupancy, payments, complaints] = await Promise.all([
    analyticsService.getDashboardStats(resolvedOwnerId, f.hostelId),
    analyticsService.getOccupancyAnalytics(resolvedOwnerId, f.hostelId),
    analyticsService.getPaymentAnalytics(resolvedOwnerId, f.hostelId),
    analyticsService.getComplaintTrends(resolvedOwnerId, f.hostelId),
  ]);
  
  // Match the frontend property names
  stats.pendingPayments = stats.overduePayments;
  stats.totalTenants = stats.occupiedBeds; // Approximating since each bed = 1 tenant

  // Mask financial data if manager
  if (req.user.role === "manager") {
    stats.monthlyRevenue = 0;
    stats.overdueAmount = 0;
    stats.unpaidAmount = 0;
    stats.pendingPayments = 0;
    // Mask chart payments
    if (payments && Array.isArray(payments)) {
      payments.forEach((p) => {
        p.collected = 0;
        p.pending = 0;
      });
    }
  }

  return success(res, { stats, charts: { occupancy, payments, complaints } });
});

export const listRooms = asyncHandler(async (req, res) => {
  const rooms = await Room.find({ ...filter(req), isActive: true })
    .populate("floorId", "name level")
    .sort({ roomNumber: 1 });
  return success(res, rooms);
});

export const createRoom = asyncHandler(async (req, res) => {
  const f = filter(req);
  const { roomNumber, floor, floorId, capacity, monthlyRent, amenities } = req.validated.body;

  let floorLevel = floor;
  let resolvedFloorId = floorId ?? null;
  if (floorId) {
    const floorDoc = await Floor.findOne({ _id: floorId, ...f, isActive: true });
    if (!floorDoc) throw new AppError("Floor not found", 404);
    floorLevel = floorDoc.level;
    resolvedFloorId = floorDoc._id;
  }

  const room = await Room.create({
    ...f,
    roomNumber,
    floor: floorLevel,
    floorId: resolvedFloorId,
    capacity,
    monthlyRent,
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
  return success(res, room, 201);
});

export const updateRoom = asyncHandler(async (req, res) => {
  const f = filter(req);
  const room = await Room.findOne({ _id: req.validated.params.id, ...f });
  if (!room) throw new AppError("Room not found", 404);

  const { monthlyRent, sharingType, type, amenities } = req.validated.body;
  if (sharingType !== undefined) {
    if (sharingType < room.occupiedBeds) {
      throw new AppError(
        `Cannot reduce capacity to ${sharingType}: room currently has ${room.occupiedBeds} occupied bed(s)`,
        400
      );
    }
    room.capacity = sharingType;
  }
  if (monthlyRent !== undefined) room.monthlyRent = monthlyRent;
  if (type !== undefined) room.roomType = type;
  if (amenities !== undefined) room.amenities = amenities;
  await room.save();
  await occupancyService.syncBedsForRoom(room);
  return success(res, room);
});

export const deleteRoom = asyncHandler(async (req, res) => {
  const f = filter(req);
  const room = await Room.findOne({ _id: req.validated.params.id, ...f });
  if (!room) throw new AppError("Room not found", 404);
  const occupied = await Bed.countDocuments({ ...f, roomId: room._id, occupancyStatus: "occupied" });
  if (occupied > 0) throw new AppError("Cannot delete room with occupied beds", 400);

  await Bed.deleteMany({ ...f, roomId: room._id });
  room.isActive = false;
  await room.save();
  return success(res, { message: "Room deleted" });
});

export const listBeds = asyncHandler(async (req, res) => {
  const query = { ...filter(req) };
  if (req.query.roomId) query.roomId = req.query.roomId;
  const beds = await Bed.find(query)
    .populate("tenantId", "name email")
    .populate("roomId", "roomNumber")
    .sort({ bedNumber: 1 });
  return success(res, beds);
});

export const updateBed = asyncHandler(async (req, res) => {
  const f = filter(req);
  const { status, bedLabel, monthlyRent } = req.validated.body;

  if (status) {
    if (bedLabel !== undefined || monthlyRent !== undefined) {
      throw new AppError("Status changes must be performed separately from label/price updates", 400);
    }
    const bed = await occupancyService.updateBedStatus({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      bedId: req.validated.params.id,
      status,
    });
    return success(res, bed);
  }

  const bed = await Bed.findOneAndUpdate(
    { _id: req.validated.params.id, ...f },
    { ...(bedLabel && { bedLabel }), ...(monthlyRent !== undefined && { monthlyRent }) },
    { new: true }
  );
  if (!bed) throw new AppError("Bed not found", 404);
  return success(res, bed);
});

export const listTenants = asyncHandler(async (req, res) => {
  const query = { ...filter(req) };
  const { search, status } = req.query;

  if (status === "active") query.isActive = true;
  if (status === "inactive") query.isActive = false;
  if (status === "temporary") query.isTemporary = true;

  if (search?.trim()) {
    const term = escapeRegex(search.trim());
    const phoneDigits = normalizePhone(term);
    query.$or = [
      { "personalInfo.name": { $regex: term, $options: "i" } },
      ...(phoneDigits ? [{ "personalInfo.phone": { $regex: phoneDigits } }] : []),
    ];
  }

  const tenants = await Tenant.find(query)
    .populate("hostelId", "name")
    .populate("floorId", "name level")
    .populate("roomId", "roomNumber floor")
    .populate("bedId", "bedLabel status")
    .sort({ createdAt: -1 });
  return success(res, tenants);
});

export const getTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOne({ _id: req.validated.params.id, ...filter(req) })
    .populate("hostelId", "name")
    .populate("floorId", "name level")
    .populate("roomId", "roomNumber floor")
    .populate("bedId", "bedLabel status");
  if (!tenant) throw new AppError("Tenant not found", 404);
  return success(res, tenant);
});

export const createTenant = asyncHandler(async (req, res) => {
  const f = filter(req);
  const {
    name,
    email,
    phone,
    emergencyContact,
    floorId,
    roomId,
    bedId,
    monthlyRent,
    joinDate,
  } = req.validated.body;

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length < 10) {
    throw new AppError("Enter a valid 10-digit mobile number", 400);
  }

  const ownerClash = await Owner.findOne({ email: normalizedEmail });
  if (ownerClash) throw new AppError("Email is already used by a hostel owner", 409);

  const existsEmail = await Tenant.findOne({
    "personalInfo.email": normalizedEmail,
    ownerId: f.ownerId,
    hostelId: f.hostelId,
  });
  if (existsEmail) throw new AppError("Tenant email already exists in this hostel", 409);

  const existsPhone = await Tenant.findOne({ "personalInfo.phone": normalizedPhone });
  if (existsPhone) throw new AppError("Tenant already registered with this number", 409);

  const [floor, room, bed] = await Promise.all([
    Floor.findOne({ _id: floorId, ...f }),
    Room.findOne({ _id: roomId, ...f }),
    Bed.findOne({ _id: bedId, ...f }),
  ]);
  if (!floor) throw new AppError("Floor not found", 404);
  if (!room) throw new AppError("Room not found", 404);
  if (!bed) throw new AppError("Bed not found", 404);
  if (room.floorId?.toString() !== floorId) throw new AppError("Room does not belong to the selected floor", 400);
  if (bed.roomId?.toString() !== roomId) throw new AppError("Bed does not belong to the selected room", 400);
  if (bed.status !== "available" || bed.tenantId) throw new AppError("Bed is already occupied", 409);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [created] = await Tenant.create(
      [
        {
          ...f,
          name: name.trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
          emergencyContact,
          floorId,
          roomId,
          bedId,
          monthlyRent: monthlyRent ?? 0,
          joinDate: joinDate ?? new Date(),
        },
      ],
      { session }
    );
    let result = created;

    const assigned = await occupancyService.assignTenantToBed({
      ownerId: f.ownerId,
      hostelId: f.hostelId,
      tenantId: result._id,
      bedId,
      session,
    });
    result = assigned.tenant;

    await ensureTenantRentInvoices(result, session);

    await session.commitTransaction();
    await logActivity({
      ...f,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "tenant_created",
      entityType: "tenant",
      entityId: result._id,
    });

    const assignedBed = await Bed.findById(bedId);
    emitTenantAssigned(req, result, assignedBed);

    return success(
      res,
      {
        tenant: result,
        message: "Tenant created successfully. They can login using their mobile number and OTP.",
      },
      201
    );
  } catch (e) {
    await session.abortTransaction();
    if (e instanceof AppError) throw e;
    throw new AppError(e.message || "Failed to create tenant", 400);
  } finally {
    session.endSession();
  }
});

export const updateTenant = asyncHandler(async (req, res) => {
  const updates = { ...req.validated.body };
  if (updates.name !== undefined) {
    updates["personalInfo.name"] = updates.name.trim();
    delete updates.name;
  }
  if (updates.phone !== undefined) {
    updates["personalInfo.phone"] = normalizePhone(updates.phone);
    delete updates.phone;
  }
  const tenant = await Tenant.findOneAndUpdate(
    { _id: req.validated.params.id, ...filter(req) },
    { $set: updates },
    { new: true }
  );
  if (!tenant) throw new AppError("Tenant not found", 404);
  return success(res, tenant);
});

export const assignBed = asyncHandler(async (req, res) => {
  const f = filter(req);
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await occupancyService.assignTenantToBed({
      ...f,
      tenantId: req.validated.params.id,
      bedId: req.validated.body.bedId,
      session,
    });

    // Persist isTemporary / preferredSharing if provided
    const { isTemporary, preferredSharing } = req.validated.body;
    if (isTemporary !== undefined || preferredSharing !== undefined) {
      const tenantUpdate = {};
      if (isTemporary !== undefined) tenantUpdate.isTemporary = isTemporary;
      if (preferredSharing !== undefined) tenantUpdate.preferredSharing = preferredSharing;
      await Tenant.findOneAndUpdate(
        { _id: req.validated.params.id, ownerId: f.ownerId, hostelId: f.hostelId },
        { $set: tenantUpdate },
        { session }
      );
    }

    await session.commitTransaction();
    emitTenantAssigned(req, result.tenant, result.bed);
    return success(res, result);
  } catch (e) {
    await session.abortTransaction();
    throw new AppError(e.message, 400);
  } finally {
    session.endSession();
  }
});

export const removeTenant = asyncHandler(async (req, res) => {
  const f = filter(req);
  const tenant = await Tenant.findOne({ _id: req.validated.params.id, ...f });
  if (!tenant) throw new AppError("Tenant not found", 404);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await occupancyService.freeTenantBed(tenant, session);
    tenant.isActive = false;
    await tenant.save({ session });
    await session.commitTransaction();
  } catch (e) {
    await session.abortTransaction();
    throw e instanceof AppError ? e : new AppError("Failed to remove tenant", 400);
  } finally {
    session.endSession();
  }

  await logActivity({
    ...f,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "tenant_removed",
    entityType: "tenant",
    entityId: tenant._id,
  });

  emitTenantRemoved(req, tenant);
  return success(res, { message: "Tenant removed and bed freed" });
});

export const listComplaints = asyncHandler(async (req, res) => {
  const query = { ...filter(req) };
  const { status, search } = req.query;

  if (status === "in_progress") {
    query.status = { $in: ["in_progress", "assigned"] };
  } else if (status) {
    query.status = status;
  }

  if (search?.trim()) {
    const safeSearch = escapeRegex(search.trim());
    const tenants = await Tenant.find({
      ...filter(req),
      "personalInfo.name": { $regex: safeSearch, $options: "i" },
    }).select("_id");
    query.$or = [
      { description: { $regex: safeSearch, $options: "i" } },
      { title: { $regex: safeSearch, $options: "i" } },
      { category: { $regex: safeSearch, $options: "i" } },
      ...(tenants.length ? [{ tenantId: { $in: tenants.map((t) => t._id) } }] : []),
    ];
  }

  const complaints = await Complaint.find(query)
    .populate("tenantId", "name email phone roomId")
    .populate("roomId", "roomNumber")
    .sort({ createdAt: -1 });
  return success(res, complaints);
});

export const updateComplaint = asyncHandler(async (req, res) => {
  const f = filter(req);
  const complaint = await Complaint.findOne({ _id: req.validated.params.id, ...f });
  if (!complaint) throw new AppError("Complaint not found", 404);

  const { status, priority, assignedTo, note } = req.validated.body;
  if (status && status !== complaint.status) {
    complaint.statusHistory.push({
      status,
      note: note ?? `Status changed to ${status}`,
      changedBy: req.user.id,
      changedByRole: req.user.role,
    });
    complaint.status = status;
    if (status === "resolved") complaint.resolvedAt = new Date();
  }
  if (priority) {
    complaint.priority = priority;
    complaint.slaDueAt = getSlaDueAt(priority);
  }
  if (assignedTo !== undefined) complaint.assignedTo = assignedTo;
  await complaint.save();

  const populated = await Complaint.findById(complaint._id)
    .populate("tenantId", "name email phone roomId")
    .populate("roomId", "roomNumber");

  const io = req.app.get("io");
  if (io) {
    io.to(`hostel_${complaint.hostelId}`).emit("complaint_updated", populated);
  }

  return success(res, populated);
});

export const listPayments = asyncHandler(async (req, res) => {
  const f = filter(req);
  await syncHostelPaymentStatuses(f.ownerId, f.hostelId);

  const query = { ...f };
  const { status, search } = req.query;

  if (status) query.status = status;

  if (search?.trim()) {
    const safeSearch = escapeRegex(search.trim());
    const tenants = await Tenant.find({
      ...filter(req),
      "personalInfo.name": { $regex: safeSearch, $options: "i" },
    }).select("_id");
    if (tenants.length) {
      query.tenantId = { $in: tenants.map((t) => t._id) };
    } else {
      return success(res, []);
    }
  }

  const payments = await Payment.find(query)
    .populate({
      path: "tenantId",
      select: "name email phone monthlyRent",
      populate: [
        { path: "roomId", select: "roomNumber" },
        { path: "floorId", select: "level name" },
        { path: "bedId", select: "bedLabel" },
      ],
    })
    .sort({ dueDate: -1 });
  return success(res, payments);
});

export const createPayment = asyncHandler(async (req, res) => {
  const f = filter(req);
  const { tenantId, amount, fineAmount, month, year, dueDate, notes } = req.validated.body;
  const tenant = await Tenant.findOne({ _id: tenantId, ...f, isActive: true });
  if (!tenant) throw new AppError("Tenant not found", 404);

  const totalAmount = amount + (fineAmount ?? 0);
  const payment = await Payment.create({
    ...f,
    tenantId,
    amount,
    fineAmount: fineAmount ?? 0,
    totalAmount,
    month,
    year,
    dueDate,
    notes,
    status: "unpaid",
  });
  return success(res, payment, 201);
});

export const updatePayment = asyncHandler(async (req, res) => {
  const f = filter(req);
  const payment = await Payment.findOne({ _id: req.validated.params.id, ...f });
  if (!payment) throw new AppError("Payment not found", 404);

  const updates = req.validated.body;
  // Manual owner mark-paid defaults to cash unless explicitly provided
  if (updates.status === "paid" && !updates.paymentMethod) {
    updates.paymentMethod = "cash";
  }
  if (updates.status === "paid" && !updates.paidDate) {
    updates.paidDate = new Date();
  }
  if (updates.fineAmount !== undefined) {
    payment.fineAmount = updates.fineAmount;
    payment.totalAmount = payment.amount + payment.fineAmount;
  }
  Object.assign(payment, updates);
  await payment.save();
  return success(res, payment);
});

export const listNotices = asyncHandler(async (req, res) => {
  const notices = await Notice.find(filter(req)).sort({ createdAt: -1 });
  return success(res, notices);
});

export const createNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.create({ ...filter(req), ...req.validated.body, isActive: true });

  const io = req.app.get("io");
  if (io) {
    io.to(`hostel_${notice.hostelId}`).emit("notice_created", notice);
  }

  return success(res, notice, 201);
});

export const deleteNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.findOneAndDelete({
    _id: req.validated.params.id,
    ...filter(req),
  });
  if (!notice) throw new AppError("Notice not found", 404);
  return success(res, { message: "Notice deleted" });
});

export const getHostel = asyncHandler(async (req, res) => {
  const f = filter(req);
  const hostel = await Hostel.findOne({ ownerId: f.ownerId, _id: f.hostelId });
  if (!hostel) throw new AppError("Hostel not found", 404);
  return success(res, hostel);
});

export const updateHostel = asyncHandler(async (req, res) => {
  const f = filter(req);
  const hostel = await Hostel.findOneAndUpdate(
    { ownerId: f.ownerId, _id: f.hostelId },
    { $set: req.validated.body },
    { new: true, runValidators: true }
  );
  if (!hostel) throw new AppError("Hostel not found", 404);
  return success(res, hostel);
});

export const listBedShiftRequests = asyncHandler(async (req, res) => {
  const requests = await BedShiftRequest.find(filter(req))
    .populate("tenantId", "name email")
    .populate("currentBedId", "bedLabel")
    .sort({ createdAt: -1 });
  return success(res, requests);
});

export const updateBedShiftRequest = asyncHandler(async (req, res) => {
  const f = filter(req);
  const request = await BedShiftRequest.findOne({ _id: req.validated.params.id, ...f });
  if (!request) throw new AppError("Request not found", 404);

  const { status, ownerNote } = req.validated.body;
  if (!["approved", "rejected"].includes(status)) {
    throw new AppError("Invalid status", 400);
  }

  if (status === "approved") {
    const tenant = await Tenant.findOne({ _id: request.tenantId, ...f });
    if (!tenant) throw new AppError("Tenant not found", 404);

    const availableBed = await Bed.findOne({ roomId: request.requestedRoomId, ...f, occupancyStatus: "available" });
    if (!availableBed) throw new AppError("No available beds in the requested room", 400);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await occupancyService.assignTenantToBed({
        ownerId: f.ownerId,
        hostelId: f.hostelId,
        tenantId: tenant._id,
        bedId: availableBed._id,
        session,
      });
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw new AppError(err.message || "Failed to shift tenant to new bed", 400);
    } finally {
      session.endSession();
    }
  }

  request.status = status;
  request.ownerNote = ownerNote;
  await request.save();
  return success(res, request);
});

export const getTenantHistory = asyncHandler(async (req, res) => {
  const f = filter(req);
  const history = await RoomAssignmentHistory.find({
    tenantId: req.validated.params.id,
    ownerId: f.ownerId,
    hostelId: f.hostelId,
  })
    .populate("floorId", "floorName level")
    .populate("roomId", "roomNumber")
    .populate("bedId", "bedNumber bedLabel")
    .sort({ date: -1 });
  return success(res, history);
});

export const listManagers = asyncHandler(async (req, res) => {
  const managers = await Owner.find({
    ownerId: req.user.id,
    role: "manager",
    isActive: true,
  }).sort({ createdAt: -1 });
  return success(res, managers);
});

export const createManager = asyncHandler(async (req, res) => {
  const { name, email, password, phone, hostelId } = req.validated.body;

  const normalizedEmail = email.trim().toLowerCase();
  const exists = await Owner.findOne({ email: normalizedEmail });
  if (exists) throw new AppError("Email already registered", 409);

  const hostel = await Hostel.findOne({ _id: hostelId, ownerId: req.user.id });
  if (!hostel) throw new AppError("Hostel not found", 404);

  const manager = await Owner.create({
    name: name.trim(),
    email: normalizedEmail,
    password,
    phone: phone?.trim(),
    role: "manager",
    ownerId: req.user.id,
    hostelId,
    isActive: true,
  });

  return success(res, {
    message: "Manager created successfully",
    manager: { id: manager._id, name: manager.name, email: manager.email, role: manager.role },
  }, 201);
});

export const deleteManager = asyncHandler(async (req, res) => {
  const manager = await Owner.findOneAndUpdate(
    { _id: req.validated.params.id, ownerId: req.user.id, role: "manager" },
    { isActive: false },
    { new: true }
  );
  if (!manager) throw new AppError("Manager not found", 404);
  return success(res, { message: "Manager deleted successfully" });
});
