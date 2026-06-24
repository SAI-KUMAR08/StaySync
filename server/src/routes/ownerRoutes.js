import { Router } from "express";
import { authenticate, authorize, ownerScope } from "../middleware/auth.js";
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
  createExpenseSchema,
  updateExpenseSchema,
} from "../validators/resources.js";

const router = Router();

// Shared Owner & Manager routes
router.use(authenticate, authorize("owner", "manager"), ownerScope);

router.get("/dashboard", owner.getDashboard);
router.get("/occupancy", owner.getOccupancy);
router.get("/hostel", owner.getHostel);
router.get("/structure", owner.getHostelStructure);

router.get("/floors", owner.listFloors);
router.post("/floors", validate(floorSchema), owner.createFloor);

router.get("/rooms", owner.listRooms);
router.get("/beds", owner.listBeds);

router.get("/tenants", owner.listTenants);
router.get("/tenants/:id", owner.getTenant);
router.get("/tenants/:id/history", owner.getTenantHistory);
router.post("/tenants", validate(tenantCreateSchema), owner.createTenant);
router.patch("/tenants/:id", validate(tenantUpdateSchema), owner.updateTenant);
router.post("/tenants/:id/assign-bed", validate(assignBedSchema), owner.assignBed);
router.delete("/tenants/:id", validate(idParamSchema), owner.removeTenant);

router.get("/complaints", owner.listComplaints);
router.patch("/complaints/:id", validate(complaintUpdateSchema), owner.updateComplaint);

router.get("/payments", owner.listPayments);

router.get("/notices", owner.listNotices);
router.post("/notices", validate(noticeSchema), owner.createNotice);
router.delete("/notices/:id", validate(idParamSchema), owner.deleteNotice);

router.get("/bed-shift-requests", owner.listBedShiftRequests);
router.patch("/bed-shift-requests/:id", owner.updateBedShiftRequest);

// STRICTLY OWNER-ONLY ROUTES (financial updates + managers + setup)
const restrictToOwner = (req, res, next) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ success: false, message: "Forbidden: Owner access required" });
  }
  next();
};

router.get("/hostels", restrictToOwner, owner.listHostels);
router.post("/hostels", restrictToOwner, validate(hostelCreateSchema), owner.createHostel);
router.patch("/hostel", restrictToOwner, owner.updateHostel);
router.post("/setup", restrictToOwner, owner.setupHostel);

router.patch("/rooms/:id", restrictToOwner, validate(roomUpdateSchema), owner.updateRoom);
router.delete("/rooms/:id", restrictToOwner, validate(idParamSchema), owner.deleteRoom);

router.patch("/beds/:id", restrictToOwner, validate(bedUpdateSchema), owner.updateBed);

router.post("/payments", restrictToOwner, validate(paymentCreateSchema), owner.createPayment);
router.patch("/payments/:id", restrictToOwner, validate(paymentUpdateSchema), owner.updatePayment);

// Expenses
router.get("/expenses", restrictToOwner, expenseCtrl.listExpenses);
router.get("/expenses/summary", restrictToOwner, expenseCtrl.getExpenseSummary);
router.get("/expenses/:id", restrictToOwner, expenseCtrl.getExpense);
router.post("/expenses", restrictToOwner, validate(createExpenseSchema), expenseCtrl.createExpense);
router.patch("/expenses/:id", restrictToOwner, validate(updateExpenseSchema), expenseCtrl.updateExpense);
router.delete("/expenses/:id", restrictToOwner, validate(idParamSchema), expenseCtrl.deleteExpense);

// Managers Management
router.get("/managers", restrictToOwner, owner.listManagers);
router.post("/managers", restrictToOwner, owner.createManager);
router.delete("/managers/:id", restrictToOwner, owner.deleteManager);

export default router;
