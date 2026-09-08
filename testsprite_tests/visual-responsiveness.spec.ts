import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const SCREENSHOT_DIR = path.join(__dirname, "../scratch/screenshots");

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test("Visual responsiveness of El Hoot Sidebar and Dashboard", async ({ page }) => {
  // 1. Visit Login
  await page.goto("https://elnesr.openappo.com/login");
  await expect(page).toHaveTitle(/شركة النسر/);

  // 2. Perform Login
  await page.fill('input[type="text"]', "01002082609");
  await page.fill('input[type="password"]', "123456");
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL("**/dashboard");
  await expect(page.locator("h1")).toContainText("الرئيسية");

  // 3. Desktop Viewport Screenshot
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1000); // Wait for number ticker animations
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop-dashboard.png"), fullPage: true });
  console.log("Captured desktop dashboard screenshot!");

  // 4. Mobile Viewport Screenshot (Drawer Open)
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-dashboard-closed.png"), fullPage: true });

  // Open mobile drawer
  await page.click('header button[aria-label="فتح القائمة"]');
  await page.waitForTimeout(500); // Wait for transition
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-dashboard-drawer-open.png") });
  console.log("Captured mobile drawer screenshots!");
});
