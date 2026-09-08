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
    const isDeducted = searchParams.get('is_deducted');

    const where: any = {};
    if (employeeId) where.employee_id = employeeId;
    if (isDeducted !== null && isDeducted !== undefined && isDeducted !== '') {
      where.is_deducted = isDeducted === 'true';
    }

    const advances = await prisma.employee_advances.findMany({
      where,
      orderBy: { advance_date: 'desc' },
      include: {
        employee: { select: { id: true, name: true, phone: true, job_title: true } },
        treasury: { select: { id: true, name: true, type: true } },
      },
    });

    const formatted = advances.map((a) => ({
      ...a,
      amount: Number(a.amount || 0),
    }));

    return NextResponse.json({ ok: true, data: formatted });
  } catch (error: any) {
    console.error('Error fetching advances:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === 'rep') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بتسجيل سلف' }, { status: 403 });
    }

    const body = await request.json();
    const { employee_id, amount, advance_date, treasury_id, notes } = body;

    const numAmount = Number(amount);
    if (!employee_id || !numAmount || numAmount <= 0) {
      return NextResponse.json({ ok: false, error: 'الموظف ومبلغ السلفة مطلوبان' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employees.findUnique({ where: { id: employee_id } });
      if (!employee) throw new Error('الموظف غير موجود');

      let treasury = null;
      if (treasury_id) {
        treasury = await tx.treasuries.findUnique({ where: { id: treasury_id } });
        if (!treasury) throw new Error('الخزينة المحددة غير موجودة');

        await tx.treasuries.update({
          where: { id: treasury_id },
          data: { current_balance: { decrement: numAmount } },
        });
      }

      const expense = await tx.expenses.create({
        data: {
          category: 'سلف موظفين',
          description: `سلفة للموظف: ${employee.name}`,
          amount: numAmount,
          expense_date: advance_date ? new Date(advance_date) : new Date(),
          payment_method: treasury?.type === 'فودافون كاش' ? 'فودافون كاش' : 'نقدي',
          treasury_id: treasury_id || null,
          created_by: user.id,
          notes: notes?.trim() || null,
        },
      });

      if (treasury_id) {
        await tx.treasury_transactions.create({
          data: {
            treasury_id,
            direction: 'out',
            amount: numAmount,
            reference_type: 'employee_advance',
            notes: `سلفة للموظف: ${employee.name}`,
            by_user_id: user.id,
            transaction_date: advance_date ? new Date(advance_date) : new Date(),
          },
        });
      }

      const advance = await tx.employee_advances.create({
        data: {
          employee_id,
          amount: numAmount,
          advance_date: advance_date ? new Date(advance_date) : new Date(),
          treasury_id: treasury_id || null,
          notes: notes?.trim() || null,
          is_deducted: false,
          expense_id: expense.id,
          created_by_user_id: user.id,
        },
        include: {
          employee: { select: { id: true, name: true } },
          treasury: { select: { id: true, name: true } },
        },
      });

      return advance;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error: any) {
    console.error('Error creating advance:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بإلغاء السلف' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ ok: false, error: 'معرف السلفة مطلوب' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const advance = await tx.employee_advances.findUnique({ where: { id } });
      if (!advance) throw new Error('السلفة غير موجودة');
      if (advance.is_deducted) throw new Error('لا يمكن حذف سلفة تم خصمها بالفعل من الراتب');

      const amount = Number(advance.amount || 0);

      if (advance.treasury_id && amount > 0) {
        await tx.treasuries.update({
          where: { id: advance.treasury_id },
          data: { current_balance: { increment: amount } },
        });

        await tx.treasury_transactions.create({
          data: {
            treasury_id: advance.treasury_id,
            direction: 'in',
            amount,
            reference_type: 'employee_advance_cancel',
            notes: 'إلغاء واسترداد سلفة موظف',
            by_user_id: user.id,
            transaction_date: new Date(),
          },
        });
      }

      if (advance.expense_id) {
        await tx.expenses.delete({ where: { id: advance.expense_id } }).catch(() => {});
      }

      await tx.employee_advances.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true, message: 'تم إلغاء السلفة بنجاح' });
  } catch (error: any) {
    console.error('Error canceling advance:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
