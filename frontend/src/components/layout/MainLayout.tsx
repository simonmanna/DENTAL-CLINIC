import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { getInitials } from "../../lib/utils";
import {
  LayoutDashboard,
  Users,
  Calendar,
  CreditCard,
  Pill,
  Package,
  UserCog,
  LogOut,
  Settings,
  Stethoscope,
  Menu,
  ChevronDown,
  X,
  Activity,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  DollarSign,
  HeartPulse,
  Shield,
  KeyRound,
  Scale,
  AlertTriangle,
  Zap,
  Landmark,
  Store,
  Banknote,
  Database,
  FolderTree,
  BarChart3,
  ClipboardList,
  ListChecks,
  MapPin,
  BookOpen,
  Boxes,
  RefreshCw,
  Microscope,
  FileText,
  ShoppingCart,
  ShieldCheck,
  FlaskConical,
  Receipt,
} from "lucide-react";
import { cn } from "../../lib/utils";

import { NotificationDropdown } from "../components/notifications/NotificationDropdown";
 
// Also add Toaster from react-hot-toast at the top of the file:
 
import { Toaster } from 'react-hot-toast';

// Header accent (avatar, notifications, footer). The sidebar itself is styled
// through the --sidebar-* tokens and `.sidebar-surface` in index.css.
const ACCENT = { base: "#0ea5e9", hover: "#0284c7", text: "#0369a1" };

// ─── NAV ITEMS ────────────────────────────────────────────────────────────────

const navItems = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/dashboard",
    badge: null,
  },
  { icon: Users, label: "Patients", path: "/patients" },
    {
    icon: Calendar,
    label: "Appointments",
    path: "#",
    children: [
      { label: "Appointments Calendar", path: "/appointments", icon: FolderTree },
      { label: "Appointments List", path: "/appointments/list", icon: ListChecks },
      { label: "Draft Appointments", path: "/DraftAppointmentsPage", icon: FlaskConical },
    ],
  },

  { icon: Calendar, label: "Visits", path: "/visits" },
    {
    icon: CreditCard,
    label: "Invoices & Receipts",
    path: "#",
    children: [
      { label: "Invoices", path: "/billing", icon: Receipt },
      { label: "Receipts", path: "/receipts", icon: FileText },
    ],
  },
  {
    icon: Pill,
    label: "Medicines",
    path: "#",
    children: [
      // { label: "Pharmacy Sales", path: "/pharmacysales", icon: Pill },
      { label: "Drug Categories", path: "/drug-categories", icon: FolderTree },
      { label: "Drugs", path: "/drug-inventory", icon: FlaskConical },
      { label: "Prescriptions", path: "/PrescriptionsList", icon: ClipboardList },
    ],
  },
  {
    icon: Stethoscope,
    label: "Clinical",
    path: "#",
    children: [
      {
        label: "Procedure Categories",
        path: "/procedure-categories",
        icon: FolderTree,
      },
      { label: "Procedures", path: "/procedures", icon: Microscope },
      { label: "Conditions/Diagnosis", path: "/ConditionsPage", icon: Microscope },
      { label: "Services", path: "/billing-services", icon: Stethoscope },
    ],
  },
  {
    icon: Package,
    label: "Inventory",
    path: "#",
    children: [
      { label: "Inventory Items", path: "/inventory", icon: Boxes },
      { label: "Stock Out", path: "/StockOut", icon: MapPin },
      { label: "Direct Stock", path: "/direct-stock", icon: Zap },
      { label: "Categories", path: "/inventory/categories", icon: FolderTree },
      // { label: "Stock Moves", path: "/stockmoves", icon: RefreshCw },
      { label: "Locations", path: "/LocationsPage", icon: MapPin },
      // { label: "Damages/Expiry", path: "/waste-records", icon: AlertTriangle },
      { label: "Adjustments", path: "/stock-adjustments", icon: Scale },
      { label: "Stock Ledger", path: "/stock-ledger", icon: BookOpen },
    ],
  },
  {
    icon: TrendingUp,
    label: "Purchases",
    path: "#",
    children: [
      { label: "Suppliers", path: "/suppliers", icon: Store },
      { label: "Purchases", path: "/purchases", icon: ShoppingCart },
    ],
  },
  {
    icon: DollarSign,
    label: "Expenses",
    path: "#",
    children: [
     { label: "Expenses", path: "/expenses", icon: Banknote },
     { label: "Payments", path: "/PaymentsList", icon: CreditCard },
     { label: "Accounts", path: "/accounts", icon: Landmark },
    ],
  },
  // {
  //   icon: Activity,
  //   label: "Cash Flow",
  //   path: "#",
  //   children: [
  //     { label: "Cash Flow", path: "/cashflow", icon: BarChart3 },
  //     { label: "Receipts", path: "/receipts", icon: FileText },
  //     { label: "Payments", path: "/PaymentsList", icon: CreditCard },
  //   ],
  // },
  { icon: UserCog, label: "Staff", path: "/staff", badge: null },
  {
    icon: Activity,
    label: "Reports",
    path: "#",
    children: [
      { label: "Medical Report", path: "/TreatmentReports", icon: FileText },
      {
        label: "Patients Report",
        path: "/PatientListReportPage",
        icon: BarChart3,
      },
      { label: "Sales & Receipts", path: "/SalesReports", icon: Receipt },
      { label: "Expenses & Payments", path: "/ExpensePaymentsReports", icon: Banknote },
      { label: "Inventory Report", path: "/InventoryReports", icon: FileText },
      { label: "General Ledger", path: "/general-ledger", icon: BookOpen },
      { label: "Audit Log", path: "/audit-log", icon: ShieldCheck },
      { label: "Backups", path: "/admin/backups", icon: Database },
    ],
  },
];

