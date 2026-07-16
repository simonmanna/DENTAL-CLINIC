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
  Palette,
  TrendingUp,
  DollarSign,
  HeartPulse,
  Shield,
  KeyRound,
} from "lucide-react";
import { cn } from "../../lib/utils";

import { NotificationDropdown } from "../components/notifications/NotificationDropdown";
 
// Also add Toaster from react-hot-toast at the top of the file:
 
import { Toaster } from 'react-hot-toast';

// ─── THEME DEFINITIONS ────────────────────────────────────────────────────────
export type ThemeKey =
  | "skyBlue"
  | "oceanTeal"
  | "slateNavy"
  | "sageGreen"
  | "warmIndigo";

interface Theme {
  key: ThemeKey;
  label: string;
  swatch: string;
  sidebar: string;
  sidebarBorder: string;
  sidebarText: string;
  sidebarMuted: string;
  sidebarHover: string;
  sidebarActive: string;
  sidebarActiveBg: string;
  sidebarActiveBar: string;
  brandBg: string;
  accent: string;
  accentHover: string;
  accentText: string;
  badgeBg: string;
}

const THEMES: Record<ThemeKey, Theme> = {
  skyBlue: {
    key: "skyBlue",
    label: "Sky Blue",
    swatch: "#38bdf8",
    // A more vibrant, luminous gradient that feels "airy"
    sidebar:
      "linear-gradient(180deg, #0369a1 100%, #0369a1 100%, #0369a1 100%)",
    sidebarBorder: "rgba(255, 255, 255, 0.12)",
    sidebarText: "#f0f9ff",
    sidebarMuted: "rgba(186, 230, 255, 0.65)",
    sidebarHover: "rgba(255, 255, 255, 0.12)",
    sidebarActive: "#ffffff",
    sidebarActiveBg: "rgba(255, 255, 255, 0.22)",
    sidebarActiveBar: "#ffffff", // Pure white bar for high-end feel
    brandBg: "rgba(255, 255, 255, 0.2)",
    accent: "#0ea5e9",
    accentHover: "#0284c7",
    accentText: "#0369a1",
    badgeBg: "#7dd3fc",
  },
  oceanTeal: {
    key: "oceanTeal",
    label: "Ocean Teal",
    swatch: "#14b8a6",
    // Shifted from muddy teal to a "Borealis" deep sea vibe
    sidebar: "linear-gradient(180deg, #14b8a6 0%, #0d9488 45%, #064e3b 100%)",
    sidebarBorder: "rgba(255, 255, 255, 0.10)",
    sidebarText: "#f0fdfa",
    sidebarMuted: "rgba(153, 246, 228, 0.60)",
    sidebarHover: "rgba(255, 255, 255, 0.08)",
    sidebarActive: "#ffffff",
    sidebarActiveBg: "rgba(255, 255, 255, 0.18)",
    sidebarActiveBar: "#5eead4",
    brandBg: "rgba(255, 255, 255, 0.15)",
    accent: "#0d9488",
    accentHover: "#0f766e",
    accentText: "#134e4a",
    badgeBg: "#2dd4bf",
  },
  slateNavy: {
    key: "slateNavy",
    label: "Slate Navy",
    swatch: "#475569",
    // Deep "Midnight" aesthetic for better professional contrast
    sidebar: "linear-gradient(180deg, #334155 0%, #1e293b 45%, #0f172a 100%)",
    sidebarBorder: "rgba(255, 255, 255, 0.05)",
    sidebarText: "#f8fafc",
    sidebarMuted: "rgba(148, 163, 184, 0.70)",
    sidebarHover: "rgba(255, 255, 255, 0.06)",
    sidebarActive: "#ffffff",
    sidebarActiveBg: "rgba(255, 255, 255, 0.10)",
    sidebarActiveBar: "#38bdf8",
    brandBg: "rgba(255, 255, 255, 0.08)",
    accent: "#3b82f6",
    accentHover: "#2563eb",
    accentText: "#1d4ed8",
    badgeBg: "#60a5fa",
  },
  sageGreen: {
    key: "sageGreen",
    label: "Sage Green",
    swatch: "#65a30d",
    // More "Evergreen/Forest" depth while keeping the Sage softness
    sidebar: "linear-gradient(180deg, #65a30d 0%, #3f6212 45%, #1a2e05 100%)",
    sidebarBorder: "rgba(255, 255, 255, 0.08)",
    sidebarText: "#f7fee7",
    sidebarMuted: "rgba(190, 242, 100, 0.55)",
    sidebarHover: "rgba(255, 255, 255, 0.08)",
    sidebarActive: "#ffffff",
    sidebarActiveBg: "rgba(255, 255, 255, 0.15)",
    sidebarActiveBar: "#bef264",
    brandBg: "rgba(255, 255, 255, 0.12)",
    accent: "#65a30d",
    accentHover: "#4d7c0f",
    accentText: "#365314",
    badgeBg: "#a3e635",
  },
  warmIndigo: {
    key: "warmIndigo",
    label: "Warm Indigo",
    swatch: "#6366f1",
    // Premium "Cyber" Indigo with high vibrancy
    sidebar: "linear-gradient(180deg, #818cf8 0%, #6366f1 45%, #4338ca 100%)",
    sidebarBorder: "rgba(255, 255, 255, 0.12)",
    sidebarText: "#eef2ff",
    sidebarMuted: "rgba(199, 210, 254, 0.65)",
    sidebarHover: "rgba(255, 255, 255, 0.10)",
    sidebarActive: "#ffffff",
    sidebarActiveBg: "rgba(255, 255, 255, 0.20)",
    sidebarActiveBar: "#c7d2fe",
    brandBg: "rgba(255, 255, 255, 0.18)",
    accent: "#6366f1",
    accentHover: "#4f46e5",
    accentText: "#3730a3",
    badgeBg: "#a5b4fc",
  },
};
// const THEMES: Record<ThemeKey, Theme> = {
// skyBlue: {
//   key: 'skyBlue',
//   label: 'Sky Blue',
//   swatch: '#0ea5e9',
//   sidebar: 'linear-gradient(180deg, #0c8ec9 0%, #0a7ab5 45%, #076096 100%)',
//   sidebarBorder: 'rgba(255,255,255,0.10)',
//   sidebarText: 'rgba(224,242,255,0.90)',
//   sidebarMuted: 'rgba(186,230,255,0.55)',
//   sidebarHover: 'rgba(255,255,255,0.10)',
//   sidebarActive: '#ffffff',
//   sidebarActiveBg: 'rgba(255,255,255,0.18)',
//   sidebarActiveBar: '#bae6fd',
//   brandBg: 'rgba(255,255,255,0.18)',
//   accent: '#0ea5e9',
//   accentHover: '#0284c7',
//   accentText: '#0369a1',
//   badgeBg: '#38bdf8',
// },
//   oceanTeal: {
//     key: 'oceanTeal',
//     label: 'Ocean Teal',
//     swatch: '#0d9488',
//     sidebar: 'linear-gradient(180deg, #0d9488 0%, #0b7a70 45%, #085f5a 100%)',
//     sidebarBorder: 'rgba(255,255,255,0.10)',
//     sidebarText: 'rgba(204,251,241,0.90)',
//     sidebarMuted: 'rgba(153,246,228,0.55)',
//     sidebarHover: 'rgba(255,255,255,0.10)',
//     sidebarActive: '#ffffff',
//     sidebarActiveBg: 'rgba(255,255,255,0.18)',
//     sidebarActiveBar: '#5eead4',
//     brandBg: 'rgba(255,255,255,0.18)',
//     accent: '#0d9488',
//     accentHover: '#0f766e',
//     accentText: '#0f766e',
//     badgeBg: '#2dd4bf',
//   },
//   slateNavy: {
//     key: 'slateNavy',
//     label: 'Slate Navy',
//     swatch: '#334155',
//     sidebar: 'linear-gradient(180deg, #1e293b 0%, #162032 45%, #0f1622 100%)',
//     sidebarBorder: 'rgba(255,255,255,0.07)',
//     sidebarText: 'rgba(226,232,240,0.88)',
//     sidebarMuted: 'rgba(148,163,184,0.55)',
//     sidebarHover: 'rgba(255,255,255,0.07)',
//     sidebarActive: '#ffffff',
//     sidebarActiveBg: 'rgba(255,255,255,0.13)',
//     sidebarActiveBar: '#7dd3fc',
//     brandBg: 'rgba(255,255,255,0.10)',
//     accent: '#3b82f6',
//     accentHover: '#2563eb',
//     accentText: '#1d4ed8',
//     badgeBg: '#60a5fa',
//   },
//   sageGreen: {
//     key: 'sageGreen',
//     label: 'Sage Green',
//     swatch: '#4d7c5e',
//     sidebar: 'linear-gradient(180deg, #3d6b4f 0%, #2f5840 45%, #1e3d2a 100%)',
//     sidebarBorder: 'rgba(255,255,255,0.09)',
//     sidebarText: 'rgba(220,252,231,0.90)',
//     sidebarMuted: 'rgba(167,243,208,0.55)',
//     sidebarHover: 'rgba(255,255,255,0.09)',
//     sidebarActive: '#ffffff',
//     sidebarActiveBg: 'rgba(255,255,255,0.17)',
//     sidebarActiveBar: '#86efac',
//     brandBg: 'rgba(255,255,255,0.15)',
//     accent: '#16a34a',
//     accentHover: '#15803d',
//     accentText: '#166534',
//     badgeBg: '#4ade80',
//   },
//   warmIndigo: {
//     key: 'warmIndigo',
//     label: 'Warm Indigo',
//     swatch: '#4f46e5',
//     sidebar: 'linear-gradient(180deg, #4338ca 0%, #3730a3 45%, #2e2986 100%)',
//     sidebarBorder: 'rgba(255,255,255,0.10)',
//     sidebarText: 'rgba(224,231,255,0.90)',
//     sidebarMuted: 'rgba(165,180,252,0.55)',
//     sidebarHover: 'rgba(255,255,255,0.10)',
//     sidebarActive: '#ffffff',
//     sidebarActiveBg: 'rgba(255,255,255,0.17)',
//     sidebarActiveBar: '#a5b4fc',
//     brandBg: 'rgba(255,255,255,0.15)',
//     accent: '#4f46e5',
//     accentHover: '#4338ca',
//     accentText: '#3730a3',
//     badgeBg: '#818cf8',
//   },
// };

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
      { label: "Appointments Calendar", path: "/appointments", icon: "📂" },
      { label: "Draft Appointments", path: "/DraftAppointmentsPage", icon: "🧪" },
    ],
  },

  { icon: Calendar, label: "Visits", path: "/visits" },
    {
    icon: CreditCard,
    label: "Invoices & Receipts",
    path: "#",
    children: [
      { label: "Invoices", path: "/billing", icon: "🧾" },
      { label: "Receipts", path: "/receipts", icon: "🗒️" },
    ],
  },
  {
    icon: Pill,
    label: "Medicines",
    path: "#",
    children: [
      // { label: "Pharmacy Sales", path: "/pharmacysales", icon: "💊" },
      { label: "Drug Categories", path: "/drug-categories", icon: "📂" },
      { label: "Drugs", path: "/drug-inventory", icon: "🧪" },
      { label: "Prescriptions", path: "/PrescriptionsList", icon: "📋" },
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
        icon: "📂",
      },
      { label: "Procedures", path: "/procedures", icon: "🔬" },
      { label: "Conditions/Diagnosis", path: "/ConditionsPage", icon: "🔬" },
      { label: "Services", path: "/billing-services", icon: "🩺" },
    ],
  },
  {
    icon: Package,
    label: "Inventory",
    path: "#",
    children: [
      { label: "Inventory Items", path: "/inventory", icon: "📦" },
      { label: "Stock Out", path: "/StockOut", icon: "📍" },
      { label: "Direct Stock", path: "/direct-stock", icon: "⚡" },
      { label: "Categories", path: "/inventory/categories", icon: "📂" },
      // { label: "Stock Moves", path: "/stockmoves", icon: "🔄" },
      { label: "Locations", path: "/LocationsPage", icon: "📍" },
      // { label: "Damages/Expiry", path: "/waste-records", icon: "⚠️" },
      { label: "Adjustments", path: "/stock-adjustments", icon: "⚖️" },
      { label: "Stock Ledger", path: "/stock-ledger", icon: "📒" },
    ],
  },
  {
    icon: TrendingUp,
    label: "Purchases",
    path: "#",
    children: [
      { label: "Suppliers", path: "/suppliers", icon: "🏪" },
      { label: "Purchases", path: "/purchases", icon: "🛒" },
    ],
  },
  {
    icon: DollarSign,
    label: "Expenses",
    path: "#",
    children: [
     { label: "Expenses", path: "/expenses", icon: "💸" },
     { label: "Payments", path: "/PaymentsList", icon: "💳" },
     { label: "Accounts", path: "/accounts", icon: "🏦" },
    ],
  },
  // {
  //   icon: Activity,
  //   label: "Cash Flow",
  //   path: "#",
  //   children: [
  //     { label: "Cash Flow", path: "/cashflow", icon: "📊" },
  //     { label: "Receipts", path: "/receipts", icon: "🗒️" },
  //     { label: "Payments", path: "/PaymentsList", icon: "💳" },
  //   ],
  // },
  { icon: UserCog, label: "Staff", path: "/staff", badge: null },
  {
    icon: Activity,
    label: "Reports",
    path: "#",
    children: [
      { label: "Medical Report", path: "/TreatmentReports", icon: "🗒️" },
      {
        label: "Patients Report",
        path: "/PatientListReportPage",
        icon: "📊",
      },
      { label: "Sales & Receipts", path: "/SalesReports", icon: "🧾" },
      { label: "Expenses & Payments", path: "/ExpensePaymentsReports", icon: "💸" },
      { label: "Inventory Report", path: "/InventoryReports", icon: "🗒️" },
      { label: "General Ledger", path: "/general-ledger", icon: "📒" },
      { label: "Audit Log", path: "/audit-log", icon: "🛡️" },
      { label: "Backups", path: "/admin/backups", icon: "💾" },
    ],
  },
];

