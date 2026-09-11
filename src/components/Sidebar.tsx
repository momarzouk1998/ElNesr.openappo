"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { ALL_MODULES, canSeeModule, type CurrentProfile, ROLE_LABELS } from "@/lib/auth";
import Image from "next/image";
import {
  LayoutDashboard,
  ShoppingCart,
  Download,
  Users,
  Factory,
  Tags,
  Package,
  Landmark,
  BarChart3,
  TrendingUp,
  UserCheck,
  ChevronRight,
  ChevronLeft,
  Menu,
  X,
  LogOut,
  User,
  Smartphone,
  AlertTriangle
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  dashboard: LayoutDashboard,
  sales: ShoppingCart,
  purchases: Download,
  customers: Users,
  suppliers: Factory,
  products: Tags,
  inventory: Package,
  treasury: Landmark,
  expenses: BarChart3,
  reports: TrendingUp,
  users: UserCheck,
};

export default function Sidebar({ profile }: { profile: CurrentProfile }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [metrics, setMetrics] = useState({ lowStock: 0, todaySales: 0 });

  // Touch Swipe to Close Drawer
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);

  // Load sidebar collapse preference
  useEffect(() => {
    const saved = localStorage.getItem("elnesr_sidebar_collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  // Fetch Live Metrics
  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch("/api/dashboard/sidebar-metrics");
        const json = await res.json();
        if (json.ok) setMetrics(json.data);
      } catch (e) {
        console.error("Failed to fetch sidebar metrics", e);
      }
    }
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close drawer on path change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on ESC key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function handleInstallApp() {
    // @ts-ignore
    const deferredPrompt = typeof window !== "undefined" ? window.deferredPrompt : null;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult?.outcome === "accepted") {
          // @ts-ignore
          window.deferredPrompt = null;
        }
      });
    } else {
      alert("📲 لتثبيت التطبيق على هاتفك فوراً:\n\n1️⃣ اضغط على علامة القائمة (⋮) أعلى متصفح Chrome.\n2️⃣ اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».\n\nسينزل التطبيق على شاشة الموبايل كأيقونة مستقلة فوراً بدون الحاجة لملفات APK وبأعلى درجات الأمان.");
    }
  }

  const toggleCollapse = () => {
    const nextState = !collapsed;
    setCollapsed(nextState);
    localStorage.setItem("elnesr_sidebar_collapsed", String(nextState));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current !== null && touchCurrentX.current !== null) {
      const deltaX = touchCurrentX.current - touchStartX.current;
      // In RTL: swiping to the right (positive deltaX) slides drawer away to the right (closes it)
      if (deltaX > 70) {
        setOpen(false);
      }
    }
    touchStartX.current = null;
    touchCurrentX.current = null;
  };

  const visible = ALL_MODULES.filter(m => {
    if (profile.username === 'admin' && m.key === 'users') return false;
    return canSeeModule(profile, m.key);
  });

  return (
    <>
      {/* ====== Mobile top bar ====== */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-header-gradient text-white px-3 py-2.5 flex items-center justify-between shadow-lg safe-area-top">
        <button
          onClick={() => setOpen(!open)}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 text-white shrink-0 transition-colors"
          aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <div className="font-extrabold text-sm truncate flex-1 text-center px-4">شركة النسر للأدوات الكهربائية</div>
        <div className="w-11 h-11 rounded-xl bg-white p-1 border-2 border-amber-500 shrink-0 shadow-sm flex items-center justify-center overflow-hidden">
          <img src="/logo.png?v=5" alt="شركة النسر" className="w-full h-full object-contain" />
        </div>
      </header>

      {/* ====== Mobile drawer (overlay) ====== */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-all duration-300"
          onClick={() => setOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="absolute right-0 top-0 h-full w-[290px] max-w-[85vw] bg-header-gradient text-white shadow-2xl flex flex-col transition-transform duration-300 ease-out translate-x-0"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-white p-1 border-2 border-amber-500 shrink-0 shadow-sm flex items-center justify-center overflow-hidden">
                  <img src="/logo.png?v=5" alt="شركة النسر" className="w-full h-full object-contain" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm leading-tight truncate">شركة النسر</div>
                  <div className="text-[10px] text-blue-200 font-medium truncate">
                    {profile.full_name} • {ROLE_LABELS[profile.role]}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarContent visible={visible} pathname={pathname} onNavigate={() => setOpen(false)} metrics={metrics} />
            </div>
            <div className="p-3 border-t border-white/10 flex items-center gap-2">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all shrink-0 flex items-center justify-center"
                title="الملف الشخصي"
              >
                <User className="w-4 h-4" />
              </Link>
              <button
                onClick={handleInstallApp}
                className="flex-1 py-2 px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200 text-xs font-bold transition-all cursor-pointer truncate"
              >
                <Smartphone className="w-4 h-4" />
                <span>تثبيت</span>
              </button>
              <button
                onClick={logout}
                className="py-2 px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-200 text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
                <span>خروج</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ====== Desktop sidebar ====== */}
      <aside
        className={`hidden md:flex flex-col bg-header-gradient text-white h-screen sticky top-0 shadow-2xl shrink-0 transition-all duration-300 ease-in-out ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        <div className="relative flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="p-4 border-b-4 border-amber-500 flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-white p-1 border-2 border-amber-500 shrink-0 shadow-sm flex items-center justify-center overflow-hidden">
                <img src="/logo.png?v=5" alt="شركة النسر" className="w-full h-full object-contain" />
              </div>
              {!collapsed && (
                <div className="min-w-0 animate-fade-in">
                  <div className="font-extrabold text-sm leading-tight truncate">شركة النسر</div>
                  <div className="text-[10px] text-amber-300 font-bold truncate">
                    {profile ? profile.full_name : "للأدوات الكهربائية"}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Toggle Button */}
          <button
            onClick={toggleCollapse}
            className="absolute -left-3 top-16 bg-amber-500 hover:bg-amber-600 text-slate-900 w-6 h-6 rounded-full flex items-center justify-center border border-white/20 shadow-md cursor-pointer transition-all hover:scale-105 z-30"
            title={collapsed ? "توسيع القائمة" : "طي القائمة"}
          >
            {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <SidebarContent
              visible={visible}
              pathname={pathname}
              onNavigate={() => {}}
              collapsed={collapsed}
              metrics={metrics}
            />
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-white/10 flex items-center gap-2">
            <Link
              href="/profile"
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all shrink-0 flex items-center justify-center"
              title="الملف الشخصي"
            >
              <User className="w-4 h-4" />
            </Link>
            {!collapsed ? (
              <>
                <button
                  onClick={handleInstallApp}
                  className="flex-1 py-2 px-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200 text-xs font-bold transition-all cursor-pointer truncate flex items-center justify-center gap-1 animate-fade-in"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>تثبيت</span>
                </button>
                <button
                  onClick={logout}
                  className="py-2 px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-200 text-xs font-bold transition-all cursor-pointer shrink-0 animate-fade-in"
                >
                  <LogOut className="w-4 h-4" />
                  <span>خروج</span>
                </button>
              </>
            ) : (
              <button
                onClick={logout}
                className="flex-1 p-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-200 text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function SidebarContent({
  visible,
  pathname,
  onNavigate,
  collapsed = false,
  metrics,
}: {
  visible: any[];
  pathname: string;
  onNavigate: () => void;
  collapsed?: boolean;
  metrics: { lowStock: number; todaySales: number };
}) {
  const activeModule = visible.reduce<any | null>((best, module) => {
    if (!module.path) return best;
    if (pathname === module.path) return module;
    if (pathname.startsWith(`${module.path}/`)) {
      if (!best || module.path.length > best.path.length) return module;
    }
    return best;
  }, null);

  return (
    <nav className="flex-1 py-4 space-y-2.5">
      {visible.map((m) => {
        const active = activeModule?.key === m.key;
        const IconComponent = ICON_MAP[m.key] || LayoutDashboard;

        // Custom live badge counts
        let badgeCount = 0;
        let badgeColor = "bg-amber-500 text-slate-900";
        let isAlert = false;

        if (m.key === "inventory" && metrics.lowStock > 0) {
          badgeCount = metrics.lowStock;
          badgeColor = "bg-red-500 text-white animate-pulse";
          isAlert = true;
        } else if (m.key === "sales" && metrics.todaySales > 0) {
          badgeCount = metrics.todaySales;
          badgeColor = "bg-emerald-500 text-white";
        }

        return (
          <div key={m.key} className="relative group px-3">
            <Link
              href={m.path}
              onClick={onNavigate}
              prefetch={true}
              className={`flex items-center rounded-xl transition-all duration-200 relative overflow-hidden group ${
                collapsed ? "justify-center p-3.5" : "gap-4 px-4.5 py-3.5"
              } ${
                active
                  ? "bg-white/10 text-amber-500 font-extrabold shadow-inner"
                  : "text-slate-200 hover:bg-white/5 hover:text-white"
              }`}
            >
              {/* Active Slide-in Indicator (Glow Pill) */}
              {active && (
                <span className="absolute right-0 top-0 bottom-0 w-2 bg-amber-500 rounded-l-full shadow-[0_0_10px_#f7941d]" />
              )}

              <IconComponent
                className={`w-[22px] h-[22px] shrink-0 transition-transform group-hover:scale-110 ${
                  active ? "text-amber-500 filter drop-shadow-[0_0_5px_rgba(247,148,29,0.5)]" : "text-slate-300"
                }`}
              />

              {!collapsed && (
                <span className="truncate flex-1 text-[15px] font-semibold">{m.label}</span>
              )}

              {/* Badge Counter */}
              {!collapsed && badgeCount > 0 && (
                <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${badgeColor}`}>
                  {isAlert ? <AlertTriangle className="w-3.5 h-3.5 inline mr-0.5 -mt-0.5" /> : null}
                  {badgeCount}
                </span>
              )}

              {collapsed && badgeCount > 0 && (
                <span className="absolute top-1.5 left-1.5 w-3 h-3 rounded-full bg-red-500 ring-2 ring-slate-900" />
              )}
            </Link>

            {/* Desktop Collapsed Tooltip */}
            {collapsed && (
              <div className="absolute right-22 top-1/2 -translate-y-1/2 bg-slate-900 border border-white/10 text-white text-xs font-bold rounded-lg py-2 px-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap shadow-xl z-50 translate-x-2 group-hover:translate-x-0">
                <div className="flex items-center gap-2">
                  <span>{m.label}</span>
                  {badgeCount > 0 && (
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${badgeColor}`}>{badgeCount}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
