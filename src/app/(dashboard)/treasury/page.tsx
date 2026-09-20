"use client";
import { useState } from "react";
import Link from "next/link";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP } from "@/lib/format";
import * as Lucide from "lucide-react";

interface Treasury {
  id: string;
  name: string;
  type: string;
  current_balance: number;
  opening_balance: number;
  notes: string | null;
  is_active: boolean;
  assigned_user?: { full_name: string } | null;
}

export default function TreasuryPage() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Treasury | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Direct Transaction Modal State
  const [directTx, setDirectTx] = useState<{ type: "deposit" | "withdrawal"; treasury?: Treasury } | null>(null);

  const { data, loading, refetch } = useApi<{ items: Treasury[]; total: number }>("/api/treasury");
  const { mutate } = useApiMutation();

  const treasuries = (data?.items || []).filter((t) => t.name.includes(search));
  const totalBalance = treasuries.reduce((s, t) => s + Number(t.current_balance), 0);
  const totalOpening = treasuries.reduce((s, t) => s + Number(t.opening_balance), 0);

  async function deleteTreasury(t: Treasury) {
    if (!confirm(`?? ???? ??? ????? "${t.name}"?`)) return;
    const { error } = await mutate("DELETE", `/api/treasury/${t.id}`);
    if (error) {
      alert("? " + error);
      return;
    }
    alert("? ?? ?????");
    refetch();
  }

  async function recalculateAll() {
    if (
      !confirm(
        "?? ?? ???? ????? ???? ?????? ????? ???? ??????? ???????? ??????? ?? ????????? ??????? ??????? ?????????"
      )
    )
      return;
    try {
      setRecalculating(true);
      const res = await fetch("/api/treasury/recalculate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        alert("? " + (json?.error?.message || "??? ??? ????? ????? ??????"));
        return;
      }
      alert("? ?? ????? ???? ?????? ????? ??????? ?????");
      refetch();
    } catch {
      alert("? ??? ??? ?? ??????");
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-2">
            <span>??</span>
            <span>??????? ?????????? ???????</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            ????? ???????? ?????? ??????? ???????? ??????? ?????? ???????? ???????? ???? ????????
          </p>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => setDirectTx({ type: "deposit" })}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-600/20 cursor-pointer"
          >
            <Lucide.PlusCircle className="w-4 h-4" />
            <span>????? ????? (+)</span>
          </button>

          <button
            onClick={() => setDirectTx({ type: "withdrawal" })}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-rose-600/20 cursor-pointer"
          >
            <Lucide.MinusCircle className="w-4 h-4" />
            <span>??? ????? (-)</span>
          </button>

          <Link
            href="/treasury/customer-payments"
            className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs sm:text-sm flex items-center gap-1 transition-all shadow-sm cursor-pointer"
          >
            <span>??</span>
            <span>?????????</span>
          </Link>

          <Link
            href="/treasury/supplier-payments"
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs sm:text-sm flex items-center gap-1 transition-all shadow-sm cursor-pointer"
          >
            <span>??</span>
            <span>?????????</span>
          </Link>

          <button
            onClick={recalculateAll}
            disabled={recalculating}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-1 cursor-pointer border border-slate-300"
            title="????? ????? ????? ??????? ?? ????????? ???????"
          >
            <Lucide.RotateCw className={`w-3.5 h-3.5 ${recalculating ? "animate-spin" : ""}`} />
            <span>{recalculating ? "????..." : "?????/????? ??????"}</span>
          </button>

          <button
            onClick={() => setShowAdd(true)}
            className="btn-primary text-xs sm:text-sm flex items-center gap-1"
          >
            <Lucide.Plus className="w-4 h-4" />
            <span>????? ?????</span>
          </button>
        </div>
      </div>

      {/* Search & Stats */}
      <div className="card">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="?? ???? ???? ??????? ?? ???????..."
          className="input-field"
          autoFocus
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500">??? ??????? ??????</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{treasuries.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
          <div className="text-xs font-bold text-emerald-700">?????? ??????? ???????</div>
          <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
            {formatEGP(totalBalance)} <span className="text-xs text-emerald-700 font-normal">?</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500">?????? ??????? ??????????</div>
          <div className="text-2xl font-black text-slate-800 font-mono mt-1">
            {formatEGP(totalOpening)} <span className="text-xs text-slate-500 font-normal">?</span>
          </div>
        </div>
      </div>

      {/* Treasury Cards Grid */}
      {loading ? (
        <div className="card text-center py-12 text-slate-400 font-bold">? ???? ???????...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {treasuries.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      {t.type}
                    </span>
                    <h3 className="font-black text-lg text-slate-900 mt-1.5">{t.name}</h3>
                    {t.assigned_user && (
                      <div className="text-xs text-slate-600 font-semibold mt-1 flex items-center gap-1">
                        <span>??</span>
                        <span>{t.assigned_user.full_name}</span>
                      </div>
                    )}
                    {t.notes && <div className="text-xs text-slate-400 mt-1">?? {t.notes}</div>}
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl">
                    ??
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold text-slate-400">?????? ?????? ??????</div>
                    <div className="text-2xl font-black text-blue-600 font-mono">
                      {formatEGP(t.current_balance)} <span className="text-xs text-slate-500 font-normal">?</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                {/* Statement Button */}
                <Link
                  href={`/treasury/${t.id}`}
                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
                >
                  <Lucide.FileText className="w-4 h-4" />
                  <span>?? ??? ???? ??????? ????????</span>
                </Link>

                {/* Quick In/Out buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDirectTx({ type: "deposit", treasury: t })}
                    className="py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center gap-1 border border-emerald-200 transition-colors cursor-pointer"
                  >
                    <Lucide.PlusCircle className="w-3.5 h-3.5" />
                    <span>????? (+)</span>
                  </button>
                  <button
                    onClick={() => setDirectTx({ type: "withdrawal", treasury: t })}
                    className="py-1.5 px-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center gap-1 border border-rose-200 transition-colors cursor-pointer"
                  >
                    <Lucide.MinusCircle className="w-3.5 h-3.5" />
                    <span>??? (-)</span>
                  </button>
                </div>

                {/* Edit and Delete */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditing(t)}
                    className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                  >
                    ?? ?????
                  </button>
                  <button
                    onClick={() => deleteTreasury(t)}
                    className="flex-1 text-xs py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold transition-colors cursor-pointer"
                  >
                    ??? ???
                  </button>
                </div>
              </div>
            </div>
          ))}
          {treasuries.length === 0 && (
            <div className="card text-center text-slate-400 py-12 col-span-full font-bold">
              ?? ???? ????? ??????
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Treasury Modal */}
      {(showAdd || editing) && (
        <TreasuryForm
          treasury={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowAdd(false);
            setEditing(null);
            refetch();
          }}
        />
      )}

      {/* Direct In/Out Transaction Modal */}
      {directTx && (
        <DirectTransactionModal
          type={directTx.type}
          initialTreasury={directTx.treasury}
          treasuries={data?.items || []}
          onClose={() => setDirectTx(null)}
          onSuccess={() => {
            setDirectTx(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

const TYPES = ["??????", "???? ?????", "?????"];

function TreasuryForm({
  treasury,
  onClose,
  onSaved,
}: {
  treasury: Treasury | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: treasury?.name || "",
    type: treasury?.type || "??????",
    opening_balance: treasury ? Number(treasury.opening_balance) : 0,
    current_balance: treasury ? Number(treasury.current_balance) : 0,
    notes: treasury?.notes || "",
    is_active: treasury?.is_active !== false,
  });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.name.trim()) {
      alert("? ??? ??????? ?????");
      return;
    }
    const url = treasury ? `/api/treasury/${treasury.id}` : "/api/treasury";
    const method = treasury ? "PATCH" : "POST";
    const { error } = await mutate(method, url, f);
    if (error) {
      alert("? " + error);
      return;
    }
    alert(treasury ? "? ?? ????? ???????" : "? ?? ????? ???????");
    onSaved();
  }

  async function recalculateThis() {
    if (!treasury) return;
    const { error } = await mutate("PATCH", `/api/treasury/${treasury.id}`, { recalculate: true });
    if (error) {
      alert("? " + error);
      return;
    }
    alert("? ?? ????? ???? ???? ??? ??????? ?????");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <h2 className="text-lg font-bold">{treasury ? "?? ????? ?????? ???????" : "?? + ????? ?????"}</h2>

        <div>
          <label className="text-sm font-medium block mb-1">??? ??????? *</label>
          <input
            className="input-field"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            autoFocus
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">?????</label>
          <select className="input-field" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">?????? ?????????</label>
            <input
              type="number"
              step="0.01"
              className="input-field font-mono"
              value={f.opening_balance}
              onChange={(e) => setF({ ...f, opening_balance: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1 text-emerald-800 font-bold">?????? ?????? *</label>
            <input
              type="number"
              step="0.01"
              className="input-field font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-300"
              value={f.current_balance}
              onChange={(e) => setF({ ...f, current_balance: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        {treasury && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setF({ ...f, current_balance: 0 })}
              className="text-xs px-2.5 py-1.5 bg-amber-100 text-amber-900 rounded-lg hover:bg-amber-200 font-bold cursor-pointer flex-1"
            >
              ? ????? ?????? (0 ?)
            </button>
            <button
              type="button"
              onClick={recalculateThis}
              className="text-xs px-2.5 py-1.5 bg-blue-100 text-blue-900 rounded-lg hover:bg-blue-200 font-bold cursor-pointer flex-1"
            >
              ?? ????? ???? ?? ???????
            </button>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-1">???????</label>
          <input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={f.is_active}
            onChange={(e) => setF({ ...f, is_active: e.target.checked })}
          />
          <label htmlFor="active" className="text-sm">
            ????
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={save} disabled={loading} className="btn-primary flex-1">
            {loading ? "???? ?????..." : "??? ?????????"}
          </button>
          <button onClick={onClose} className="btn-secondary">
            ?????
          </button>
        </div>
      </div>
    </div>
  );
}

function DirectTransactionModal({
  type,
  initialTreasury,
  treasuries,
  onClose,
  onSuccess,
}: {
  type: "deposit" | "withdrawal";
  initialTreasury?: Treasury;
  treasuries: Treasury[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [treasuryId, setTreasuryId] = useState<string>(initialTreasury?.id || (treasuries[0]?.id || ""));
  const [amount, setAmount] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!treasuryId || !amount || Number(amount) <= 0) {
      alert("???? ?????? ??????? ?????? ???? ????");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/treasury/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasury_id: treasuryId,
          type,
          amount: Number(amount),
          transaction_date: date,
          title,
          notes,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert("? " + (json?.error?.message || "??? ????? ??????"));
        return;
      }

      alert("? " + json.message);
      onSuccess();
    } catch {
      alert("? ??? ??? ??? ?????");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
            {type === "deposit" ? (
              <>
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Lucide.PlusCircle className="w-5 h-5" />
                </div>
                <span>????? ???? ????? (+)</span>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <Lucide.MinusCircle className="w-5 h-5" />
                </div>
                <span>??? ???? ????? (-)</span>
              </>
            )}
          </h3>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
            <Lucide.X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">??????? ????????? *</label>
            <select
              required
              value={treasuryId}
              onChange={(e) => setTreasuryId(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-600 outline-none"
            >
              <option value="">???? ???????...</option>
              {treasuries.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (??????: {formatEGP(t.current_balance)} ?)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">?????? (?.?) *</label>
            <input
              type="number"
              step="any"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`w-full h-11 px-3.5 border rounded-xl text-lg font-black font-mono outline-none ${
                type === "deposit"
                  ? "text-emerald-700 border-emerald-200 focus:ring-2 focus:ring-emerald-500"
                  : "text-rose-700 border-rose-200 focus:ring-2 focus:ring-rose-500"
              }`}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">?????? / ??? ?????? *</label>
            <input
              type="text"
              required
              placeholder={
                type === "deposit"
                  ? "????: ????? ????? ?? ???????? ??? ?? ?????? ????? ????..."
                  : "????: ????? ?? ?????? ???? ?????? ??? ???? ??..."
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">??????? *</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">??????? ?????? (???????)</label>
            <input
              type="text"
              placeholder="?? ?????? ????..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className={`flex-1 h-11 rounded-xl text-white font-black text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 ${
                type === "deposit"
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                  : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
              }`}
            >
              {submitting ? "???? ?????..." : type === "deposit" ? "????? ??????? (+)" : "????? ????? (-)"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 h-11 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
            >
              ?????
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
