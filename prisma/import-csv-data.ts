import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function runQuery(query: string, values: any[] = []) {
  return prisma.$executeRawUnsafe(query, ...values);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function readCSVFile(filePath: string): any[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

function getValue(row: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
}

function parseDate(dateStr: string): Date {
  if (!dateStr || dateStr.trim() === '') return new Date();

  try {
    const cleaned = dateStr.trim();
    const [datePart] = cleaned.split(' ');

    if (datePart.includes('/')) {
      const [month, day, year] = datePart.split('/').map(Number);
      return new Date(year, month - 1, day);
    }

    if (datePart.includes('-')) {
      const [year, month, day] = datePart.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
  } catch {
    // fall back to today
  }

  return new Date();
}

function isValidUuid(value: string): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeText(value: string): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function resolveEntityId(tableName: string, sourceId: string, fallbackMap?: Map<string, string>): Promise<string | null> {
  if (!sourceId) return null;

  if (fallbackMap?.has(sourceId)) {
    return fallbackMap.get(sourceId) || null;
  }

  if (isValidUuid(sourceId)) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM elnazlawy.${tableName} WHERE id::text = $1 LIMIT 1`, sourceId);
    if (rows[0]?.id) return rows[0].id;
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM elnazlawy.${tableName} WHERE legacy_id = $1 LIMIT 1`, sourceId);
  return rows[0]?.id || null;
}

async function resolveEntityByName(tableName: string, name: string, fallbackMap?: Map<string, string>): Promise<string | null> {
  if (!name) return null;

  const normalizedName = normalizeText(name);
  if (fallbackMap?.has(normalizedName)) {
    return fallbackMap.get(normalizedName) || null;
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM elnazlawy.${tableName} WHERE lower(trim(name)) = $1 LIMIT 1`, normalizedName);
  return rows[0]?.id || null;
}

async function clearData() {
  console.log('🗑️  Clearing business data only (keeping users)...');

  await runQuery(`
    TRUNCATE TABLE
      elnazlawy.customer_payments,
      elnazlawy.supplier_payments,
      elnesr.inventory,
      elnesr.products,
      elnesr.customers,
      elnesr.suppliers,
      elnazlawy.treasury_transactions,
      elnazlawy.treasuries,
      elnesr.stores,
      elnazlawy.expenses,
      elnazlawy.checks,
      elnazlawy.sales_invoice_items,
      elnesr.sales_invoices,
      elnazlawy.purchase_invoice_items,
      elnesr.purchase_invoices,
      elnazlawy.stock_transfers,
      elnazlawy.product_price_history,
      elnazlawy.audit_log
    RESTART IDENTITY CASCADE;
  `);

  console.log('✅ Business data cleared successfully');
}

async function importData() {
  const dataDir = path.join(__dirname, '..', 'data');

  try {
    await clearData();

    console.log('💰 Creating default treasury...');
    const treasuryId = randomUUID();
    await runQuery(
      `INSERT INTO elnazlawy.treasuries (id, name, type, opening_balance, current_balance, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [treasuryId, 'الخزينة الرئيسية', 'رئيسية', 0, 0, true]
    );

    console.log('🏢 Creating default store...');
    const storeId = randomUUID();
    await runQuery(
      `INSERT INTO elnesr.stores (id, name, type, description, treasury_id, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, NOW(), NOW())`,
      [storeId, 'المخزن الرئيسي', 'store', 'المخزن الرئيسي', treasuryId, true]
    );

    console.log('📦 Importing products...');
    const products = readCSVFile(path.join(dataDir, 'Product.csv'));
    let productCount = 0;

    for (const row of products) {
      const originalId = getValue(row, ['Product_Id P', 'Product_Id']);
      const name = getValue(row, ['Name P', 'Name']);

      if (!originalId || !name) continue;

      const openingBalance = parseFloat(getValue(row, ['Opening_Balance P', 'Opening_Balance'])) || 0;
      const purchasePrice = parseFloat(getValue(row, ['Initial_Purchase_Price', 'Purchase_Price'])) || 0;

      const productId = randomUUID();
      await runQuery(
        `INSERT INTO elnesr.products (
          id, legacy_id, name, description, category, unit, units_per_carton,
          default_sale_price, last_purchase_price, reorder_level, is_active, created_at, updated_at
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
        [productId, originalId, name, getValue(row, ['Description P', 'Description']) || null, getValue(row, ['Category P', 'Category']) || null, getValue(row, ['Unit_Of_Measure P', 'Unit']) || 'قطعة', parseInt(getValue(row, ['Units_Per_Carton P', 'Units_Per_Carton']), 10) || 1, 0, purchasePrice, 5, true]
      );

      if (openingBalance > 0) {
        await runQuery(
          `INSERT INTO elnesr.inventory (id, product_id, store_id, current_stock, opening_balance, reorder_level, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, NOW(), NOW())`,
          [randomUUID(), productId, storeId, openingBalance, openingBalance, 5]
        );
      }

      productCount++;
    }
    console.log(`✅ Imported ${productCount} products`);

    console.log('👥 Importing customers...');
    const customers = readCSVFile(path.join(dataDir, 'Customer.csv'));
    let customerCount = 0;
    const customerIdMap = new Map<string, string>();
    const customerNameMap = new Map<string, string>();

    for (const row of customers) {
      const originalId = getValue(row, ['Customer_Id C', 'Customer_Id']);
      const name = getValue(row, ['Customer_NAM e C', 'Customer_Name', 'Customer_Name C']);

      if (!originalId || !name) continue;

      const openingBalance = parseFloat(getValue(row, ['Opening_Balance C', 'Opening_Balance'])) || 0;
      const currentBalance = parseFloat(getValue(row, ['Customer_Balance', 'Balance'])) || openingBalance;

      let routeDays: string[] = [];
      const routeValue = getValue(row, ['Route_Days', 'Route']);
      if (routeValue) {
        routeDays = routeValue.split(',').map((d: string) => d.trim()).filter(Boolean);
      }

      const customerId = randomUUID();
      await runQuery(
        `INSERT INTO elnesr.customers (
          id, legacy_id, name, phone, whatsapp, address, location, balance, opening_balance, route_days, is_active, created_at, updated_at
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
        [customerId, originalId, name, getValue(row, ['Phone C', 'Phone']) || null, getValue(row, ['Whatsapp C', 'Whatsapp']) || null, getValue(row, ['Address C', 'Address']) || null, getValue(row, ['Location C', 'Location']) || null, currentBalance, openingBalance, routeDays, true]
      );

      if (originalId) customerIdMap.set(originalId, customerId);
      const normalizedCustomerName = normalizeText(name);
      if (normalizedCustomerName) customerNameMap.set(normalizedCustomerName, customerId);
      customerCount++;
    }
    console.log(`✅ Imported ${customerCount} customers`);

    console.log('🏭 Importing suppliers...');
    const suppliers = readCSVFile(path.join(dataDir, 'Supplier.csv'));
    let supplierCount = 0;
    const supplierIdMap = new Map<string, string>();
    const supplierNameMap = new Map<string, string>();

    for (const row of suppliers) {
      const originalId = getValue(row, ['Supplier_Id SU', 'Supplier_Id']);
      const name = getValue(row, ['Supplier_NAM e SU', 'Supplier_Name', 'Supplier_Name SU']);

      if (!originalId || !name) continue;

      const openingBalance = parseFloat(getValue(row, ['Opening_Balance S', 'Opening_Balance'])) || 0;
      const currentBalance = parseFloat(getValue(row, ['Supplier_Balance', 'Balance'])) || openingBalance;

      const supplierId = randomUUID();
      await runQuery(
        `INSERT INTO elnesr.suppliers (
          id, legacy_id, name, phone, address, balance, opening_balance, is_active, created_at, updated_at
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [supplierId, originalId, name, getValue(row, ['Phone SU', 'Phone']) || null, getValue(row, ['Address SU', 'Address']) || null, currentBalance, openingBalance, true]
      );

      if (originalId) supplierIdMap.set(originalId, supplierId);
      const normalizedSupplierName = normalizeText(name);
      if (normalizedSupplierName) supplierNameMap.set(normalizedSupplierName, supplierId);
      supplierCount++;
    }
    console.log(`✅ Imported ${supplierCount} suppliers`);

    console.log('💰 Importing customer payments...');
    const customerPayments = readCSVFile(path.join(dataDir, 'CustomerPayment.csv'));
    let customerPaymentCount = 0;

    for (const row of customerPayments) {
      const originalId = getValue(row, ['Payment_Id CP', 'Payment_Id']);
      const customerId = getValue(row, ['Customer_Id CP', 'Customer_Id']);

      if (!originalId || !customerId) continue;

      const amount = parseFloat(getValue(row, ['AM ount CP', 'Amount CP', 'Amount'])) || 0;
      if (amount <= 0) continue;

      const date = parseDate(getValue(row, ['Date CP', 'Date']));

      const customerPaymentId = randomUUID();
      const customerName = getValue(row, ['Customer_NAM e CP', 'Customer_Name CP', 'Customer_Name', 'Customer Name', 'Customer']) || '';
      const resolvedCustomerId = await resolveEntityId('customers', customerId, customerIdMap) || await resolveEntityByName('customers', customerName, customerNameMap);
      const paymentTreasuryId = isValidUuid(getValue(row, ['Treasury_Id CP', 'Treasury_Id'])) ? getValue(row, ['Treasury_Id CP', 'Treasury_Id']) : treasuryId;

      if (!resolvedCustomerId) {
        console.log(`Skipping customer payment ${originalId} because customer_id could not be resolved: ${customerId}`);
        continue;
      }

      await runQuery(
        `INSERT INTO elnazlawy.customer_payments (
          id, payment_date, customer_id, amount, payment_method, treasury_id, notes, created_at
        ) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::uuid, $7, NOW())`,
        [customerPaymentId, date, resolvedCustomerId, amount, getValue(row, ['Payment_Method CP', 'Payment_Method']) || 'نقدي', paymentTreasuryId, getValue(row, ['Notes CP', 'Notes']) || null]
      );

      customerPaymentCount++;
    }
    console.log(`✅ Imported ${customerPaymentCount} customer payments`);

    console.log('💸 Importing supplier payments...');
    const supplierPayments = readCSVFile(path.join(dataDir, 'SupplierPayment.csv'));
    let supplierPaymentCount = 0;

    for (const row of supplierPayments) {
      const originalId = getValue(row, ['Payment_Id SP', 'Payment_Id']);
      const supplierId = getValue(row, ['Supplier_Id SP', 'Supplier_Id']);

      if (!originalId || !supplierId) continue;

      const amount = parseFloat(getValue(row, ['AM ount SP', 'Amount SP', 'Amount'])) || 0;
      if (amount <= 0) continue;

      const date = parseDate(getValue(row, ['Date SP', 'Date']));

      const supplierPaymentId = randomUUID();
      const supplierName = getValue(row, ['Supplier_NAM e SP', 'Supplier_Name SP', 'Supplier_Name', 'Supplier Name', 'Supplier']) || '';
      const resolvedSupplierId = await resolveEntityId('suppliers', supplierId, supplierIdMap) || await resolveEntityByName('suppliers', supplierName, supplierNameMap);
      const paymentSupplierTreasuryId = isValidUuid(getValue(row, ['Treasury_Id SP', 'Treasury_Id'])) ? getValue(row, ['Treasury_Id SP', 'Treasury_Id']) : treasuryId;

      if (!resolvedSupplierId) {
        console.log(`Skipping supplier payment ${originalId} because supplier_id could not be resolved: ${supplierId}`);
        continue;
      }

      await runQuery(
        `INSERT INTO elnazlawy.supplier_payments (
          id, payment_date, supplier_id, amount, payment_method, treasury_id, notes, created_at
        ) VALUES ($1::uuid, $3, $2::uuid, $4, $5, $6::uuid, $7, NOW())`,
        [supplierPaymentId, resolvedSupplierId, date, amount, getValue(row, ['Payment_Method SP', 'Payment_Method']) || 'نقدي', paymentSupplierTreasuryId, getValue(row, ['Notes SP', 'Notes']) || null]
      );

      supplierPaymentCount++;
    }
    console.log(`✅ Imported ${supplierPaymentCount} supplier payments`);

    console.log('\n🎉 Data import completed successfully!');
  } catch (error) {
    console.error('❌ Error importing data:', error);
    throw error;
  }
}

async function main() {
  try {
    await importData();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
