import { Router } from "express";
import { authenticate, authorize, ownerScope, requirePermission } from "../middleware/auth.js";
import { PERMISSIONS } from "../config/permissions.js";
import { validate } from "../middleware/validate.js";
import * as owner from "../controllers/ownerController.js";
import * as expenseCtrl from "../controllers/expenseController.js";
import {
  floorSchema,
  roomSchema,
  roomUpdateSchema,
  bedUpdateSchema,
  tenantCreateSchema,
  tenantUpdateSchema,
  assignBedSchema,
  complaintUpdateSchema,
  paymentCreateSchema,
  paymentUpdateSchema,
  noticeSchema,
  idParamSchema,
  hostelCreateSchema,
  hostelUpdateSchema,
  createManagerSchema,
  bedShiftUpdateSchema,
  createExpenseSchema,
  updateExpenseSchema,
} from "../validators/resources.js";

const router = Router();

// Shared Owner & Manager routes
router.use(authenticate, authorize("owner", "manager"), ownerScope);

// ── Dashboard & Overview ─────────────────────────────────
router.get("/dashboard", requirePermission(PERMISSIONS.READ_DASHBOARD), owner.getDashboard);
router.get("/financial-overview", requirePermission(PERMISSIONS.READ_DASHBOARD), owner.getFinancialOverview);
router.get("/occupancy", requirePermission(PERMISSIONS.READ_OCCUPANCY), owner.getOccupancy);
router.get("/hostel", requirePermission(PERMISSIONS.READ_HOSTEL), owner.getHostel);
router.get("/structure", requirePermission(PERMISSIONS.READ_HOSTEL), owner.getHostelStructure);

// ── Floors ───────────────────────────────────────────────
router.get("/floors", requirePermission(PERMISSIONS.READ_ROOMS), owner.listFloors);
router.post("/floors", requirePermission(PERMISSIONS.CREATE_ROOMS), validate(floorSchema), owner.createFloor);

// ── Rooms & Beds ─────────────────────────────────────────
router.get("/rooms", requirePermission(PERMISSIONS.READ_ROOMS), owner.listRooms);
router.get("/beds", requirePermission(PERMISSIONS.READ_BEDS), owner.listBeds);
router.patch("/rooms/:id", requirePermission(PERMISSIONS.UPDATE_ROOMS), validate(roomUpdateSchema), owner.updateRoom);
router.delete("/rooms/:id", requirePermission(PERMISSIONS.DELETE_ROOMS), validate(idParamSchema), owner.deleteRoom);
router.patch("/beds/:id", requirePermission(PERMISSIONS.UPDATE_BEDS), validate(bedUpdateSchema), owner.updateBed);

// ── Tenants ──────────────────────────────────────────────
router.get("/tenants", requirePermission(PERMISSIONS.READ_TENANTS), owner.listTenants);
router.get("/tenants/:id", requirePermission(PERMISSIONS.READ_TENANTS), validate(idParamSchema), owner.getTenant);
router.get("/tenants/:id/history", requirePermission(PERMISSIONS.READ_TENANTS), validate(idParamSchema), owner.getTenantHistory);
router.post("/tenants", requirePermission(PERMISSIONS.CREATE_TENANTS), validate(tenantCreateSchema), owner.createTenant);
router.patch("/tenants/:id", requirePermission(PERMISSIONS.UPDATE_TENANTS), validate(tenantUpdateSchema), owner.updateTenant);
router.post("/tenants/:id/assign-bed", requirePermission(PERMISSIONS.UPDATE_TENANTS), validate(assignBedSchema), owner.assignBed);
router.delete("/tenants/:id", requirePermission(PERMISSIONS.DELETE_TENANTS), validate(idParamSchema), owner.removeTenant);

// ── Complaints ───────────────────────────────────────────
router.get("/complaints", requirePermission(PERMISSIONS.READ_COMPLAINTS), owner.listComplaints);
router.patch("/complaints/:id", requirePermission(PERMISSIONS.UPDATE_COMPLAINTS), validate(complaintUpdateSchema), owner.updateComplaint);

// ── Payments ─────────────────────────────────────────────
router.get("/payments", requirePermission(PERMISSIONS.READ_PAYMENTS), owner.listPayments);
router.post("/payments", requirePermission(PERMISSIONS.CREATE_PAYMENTS), validate(paymentCreateSchema), owner.createPayment);
router.patch("/payments/:id", requirePermission(PERMISSIONS.UPDATE_PAYMENTS), validate(paymentUpdateSchema), owner.updatePayment);

// ── Notices ──────────────────────────────────────────────
router.get("/notices", requirePermission(PERMISSIONS.READ_NOTICES), owner.listNotices);
router.post("/notices", requirePermission(PERMISSIONS.CREATE_NOTICES), validate(noticeSchema), owner.createNotice);
router.delete("/notices/:id", requirePermission(PERMISSIONS.DELETE_NOTICES), validate(idParamSchema), owner.deleteNotice);

// ── Bed Shift Requests ───────────────────────────────────
router.get("/bed-shift-requests", requirePermission(PERMISSIONS.READ_BED_SHIFT_REQUESTS), owner.listBedShiftRequests);
router.patch("/bed-shift-requests/:id", requirePermission(PERMISSIONS.UPDATE_BED_SHIFT_REQUESTS), validate(bedShiftUpdateSchema), owner.updateBedShiftRequest);

// ── STRICTLY OWNER-ONLY ROUTES ──────────────────────────
// Hostel setup & structure
router.get("/hostels", requirePermission(PERMISSIONS.MANAGE_HOSTEL), owner.listHostels);
router.post("/hostels", requirePermission(PERMISSIONS.MANAGE_HOSTEL), validate(hostelCreateSchema), owner.createHostel);
router.patch("/hostel", requirePermission(PERMISSIONS.UPDATE_HOSTEL), validate(hostelUpdateSchema), owner.updateHostel);
router.post("/setup", requirePermission(PERMISSIONS.MANAGE_HOSTEL), owner.setupHostel);

// Expenses (owner-only financial tracking)
router.get("/expenses", requirePermission(PERMISSIONS.READ_EXPENSES), expenseCtrl.listExpenses);
router.get("/expenses/summary", requirePermission(PERMISSIONS.READ_EXPENSES), expenseCtrl.getExpenseSummary);
router.get("/expenses/:id", requirePermission(PERMISSIONS.READ_EXPENSES), validate(idParamSchema), expenseCtrl.getExpense);
router.post("/expenses", requirePermission(PERMISSIONS.CREATE_EXPENSES), validate(createExpenseSchema), expenseCtrl.createExpense);
router.patch("/expenses/:id", requirePermission(PERMISSIONS.UPDATE_EXPENSES), validate(idParamSchema), validate(updateExpenseSchema), expenseCtrl.updateExpense);
router.delete("/expenses/:id", requirePermission(PERMISSIONS.DELETE_EXPENSES), validate(idParamSchema), expenseCtrl.deleteExpense);

// Managers Management (owner-only)
router.get("/managers", requirePermission(PERMISSIONS.READ_MANAGERS), owner.listManagers);
router.post("/managers", requirePermission(PERMISSIONS.CREATE_MANAGERS), validate(createManagerSchema), owner.createManager);
router.delete("/managers/:id", requirePermission(PERMISSIONS.DELETE_MANAGERS), validate(idParamSchema), owner.deleteManager);

export default router;
