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

      // 5. سلف ورواتب الموظفين لمعرفة المصروفات المرتبطة بها وعدم تكرارها
      const [empAdvList, salaryList] = await Promise.all([
        prisma.employee_advances.findMany({
          where: { treasury_id: t.id },
          select: { amount: true, expense_id: true },
        }),
        prisma.salary_payments.findMany({
          where: { treasury_id: t.id },
          select: { net_paid: true, expense_id: true },
        }),
      ]);

      const linkedExpenseIds = [
        ...empAdvList.map((e) => e.expense_id),
        ...salaryList.map((s) => s.expense_id),
      ].filter(Boolean) as string[];

      const expSum = await prisma.expenses.aggregate({
        where: {
          treasury_id: t.id,
          ...(linkedExpenseIds.length > 0 ? { id: { notIn: linkedExpenseIds } } : {}),
        },
        _sum: { amount: true },
      });

      const empAdvTotal = empAdvList.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const salaryTotal = salaryList.reduce((sum, s) => sum + Number(s.net_paid || 0), 0);

      // 8. مسحوبات الشركاء (-)
      const partnerWithSum = await prisma.partner_withdrawals.aggregate({
        where: { treasury_id: t.id },
        _sum: { amount: true },
      });

      const shadowRefTypes = [
        'customer_payment',
        'customer_payment_adjustment',
        'customer_payment_cancellation',
        'supplier_payment',
        'supplier_payment_adjustment',
        'supplier_payment_cancellation',
        'expense',
        'expense_adjustment',
        'expense_cancellation',
        'partner_withdrawal',
        'customer_adjustment',
        'supplier_adjustment',
        'employee_advance',
        'employee_advance_cancel',
        'salary_payment',
      ];

      // 9. حركات الخزينة المباشرة والتحويلات (+/-)
      const txInSum = await prisma.treasury_transactions.aggregate({
        where: {
          treasury_id: t.id,
          direction: { in: ['in', 'transfer_in'] },
          reference_type: { notIn: shadowRefTypes },
        },
        _sum: { amount: true },
      });
      const txOutSum = await prisma.treasury_transactions.aggregate({
        where: {
          treasury_id: t.id,
          direction: { in: ['out', 'transfer_out'] },
          reference_type: { notIn: shadowRefTypes },
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
        empAdvTotal +
        salaryTotal +
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
