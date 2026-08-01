import mongoose from "mongoose";
import { Tenant, Bed, TemporaryAllotmentRequest } from "../models/index.js";
import { assignTenantToBed, selectRandomAvailableBedForType } from "./occupancyService.js";

/**
 * Waiting queue for temporarily-allotted tenants who have requested a permanent
 * room type. First requested, first served.
 */

/**
 * Create a waiting request for a temporary tenant (if one isn't already active).
 * Enforced at the DB level by a partial unique index on `{ tenantId, status: "waiting" }`.
 */
export async function enqueueTemporaryAllotment({
  ownerId,
  hostelId,
  tenantId,
  requestedSharingType,
  tempRoomId,
  tempBedId,
  session,
}) {
  if (!requestedSharingType) return null;
  const dbOpts = session ? { session } : {};

  const existing = await TemporaryAllotmentRequest.findOne({ tenantId, status: "waiting" }).session(
    session || null
  );
  if (existing) return existing;

  try {
    const [req] = await TemporaryAllotmentRequest.create(
      [
        {
          ownerId,
          hostelId,
          tenantId,
          requestedSharingType,
          tempRoomId: tempRoomId || null,
          tempBedId: tempBedId || null,
          status: "waiting",
        },
      ],
      dbOpts
    );
    return req;
  } catch (err) {
    // Race lost on the unique index — an active request already exists.
    if (err?.code === 11000) return null;
    throw err;
  }
}

/** Room sharing-types (capacities) that currently have at least one available position. */
async function getAvailableTypes(ownerId, hostelId, session) {
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
        $expr: { $lt: ["$room.occupiedBeds", "$room.capacity"] },
      },
    },
    { $group: { _id: "$room.capacity" } },
  ]).session(session || null);
  return rows.map((r) => r._id);
}

/** One pass inside a transaction: serve FIFO waiting requests while positions exist. */
async function processPass({ ownerId, hostelId, session, io }) {
  let total = 0;
  let guard = 0;
  while (guard < 100) {
    guard++;
    let madeProgress = false;

    const types = await getAvailableTypes(ownerId, hostelId, session);
    for (const type of types) {
      // Earliest waiting request for this room type (time, then request id).
      const req = await TemporaryAllotmentRequest.findOne({
        ownerId,
        hostelId,
        status: "waiting",
        requestedSharingType: type,
      })
        .sort({ requestedAt: 1, _id: 1 })
        .session(session);
      if (!req) continue;

      const tenant = await Tenant.findOne({
        _id: req.tenantId,
        ownerId,
        hostelId,
        isActive: true,
      }).session(session);
      if (!tenant) {
        // Tenant no longer active — cancel the stale request and move on.
        req.status = "cancelled";
        await req.save({ session });
        madeProgress = true;
        continue;
      }

      const candidate = await selectRandomAvailableBedForType({
        ownerId,
        hostelId,
        sharingType: type,
        session,
      });
      if (!candidate) continue; // position vanished — try the next type

      // Allocate transactionally (frees the tenant's temp bed, claims the new one).
      await assignTenantToBed({
        ownerId,
        hostelId,
        tenantId: tenant._id,
        bedId: candidate._id,
        session,
      });

      // Release the temporary allotment and mark the tenant permanent.
      await Tenant.updateOne(
        { _id: tenant._id },
        {
          $set: {
            isTemporary: false,
            preferredSharing: null,
            temporaryAllotmentDate: null,
            permanentTargetBedId: null,
            needsReassignment: false,
          },
        },
        { session }
      );

      req.status = "completed";
      req.completedAt = new Date();
      await req.save({ session });

      total++;
      madeProgress = true;

      // The shift changed beds/rooms — broadcast so open views (structure,
      // tenant list, waiting queue) refresh in real time.
      if (io && hostelId) {
        io.to(`hostel_${hostelId}`).emit("tenant_assigned", {
          hostelId,
          tenantId: tenant._id,
          tenantName: tenant.personalInfo?.name || tenant.name,
          message: `${tenant.personalInfo?.name || "A tenant"} moved to a ${type}-sharing room.`,
        });
        io.to(`hostel_${hostelId}`).emit("occupancy_update", {
          hostelId,
          at: Date.now(),
        });
      }

      break; // positions changed — re-scan to pick up the freed temp bed (cascade)
    }

    if (!madeProgress) break;
  }
  return total;
}

/**
 * Serve the waiting queue: whenever a room/bed becomes available, the earliest
 * waiting request for that room type is shifted automatically. Runs in its own
 * transaction and retries on write conflicts. Pass `io` (the socket.io server)
 * to broadcast the shift to the hostel room in real time.
 */
export async function processWaitingQueue({ ownerId, hostelId, io }) {
  if (!ownerId || !hostelId) return 0;

  for (let attempt = 0; attempt < 4; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const processed = await processPass({ ownerId, hostelId, session, io });
      await session.commitTransaction();
      return processed;
    } catch (err) {
      await session.abortTransaction();
      // Concurrent allocation raced us — retry with a fresh snapshot.
      if (err?.codeName === "WriteConflict" || err?.code === 112) continue;
      console.error("[tempAllotmentService] processWaitingQueue failed:", err?.message || err);
      return 0;
    } finally {
      session.endSession();
    }
  }
  return 0;
}
