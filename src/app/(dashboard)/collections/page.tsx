import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import prisma from "@/lib/db/prisma";
import { formatEGP } from "@/lib/format";

export default async function CollectionsPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const customers = await prisma.customers.findMany({
    where: { is_active: true, balance: { gt: 0 } },
    orderBy: { balance: "desc" },
    take: 100,
  });

  const totalDebt = customers.reduce((sum, customer) => sum + Number(customer.balance), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">💵 دفتر التحصيلات</h1>
          <p className="text-sm text-gray-500">العملاء الذين لديهم رصيد مستحق للتحصيل</p>
        </div>
      </div>

      <div className="card">
        <div className="text-xs text-gray-500">إجمالي المستحقات</div>
        <div className="text-2xl font-extrabold text-elnesr-600">{formatEGP(totalDebt)}</div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-right">العميل</th>
              <th className="p-3 text-right">الهاتف</th>
              <th className="p-3 text-right">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-semibold">{customer.name}</td>
                <td className="p-3">{customer.phone || "—"}</td>
                <td className="p-3 font-bold text-elnesr-600">{formatEGP(Number(customer.balance))}</td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={3} className="p-10 text-center text-gray-400">لا توجد مستحقات حالية</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
