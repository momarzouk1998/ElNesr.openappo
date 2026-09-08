import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'غير مصرح' }, { status: 401 });
    }

    const employees = await prisma.employees.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        advances: {
          where: { is_deducted: false },
          select: { id: true, amount: true, advance_date: true, notes: true },
        },
        salary_payments: {
          orderBy: { payment_date: 'desc' },
          take: 5,
        },
      },
    });

    const formatted = employees.map((emp) => {
      const pendingAdvancesTotal = emp.advances.reduce(
        (sum, adv) => sum + Number(adv.amount || 0),
        0
      );
      return {
        ...emp,
        basic_salary: Number(emp.basic_salary || 0),
        pending_advances_total: pendingAdvancesTotal,
        pending_advances_count: emp.advances.length,
      };
    });

    return NextResponse.json({ ok: true, data: formatted });
  } catch (error: any) {
    console.error('Error fetching employees:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === 'rep') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بإضافة موظفين' }, { status: 403 });
    }

    const body = await request.json();
    const { name, phone, job_title, basic_salary, hire_date, notes } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'اسم الموظف مطلوب' }, { status: 400 });
    }

    const employee = await prisma.employees.create({
      data: {
        name: name.trim(),
        phone: phone?.trim() || null,
        job_title: job_title?.trim() || null,
        basic_salary: Number(basic_salary) || 0,
        hire_date: hire_date ? new Date(hire_date) : new Date(),
        notes: notes?.trim() || null,
        is_active: true,
      },
    });

    return NextResponse.json({ ok: true, data: employee });
  } catch (error: any) {
    console.error('Error creating employee:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
