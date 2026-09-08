import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'غير مصرح' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee_id');
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    const where: any = {};
    if (employeeId) where.employee_id = employeeId;
    if (month) where.month = Number(month);
    if (year) where.year = Number(year);

    const salaries = await prisma.salary_payments.findMany({
      where,
      orderBy: { payment_date: 'desc' },
      include: {
        employee: { select: { id: true, name: true, phone: true, job_title: true } },
        treasury: { select: { id: true, name: true, type: true } },
        advances: { select: { id: true, amount: true, advance_date: true, notes: true } },
      },
    });

    const formatted = salaries.map((s) => ({
      ...s,
      basic_salary: Number(s.basic_salary || 0),
      total_advances: Number(s.total_advances || 0),
      bonuses: Number(s.bonuses || 0),
      deductions: Number(s.deductions || 0),
      net_paid: Number(s.net_paid || 0),
    }));

    return NextResponse.json({ ok: true, data: formatted });
  } catch (error: any) {
    console.error('Error fetching salaries:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === 'rep') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بصرف الرواتب' }, { status: 403 });
    }

    const body = await request.json();
    const {
      employee_id,
      month,
      year,
      basic_salary,
      bonuses = 0,
      deductions = 0,
      treasury_id,
      payment_date,
      notes,
    } = body;

    if (!employee_id || !month || !year || !treasury_id) {
      return NextResponse.json(
        { ok: false, error: 'الموظف، الشهر، السنة، والخزينة حقول مطلوبة' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employees.findUnique({ where: { id: employee_id } });
      if (!employee) throw new Error('الموظف غير موجود');

      const treasury = await tx.treasuries.findUnique({ where: { id: treasury_id } });
      if (!treasury) throw new Error('الخزينة المحددة غير موجودة');

      const pendingAdvances = await tx.employee_advances.findMany({
        where: { employee_id, is_deducted: false },
      });

      const totalAdvances = pendingAdvances.reduce(
        (sum, a) => sum + Number(a.amount || 0),
        0
      );

      const numBasic = Number(basic_salary !== undefined ? basic_salary : employee.basic_salary || 0);
      const numBonuses = Number(bonuses || 0);
      const numDeductions = Number(deductions || 0);

      const netPaid = numBasic + numBonuses - totalAdvances - numDeductions;
      if (netPaid < 0) {
        throw new Error(`صافي الراتب سالب (${netPaid} ج). يرجى مراجعة السلف والخصومات`);
      }

      if (netPaid > 0) {
        await tx.treasuries.update({
          where: { id: treasury_id },
          data: { current_balance: { decrement: netPaid } },
        });
      }

      const expense = await tx.expenses.create({
        data: {
          category: 'رواتب وأجور',
          description: `صرف راتب شهر ${month}/${year} للموظف: ${employee.name}`,
          amount: netPaid,
          expense_date: payment_date ? new Date(payment_date) : new Date(),
          payment_method: treasury.type === 'فودافون كاش' ? 'فودافون كاش' : 'نقدي',
          treasury_id: treasury_id,
          created_by: user.id,
          notes: `الراتب الأساسي: ${numBasic} | السلف: ${totalAdvances} | المكافآت: ${numBonuses} | الخصومات: ${numDeductions} ${notes ? ' | ' + notes : ''}`,
        },
      });

      if (netPaid > 0) {
        await tx.treasury_transactions.create({
          data: {
            treasury_id,
            direction: 'out',
            amount: netPaid,
            reference_type: 'salary_payment',
            notes: `صرف راتب ${employee.name} عن شهر ${month}/${year}`,
            by_user_id: user.id,
            transaction_date: payment_date ? new Date(payment_date) : new Date(),
          },
        });
      }

      const salaryPayment = await tx.salary_payments.create({
        data: {
          employee_id,
          month: Number(month),
          year: Number(year),
          basic_salary: numBasic,
          total_advances: totalAdvances,
          bonuses: numBonuses,
          deductions: numDeductions,
          net_paid: netPaid,
          payment_date: payment_date ? new Date(payment_date) : new Date(),
          treasury_id,
          expense_id: expense.id,
          notes: notes?.trim() || null,
          created_by_user_id: user.id,
        },
        include: {
          employee: { select: { id: true, name: true, phone: true } },
          treasury: { select: { id: true, name: true } },
        },
      });

      if (pendingAdvances.length > 0) {
        await tx.employee_advances.updateMany({
          where: { id: { in: pendingAdvances.map((a) => a.id) } },
          data: {
            is_deducted: true,
            salary_payment_id: salaryPayment.id,
          },
        });
      }

      return salaryPayment;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error: any) {
    console.error('Error paying salary:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
