/**
 * Auth service facade.
 *
 * The implementation lives in `./auth/` (ownerAuth, tenantAuth, sessions,
 * helpers). This file re-exports every public function so existing consumers
 * (`authController`, `tenantController`, `ownerController`) keep working
 * unchanged.
 */
export * from "./auth/ownerAuth.js";
export * from "./auth/tenantAuth.js";
export * from "./auth/sessions.js";
