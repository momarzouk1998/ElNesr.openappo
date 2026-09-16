import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import prisma from "@/lib/db/prisma";
import { formatQty } from "@/lib/format";

export default async function MyInventoryPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const stores = await prisma.stores.findMany({
    where: { assigned_user_id: profile.id, is_active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const storeIds = stores.map((s) => s.id);
  const inventory = storeIds.length
    ? await prisma.inventory.findMany({
        where: { store_id: { in: storeIds } },
        include: { product: true, store: true },
        orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }],
        take: 200,
      })
    : [];

  const lowStock = inventory.filter((item) => Number(item.current_stock) <= item.reorder_level);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">🚐 بضاعة السيارة</h1>
          <p className="text-sm text-gray-500">إجمالي عناصر المخزون المخصصة للفرع أو السيارة المعينة لك</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <div className="text-xs text-gray-500">عدد العناصر</div>
          <div className="text-2xl font-extrabold text-slate-650">{inventory.length}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">تحت حد إعادة الطلب</div>
          <div className="text-2xl font-extrabold text-elnesr-600">{lowStock.length}</div>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-right">المنتج</th>
              <th className="p-3 text-right">المخزن</th>
              <th className="p-3 text-right">الرصيد</th>
              <th className="p-3 text-right">الحد الأدنى</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-semibold">{item.product.name}</td>
                <td className="p-3">{item.store.name}</td>
                <td className={`p-3 font-bold ${Number(item.current_stock) <= item.reorder_level ? "text-elnesr-600" : "text-slate-650"}`}>
                  {formatQty(Number(item.current_stock))}
                </td>
                <td className="p-3">{item.reorder_level}</td>
              </tr>
            ))}
            {inventory.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-gray-400">لا توجد عناصر مخزون مرتبطة بك حاليًا</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
