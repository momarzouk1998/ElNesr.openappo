"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatEGP } from "@/lib/format";

interface Customer {
  id: string; name: string; phone: string | null; whatsapp: string | null;
  address: string | null; balance: number; route_days: string[];
}
interface ApiResponse { items: Customer[]; total: number; }

const DAYS = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

export default function RoutePage() {
  const [selectedDay, setSelectedDay] = useState("");
  const { data, loading } = useApi<ApiResponse>("/api/customers?limit=9999");

  const customers = (data?.items || []).filter(c => c.route_days && c.route_days.length > 0);
  const filtered = selectedDay ? customers.filter(c => c.route_days.includes(selectedDay)) : customers;

  // group by day
  const byDay = DAYS.map(day => ({
    day,
    customers: customers.filter(c => c.route_days.includes(day)),
  }));

  const totalDebt = filtered.reduce((s, c) => s + Number(c.balance), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">🗺️ خط السير</h1>
        <p className="text-sm text-gray-500">توزيع العملاء على أيام الأسبوع</p>
      </div>

      {/* Day summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {byDay.map(({ day, customers: dayCustomers }) => {
          const dayDebt = dayCustomers.reduce((s, c) => s + Number(c.balance), 0);
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(selectedDay === day ? "" : day)}
              className={`card p-3 text-center transition-all ${selectedDay === day ? "ring-2 ring-elnesr-500 bg-elnesr-50" : "hover:shadow-md"}`}
            >
              <div className="text-sm font-bold text-slate-650">{day}</div>
              <div className="text-xs text-gray-500">{dayCustomers.length} عميل</div>
              <div className="text-xs font-mono mt-1 text-orange-700">{formatEGP(dayDebt)}</div>
            </button>
          );
        })}
      </div>

      {/* Customers without route */}
      {(data?.items || []).filter(c => !c.route_days || c.route_days.length === 0).length > 0 && (
        <div className="card p-4 bg-yellow-50 border border-yellow-200">
          <div className="text-sm text-yellow-800">
            ⚠️ {(data?.items || []).filter(c => !c.route_days || c.route_days.length === 0).length} عميل بدون أيام زيارة محددة
          </div>
        </div>
      )}

      {/* Filtered customers */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">
            {selectedDay ? `عملاء ${selectedDay}` : "كل العملاء بخط سير"}
          </h2>
          <p className="text-sm text-gray-500">{filtered.length} عميل • إجمالي ديون: {formatEGP(totalDebt)} جنيه</p>
        </div>
        {selectedDay && <button onClick={() => setSelectedDay("")} className="btn-secondary">إظهار الكل</button>}
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">الاسم</th>
                <th className="p-3 text-right">الهاتف</th>
                <th className="p-3 text-right">العنوان</th>
                <th className="p-3 text-right">أيام الزيارة</th>
                <th className="p-3 text-right">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-semibold">{c.name}</td>
                  <td className="p-3 text-xs font-mono">
                    {c.phone && <a href={`tel:${c.phone}`} className="text-elnesr-600 hover:underline">{c.phone}</a>}
                    {!c.phone && "—"}
                  </td>
                  <td className="p-3 text-xs text-gray-600">{c.address || '—'}</td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {c.route_days.map(d => (
                        <span key={d} className={`badge text-xs ${d === selectedDay ? "bg-elnesr-100 text-elnesr-800" : "bg-gray-100"}`}>{d}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 font-mono font-bold text-red-700">{formatEGP(c.balance)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-gray-400">لا يوجد عملاء</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