// ─── GOOGLE FONTS ─────────────────────────────────────────────────────────────
const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&family=DM+Sans:wght@500;600;700;800&display=swap');
    * { font-family: 'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif !important; font-weight: 600; }
    input, textarea, select { font-family: 'DM Sans', system-ui, sans-serif !important; font-weight: 600; }
    body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  `}</style>
);

// ─── NAV ITEM ─────────────────────────────────────────────────────────────────
interface NavItemProps {
  item: (typeof navItems)[0];
  collapsed: boolean;
  isActive: (path: string) => boolean;
  onNavigate?: () => void;
  theme: Theme;
}

function NavItem({
  item,
  collapsed,
  isActive,
  onNavigate,
  theme,
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

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          title={collapsed ? item.label : undefined}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg mx-2 text-sm transition-all duration-150 group relative"
          style={{
            width: "calc(100% - 16px)",
            color: anyChildActive ? theme.sidebarActive : theme.sidebarText,
            background: anyChildActive ? theme.sidebarActiveBg : "transparent",
            fontWeight: anyChildActive ? 600 : 400,
          }}
          onMouseEnter={(e) =>
            !anyChildActive &&
            ((e.currentTarget as HTMLElement).style.background =
              theme.sidebarHover)
          }
          onMouseLeave={(e) =>
            !anyChildActive &&
            ((e.currentTarget as HTMLElement).style.background = "transparent")
          }
        >
          {anyChildActive && !collapsed && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
              style={{ background: theme.sidebarActiveBar }}
            />
          )}
          <item.icon
            className="shrink-0"
            style={{
              width: 16,
              height: 16,
              opacity: anyChildActive ? 1 : 1,
            }}
          />
          {!collapsed && (
            <>
              <span className="flex-1 text-left truncate text-[13.5px] tracking-[0.01em]">
                {item.label}
              </span>
              <ChevronDown
                className={cn(
                  "transition-transform duration-200",
                  open ? "rotate-180" : "",
                )}
                style={{ width: 13, height: 13, opacity: 1 }}
              />
            </>
          )}
        </button>

        {open && !collapsed && (
          <div
            className="ml-4 mr-2 mt-0.5 mb-0.5 pl-3"
            style={{ borderLeft: `1px solid ${theme.sidebarBorder}` }}
          >
            {item.children!.map((child) => (
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className="flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] transition-all duration-100 mt-0.5"
                style={{
                  color: isActive(child.path)
                    ? theme.sidebarActive
                    : theme.sidebarMuted,
                  background: isActive(child.path)
                    ? "rgba(255,255,255,0.14)"
                    : "transparent",
                  fontWeight: isActive(child.path) ? 600 : 400,
                }}
                onMouseEnter={(e) =>
                  !isActive(child.path) &&
                  ((e.currentTarget as HTMLElement).style.color =
                    theme.sidebarText)
                }
                onMouseLeave={(e) =>
                  !isActive(child.path) &&
                  ((e.currentTarget as HTMLElement).style.color =
                    theme.sidebarMuted)
                }
              >
                <span style={{ fontSize: 13, lineHeight: 1 }}>
                  {child.icon}
                </span>
                {child.label}
              </Link>
            ))}
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
      className="flex items-center gap-3 px-3 py-2 rounded-lg mx-2 text-[13.5px] transition-all duration-150 group relative"
      style={{
        display: "flex",
        color: active ? theme.sidebarActive : theme.sidebarText,
        background: active ? theme.sidebarActiveBg : "transparent",
        fontWeight: active ? 600 : 400,
      }}
      onMouseEnter={(e) =>
        !active &&
        ((e.currentTarget as HTMLElement).style.background = theme.sidebarHover)
      }
      onMouseLeave={(e) =>
        !active &&
        ((e.currentTarget as HTMLElement).style.background = "transparent")
      }
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
          style={{ background: theme.sidebarActiveBar }}
        />
      )}
      <item.icon
        className="shrink-0"
        style={{ width: 16, height: 16, opacity: active ? 1 : 1 }}
      />
      {!collapsed && (
        <span className="flex-1 truncate tracking-[0.01em]">{item.label}</span>
      )}
      {!collapsed && item.badge && (
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white min-w-[18px] text-center leading-tight"
          style={{ background: theme.badgeBg }}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function ThemePicker({
  current,
  onChange,
  onClose,
}: {
  current: ThemeKey;
  onChange: (k: ThemeKey) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute right-0 top-11 z-50 p-4"
      style={{
        width: 256,
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
        border: "1px solid #e8edf2",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>
          Color Theme
        </span>
        <button
          onClick={onClose}
          className="rounded-md p-0.5 hover:bg-gray-100 transition-colors"
          style={{ color: "#94a3b8" }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {Object.values(THEMES).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              onChange(t.key);
              onClose();
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left w-full"
            style={{
              background: current === t.key ? "#f0f9ff" : "transparent",
              border:
                current === t.key
                  ? "1.5px solid #bae6fd"
                  : "1px solid transparent",
            }}
          >
            <span
              className="rounded-full border-2 border-white shrink-0"
              style={{
                width: 18,
                height: 18,
                background: t.swatch,
                boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: "#334155",
                fontWeight: current === t.key ? 600 : 400,
              }}
            >
              {t.label}
            </span>
            {current === t.key && (
              <span
                className="ml-auto"
                style={{ fontSize: 11, color: "#0ea5e9", fontWeight: 600 }}
              >
                Active
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN LAYOUT ──────────────────────────────────────────────────────────────
export function MainLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // const [showNotifications, setShowNotifications] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [themeKey, setThemeKey] = useState<ThemeKey>("skyBlue");
  // ─── ADD THIS with your other useState declarations ───────────────────────────
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const theme = THEMES[themeKey];

  const isActive = (path: string) =>
    path !== "#" && location.pathname.startsWith(path);

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
    theme,
    onNavigate: () => setMobileOpen(false),
  };

  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ background: theme.sidebar }}>
      {/* Brand Header */}
      <div
        className={cn(
          "flex items-center h-[58px] shrink-0 px-4",
          collapsed ? "justify-center" : "gap-3",
        )}
        style={{ borderBottom: `1px solid ${theme.sidebarBorder}` }}
      >
        <div
          className="flex items-center justify-center shrink-0 rounded-xl"
          style={{
            width: 34,
            height: 34,
            background: theme.brandBg,
            border: `1px solid rgba(255,255,255,0.22)`,
          }}
        >
          <HeartPulse style={{ width: 18, height: 18, color: "#fff" }} />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-none">
            <span
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: "-0.3px",
              }}
            >
              Fshikta Dental
            </span>
            <span
              style={{
                color: theme.sidebarMuted,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Clinic Management
            </span>
          </div>
        )}
      </div>


      {/* Nav Items */}
      <nav
        className="flex-1 overflow-y-auto pb-2 space-y-0.5"
        style={{ scrollbarWidth: "none" }}
      >
        {navItems.map((item) => (
          <NavItem
            key={`${item.label}-${item.path}`}
            item={item}
            {...navSharedProps}
          />
        ))}
      </nav>

      {/* Bottom Actions */}
      <div
        className="p-2 space-y-0.5"
        style={{ borderTop: `1px solid ${theme.sidebarBorder}` }}
      >
        <Link
          to="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
          style={{ color: theme.sidebarMuted, fontSize: 13 }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              theme.sidebarHover;
            (e.currentTarget as HTMLElement).style.color = theme.sidebarText;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = theme.sidebarMuted;
          }}
        >
          <Settings style={{ width: 15, height: 15, flexShrink: 0 }} />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
          style={{ color: theme.sidebarMuted, fontSize: 13 }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "rgba(239,68,68,0.15)";
            (e.currentTarget as HTMLElement).style.color = "#fca5a5";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = theme.sidebarMuted;
          }}
        >
          <LogOut style={{ width: 15, height: 15, flexShrink: 0 }} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <FontLoader />

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 500,
          },
        }}
      />

      <div
        className="flex h-screen overflow-hidden"
        style={{ background: "#f1f5f9" }}
      >
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "hidden lg:flex flex-col shrink-0 z-30 transition-all duration-300",
            collapsed ? "w-[62px]" : "w-[228px]",
          )}
          style={{ boxShadow: "2px 0 12px rgba(0,0,0,0.10)" }}
        >
          {sidebarContent}
        </aside>

        {/* Mobile Overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="absolute inset-0 backdrop-blur-sm"
              style={{ background: "rgba(15,23,42,0.45)" }}
              onClick={() => setMobileOpen(false)}
            />
            <aside
              className="relative flex flex-col w-[228px]"
              style={{ boxShadow: "4px 0 20px rgba(0,0,0,0.18)" }}
            >
              {sidebarContent}
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3.5 right-3 flex items-center justify-center rounded-full"
                style={{
                  width: 26,
                  height: 26,
                  background: "rgba(255,255,255,0.18)",
                  color: "#fff",
                }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </aside>
          </div>
        )}

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Header */}
          <header
            className="flex items-center justify-between shrink-0 px-4"
            style={{
              background: "#fff",
              borderBottom: "1px solid #e8edf2",
              height: 42,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  window.innerWidth < 1024
                    ? setMobileOpen((o) => !o)
                    : setCollapsed((c) => !c)
                }
                className="flex items-center justify-center rounded-lg transition-all"
                style={{ width: 36, height: 36, color: "#64748b" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#f1f5f9";
                  (e.currentTarget as HTMLElement).style.color = theme.accent;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                  (e.currentTarget as HTMLElement).style.color = "#64748b";
                }}
              >
                <Menu style={{ width: 18, height: 18 }} />
              </button>

              {/* Breadcrumb */}
              <nav className="hidden md:flex items-center gap-1.5">
                <span
                  style={{ fontSize: 13, color: "#94a3b8", cursor: "pointer" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#475569")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#94a3b8")
                  }
                >
                  Home
                </span>
                <ChevronRight
                  style={{ width: 13, height: 13, color: "#cbd5e1" }}
                />
                <span
                  style={{ fontSize: 13, color: "#1e293b", fontWeight: 600 }}
                >
                  {currentPage}
                </span>
              </nav>
            </div>

            {/* Right */}
            <div className="flex items-center gap-1">
               <NotificationDropdown accentColor={theme.accent} />

              {/* Theme Picker */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowThemePicker((o) => !o);
                  }}
                  className="flex items-center justify-center rounded-lg transition-all"
                  style={{ width: 36, height: 30, color: "#64748b" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "#f1f5f9";
                    (e.currentTarget as HTMLElement).style.color = theme.accent;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                    (e.currentTarget as HTMLElement).style.color = "#64748b";
                  }}
                >
                  <Palette style={{ width: 16, height: 16 }} />
                </button>
                {showThemePicker && (
                  <ThemePicker
                    current={themeKey}
                    onChange={setThemeKey}
                    onClose={() => setShowThemePicker(false)}
                  />
                )}
              </div>

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
                      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentHover})`,
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
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-slate-50"
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
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-slate-50"
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
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-red-50 text-left mt-0.5"
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
              <span style={{ color: theme.accentText, fontWeight: 600 }}>
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