const ALL_NAV_PATHS: string[] = navItems
  .flatMap((n: { path: string; children?: { path: string }[] }) => [
    n.path,
    ...(n.children ?? []).map((c) => c.path),
  ])
  .filter((p) => p !== "#");

// ─── NAV ITEM ─────────────────────────────────────────────────────────────────
interface NavItemProps {
  item: (typeof navItems)[0];
  collapsed: boolean;
  isActive: (path: string) => boolean;
  onNavigate?: () => void;
}

function NavItem({
  item,
  collapsed,
  isActive,
  onNavigate,
}: NavItemProps) {
  const location = useLocation();
  const hasChildren = "children" in item && item.children;
  const anyChildActive = hasChildren
    ? item.children!.some((c) => isActive(c.path))
    : false;
  const [open, setOpen] = useState(anyChildActive);
  const active = isActive(item.path);

  useEffect(() => {
    if (anyChildActive) setOpen(true);
  }, [location.pathname]);

  const rowBase = cn(
    "relative flex w-full items-center gap-3 rounded-lg py-2.5 text-[14px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-accent/70",
    collapsed ? "justify-center px-0" : "px-3",
  );
  const rowState = (on: boolean) =>
    on
      ? "bg-sidebar-active-bg font-semibold text-sidebar-active shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      : "font-medium text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-active";

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          title={collapsed ? item.label : undefined}
          aria-expanded={open}
          className={cn(rowBase, rowState(anyChildActive))}
        >
          <item.icon
            className={cn(
              "h-[18px] w-[18px] shrink-0",
              anyChildActive ? "text-sidebar-active" : "text-sidebar-muted",
            )}
            strokeWidth={1.75}
          />
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">{item.label}</span>
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 text-sidebar-muted transition-transform duration-200",
                  open && "rotate-90",
                )}
              />
            </>
          )}
        </button>

        {open && !collapsed && (
          <div className="relative mb-1 ml-[21px] mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
            {item.children!.map((child) => {
              const childActive = isActive(child.path);
              return (
                <Link
                  key={child.path}
                  to={child.path}
                  onClick={onNavigate}
                  aria-current={childActive ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-accent/70",
                    childActive
                      ? "bg-sidebar-hover font-semibold text-sidebar-active"
                      : "font-normal text-sidebar-muted hover:bg-sidebar-hover/70 hover:text-sidebar-active",
                  )}
                >
                  <child.icon
                    className={cn(
                      "h-[14px] w-[14px] shrink-0 transition-colors",
                      childActive
                        ? "text-sidebar-accent"
                        : "text-sidebar-muted group-hover:text-sidebar-active",
                    )}
                  />
                  <span className="truncate">{child.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(rowBase, rowState(active))}
    >
      <item.icon
        className={cn(
          "h-[18px] w-[18px] shrink-0",
          active ? "text-sidebar-active" : "text-sidebar-muted",
        )}
        strokeWidth={1.75}
      />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge && (
        <span className="ml-auto min-w-[18px] rounded-full bg-sidebar-accent px-1.5 py-0.5 text-center text-[10px] font-bold leading-tight text-sidebar">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// ─── MAIN LAYOUT ──────────────────────────────────────────────────────────────
export function MainLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // const [showNotifications, setShowNotifications] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // ─── ADD THIS with your other useState declarations ───────────────────────────
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  // Longest matching nav path wins, so /appointments/list doesn't also light
  // up the /appointments calendar entry.
  const isActive = (path: string) => {
    if (path === "#" || !location.pathname.startsWith(path)) return false;
    return !ALL_NAV_PATHS.some(
      (p) =>
        p.length > path.length &&
        p.startsWith(path) &&
        location.pathname.startsWith(p),
    );
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const currentPage =
    navItems.find((n) => isActive(n.path))?.label ||
    navItems
      .flatMap((n) => ("children" in n && n.children ? n.children : []))
      .find((c) => isActive(c.path))?.label ||
    "Dashboard";

  const navSharedProps = {
    collapsed,
    isActive,
    onNavigate: () => setMobileOpen(false),
  };

  const sidebarContent = (
    <div className="sidebar-surface flex h-full flex-col">
      {/* Brand */}
      <div
        className={cn(
          "flex h-[68px] shrink-0 items-center px-4",
          collapsed ? "justify-center" : "gap-3",
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-[0_4px_14px_rgba(14,165,233,0.45)] ring-1 ring-white/20">
          <HeartPulse className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[16px] font-bold tracking-[-0.01em] text-sidebar-active">
              Fshikta Dental
            </span>
            <span className="truncate text-[12px] font-medium text-sidebar-muted">
              Clinic Management
            </span>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted outline-none transition-colors hover:bg-sidebar-hover hover:text-sidebar-active focus-visible:ring-2 focus-visible:ring-sidebar-accent/70 lg:flex"
          >
            <PanelLeftClose className="h-[17px] w-[17px]" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="mx-auto mb-1 hidden h-7 w-7 items-center justify-center rounded-md text-sidebar-muted outline-none transition-colors hover:bg-sidebar-hover hover:text-sidebar-active focus-visible:ring-2 focus-visible:ring-sidebar-accent/70 lg:flex"
        >
          <PanelLeftOpen className="h-[17px] w-[17px]" />
        </button>
      )}

      {/* Nav */}
      <nav className="sidebar-scroll flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navItems.map((item) => (
          <NavItem
            key={`${item.label}-${item.path}`}
            item={item}
            {...navSharedProps}
          />
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="shrink-0 space-y-1 border-t border-sidebar-border px-3 py-2.5">
        <Link
          to="/settings"
          title={collapsed ? "Settings" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg py-2.5 text-[14px] font-medium text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-hover hover:text-sidebar-active focus-visible:ring-2 focus-visible:ring-sidebar-accent/70",
            collapsed ? "justify-center" : "px-3",
          )}
        >
          <Settings className="h-[18px] w-[18px] shrink-0 text-sidebar-muted" strokeWidth={1.75} />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={handleLogout}
          title={collapsed ? "Sign Out" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg py-2.5 text-[14px] font-medium text-sidebar-foreground outline-none transition-colors hover:bg-red-500/20 hover:text-red-100 focus-visible:ring-2 focus-visible:ring-danger/70",
            collapsed ? "justify-center" : "px-3",
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 text-sidebar-muted" strokeWidth={1.75} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Toaster position="top-right" />

      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "z-30 hidden shrink-0 flex-col border-r border-sidebar-border transition-[width] duration-200 ease-out lg:flex",
            collapsed ? "w-[72px]" : "w-[264px]",
          )}
        >
          {sidebarContent}
        </aside>

        {/* Mobile Overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="absolute inset-0 bg-foreground/45 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative flex w-[264px] flex-col border-r border-sidebar-border shadow-lg">
              {sidebarContent}
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-hover text-sidebar-foreground transition-colors hover:bg-sidebar-active-bg hover:text-sidebar-active"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </aside>
          </div>
        )}

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Header */}
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-3 sm:px-4">
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  window.innerWidth < 1024
                    ? setMobileOpen((o) => !o)
                    : setCollapsed((c) => !c)
                }
                aria-label="Toggle navigation"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Menu className="h-[17px] w-[17px]" />
              </button>

              {/* Breadcrumb */}
              <nav
                aria-label="Breadcrumb"
                className="ml-1 hidden items-center gap-1.5 md:flex"
              >
                <Link
                  to="/dashboard"
                  className="rounded text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Home
                </Link>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-border" />
                <span
                  aria-current="page"
                  className="text-[13px] font-semibold text-foreground"
                >
                  {currentPage}
                </span>
              </nav>
            </div>

            {/* Right */}
            <div className="flex items-center gap-1">
               <NotificationDropdown accentColor={ACCENT.base} />

              {/* Divider */}
              <div
                style={{
                  width: 1,
                  height: 24,
                  background: "#e2e8f0",
                  margin: "0 4px",
                }}
              />

              {/* User Dropdown */}
              <div className="relative" data-user-menu>
                <button
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2.5 pl-1 cursor-pointer group"
                >
                  <div
                    className="flex items-center justify-center rounded-lg text-white text-xs font-bold transition-transform"
                    style={{
                      width: 32,
                      height: 28,
                      background: `linear-gradient(135deg, ${ACCENT.base}, ${ACCENT.hover})`,
                    }}
                  >
                    {user?.staff ? getInitials(user.staff.firstName) : "AD"}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#1e293b",
                        lineHeight: 1.3,
                        margin: 0,
                      }}
                    >
                      {user?.staff?.firstName || "Admin"}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        lineHeight: 1.3,
                        margin: 0,
                      }}
                    >
                      {user?.role || "Admin"}
                    </p>
                  </div>
                  <ChevronDown
                    style={{
                      width: 13,
                      height: 13,
                      color: "#94a3b8",
                      transition: "transform 0.2s",
                    }}
                    className={`hidden sm:block ${userMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Dropdown Menu */}
                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-11 z-50 overflow-hidden"
                    style={{
                      width: 200,
                      background: "#fff",
                      borderRadius: 12,
                      boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
                      border: "1px solid #e8edf2",
                    }}
                  >
                    {/* User Info Header */}
                    <div
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#1e293b",
                          margin: 0,
                        }}
                      >
                        {user?.staff
                          ? `${user.staff.firstName} ${user.staff.lastName}`
                          : "Administrator"}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          margin: "4px 0 0",
                        }}
                      >
                        {user?.email || "admin@smilecare.com"}
                      </p>
                    </div>

                    {/* Menu Items */}
                    <div style={{ padding: 8 }}>
                      <Link
                        to="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted/50"
                        style={{ color: "#334155" }}
                      >
                        <Settings
                          style={{ width: 14, height: 14, color: "#64748b" }}
                        />
                        Settings
                      </Link>

                      <Link
                        to="/change-password"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted/50"
                        style={{ color: "#334155" }}
                      >
                        <KeyRound
                          style={{ width: 14, height: 14, color: "#64748b" }}
                        />
                        Change Password
                      </Link>

                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-danger-muted/60 text-left mt-0.5"
                        style={{ color: "#ef4444" }}
                      >
                        <LogOut style={{ width: 14, height: 14 }} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-0 md:p-1">{children}</main>

          {/* Footer */}
          <footer
            className="flex items-center justify-between shrink-0 px-6 py-2"
            style={{ background: "#fff", borderTop: "1px solid #e8edf2" }}
          >
            <span style={{ fontSize: 11.5, color: "#94a3b8" }}>
              © 2024–2026{" "}
              <span style={{ color: ACCENT.text, fontWeight: 600 }}>
                Fshikta Dental
              </span>{" "}
              Dental Management System
            </span>
            <span
              style={{ fontSize: 11.5, color: "#cbd5e1" }}
              className="hidden sm:inline"
            >
              v2.1.0
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}
