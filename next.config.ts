import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // رقم النسخة = SHA بتاع الـ commit (build-arg) — ثابت فى كل مراحل الـ build.
  // (Date.now() كان بيتحسب لكل مرحلة لوحدها فالمتصفح والسيرفر بياخدوا أرقام مختلفة
  // والشريط بيفضل ظاهر على طول.) بيتغير مع كل build — الواجهة بتقارنه برقم السيرفر عشان تعرف إن فيه تحديث
  env: { APP_BUILD_ID: process.env.BUILD_ID || 'dev' },
  output: "standalone",
  // ضغط ردود API: gzip/brotli عبر Next
  compress: true,
  // توليد صفحات ثابتة (RSC) أسرع
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // staleTimes: تصفير الكاش في المتصفح لضمان تحميل البيانات الطازجة دائماً
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  async headers() {
    return [
      // Security headers + cache hints
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Service Worker
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // Static assets — cache long (1 year)
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // الصور — cache يوم
      {
        source: "/(icons|images|.*\\.(?:png|jpg|jpeg|svg|webp|ico))",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
