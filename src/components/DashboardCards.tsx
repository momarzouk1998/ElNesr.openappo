"use client";
import React from "react";
import NumberTicker from "./NumberTicker";
import { formatEGP } from "@/lib/format";
import * as Lucide from "lucide-react";

// Mapping string icons to Lucide components
const iconMap: Record<string, React.ComponentType<any>> = {
  sales: Lucide.ShoppingCart,
  calendar: Lucide.Calendar,
  profit: Lucide.CircleDollarSign,
  folder: Lucide.FolderOpen,
  debt: Lucide.CreditCard,
  bank: Lucide.Landmark,
  check: Lucide.Receipt,
  package: Lucide.Package,
  clock: Lucide.Clock,
  list: Lucide.ClipboardList,
  chart: Lucide.BarChart3,
  users: Lucide.Users,
  factory: Lucide.Factory,
  tags: Lucide.Tags,
  building: Lucide.Building,
  alert: Lucide.AlertTriangle,
  own: Lucide.Wallet,
  partners: Lucide.Handshake,
  coins: Lucide.Coins,
};

export function KpiCard({
  iconKey,
  label,
  value,
  subValue,
  color,
  isCurrency = false,
}: {
  iconKey: string;
  label: string;
  value: number;
  subValue: string;
  color: "green" | "blue" | "orange" | "red" | "purple" | "yellow";
  isCurrency?: boolean;
}) {
  const IconComponent = iconMap[iconKey] || Lucide.HelpCircle;

  const colorClasses = {
    green: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-600 shadow-emerald-500/5",
    blue: "from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-600 shadow-blue-500/5",
    orange: "from-amber-500/15 to-amber-500/5 border-amber-500/30 text-amber-600 shadow-amber-500/5",
    red: "from-rose-500/10 to-rose-500/5 border-rose-500/20 text-rose-600 shadow-rose-500/5",
    purple: "from-purple-500/10 to-purple-500/5 border-purple-500/20 text-purple-600 shadow-purple-500/5",
    yellow: "from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-700 shadow-amber-500/5",
  };

  const glowBorder = {
    green: "group-hover:border-emerald-500/50",
    blue: "group-hover:border-blue-500/50",
    orange: "group-hover:border-amber-500/60",
    red: "group-hover:border-rose-500/50",
    purple: "group-hover:border-purple-500/50",
    yellow: "group-hover:border-amber-500/50",
  };

  return (
    <div
      className={`relative group overflow-hidden bg-gradient-to-br ${colorClasses[color]} border rounded-2xl p-5 shadow-sm transition-all duration-350 hover:-translate-y-1 hover:shadow-md ${glowBorder[color]}`}
    >
      {/* MagicUI Border Beam Glow Effect */}
      <span className="absolute inset-0 border border-transparent rounded-2xl -z-10 group-hover:bg-gradient-to-r group-hover:from-white/10 group-hover:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            {label}
          </span>
          <div className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-baseline gap-1">
            <NumberTicker
              value={value}
              formatter={(v) => (isCurrency ? formatEGP(v) : String(Math.floor(v)))}
            />
          </div>
        </div>
        <div className={`p-2.5 rounded-xl bg-white/80 shadow-sm border border-black/5`}>
          <IconComponent className="w-5 h-5" />
        </div>
      </div>
      <div className="text-[10px] text-slate-500 font-medium mt-3 border-t border-black/5 pt-2 flex items-center justify-between">
        <span>{subValue}</span>
      </div>
    </div>
  );
}

export function SmallStat({
  iconKey,
  label,
  value,
  highlight,
}: {
  iconKey: string;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  const IconComponent = iconMap[iconKey] || Lucide.HelpCircle;

  return (
    <div
      className={`flex items-center gap-3 p-4 bg-white border rounded-2xl transition-all hover:shadow-sm ${
        highlight
          ? "border-rose-300 bg-rose-50/50 text-rose-600"
          : "border-slate-100 hover:border-slate-350 text-slate-700"
      }`}
    >
      <div className={`p-2 rounded-xl ${highlight ? "bg-rose-100" : "bg-slate-50"}`}>
        <IconComponent className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold text-slate-400 leading-none mb-1">{label}</div>
        <div className={`text-base font-extrabold leading-none ${highlight ? "text-rose-600" : "text-slate-850"}`}>
          <NumberTicker value={value} />
        </div>
      </div>
    </div>
  );
}
