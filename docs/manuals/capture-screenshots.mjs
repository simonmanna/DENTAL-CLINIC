/**
 * Screenshot capture for the Fshikta Dental user manuals.
 *
 * Usage (from repo root, with backend on :3001 and frontend on :5173 running):
 *   node docs/manuals/capture-screenshots.mjs
 *   node docs/manuals/capture-screenshots.mjs --only reception
 *
 * Playwright must be installed and `npx playwright install chromium` run once.
 * Logins are the demo accounts created by docs/manuals/create-demo-users.js.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "images");
const BASE = process.env.MANUAL_BASE_URL ?? "http://localhost:5173";
const PASSWORD = process.env.MANUAL_DEMO_PASSWORD ?? "Demo@1234";
const VIEWPORT = { width: 1600, height: 1000 };

const ACCOUNTS = {
  reception: "demo.reception@fshikta.local",
  clinical: "demo.dentist@fshikta.local",
  management: "demo.manager@fshikta.local",
};

/** name = output file stem, path = route, click = optional selectors to open a dialog. */
const SHOTS = {
  reception: [
    { name: "r01-login", path: "/login", anonymous: true },
    { name: "r02-dashboard", path: "/dashboard" },
    { name: "r03-patients-list", path: "/patients" },
    { name: "r04-patient-new", path: "/patients", click: ["text=New Patient"] },
    { name: "r05-appointments-calendar", path: "/appointments" },
    { name: "r06-appointment-new", path: "/appointments/new" },
    { name: "r07-draft-appointments", path: "/DraftAppointmentsPage" },
    { name: "r08-visits", path: "/visits" },
    { name: "r09-invoices", path: "/billing" },
    { name: "r10-receipts", path: "/receipts" },
    { name: "r11-payments", path: "/PaymentsList" },
    { name: "r12-notifications", path: "/notifications" },
    { name: "r13-change-password", path: "/change-password" },
  ],
  clinical: [
    { name: "c01-dashboard", path: "/dashboard" },
    { name: "c02-visits", path: "/visits" },
    { name: "c03-patients", path: "/patients" },
    { name: "c04-dental-chart", path: "/dental-chart" },
    { name: "c05-emr", path: "/emr" },
    { name: "c06-treatment-plans", path: "/treatment-plans" },
    { name: "c07-conditions-catalog", path: "/ConditionsPage" },
    { name: "c08-procedures", path: "/procedures" },
    { name: "c09-procedure-categories", path: "/procedure-categories" },
    { name: "c10-prescriptions", path: "/prescriptions-list" },
    { name: "c11-imaging", path: "/imaging" },
    { name: "c12-clinical-reports", path: "/ClinicalReportsPage" },
    { name: "c13-drugs", path: "/drugs" },
  ],
  management: [
    { name: "m01-dashboard", path: "/dashboard" },
    { name: "m02-reports", path: "/reports" },
    { name: "m03-patient-reports", path: "/PatientReportsPage" },
    { name: "m04-sales-reports", path: "/SalesReports" },
    { name: "m05-expense-reports", path: "/ExpensePaymentsReports" },
    { name: "m06-treatment-reports", path: "/TreatmentReports" },
    { name: "m07-visit-reports", path: "/VisitReports" },
    { name: "m08-inventory-reports", path: "/InventoryReports" },
    { name: "m09-general-ledger", path: "/general-ledger" },
    { name: "m10-accounts", path: "/accounts" },
    { name: "m11-expenses", path: "/expenses" },
    { name: "m12-expense-categories", path: "/expenses/categories" },
    { name: "m13-fixed-assets", path: "/fixed-assets" },
    { name: "m14-staff", path: "/staff" },
    { name: "m15-suppliers", path: "/suppliers" },
    { name: "m16-purchases", path: "/purchases" },
    { name: "m17-inventory", path: "/inventory" },
    { name: "m18-stock-ledger", path: "/stock-ledger" },
    { name: "m19-pharmacy-sales", path: "/pharmacysales" },
    { name: "m20-billing-services", path: "/billing-services" },
    { name: "m21-settings", path: "/settings" },
    { name: "m22-audit-log", path: "/audit-log" },
    { name: "m23-backups", path: "/admin/backups" },
  ],
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
  await page.waitForTimeout(1500);
}

async function capture(page, shot) {
  await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1200);
  for (const sel of shot.click ?? []) {
    await page.click(sel, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: resolve(OUT, `${shot.name}.png`), fullPage: !shot.click });
  console.log("captured", shot.name);
}

const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [role, shots] of Object.entries(SHOTS)) {
    if (only && only !== role) continue;
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && console.warn(`  [console] ${m.text()}`));
    for (const shot of shots) {
      if (shot.anonymous) {
        await capture(page, shot);
        continue;
      }
      if (!page.url().includes("/dashboard") && !ctx.__loggedIn) {
        await login(page, ACCOUNTS[role]);
        ctx.__loggedIn = true;
      }
      await capture(page, shot);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log("done →", OUT);
