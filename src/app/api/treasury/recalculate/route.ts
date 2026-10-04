import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

// POST /api/treasury/recalculate - إعادة حساب وتصفير أرصدة جميع الخزائن من الحركات الفعلية
export async function POST() {
  const profile = await getCurrentUser();
  if (!profile || !['admin', 'manager', 'accountant'].includes(profile.role)) {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'هذه العملية للإدارة فقط' } }, { status: 403 });
  }

  try {
    const treasuries = await prisma.treasuries.findMany();

    for (const t of treasuries) {
      // 1. تحصيلات العملاء (+)
      const cpSum = await prisma.customer_payments.aggregate({
        where: { treasury_id: t.id },
        _sum: { amount: true },
      });

      // 2. تسويات وسلف العملاء (+/-)
      const custCreditSum = await prisma.customer_adjustments.aggregate({
        where: { treasury_id: t.id, type: 'credit' },
        _sum: { amount: true },
      });
      const custDebitSum = await prisma.customer_adjustments.aggregate({
        where: { treasury_id: t.id, type: 'debit' },
        _sum: { amount: true },
      });

      // 3. مدفوعات الموردين (-)
      const spSum = await prisma.supplier_payments.aggregate({
        where: { treasury_id: t.id },
        _sum: { amount: true },
      });

      // 4. تسويات وسلف الموردين (+/-)
      const suppDebitSum = await prisma.supplier_adjustments.aggregate({
        where: { treasury_id: t.id, type: 'debit' },
        _sum: { amount: true },
      });
      const suppCreditSum = await prisma.supplier_adjustments.aggregate({
        where: { treasury_id: t.id, type: 'credit' },
        _sum: { amount: true },
      });

      // 5. المصروفات النقدية (-)
      const expSum = await prisma.expenses.aggregate({
        where: { treasury_id: t.id },
        _sum: { amount: true },
      });

      // 6. سلف الموظفين (-)
      const empAdvSum = await prisma.employee_advances.aggregate({
        where: { treasury_id: t.id },
        _sum: { amount: true },
      });

      // 7. رواتب الموظفين (-)
      const salarySum = await prisma.salary_payments.aggregate({
        where: { treasury_id: t.id },
        _sum: { net_paid: true },
      });

      // 8. مسحوبات الشركاء (-)
      const partnerWithSum = await prisma.partner_withdrawals.aggregate({
        where: { treasury_id: t.id },
        _sum: { amount: true },
      });

      // 9. حركات الخزينة المباشرة والتحويلات (+/-)
      const txInSum = await prisma.treasury_transactions.aggregate({
        where: {
          treasury_id: t.id,
          direction: { in: ['in', 'transfer_in'] },
          reference_type: { notIn: ['customer_payment', 'supplier_payment_cancellation'] },
        },
        _sum: { amount: true },
      });
      const txOutSum = await prisma.treasury_transactions.aggregate({
        where: {
          treasury_id: t.id,
          direction: { in: ['out', 'transfer_out'] },
          reference_type: { notIn: ['supplier_payment', 'customer_payment_cancellation', 'expense', 'partner_withdrawal'] },
        },
        _sum: { amount: true },
      });

      const opening = Number(t.opening_balance || 0);

      const totalIn =
        Number(cpSum._sum.amount || 0) +
        Number(custCreditSum._sum.amount || 0) +
        Number(suppDebitSum._sum.amount || 0) +
        Number(txInSum._sum.amount || 0);

      const totalOut =
        Number(spSum._sum.amount || 0) +
        Number(custDebitSum._sum.amount || 0) +
        Number(suppCreditSum._sum.amount || 0) +
        Number(expSum._sum.amount || 0) +
        Number(empAdvSum._sum.amount || 0) +
        Number(salarySum._sum.net_paid || 0) +
        Number(partnerWithSum._sum.amount || 0) +
        Number(txOutSum._sum.amount || 0);

      const calculatedBalance = opening + totalIn - totalOut;

      await prisma.treasuries.update({
        where: { id: t.id },
        data: { current_balance: calculatedBalance, updated_at: new Date() },
      });
    }

    return NextResponse.json({ ok: true, message: 'تم إعادة حساب وتصفير أرصدة الخزائن بنجاح' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
