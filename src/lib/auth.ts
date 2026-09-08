// ========================================
// ELNAZLAWY — Auth types & module registry
// ========================================

export type UserRole = 'admin' | 'manager' | 'accountant' | 'rep';

export interface CurrentProfile {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  can_see_cost: boolean;
  is_active: boolean;
}

export interface AllModule {
  key: string;
  label: string;
  icon: string;
  path: string;
  adminOnly?: boolean;
}

export const ALL_MODULES: AllModule[] = [
  // 🟢 للمدير (Admin / Manager)
  { key: 'dashboard',         label: 'الرئيسية',                icon: '📊', path: '/dashboard' },
  { key: 'sales',             label: 'فواتير المبيعات',         icon: '🛒', path: '/sales' },
  { key: 'purchases',         label: 'فواتير المشتريات',        icon: '📥', path: '/purchases' },
  { key: 'customers',         label: 'العملاء',                 icon: '👥', path: '/customers' },
  { key: 'suppliers',         label: 'الموردين',                icon: '🏭', path: '/suppliers' },
  { key: 'products',          label: 'الأصناف',                 icon: '🏷️', path: '/products' },
  { key: 'inventory',         label: 'المخازن',                 icon: '📦', path: '/inventory' },
  { key: 'treasury',          label: 'الخزائن',                 icon: '🏦', path: '/treasury' },
  { key: 'expenses',          label: 'المصروفات',               icon: '📉', path: '/expenses' },
  { key: 'employees',         label: 'الموظفين والرواتب',       icon: '👷', path: '/employees' },
  // 🔵 للمحاسب
  { key: 'reports',           label: 'التقارير',                icon: '📈', path: '/reports' },
  // 🟣 Admin only
  { key: 'users',             label: 'المستخدمين',              icon: '👤', path: '/admin/users', adminOnly: true },
];

export const MODULE_KEYS = ALL_MODULES.map((m) => m.key);

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مدير عام',
  manager: 'مدير',
  accountant: 'محاسب',
  rep: 'مندوب',
};

export function canSeeModule(profile: CurrentProfile | null, moduleKey: string): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  const mod = ALL_MODULES.find((m) => m.key === moduleKey);
  if (mod && mod.adminOnly) return false;

  // Reps see only their own modules (يبدأ فاتورة المبيعات من زر الصفحة)
  if (profile.role === 'rep') {
    return ['sales', 'products', 'customers'].includes(moduleKey);
  }  // Managers + Accountants see everything except admin
  return true;
}

export function canSeeCost(profile: CurrentProfile | null): boolean {
  if (!profile) return false;
  return profile.can_see_cost;
}
