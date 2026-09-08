import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'غير مصرح' }, { status: 401 });
    }

    const { id } = await params;
    const employee = await prisma.employees.findUnique({
      where: { id },
      include: {
        advances: {
          orderBy: { advance_date: 'desc' },
          include: { treasury: { select: { id: true, name: true } } },
        },
        salary_payments: {
          orderBy: { payment_date: 'desc' },
          include: { treasury: { select: { id: true, name: true } } },
        },
      },
    });

    if (!employee) {
      return NextResponse.json({ ok: false, error: 'الموظف غير موجود' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...employee,
        basic_salary: Number(employee.basic_salary || 0),
        advances: employee.advances.map((a) => ({
          ...a,
          amount: Number(a.amount || 0),
        })),
        salary_payments: employee.salary_payments.map((s) => ({
          ...s,
          basic_salary: Number(s.basic_salary || 0),
          total_advances: Number(s.total_advances || 0),
          bonuses: Number(s.bonuses || 0),
          deductions: Number(s.deductions || 0),
          net_paid: Number(s.net_paid || 0),
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role === 'rep') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بتعديل بيانات الموظفين' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, phone, job_title, basic_salary, hire_date, notes, is_active } = body;

    const updated = await prisma.employees.update({
      where: { id },
      data: {
        name: name ? name.trim() : undefined,
        phone: phone !== undefined ? (phone?.trim() || null) : undefined,
        job_title: job_title !== undefined ? (job_title?.trim() || null) : undefined,
        basic_salary: basic_salary !== undefined ? Number(basic_salary) : undefined,
        hire_date: hire_date ? new Date(hire_date) : undefined,
        notes: notes !== undefined ? (notes?.trim() || null) : undefined,
        is_active: is_active !== undefined ? Boolean(is_active) : undefined,
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بحذف موظف' }, { status: 403 });
    }

    const { id } = await params;
    await prisma.employees.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true, message: 'تم حذف الموظف بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
