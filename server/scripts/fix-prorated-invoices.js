/* One-time data fix (user-approved): restore the wrongly-prorated first-month
   invoices of ACTIVE tenants back to their original amount.
   - Backs up every affected Payment document to backup-prorated-invoices.json
   - Reconstructs the original amount as tenant.monthlyRent + deposit figure
     recorded in the invoice note (the historical record of what was billed).
   - Strips the "(Prorated checkout: ...)" suffix from notes.
   Run: node scripts/fix-prorated-invoices.js */
import "dotenv/config";
import fs from "node:fs";
import mongoose from "mongoose";
import { Tenant, Payment } from "../src/models/index.js";

const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME || "smart-hostel";

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });

  // Only ACTIVE tenants' prorated invoices get restored.
  const lowPay = await Payment.find({ amount: 161, paymentType: "rent" })
    .select("tenantId amount totalAmount fineAmount paymentMonth year paymentStatus notes")
    .lean();
  const tids = [...new Set(lowPay.map((p) => p.tenantId?.toString()).filter(Boolean))];
  const tenants = await Tenant.find({ _id: { $in: tids } })
    .select("personalInfo.name monthlyRent isActive")
    .lean();
  const tmap = new Map(tenants.map((t) => [t._id.toString(), t]));

  const toFix = lowPay.filter((p) => tmap.get(p.tenantId?.toString())?.isActive);
  if (!toFix.length) {
    console.log("No active-tenant prorated invoices to fix.");
    await mongoose.disconnect();
    return;
  }

  // Backup before any write.
  const backup = toFix.map((p) => ({
    ...p,
    tenant: tmap.get(p.tenantId?.toString())?.personalInfo?.name,
  }));
  fs.writeFileSync("backup-prorated-invoices.json", JSON.stringify(backup, null, 2));
  console.log(`Backup written: backup-prorated-invoices.json (${toFix.length} docs)`);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (const p of toFix) {
      const tenant = tmap.get(p.tenantId?.toString());
      const m = /incl\. security deposit ₹(\d+)/.exec(p.notes || "");
      const deposit = m ? Number(m[1]) : 0;
      const originalAmount = tenant.monthlyRent + deposit;
      const notes = (p.notes || "").replace(/\s*\(Prorated checkout:[^)]*\)/, "");

      await Payment.updateOne(
        { _id: p._id },
        {
          $set: {
            amount: originalAmount,
            totalAmount: originalAmount + (p.fineAmount || 0),
            notes,
          },
        },
        { session }
      );
      console.log(
        `  ${tenant.personalInfo?.name}: ₹${p.amount} -> ₹${originalAmount} (deposit ${deposit})`
      );
    }
    await session.commitTransaction();
    console.log("Committed.");
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }

  // Verify.
  const after = await Payment.find({ _id: { $in: toFix.map((p) => p._id) } })
    .select("amount totalAmount notes")
    .lean();
  for (const a of after)
    console.log(
      `  verified: amount=${a.amount} totalAmount=${a.totalAmount} | ${(a.notes || "").slice(0, 60)}`
    );

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
