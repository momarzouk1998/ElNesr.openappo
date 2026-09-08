// =============================================
// EL NESR — Database Seed (شركة النسر للأدوات الكهربائية)
// Run: npm run db:seed
// Creates: admin/owner user, 2 stores, 2 treasuries, mock products, customers, suppliers
// =============================================
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding EL NESR database...');

  // Ensure schema exists
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS elnesr;`);

  // Clean business data while preserving existing users
  console.log('🧹 Cleaning business data...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      elnesr.audit_log, 
      elnesr.treasury_transactions, 
      elnesr.customer_payments, 
      elnesr.supplier_payments, 
      elnesr.checks, 
      elnesr.expenses, 
      elnesr.sales_invoice_items, 
      elnesr.sales_invoices, 
      elnesr.purchase_invoice_items, 
      elnesr.purchase_invoices, 
      elnesr.stock_transfers, 
      elnesr.product_price_history, 
      elnesr.inventory, 
      elnesr.products, 
      elnesr.customers, 
      elnesr.suppliers, 
      elnesr.stores, 
      elnesr.treasuries,
      elnesr.employee_advances,
      elnesr.salary_payments,
      elnesr.employees
    RESTART IDENTITY CASCADE;
  `);

  const pwd = await bcrypt.hash('123456', 10);

  // === Users ===
  console.log('👥 Creating default users...');
  const userDefinitions = [
    { username: 'admin',     full_name: 'إبراهيم - شركة النسر', phone: '01009328799', role: 'admin',   can_see_cost: true },
    { username: 'openapps',  full_name: 'الدعم الفني OPEN APPS', phone: '01558282760', role: 'admin',   can_see_cost: true },
  ];

  const users = await Promise.all(
    userDefinitions.map(async (user) => {
      return prisma.users.upsert({
        where: { username: user.username },
        update: {
          full_name: user.full_name,
          phone: user.phone,
          password_hash: pwd,
          role: user.role,
          can_see_cost: user.can_see_cost,
          is_active: true,
        },
        create: {
          username: user.username,
          full_name: user.full_name,
          phone: user.phone,
          password_hash: pwd,
          role: user.role,
          can_see_cost: user.can_see_cost,
          is_active: true,
        },
      });
    })
  );

  const [owner] = users;

  // === Stores ===
  console.log('🏢 Creating stores...');
  const [mainStore, panelsStore] = await Promise.all([
    prisma.stores.create({ data: { id: '11111111-1111-1111-1111-111111111111', name: 'المخزن الرئيسي', type: 'store', description: 'المقر والمخزن الرئيسي' } }),
    prisma.stores.create({ data: { id: '22222222-2222-2222-2222-222222222222', name: 'مخزن اللوحات والمهمات', type: 'store', description: 'لوحات وقواطع وكابلات' } }),
  ]);

  // === Treasuries ===
  console.log('🏦 Creating treasuries...');
  await Promise.all([
    prisma.treasuries.create({ data: { name: 'الخزينة النقدية الرئيسية', type: 'نقدية', opening_balance: 0, current_balance: 0, assigned_user_id: owner.id } }),
    prisma.treasuries.create({ data: { name: 'خزينة فودافون كاش', type: 'فودافون كاش', opening_balance: 0, current_balance: 0 } }),
  ]);

  // === Mock Customers ===
  console.log('👥 Creating mock customers...');
  await Promise.all([
    prisma.customers.create({ data: { name: 'معرض النور للتجهيزات الكهربائية', phone: '01012345671', opening_balance: 8500, balance: 8500, address: 'شارع الجمهورية' } }),
    prisma.customers.create({ data: { name: 'مؤسسة الأهرام للمقاولات', phone: '01012345672', opening_balance: 24000, balance: 24000, address: 'المنطقة الصناعية' } }),
    prisma.customers.create({ data: { name: 'الورشة الفنية للكهرباء (م/ حسام)', phone: '01012345673', opening_balance: 4200, balance: 4200, address: 'طريق المحطة' } }),
    prisma.customers.create({ data: { name: 'شركة الأمل للتوريدات الهندسية', phone: '01012345674', opening_balance: 0, balance: 0, address: 'ميدان التحرير' } }),
    prisma.customers.create({ data: { name: 'معرض المستقبل للكهرباء', phone: '01012345675', opening_balance: 12000, balance: 12000, address: 'حي الزهور' } }),
  ]);

  // === Mock Suppliers ===
  console.log('🏭 Creating mock suppliers...');
  await Promise.all([
    prisma.suppliers.create({ data: { name: 'شركة شنايدر إلكتريك مصر', phone: '01111111101', opening_balance: 35000, balance: 35000, address: 'القاهرة' } }),
    prisma.suppliers.create({ data: { name: 'مصنع السويدي للكابلات واللوحات', phone: '01111111102', opening_balance: 48000, balance: 48000, address: 'العاشر من رمضان' } }),
    prisma.suppliers.create({ data: { name: 'المؤسسة الدولية للتوزيع والاستيراد', phone: '01111111103', opening_balance: 0, balance: 0, address: 'الإسكندرية' } }),
    prisma.suppliers.create({ data: { name: 'شركة فينوس للصناعات الحديثة', phone: '01111111104', opening_balance: 15000, balance: 15000, address: 'مدينة نصر' } }),
  ]);

  // === Mock Products (Electrical Panels & Equipment) ===
  console.log('🏷️ Creating mock electrical products & stock...');
  const mockProducts = [
    { name: 'لوحة كهرباء 24 خط فينوس داخلي', category: 'لوحات كهربائية', unit: 'piece', default_sale_price: 1850, last_purchase_price: 1500, stockMain: 45, stockPanels: 20 },
    { name: 'لوحة كهرباء 36 خط شنايدر رئيسية', category: 'لوحات كهربائية', unit: 'piece', default_sale_price: 3200, last_purchase_price: 2700, stockMain: 30, stockPanels: 15 },
    { name: 'قاطع تيار أوتوماتيك 63 أمبير ثلاثي شنايدر', category: 'قواطع تيار', unit: 'piece', default_sale_price: 850, last_purchase_price: 680, stockMain: 60, stockPanels: 40 },
    { name: 'قاطع تيار عمومي 100 أمبير شنايدر', category: 'قواطع تيار', unit: 'piece', default_sale_price: 1950, last_purchase_price: 1600, stockMain: 25, stockPanels: 10 },
    { name: 'قاطع تيار أحادي 32 أمبير فينوس', category: 'قواطع تيار', unit: 'piece', default_sale_price: 145, last_purchase_price: 110, stockMain: 200, stockPanels: 150 },
    { name: 'لفة سلك نحاس معزول 4 مم (100 متر) السويدي', category: 'كابلات وأسلاك', unit: 'piece', default_sale_price: 2650, last_purchase_price: 2350, stockMain: 80, stockPanels: 35 },
    { name: 'لفة سلك نحاس معزول 6 مم (100 متر) السويدي', category: 'كابلات وأسلاك', unit: 'piece', default_sale_price: 3950, last_purchase_price: 3550, stockMain: 50, stockPanels: 25 },
    { name: 'شاسيه ماجيك 3 فتحة فينوس الأصلي', category: 'مفاتيح ومآخذ', unit: 'piece', default_sale_price: 28, last_purchase_price: 18, stockMain: 500, stockPanels: 300 },
    { name: 'لقمة مفتاح إنارة 16 أمبير ماجيك فينوس', category: 'مفاتيح ومآخذ', unit: 'piece', default_sale_price: 35, last_purchase_price: 24, stockMain: 600, stockPanels: 400 },
    { name: 'كشاف ليد بانل مسطح 60*60 سم 48 وات أبيض', category: 'إضاءة وليد', unit: 'piece', default_sale_price: 420, last_purchase_price: 330, stockMain: 90, stockPanels: 40 },
  ];

  for (const item of mockProducts) {
    const prod = await prisma.products.create({
      data: {
        name: item.name,
        category: item.category,
        unit: item.unit,
        default_sale_price: item.default_sale_price,
        last_purchase_price: item.last_purchase_price,
        reorder_level: 5,
        is_active: true,
      },
    });

    // إضافة المخزون في المخزنين
    await prisma.inventory.createMany({
      data: [
        { product_id: prod.id, store_id: mainStore.id, current_stock: item.stockMain, opening_balance: item.stockMain },
        { product_id: prod.id, store_id: panelsStore.id, current_stock: item.stockPanels, opening_balance: item.stockPanels },
      ],
    });
  }

  // === Mock Employees (الموظفين) ===
  console.log('👷 Creating mock employees...');
  const [emp1, emp2] = await Promise.all([
    prisma.employees.create({
      data: {
        name: 'أحمد محمود الغواص',
        phone: '01099887766',
        job_title: 'فني تجميع لوحات',
        basic_salary: 6500,
        hire_date: new Date('2026-01-01'),
        is_active: true,
      },
    }),
    prisma.employees.create({
      data: {
        name: 'محمد عبد الله',
        phone: '01122334455',
        job_title: 'مسؤول مخزن وتجهيز',
        basic_salary: 5000,
        hire_date: new Date('2026-02-15'),
        is_active: true,
      },
    }),
  ]);

  console.log('✅ Seed completed successfully for El Nesr system!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
