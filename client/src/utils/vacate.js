/**
 * Vacate-action gating for the tenant list.
 *
 * A tenant can ONLY be vacated through an approved vacate request whose approved
 * vacating date has arrived (the request already satisfies the minimum 15-day
 * advance notice). The Vacate action is therefore available only in that case —
 * for tenants with no request, a pending/rejected request, or an approved request
 * whose date hasn't arrived, it is disabled. The server enforces the same rule
 * (`vacateService.assertCanVacate`), so this only drives the UI state.
 *
 * Returns { blocked, status, eligibleDate }.
 */
export function getVacateState(tenant) {
  const req = tenant?.vacateRequest;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(new Date());

  if (req?.status === "approved") {
    const eligibleDate = new Date(req.approvedVacateDate || req.requestedVacateDate);
    if (today >= startOfDay(eligibleDate)) {
      return { blocked: false, status: "approved", eligibleDate };
    }
    // Approved but the vacating date hasn't arrived yet.
    return { blocked: true, status: "approved", eligibleDate };
  }

  // No request, or pending / rejected / completed — not eligible to be vacated.
  return { blocked: true, status: req?.status || null, eligibleDate: null };
}
