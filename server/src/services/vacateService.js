import { AppError } from "../middleware/error.middleware.js";
import { VacateRequest } from "../models/index.js";
import { TENANT as TENANT_POLICY } from "../utils/constants.js";

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Formats a date for human-readable error messages, e.g. "16 July 2026". */
function formatDate(d) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Vacate-eligibility gate — the ONLY way a tenant may be vacated. Enforced on
 * the backend before any side effect, so it holds even when the API is called
 * directly. Verifies, in order:
 *   1. An approved vacate request exists for this tenant (a request that is
 *      pending, rejected, or already processed/completed does NOT qualify).
 *   2. The request's submission → approved vacating date gap satisfies the
 *      minimum 15 full-day notice (defense-in-depth; createVacateRequest
 *      already enforces this at submission).
 *   3. Today is on or after the approved vacating date.
 *
 * On any failure it throws a 400 and the caller aborts before freeing the bed,
 * starting retention, or triggering reallocation. Returns the approved request
 * when vacating is allowed.
 */
export async function assertCanVacate({ ownerId, hostelId, tenantId }) {
  const request = await VacateRequest.findOne({
    ownerId,
    hostelId,
    tenantId,
    status: "approved",
    isActive: true,
  }).sort({ createdAt: -1 });

  if (!request) {
    throw new AppError(
      "This tenant does not have an approved vacate request. A tenant can only be vacated on or after the approved vacating date of an approved request.",
      400
    );
  }

  const approvedDate = request.approvedVacateDate || request.requestedVacateDate;
  const approvedDay = startOfDay(new Date(approvedDate));

  // Minimum 15 full days between request submission and the approved vacating
  // date. Same start-of-day math as createVacateRequest, so an exactly-15-day
  // notice passes and a shorter one fails.
  const submittedDay = startOfDay(new Date(request.createdAt));
  const noticeDays = Math.ceil((approvedDay - submittedDay) / 86400000);
  if (noticeDays < TENANT_POLICY.VACATE_MIN_NOTICE_DAYS) {
    throw new AppError(
      `The vacate request does not meet the minimum ${TENANT_POLICY.VACATE_MIN_NOTICE_DAYS}-day notice period between submission and the vacating date.`,
      400
    );
  }

  const today = startOfDay(new Date());
  if (today < approvedDay) {
    throw new AppError(
      `This tenant's vacate request is approved for ${formatDate(approvedDate)}. ` +
        "Vacating can only be completed on or after that date.",
      400
    );
  }

  return request;
}

/**
 * Mark the tenant's approved vacate request as completed — called once the
 * admin has actually completed the vacating process (bed released, tenant
 * deactivated). Runs inside the caller's transaction when `session` is given.
 */
export async function completeVacateRequest({ ownerId, hostelId, tenantId, session }) {
  const opts = session ? { session } : {};
  await VacateRequest.updateOne(
    { ownerId, hostelId, tenantId, status: "approved", isActive: true },
    { $set: { status: "completed", isActive: true } },
    opts
  );
}

/**
 * Revert a completed vacate request back to "approved" — used by undo-vacate
 * when a tenant is restored, so the admin can still complete the vacating on
 * or after the approved date.
 */
export async function reopenVacateRequest({ ownerId, hostelId, tenantId }) {
  await VacateRequest.updateOne(
    { ownerId, hostelId, tenantId, status: "completed" },
    { $set: { status: "approved", isActive: true } }
  );
}
