/**
 * Owner controller facade.
 *
 * Implementation lives in `./owner/` (dashboard, structure, tenants, payments,
 * support). This file re-exports every handler so `ownerRoutes` keeps working
 * unchanged.
 */
export * from "./owner/dashboardController.js";
export * from "./owner/structureController.js";
export * from "./owner/tenantsController.js";
export * from "./owner/paymentsController.js";
export * from "./owner/supportController.js";
export * from "./owner/profileController.js";
