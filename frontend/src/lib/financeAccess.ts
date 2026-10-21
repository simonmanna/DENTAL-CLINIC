// Finance visibility: the owner wants invoices, receipts, cash and financial
// reports seen only by admins and the front desk — not by clinical staff.
// The backend enforces the same roles; this only keeps the UI tidy.

export const FINANCE_ROLES = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"];

export function canViewFinance(role?: string | null): boolean {
  return !!role && FINANCE_ROLES.includes(role);
}

/** Pages (nav entries + routes) that only finance roles may open. */
export const FINANCE_PATHS = [
  "/billing",
  "/receipts",
  "/VisitBillingPage",
  "/expenses",
  "/PaymentsList",
  "/supplierpayment",
  "/cash-flow",
  "/accounts",
  "/SalesReports",
  "/ExpensePaymentsReports",
  "/general-ledger",
  "/VisitReports",
  "/reports",
];

export function isFinancePath(path: string): boolean {
  return FINANCE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}
