"use client";
import { useRouter } from "next/navigation";
import { formatEGP } from "@/lib/format";
import { useState } from "react";
import Link from "next/link";

import { WhatsAppShareButton } from "@/components/WhatsAppShareButton";
import { InvoiceImageDownloadButton } from "@/components/InvoiceImageDownloadButton";

interface Party {
  id: string; name: string; phone: string | null; balance: number; opening_balance: number; address?: string | null;
}

interface Transaction {
  id: string; date: Date; dateStr: string; type: string; docNumber: string; debit: number; credit: number; notes: string;
}

export function StatementsClient({ type: initialType, parties, selected, transactions }: {
  type: 'customer' | 'supplier';
  parties: Party[];
  selected: Party | null;
  transactions: Transaction[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'customer' | 'supplier'>(initialType);

  const filteredParties = parties.filter(p => !search || p.name.includes(search) || (p.phone || '').includes(search));

  function changeType(t: 'customer' | 'supplier') {
    setType(t);
    router.push(`/reports/statements?type=${t}`);
  }

  function selectParty(id: string) {
    router.push(`/reports/statements?type=${type}&id=${id}`);
  }

  // حساب الرصيد التراكمي
  let runningBalance = Number(selected?.opening_balance || 0);
  const rows: Array<Transaction & { running: number }> = [];
  // سطر الرصيد الافتتاحي
  rows.push({
    id: 'opening',
    date: new Date(0),
    dateStr: '—',
    type: 'رصيد أول المدة',
    docNumber: '—',
    debit: 0,
    credit: 0,
    notes: 'رصيد افتتاحي',
    running: runningBalance,
  });
  for (const t of transactions) {
    runningBalance = runningBalance + Number(t.debit) - Number(t.credit);
    rows.push({ ...t, running: runningBalance });
  }

  const totalDebit = transactions.reduce((s, t) => s + Number(t.debit), 0);
  const totalCredit = transactions.reduce((s, t) => s + Number(t.credit), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">📋 كشوف الحسابات</h1>
          <p className="text-sm text-gray-500">كشف حساب تفصيلي مع رصيد تراكمي + تصدير صورة وواتساب</p>
        </div>
        <div className="flex gap-2 no-print flex-wrap items-center">
          {selected && (
            <>
              <WhatsAppShareButton
                targetId="statement-container"
                fileName={`كشف_حساب_${selected.name}`}
                recipientPhone={selected.phone}
                recipientName={selected.name}
                title={`كشف حساب ${type === 'customer' ? 'العميل' : 'المورد'}`}
              />
              <InvoiceImageDownloadButton
                targetId="statement-container"
                fileName={`كشف_حساب_${selected.name}`}
                label="🖼️ صورة"
              />
              <Link
                href={`/print/statement/${type}/${selected.id}`}
                target="_blank"
                className="bg-button-orange text-white px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity flex items-center gap-1"
              >
                📄 الكشف المطبوع + تفاصيل الأصناف
              </Link>
            </>
          )}
          {selected && (
            <button onClick={() => window.print()} className="btn-secondary text-sm">🖨️ طباعة</button>
          )}
        </div>
      </div>

      {/* أزرار الكشوف المجمعة */}
      <div className="card p-3 no-print">
        <div className="text-xs text-gray-500 mb-2 font-semibold">كشوف مجمعة:</div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/print/statement/all-customers"
            target="_blank"
            className="bg-elnesr-50 text-elnesr-700 border border-elnesr-200 px-4 py-2 rounded-lg font-bold text-sm hover:bg-elnesr-100 transition-colors flex items-center gap-1.5"
          >
            👥 كل العملاء
          </Link>
          <Link
            href="/print/statement/all-suppliers"
            target="_blank"
            className="bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2 rounded-lg font-bold text-sm hover:bg-gray-100 transition-colors flex items-center gap-1.5"
          >
            🏭 كل الموردين
          </Link>
        </div>
      </div>

      {/* اختيار النوع والطرف */}
      <div className="card p-4 space-y-3 no-print">
        <div className="flex gap-2">
          <button
            onClick={() => changeType('customer')}
            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors ${type === 'customer' ? 'bg-elnesr-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >👥 عميل</button>
          <button
            onClick={() => changeType('supplier')}
            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors ${type === 'supplier' ? 'bg-elnesr-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >🏭 مورد</button>
        </div>
        <input
          autoFocus
          className="input-field"
          placeholder={`🔍 ابحث عن ${type === 'customer' ? 'عميل' : 'مورد'} بالاسم أو الهاتف...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <div className="max-h-60 overflow-y-auto border rounded-lg">
            {filteredParties.length === 0 && <p className="text-center py-4 text-gray-400 text-sm">لا توجد نتائج</p>}
            {filteredParties.slice(0, 20).map(p => (
              <button
                key={p.id}
                onClick={() => { setSearch(''); selectParty(p.id); }}
                className="w-full text-right p-2 hover:bg-elnesr-50 border-b last:border-b-0 text-sm flex justify-between items-center"
              >
                <div>
                  <div className="font-semibold">{p.name}</div>
                  {p.phone && <div className="text-xs text-gray-500 font-mono">{p.phone}</div>}
                </div>
                <div className={`font-mono text-xs ${Number(p.balance) > 0 ? 'text-red-600' : Number(p.balance) < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                  {formatEGP(p.balance)} ج
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div id="statement-container" className="space-y-4 bg-white p-4 rounded-2xl border border-gray-200">
          {/* بيانات الطرف */}
          <div className="card border-0 shadow-none bg-gray-50">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold">{selected.name}</h2>
                {selected.phone && <p className="text-sm text-gray-500 font-mono">📞 {selected.phone}</p>}
                {selected.address && <p className="text-xs text-gray-500 mt-1">📍 {selected.address}</p>}
              </div>
              <div className="text-left">
                <div className="text-xs text-gray-500">الرصيد الحالي</div>
                <div className={`text-2xl font-extrabold ${Number(selected.balance) > 0 ? 'text-red-700' : Number(selected.balance) < 0 ? 'text-blue-700' : 'text-green-700'}`}>
                  {formatEGP(selected.balance)} ج
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {Number(selected.balance) > 0 ? (type === 'customer' ? 'مديون' : 'مستحق علينا') : Number(selected.balance) < 0 ? 'رصيد دائن' : 'خالص'}
                </div>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card p-3">
              <div className="text-xs text-gray-500">رصيد أول المدة</div>
              <div className="text-lg font-bold text-slate-650">{formatEGP(selected.opening_balance)}</div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-gray-500">إجمالي مدين</div>
              <div className="text-lg font-bold text-red-600">{formatEGP(totalDebit)}</div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-gray-500">إجمالي دائن</div>
              <div className="text-lg font-bold text-green-600">{formatEGP(totalCredit)}</div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-gray-500">عدد الحركات</div>
              <div className="text-lg font-bold text-slate-650">{transactions.length}</div>
            </div>
          </div>

          {/* جدول الكشف */}
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-right whitespace-nowrap">التاريخ</th>
                  <th className="p-2 text-right">البيان</th>
                  <th className="p-2 text-right">المستند</th>
                  <th className="p-2 text-right">مدين</th>
                  <th className="p-2 text-right">دائن</th>
                  <th className="p-2 text-right">الرصيد</th>
                  <th className="p-2 text-right">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t ${r.id === 'opening' ? 'bg-blue-50 font-bold' : ''}`}>
                    <td className="p-2 text-xs whitespace-nowrap">{r.dateStr}</td>
                    <td className="p-2">{r.type}</td>
                    <td className="p-2 text-xs font-mono">{r.docNumber}</td>
                    <td className="p-2 text-red-600 font-mono font-bold">
                      {r.debit > 0 ? formatEGP(r.debit) : '—'}
                    </td>
                    <td className="p-2 text-green-600 font-mono font-bold">
                      {r.credit > 0 ? formatEGP(r.credit) : '—'}
                    </td>
                    <td className={`p-2 font-mono font-bold ${r.running > 0 ? 'text-red-700' : r.running < 0 ? 'text-blue-700' : 'text-green-700'}`}>
                      {formatEGP(r.running)}
                    </td>
                    <td className="p-2 text-xs text-gray-600">{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td colSpan={3} className="p-2 text-left">الإجماليات:</td>
                  <td className="p-2 font-mono text-red-700">{formatEGP(totalDebit)}</td>
                  <td className="p-2 font-mono text-green-700">{formatEGP(totalCredit)}</td>
                  <td className="p-2 font-mono">{formatEGP(runningBalance)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {transactions.length === 0 && (
            <div className="card text-center py-12 text-gray-400">لا توجد حركات لهذا الطرف</div>
          )}
        </div>
      )}

      {!selected && (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">👆</p>
          <p>ابحث واختر {type === 'customer' ? 'عميل' : 'مورد'} لعرض كشف الحساب</p>
        </div>
      )}
    </div>
  );
}
