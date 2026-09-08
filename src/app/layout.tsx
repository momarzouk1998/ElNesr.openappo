import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Cairo } from "next/font/google";
import { COOKIE_NAME, verifySession } from "@/lib/db/auth";
import prisma from "@/lib/db/prisma";
import type { CurrentProfile, UserRole } from "@/lib/auth";
import "./globals.css";

export const dynamic = "force-dynamic";

// خط Cairo محمّل ذاتياً بواسطة Next (يستخدم display: swap فلا يحجب الرسم)
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-cairo",
  preload: true,
  fallback: ["Segoe UI", "Tahoma", "sans-serif"],
});

export const metadata: Metadata = {
  title: "شركة النسر للأدوات الكهربائية - نظام الإدارة",
  description: "نظام إدارة شركة النسر لتجارة وتوزيع الأدوات واللوحات الكهربائية. إدارة المخزون، المبيعات، كشوفات الحساب، والتقارير المالية.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "النسر", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/logo.png?v=20260825", sizes: "32x32", type: "image/png" },
      { url: "/logo.png?v=20260825", sizes: "192x192", type: "image/png" },
      { url: "/logo.png?v=20260825", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/logo.png?v=20260825"],
    apple: [
      { url: "/logo.png?v=20260825", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f4185",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

async function getInitialUser(): Promise<CurrentProfile | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = await verifySession(token);
    if (!payload) return null;
    const user = await prisma.users.findFirst({
      where: { id: payload.sub, is_active: true },
      select: { id: true, username: true, full_name: true, role: true, can_see_cost: true, is_active: true },
    });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role as UserRole,
      can_see_cost: user.can_see_cost,
      is_active: user.is_active,
    };
  } catch {
    return null;
  }
}

async function checkSubscription(): Promise<{ active: boolean; status?: string; daysLeft?: number; graceDaysLeft?: number; message?: string }> {
  try {
    const adminUrl = process.env.ADMIN_API_URL || "https://admin.openappo.com";
    const systemName = process.env.SYSTEM_NAME || "elnesr";

    const res = await fetch(`${adminUrl}/api/subscription/verify?system=${systemName}`, {
      cache: "no-store", // Instant realtime checks on every refresh
    });
    
    if (!res.ok) return { active: true };
    const data = await res.json();
    return data;
  } catch (error) {
    console.error("Subscription check failed:", error);
    return { active: true }; // Do not block if admin server is unreachable
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const subStatus = await checkSubscription();

  if (!subStatus.active) {
    return (
      <html lang="ar" dir="rtl" className={cairo.variable}>
        <head>
          <title>System Blocked</title>
        </head>
        <body className="min-h-screen font-[var(--font-cairo)] bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border-t-4 border-red-500">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">انتهت صلاحية الاشتراك</h1>
            <p className="text-gray-600 mb-6">
              {subStatus.message || "عفواً، لقد انتهت صلاحية اشتراك هذا النظام. يرجى التواصل مع الإدارة لتجديد الاشتراك واستعادة الوصول."}
            </p>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="ar" dir="rtl" className={cairo.variable} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo.png?v=20260825" type="image/png" sizes="any" />
        <link rel="shortcut icon" href="/logo.png?v=20260825" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png?v=20260825" />
      </head>
      <body className="min-h-screen font-[var(--font-cairo)] flex flex-col">
        {subStatus.status === "expiring_soon" && (
          <div className="no-print print:hidden bg-yellow-500 text-black px-4 py-2 text-center text-sm font-bold w-full shadow-sm">
            {subStatus.message}
          </div>
        )}
        {subStatus.status === "grace_period" && (
          <div className="no-print print:hidden bg-red-500 text-white px-4 py-2 text-center text-sm font-bold w-full shadow-sm">
            {subStatus.message}
          </div>
        )}
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                let deferredPrompt;
                window.addEventListener('beforeinstallprompt', (e) => {
                  e.preventDefault();
                  deferredPrompt = e;
                  window.deferredPrompt = deferredPrompt;
                });

                // Unregister any old Service Worker and wipe cache
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then((registrations) => {
                    for (const reg of registrations) {
                      reg.unregister();
                    }
                  });
                }
                if (typeof window !== 'undefined' && 'caches' in window) {
                  caches.keys().then((names) => {
                    for (const name of names) {
                      caches.delete(name);
                    }
                  });
                }
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
