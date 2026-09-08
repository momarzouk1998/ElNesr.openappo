// =============================================
// ELNAZLAWY — AppSheet → PostgreSQL Migration
// المصدر: ELNazlawi/current data/*.csv
// الهدف: elnazlawy schema على DigitalOcean
// =============================================
// Usage:
//   DATABASE_URL="postgresql://elnazlawy:***@127.0.0.1:15432/elnazlawy_db" \
//   node --experimental-strip-types --no-warnings=ExperimentalWarning \
//   prisma/migrate-from-appsheet.ts --dry-run
//   ... --apply   لتنفيذ المهاجرة فعلياً
// =============================================
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_appsheet = "D:/OPEN APPS/DigitalOcian Projects/ELNazlawi/current data";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const APPLY = process.argv.includes("--apply");

if (!DRY_RUN && !APPLY) {
  console.error("❌ استخدم --dry-run أو --apply");
  process.exit(1);
}

// وضع خاص: استكمال بعد فشل جزئي (بدون truncate، يبني الـ maps من DB الموجود)
const RESUME = process.argv.includes("--resume");

// ====== CSV Parser بسيط (يتعامل مع الـ quoting) ======
function parseCsv(content: string): { header: string[]; rows: string[][] } {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { header, rows };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { result.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function loadCsv(name: string) {
  const content = readFileSync(join(__dirname_appsheet, name), "utf-8");
  return parseCsv(content);
}

function rowToObj(header: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  header.forEach((h, i) => { obj[h] = row[i] ?? ""; });
  return obj;
}

// ====== Helpers ======
function num(v: string | undefined): number {
  if (!v || v.trim() === "") return 0;
  const n = Number(v.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
function str(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function date(v: string | undefined): Date | null {
  if (!v || v.trim() === "") return null;
  // AppSheet format: M/D/YYYY or M/D/YYYY HH:MM:SS
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mo, d, y] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// ====== Migration maps (legacy_id → new UUID) ======
const userIdMap = new Map<string, number>();      // legacy → int id
const storeIdMap = new Map<string, string>();     // legacy → uuid
const productIdMap = new Map<string, string>();   // legacy → uuid
const customerIdMap = new Map<string, string>();  // legacy → uuid
const supplierIdMap = new Map<string, string>();  // legacy → uuid
const treasuryIdMap = new Map<string, string>();  // legacy → uuid

// ====== Stats ======
const stats: Record<string, number> = {};
const errors: string[] = [];

function track(table: string, n: number) {
  stats[table] = (stats[table] || 0) + n;
  if (DRY_RUN) console.log(`  [dry-run] ${table}: +${n} (total ${stats[table]})`);
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🚀 ELNAZLAWY Migration — Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY"}`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    // في الـ dry-run نستخدم skip الحسابات الحساسة
  }

  // ============ 0. Clean existing (فقط في APPLY mode) ============
  if (APPLY && !RESUME) {
    console.log("🧹 مسح البيانات الحالية (TRUNCATE)...");
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE elnazlawy.audit_log, elnazlawy.treasury_transactions, elnazlawy.product_price_history, elnazlawy.customer_payments, elnazlawy.supplier_payments, elnazlawy.expenses, elnazlawy.purchase_invoice_items, elnesr.purchase_invoices, elnazlawy.sales_invoice_items, elnesr.sales_invoices, elnazlawy.stock_transfers, elnesr.inventory, elnesr.products, elnesr.customers, elnesr.suppliers, elnazlawy.treasuries, elnesr.stores, elnesr.users RESTART IDENTITY CASCADE;`
    );
  }

  // ============ 0b. RESUME mode: إعادة بناء الـ maps من DB الموجود ============
  if (RESUME) {
    console.log("🔄 RESUME mode — إعادة بناء الـ maps من DB الموجود...");
    const users = await prisma.users.findMany({ select: { id: true, username: true } });
    // username → legacyId mapping (reverse)
    const usernameToLegacy: Record<string, string> = {
      openapps: "aa4560", mahmoud: "aa4561", ibrahim: "aa4562", abumahmoud: "aa4563",
    };
    for (const u of users) {
      const legacy = usernameToLegacy[u.username];
      if (legacy) userIdMap.set(legacy, u.id);
    }
    const stores = await prisma.stores.findMany();
    // نحتاج ربط store name → legacy (لأن id الجديد = uuid مختلف عن legacy)
    // نبني map من الـ Stores.csv (legacy_id → name) ثم نربط name → new uuid
    const storesCsv = loadCsv("Stores.csv");
    const legacyStoreName = new Map<string, string>();
    storesCsv.rows.forEach((row) => {
      const o = rowToObj(storesCsv.header, row);
      if (o["Store_Id S"]) legacyStoreName.set(o["Store_Id S"], o["Store_NAM e S"]);
    });
    for (const s of stores) {
      for (const [legacyId, name] of legacyStoreName) {
        if (name === s.name) { storeIdMap.set(legacyId, s.id); break; }
      }
    }
    const treasuries = await prisma.treasuries.findMany();
    for (const t of treasuries) {
      // الخزينة الرئيسية (الوحيدة بأرصدة) → legacy c2f3df96
      if (t.type === "رئيسية" && Number(t.opening_balance) > 0) treasuryIdMap.set("c2f3df96", t.id);
    }
    // محصولات
    const suppliers = await prisma.suppliers.findMany({ select: { id: true, legacy_id: true } });
    for (const s of suppliers) if (s.legacy_id) supplierIdMap.set(s.legacy_id, s.id);
    const customers = await prisma.customers.findMany({ select: { id: true, legacy_id: true } });
    for (const c of customers) if (c.legacy_id) customerIdMap.set(c.legacy_id, c.id);
    const products = await prisma.products.findMany({ select: { id: true, legacy_id: true } });
    for (const p of products) if (p.legacy_id) productIdMap.set(p.legacy_id, p.id);
    console.log(`  ↳ users: ${userIdMap.size}, stores: ${storeIdMap.size}, products: ${productIdMap.size}, customers: ${customerIdMap.size}, suppliers: ${supplierIdMap.size}, treasuries: ${treasuryIdMap.size}`);
  }

  // ============ 1. Users ============
  console.log("\n👤 1. Users...");
  {
    const { header, rows } = loadCsv("User.csv");
    const pwdHash = APPLY ? await bcrypt.hash("123456", 10) : "dummy-hash";
    for (const row of rows) {
      const o = rowToObj(header, row);
      const legacyId = o["User_Id U"];
      const fullName = str(o["User_NAM e U"]);
      if (!legacyId || !fullName) continue;
      const roleRaw = (o["Role U"] || "").trim();
      const position = (o["Position U"] || "").trim();
      // role mapping: ادمن→admin، مدير→manager، محاسب→accountant، else→rep
      let role = "rep";
      if (roleRaw === "ادمن" || position === "Manager" && roleRaw === "ادمن") role = "admin";
      else if (roleRaw === "مدير") role = "manager";
      else if (roleRaw === "محاسب") role = "accountant";
      // can_see_cost: admin + manager بس
      const canSeeCost = role === "admin" || role === "manager";
      // username: من legacy id (aa4560 → openapps mapping خاص)
      let username = legacyId;
      // mapping خاص للمستخدمين المعروفين
      if (legacyId === "aa4560") username = "openapps";
      else if (legacyId === "aa4561") username = "mahmoud";
      else if (legacyId === "aa4562") username = "ibrahim";
      else if (legacyId === "aa4563") username = "abumahmoud";

      track("users", 1);
      if (APPLY) {
        const u = await prisma.users.create({
          data: {
            username,
            full_name: fullName,
            phone: str(o["Phone Number U"]),
            whatsapp: str(o["Whatsapp Number U"]),
            email: str(o["Email U"]),
            password_hash: pwdHash,
            role,
            can_see_cost: canSeeCost,
            is_active: true,
          },
        });
        userIdMap.set(legacyId, u.id);
      } else {
        // dry-run: نحط id وهمي
        userIdMap.set(legacyId, Math.floor(Math.random() * 1000));
      }
    }
  }

  // ============ 2. Stores ============
  console.log("\n🏢 2. Stores...");
  {
    const { header, rows } = loadCsv("Stores.csv");
    for (const row of rows) {
      const o = rowToObj(header, row);
      const legacyId = o["Store_Id S"];
      const name = str(o["Store_NAM e S"]);
      if (!legacyId || !name) continue;
      const typeRaw = (o["Type S"] || "").trim();
      let type = "store";
      if (typeRaw.includes("محل")) type = "showroom";
      else if (typeRaw.includes("سيارة") || typeRaw.includes("عربية")) type = "vehicle";
      // assigned rep (للعربيات)
      const assignedLegacy = str(o["Assigned_Rep"]);
      const assignedUserId = assignedLegacy ? userIdMap.get(assignedLegacy) : null;
      track("stores", 1);
      if (APPLY) {
        const s = await prisma.stores.create({
          data: {
            // Prisma هتولّد UUID تلقائياً (مفيش explicit id)
            name,
            type,
            description: str(o["Description S"]),
            assigned_user_id: assignedUserId ?? null,
            is_active: true,
          },
        });
        storeIdMap.set(legacyId, s.id);
      } else {
        storeIdMap.set(legacyId, crypto.randomUUID());
      }
    }
  }

  // ============ 3. Treasuries ============
  console.log("\n🏦 3. Treasuries...");
  {
    const { header, rows } = loadCsv("Treasury.csv");
    for (const row of rows) {
      const o = rowToObj(header, row);
      const legacyId = o["Treasury_Id T"];
      const name = str(o["Treasury_NAM e T"]);
      if (!legacyId || !name) continue;
      const typeRaw = (o["Type T"] || "").trim();
      let type = "رئيسية";
      if (typeRaw.includes("عهدة") || typeRaw.includes("عربية")) type = "عهدة عربية";
      else if (typeRaw.includes("إدارة")) type = "إدارة";
      track("treasuries", 1);
      if (APPLY) {
        const t = await prisma.treasuries.create({
          data: {
            name,
            type,
            opening_balance: num(o["Opening_Balance T"]),
            current_balance: num(o["Current_Balance T"]),
            is_active: true,
          },
        });
        treasuryIdMap.set(legacyId, t.id);
      } else {
        treasuryIdMap.set(legacyId, crypto.randomUUID());
      }
    }
    // إضافة 3 خزائن مفقودة (عهدة عربية كبيرة، عهدة عربية صغيرة، خزينة الإدارة)
    const extraTreasuries = [
      { name: "عهدة عربية كبيرة", type: "عهدة عربية" },
      { name: "عهدة عربية صغيرة", type: "عهدة عربية" },
      { name: "خزينة الإدارة", type: "إدارة" },
    ];
    for (const et of extraTreasuries) {
      track("treasuries", 1);
      if (APPLY) {
        const t = await prisma.treasuries.create({
          data: { name: et.name, type: et.type, opening_balance: 0, current_balance: 0, is_active: true },
        });
        // map بأسماء وهمية عشان نقدر نربط
        treasuryIdMap.set(`__extra_${et.name}`, t.id);
      }
    }
  }

  // ============ 4. Suppliers ============
  console.log("\n🏭 4. Suppliers...");
  {
    const { header, rows } = loadCsv("Supplier.csv");
    for (const row of rows) {
      const o = rowToObj(header, row);
      const legacyId = o["Supplier_Id SU"];
      const name = str(o["Supplier_NAM e SU"]);
      if (!legacyId || !name) continue; // تخطي الصفوف الفاضية
      track("suppliers", 1);
      if (APPLY) {
        const s = await prisma.suppliers.create({
          data: {
            legacy_id: legacyId,
            name,
            phone: str(o["Phone SU"]),
            address: str(o["Address SU"]),
            opening_balance: num(o["Opening_Balance S"]),
            balance: num(o["Supplier_Balance"]),
            is_active: true,
          },
        });
        supplierIdMap.set(legacyId, s.id);
      } else {
        supplierIdMap.set(legacyId, crypto.randomUUID());
      }
    }
  }

  // ============ 5. Customers ============
  console.log("\n👥 5. Customers...");
  {
    const { header, rows } = loadCsv("Customer.csv");
    for (const row of rows) {
      const o = rowToObj(header, row);
      const legacyId = o["Customer_Id C"];
      const name = str(o["Customer_NAM e C"]);
      if (!legacyId || !name) continue;
      // route_days: comma-separated → array
      const routeRaw = str(o["Route_Days"]) || "";
      const routeDays = routeRaw.split(",").map((d) => d.trim()).filter(Boolean);
      track("customers", 1);
      if (APPLY) {
        const c = await prisma.customers.create({
          data: {
            legacy_id: legacyId,
            name,
            phone: str(o["Phone C"]),
            whatsapp: str(o["Whatsapp C"]),
            address: str(o["Address C"]),
            location: str(o["Location C"]),
            opening_balance: num(o["Opening_Balance C"]),
            balance: num(o["Customer_Balance"]),
            route_days: routeDays,
            is_active: true,
          },
        });
        customerIdMap.set(legacyId, c.id);
      } else {
        customerIdMap.set(legacyId, crypto.randomUUID());
      }
    }
  }

  // ============ 6. Products (مع دمج المكررات) ============
  console.log("\n🏷️ 6. Products (مع دمج المكررات)...");
  // المكررات الـ 4 أزواج (من MIGRATION_PLAN 1.10) — المُحتفظ → المُحذوف
  const duplicateKeep = new Set(["a0b82dd3", "d465a2e2", "f193a943", "d6d8673e"]);
  const duplicateMerge: Record<string, string> = {
    "dc5fd944": "a0b82dd3", // ترنز 400 وات ليد
    "8402f559": "d465a2e2", // ترنز 300 وات ليد
    "b9316138": "f193a943", // قطعه دش اسود فورا
    "5c61fd7f": "d6d8673e", // بريزه خارج قوه فينوس
  };
  {
    const { header, rows } = loadCsv("Product.csv");
    let skippedDup = 0;
    for (const row of rows) {
      const o = rowToObj(header, row);
      const legacyId = o["Product_Id P"];
      const name = str(o["Name P"]);
      if (!legacyId || !name) continue;
      // تخطي المكررات (المحذوفة)
      if (duplicateMerge[legacyId]) { skippedDup++; continue; }
      // normalize unit
      const unitRaw = (o["Unit_Of_Measure P"] || "").trim();
      let unit = "piece";
      if (unitRaw.includes("علب")) unit = "box";
      else if (unitRaw.includes("كرتون")) unit = "carton";
      track("products", 1);
      if (APPLY) {
        const p = await prisma.products.create({
          data: {
            legacy_id: legacyId,
            name,
            description: str(o["Description P"]),
            category: str(o["Category P"]),
            unit,
            units_per_carton: num(o["Units_Per_Carton P"]) || 1,
            last_purchase_price: num(o["Initial_Purchase_Price"]),
            is_active: true,
          },
        });
        productIdMap.set(legacyId, p.id);
      } else {
        productIdMap.set(legacyId, crypto.randomUUID());
      }
    }
    console.log(`  ↳ تم تخطي ${skippedDup} منتج مكرر`);
  }

  // ============ 7. Inventory (بس اللي فيه كمية > 0) ============
  console.log("\n📦 7. Inventory (الكميات > 0 فقط)...");
  {
    const { header, rows } = loadCsv("Inventory.csv");
    let skippedZero = 0;
    for (const row of rows) {
      const o = rowToObj(header, row);
      const qty = num(o["Current_Stock I"]);
      if (qty <= 0) { skippedZero++; continue; } // فلتر: بس اللي فيه كمية
      const legacyProductId = o["Product_Id I"];
      const legacyStoreId = o["Store_Id I"];
      // resolve الـ product id (مع التعامل مع المكررات المدموجة)
      const realProductLegacy = duplicateMerge[legacyProductId] || legacyProductId;
      const productId = productIdMap.get(realProductLegacy);
      const storeId = storeIdMap.get(legacyStoreId);
      if (!productId || !storeId) continue;
      track("inventory", 1);
      if (APPLY) {
        try {
          await prisma.inventory.create({
            data: {
              product_id: productId,
              store_id: storeId,
              current_stock: qty,
              opening_balance: num(o["Opening_Balance I"]),
              reorder_level: num(o["Reorder_Level"]) || 5,
            },
          });
        } catch (e) {
          // سجل سيء — سجّل وتخطّى بدل ما يوقف الباقي
          errors.push(`inventory: product=${legacyProductId} store=${legacyStoreId} — ${(e as Error).message}`);
        }
      }
    }
    console.log(`  ↳ تم تخطي ${skippedZero} صف كمية = 0`);
  }

  // ============ 8. Purchase Invoices + Items ============
  console.log("\n📥 8. Purchase Invoices...");
  {
    const { header: invHeader, rows: invRows } = loadCsv("PurchaseInvoice.csv");
    const { header: itemHeader, rows: itemRows } = loadCsv("PurchaseInvoiceItem.csv");
    // index items by purchase_id
    const itemsByPurchase = new Map<string, any[]>();
    for (const row of itemRows) {
      const o = rowToObj(itemHeader, row);
      const pid = o["Purchase_Id PII"];
      if (!pid) continue;
      if (!itemsByPurchase.has(pid)) itemsByPurchase.set(pid, []);
      itemsByPurchase.get(pid)!.push(o);
    }
    for (const row of invRows) {
      const o = rowToObj(invHeader, row);
      const legacyId = o["Purchase_Id PI"];
      if (!legacyId) continue;
      const supplierId = supplierIdMap.get(o["Supplier_Id PI"]);
      const purchaseNumber = num(o["Purchase_Number PI"]) || 1;
      const totalAmount = num(o["Total_AM ount PI"]);
      const items = itemsByPurchase.get(legacyId) || [];
      track("purchase_invoices", 1);
      if (APPLY) {
        const inv = await prisma.purchase_invoices.create({
          data: {
            purchase_number: purchaseNumber,
            purchase_date: date(o["Purchase_Date PI"]) || new Date(),
            supplier_id: supplierId || null,
            total_amount: totalAmount,
            paid_amount: 0,
            status: "مكتملة",
            notes: str(o["Supp_Purchase N PI"]),
          },
        });
        // items
        for (const it of items) {
          const realProdLegacy = duplicateMerge[it["Product_Id PII"]] || it["Product_Id PII"];
          const productId = productIdMap.get(realProdLegacy);
          if (!productId) continue;
          track("purchase_invoice_items", 1);
          await prisma.purchase_invoice_items.create({
            data: {
              purchase_id: inv.id,
              product_id: productId,
              product_name: str(it["Product_NAM e PII"]) || "غير معروف",
              quantity: num(it["Quantity PII"]),
              unit_cost: num(it["Unit_Cost PII"]),
              line_total: num(it["Total_Cost PII"]),
            },
          });
        }
      } else {
        track("purchase_invoice_items", items.length);
      }
    }
  }

  // ============ 9. Customer Payments ============
  console.log("\n💰 9. Customer Payments...");
  {
    const { header, rows } = loadCsv("CustomerPayment.csv");
    for (const row of rows) {
      const o = rowToObj(header, row);
      const legacyId = o["Payment_Id CP"];
      if (!legacyId) continue;
      const amount = num(o["Actual_AM ount CP"]) || num(o["AM ount CP"]);
      const customerId = customerIdMap.get(o["Customer_Id CP"]);
      // treasury: نحاول نحل من Treasury_Id CP، لو مش موجود نستخدم الخزينة الرئيسية
      const treasuryId = treasuryIdMap.get(o["Treasury_Id CP"]) || [...treasuryIdMap.values()][0];
      const byUserLegacy = o["By_User CP"];
      const byUserId = userIdMap.get(byUserLegacy) || null;
      track("customer_payments", 1);
      if (APPLY) {
        try {
          const cp = await prisma.customer_payments.create({
            data: {
              payment_date: date(o["Date CP"]) || new Date(),
              customer_id: customerId || null,
              amount,
              payment_method: str(o["Payment_Method CP"]) || "نقدي",
              treasury_id: treasuryId || null,
              notes: str(o["Notes CP"]),
              created_by: byUserId,
            },
          });
          // treasury transaction مقابل
          track("treasury_transactions", 1);
          await prisma.treasury_transactions.create({
            data: {
              treasury_id: treasuryId!,
              direction: "in",
              amount,
              reference_type: "customer_payment",
              reference_id: cp.id,
              status: "accepted",
              by_user_id: byUserId,
              transaction_date: date(o["Date CP"]) || new Date(),
            },
          });
        } catch (e) {
          errors.push(`customer_payment: legacy=${legacyId} — ${(e as Error).message}`);
        }
      }
    }
  }

  // ============ 10. Supplier Payments ============
  console.log("\n💸 10. Supplier Payments...");
  {
    const { header, rows } = loadCsv("SupplierPayment.csv");
    for (const row of rows) {
      const o = rowToObj(header, row);
      const legacyId = o["Payment_Id SP"];
      if (!legacyId) continue;
      const amount = num(o["Actual_Amount SP"]) || num(o["Amount SP"]);
      const supplierId = supplierIdMap.get(o["Supplier_Id SP"]);
      const treasuryId = treasuryIdMap.get(o["Treasury_Id SP"]) || [...treasuryIdMap.values()][0];
      track("supplier_payments", 1);
      if (APPLY) {
        try {
          const sp = await prisma.supplier_payments.create({
            data: {
              payment_date: date(o["Payment_Date SP"]) || new Date(),
              supplier_id: supplierId || null,
              amount,
              payment_method: str(o["Payment_Method SP"]) || "نقدي",
              treasury_id: treasuryId || null,
              notes: str(o["Notes SP"]),
            },
          });
          track("treasury_transactions", 1);
          await prisma.treasury_transactions.create({
            data: {
              treasury_id: treasuryId!,
              direction: "out",
              amount,
              reference_type: "supplier_payment",
              reference_id: sp.id,
              status: "accepted",
              transaction_date: date(o["Payment_Date SP"]) || new Date(),
            },
          });
        } catch (e) {
          errors.push(`supplier_payment: legacy=${legacyId} — ${(e as Error).message}`);
        }
      }
    }
  }

  // ============ 11. Expenses ============
  console.log("\n📉 11. Expenses...");
  {
    const { header, rows } = loadCsv("Expense.csv");
    for (const row of rows) {
      const o = rowToObj(header, row);
      const legacyId = o["Expense_Id E"];
      if (!legacyId) continue;
      const amount = num(o["Actual_AM ount E"]) || num(o["AM ount E"]);
      // treasury: ممكن يكون c7b3d869 (مش موجود في Treasury.csv) — نستخدم الرئيسية
      const treasuryId = treasuryIdMap.get(o["Treasury_Id E"]) || [...treasuryIdMap.values()][0];
      track("expenses", 1);
      if (APPLY) {
        try {
          const e = await prisma.expenses.create({
            data: {
              expense_date: date(o["Date E"]) || new Date(),
              category: str(o["Category E"]) || "أخرى",
              description: str(o["User NAM e E"]) || str(o["Notes E"]) || "مصروف",
              amount,
              payment_method: "نقدي",
              treasury_id: treasuryId || null,
              notes: str(o["Notes E"]),
            },
          });
          track("treasury_transactions", 1);
          await prisma.treasury_transactions.create({
            data: {
              treasury_id: treasuryId!,
              direction: "out",
              amount,
              reference_type: "expense",
              reference_id: e.id,
              status: "accepted",
              transaction_date: date(o["Date E"]) || new Date(),
            },
          });
        } catch (e) {
          errors.push(`expense: legacy=${legacyId} — ${(e as Error).message}`);
        }
      }
    }
  }

  // ============ 12. Stock Transfers (فاضي في المصدر بس نمشّي البنية) ============
  console.log("\n🚛 12. Stock Transfers...");
  {
    const { header, rows } = loadCsv("StockTransfer.csv");
    for (const row of rows) {
      const o = rowToObj(header, row);
      const legacyId = o["Transfer_Id ST"];
      if (!legacyId) continue;
      const fromStore = storeIdMap.get(o["From_Store ST"]);
      const toStore = storeIdMap.get(o["To_Store ST"]);
      const realProdLegacy = duplicateMerge[o["Product_Id ST"]] || o["Product_Id ST"];
      const productId = productIdMap.get(realProdLegacy);
      if (!fromStore || !toStore || !productId) continue;
      track("stock_transfers", 1);
      if (APPLY) {
        await prisma.stock_transfers.create({
          data: {
            transfer_date: date(o["Date ST"]) || new Date(),
            from_store_id: fromStore,
            to_store_id: toStore,
            product_id: productId,
            product_name: str(o["Product_NAM e ST"]) || "غير معروف",
            quantity: num(o["Quantity ST"]),
            status: "مكتملة",
            notes: str(o["Notes ST"]),
          },
        });
      }
    }
  }

  // ============ النهاية ============
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${DRY_RUN ? "📊 DRY-RUN" : "✅ APPLY"} — الإحصائيات النهائية:`);
  for (const [k, v] of Object.entries(stats)) {
    console.log(`   ${k.padEnd(28)} ${String(v).padStart(6)}`);
  }
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("💡 لتطبيق المهاجرة فعلياً: شغل السكريبت بـ --apply");
  } else {
    console.log("🎉 المهاجرة اكتملت بنجاح!");
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} سجل فشل (متخطّى):`);
    for (const e of errors.slice(0, 20)) console.log(`   • ${e}`);
    if (errors.length > 20) console.log(`   ... و ${errors.length - 20} خطأ آخر`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
