"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("elhoot_identifier");
    if (saved) { setIdentifier(saved); setRemember(true); }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError("من فضلك أدخل اسم المستخدم وكلمة السر");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier.trim(), password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(`❌ ${json?.error?.message || "بيانات الدخول غير صحيحة"}`);
        return;
      }
      if (remember) localStorage.setItem("elhoot_identifier", identifier);
      else localStorage.removeItem("elhoot_identifier");
      const redirect = searchParams.get("redirect") || "/dashboard";
      router.push(redirect);
      router.refresh();
    } catch (e: any) {
      setError(`❌ ${e?.message || "حدث خطأ"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-grid">
      <div className="absolute inset-0 bg-gradient-to-br from-elhoot-500/10 via-white to-amber-500/10 -z-10" />

      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-28 h-28 rounded-2xl bg-white shadow-xl mb-4 border-2 border-amber-500 p-2">
            <Image src="/logo.png" alt="شركة النسر" width={100} height={100} className="rounded-xl object-contain" priority />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800">شركة النسر</h1>
          <p className="text-sm text-elhoot-600 font-bold mt-1">El Hoot Electrical Systems</p>
          <p className="text-gray-600 mt-2 text-sm">لتجارة وتوزيع الأدوات واللوحات الكهربائية بالجملة</p>
        </div>

        <div className="bg-white rounded-2xl shadow-elevated p-8 border border-gray-100">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                رقم الهاتف (أو اسم المستخدم)
              </label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="01002082609"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-elhoot-500/30 focus:border-elhoot-500 text-left font-mono"
                dir="ltr"
                autoComplete="tel"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">كلمة السر</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-elhoot-500/30 focus:border-elhoot-500"
                  autoComplete="current-password"
                  required
                />
                <button type="button" onClick={() => setShowPw(s => !s)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-4 h-4 rounded accent-elhoot-500" />
              <span className="text-sm text-gray-700">تذكر بياناتي</span>
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-start gap-2">
                <span className="text-lg">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-elhoot-500 hover:bg-elhoot-600 text-white font-bold py-3 rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (<><span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> جاري الدخول...</>) : "دخول النظام"}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-500 leading-relaxed">
              هذا النظام مخصص لـ شركة النسر للأدوات الكهربائية.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          شركة النسر للأدوات الكهربائية © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">⏳ جاري التحميل...</div>}>
      <LoginForm />
    </Suspense>
  );
}
