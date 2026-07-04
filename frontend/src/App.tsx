// src/App.tsx
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MainLayout } from "./components/layout/MainLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { PatientsPage } from "./pages/patients/PatientsPage";
import { PatientDetailPage } from "./pages/patients/PatientDetailPage";
import { AppointmentsPage } from "./pages/appointments/AppointmentsPage";
import { BillingPage } from "./pages/billing/BillingPage";
import { EMRPage, ImagingPage, PharmacyPage } from "./pages/emr/EMRPage";
import { InventoryPage } from "./pages/inventory/InventoryPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
// import { } from './pages/visit/AppointmentVisitPage';
import { VisitPage } from "./pages/visits/VisitPage";
// In App.tsx, update the import path:
import { ExpensesPage } from "./pages/expenses/ExpensesPage";
import ExpenseCategoriesPage from "./pages/expenses/ExpenseCategoriesPage";
import { StockMovementsPage } from "./pages/inventory/StockMovementsPage";
import { SupplierPaymentsPage } from "./pages/inventory/SupplierPaymentsPage";
import { VisitReports } from "./pages/reports/VisitReports";

import { VisitsListPage } from "./pages/visits/VisitsListPage";
import PurchasesPage from "./pages/purchases/PurchasesPage";
import { PrescriptionsPage } from "./pages/pharmacy/PrescriptionsPage";
import StockTransfersPage from "./pages/stock-transfers/StockTransfersPage";
import StockTransferFormPage from "./pages/stock-transfers/StockTransferFormPage";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";


// Staff Management Pages
import { StaffListPage } from "./pages/staff/StaffListPage";
import { StaffCreatePage } from "./pages/staff/StaffCreatePage";
import { StaffEditPage } from "./pages/staff/StaffEditPage";
import { StaffDetailPage } from "./pages/staff/StaffDetailPage";
import { StaffSchedulePage } from "./pages/staff/StaffSchedulePage";
import { StaffPerformancePage } from "./pages/staff/StaffPerformancePage";
// import { DentalChart } from "./pages/trials/DentalChart";

import ProceduresPage from "./pages/procedures/ProceduresPage";

// import TreatmentPlansPage from "./pages/treatmentplans/TreatmentPlansPage";
// import VisitProceduresPanel from "./pages/treatmentplans/VisitProceduresPanel";
import SuppliersPage from "./pages/suppliers/page";

import PurchaseOrderDetailPage from "./pages/purchases/PurchaseOrderDetailPage";
import { ReceiptsPage } from "./pages/receipts/ReceiptsPage";

import AccountsPage from "./pages/accounts/AccountsPage";
import GeneralLedgerPage from "./pages/general-ledger/GeneralLedgerPage";
// import MultiDispensePage from "./pages/pharmacy/MultiDispensePage";

import ProcedureCategoriesPage from "./pages/procedures/ProcedureCategoriesPage";

import FixedAssetsPage from "./pages/fixed-assets/FixedAssetsPage";
import BillingServicesPage from "./pages/billing-services/BillingServices";
import StockLogsPage from "./pages/stock-log/StockLog";
import { InventoryCategoriesPage } from "./pages/inventory/categories/categories-page";
import InventoryListPage from "./pages/inventory/InventoryListPage";
import InventoryFormPage from "./pages/inventory/InventoryFormPage";
import InventoryDetailPage from "./pages/inventory/InventoryDetailPage";
import WasteRecordsPage from "./pages/waste/WasteRecordsPage";
import CreateWasteRecordPage from "./pages/waste/components/CreateWasteRecordPage";
import { WasteDetailDrawer } from "./pages/waste/components/WasteDetailDrawer";
import StockAdjustmentsPage from "./pages/inventory-adjustments/StockAdjustmentsPage";
import LocationsPage from "./pages/inventory-locations/InventoryLocations";
// import { PaymentHistory } from "./pages/payments/PaymentHistory";
import { DrugCategoryPage } from "./pages/drug-categories/DrugCategoryPage";
import DrugsPage from "./pages/drugs/DrugsPage";
import { ClinicalReportsPage } from "./pages/reports/ClinicalReports";
import ConditionsPage from "./pages/conditions/ConditionsPage";
import PharmacySalesList from "./pages/pharmacy/PharmacySalesList";
import { PrescriptionsList } from "./pages/prescriptions/components/prescriptions-list";
import { VisitBillingPage } from "./pages/visits/VisitBillingPage";
import StockOutPage from "./pages/stock-out/StockOutPage";
import DirectStockPage from "./pages/direct-stock/DirectStockPage";
import PaymentsPage from "./pages/payments/PaymentsList";
import PatientReportsPage from "./pages/patients/PatientReportsPage";
import PatientListReportPage from "./pages/patients/PatientListReportPage";
import TreatmentReports from "./pages/treatmentplans/TreatmentReports";
import InventoryReports from "./pages/inventory/InventoryReport";
import { SalesReports, ExpensePaymentsReports } from "./pages/finance/FinancialReports";
import { DraftAppointmentsPage } from "./pages/appointments/AppointmentsDraftPage";
import NotificationsPage from "./pages/notifications/NotificationsPage";
import ClinicSettingsPage from "./pages/clinic-settings/ClinicSettingsPage";
import AuditLogPage from "./pages/audit-log/AuditLogPage";


// Role-based route protection
import { useAuthStore } from "./store/auth.store";
import { UserRole } from "@/types/shared";
import { Toaster } from "@/components/ui/sonner";



const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <MainLayout>{children}</MainLayout>;
}

// Admin-only route protection
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const isAdmin =
    // user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;
    user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "DENTIST";
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return <MainLayout>{children}</MainLayout>;
}

export default function App() {
  const { loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, []);

  return (
    <QueryClientProvider client={qc}>
      <Toaster position="top-right" richColors closeButton />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
          <Route
            path="/notifications"
            element={
              <MainLayout>
                <NotificationsPage />
              </MainLayout>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <ClinicSettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/DraftAppointmentsPage"
            element={
              <ProtectedRoute>
                <DraftAppointmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/SalesReports"
            element={
              <ProtectedRoute>
                <SalesReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ExpensePaymentsReports"
            element={
              <ProtectedRoute>
                <ExpensePaymentsReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/InventoryReports"
            element={
              <ProtectedRoute>
                <InventoryReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/TreatmentReports"
            element={
              <ProtectedRoute>
                <TreatmentReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/PatientListReportPage"
            element={
              <ProtectedRoute>
                <PatientListReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/PatientReportsPage"
            element={
              <ProtectedRoute>
                <PatientReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/PaymentsList"
            element={
              <ProtectedRoute>
                <PaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/StockOut"
            element={
              <ProtectedRoute>
                <StockOutPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/direct-stock"
            element={
              <ProtectedRoute>
                <DirectStockPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/PrescriptionsList"
            element={
              <ProtectedRoute>
                <PrescriptionsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/VisitBillingPage"
            element={
              <ProtectedRoute>
                <VisitBillingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/VisitBillingPage/:visitId/:patientId"
            element={
              <ProtectedRoute>
                <VisitBillingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/PharmacySalesList"
            element={
              <ProtectedRoute>
                <PharmacySalesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/VisitReports"
            element={
              <ProtectedRoute>
                <VisitReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ConditionsPage"
            element={
              <ProtectedRoute>
                <ConditionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ClinicalReportsPage"
            element={
              <ProtectedRoute>
                <ClinicalReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />{" "}
          <Route
            path="/drug-categories"
            element={
              <ProtectedRoute>
                <DrugCategoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <InventoryListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/:id"
            element={
              <ProtectedRoute>
                <InventoryDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/:id/edit"
            element={
              <ProtectedRoute>
                <InventoryFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock-adjustments"
            element={
              <ProtectedRoute>
                <StockAdjustmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/waste-records"
            element={
              <ProtectedRoute>
                <WasteRecordsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/waste-records/new"
            element={
              <ProtectedRoute>
                <CreateWasteRecordPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/InventoryList/new"
            element={
              <ProtectedRoute>
                <InventoryFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/new"
            element={
              <ProtectedRoute>
                <InventoryFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock-transfers"
            element={
              <ProtectedRoute>
                <StockTransfersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock-transfers/New"
            element={
              <ProtectedRoute>
                <StockTransferFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients"
            element={
              <ProtectedRoute>
                <PatientsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients/new"
            element={
              <ProtectedRoute>
                <PatientsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients/:id"
            element={
              <ProtectedRoute>
                <PatientDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/appointments"
            element={
              <ProtectedRoute>
                <AppointmentsPage />
              </ProtectedRoute>
            }
          />
          {/* <Route
            path="/MultiDispensePage"
            element={
              <ProtectedRoute>
                <MultiDispensePage />
              </ProtectedRoute>
            }
          /> */}
          <Route
            path="/receipts"
            element={
              <ProtectedRoute>
                <ReceiptsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/receipts/:id"
            element={
              <ProtectedRoute>
                <ReceiptsPage />
              </ProtectedRoute>
            }
          />
          {/* { path: '/receipts', element: <ReceiptsPage /> } */}
          {/* { path: '/receipts/:id', element: <ReceiptsPage /> } */}
          <Route
            path="/appointments/new"
            element={
              <ProtectedRoute>
                <AppointmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dental-chart"
            element={
              <ProtectedRoute>
                <PatientsPage />
              </ProtectedRoute>
            }
          />
          {/* <Route
            path="/treatment-plans"
            element={
              <ProtectedRoute>
                <TreatmentPlansPage />
              </ProtectedRoute>
            }
          /> */}
          <Route
            path="/LocationsPage"
            element={
              <ProtectedRoute>
                <LocationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/emr"
            element={
              <ProtectedRoute>
                <EMRPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/imaging"
            element={
              <ProtectedRoute>
                <ImagingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                <BillingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ProtectedRoute>
                <AccountsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/general-ledger"
            element={
              <ProtectedRoute>
                <GeneralLedgerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pharmacy"
            element={
              <ProtectedRoute>
                <PharmacyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing-services"
            element={
              <ProtectedRoute>
                <BillingServicesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visits"
            element={
              <ProtectedRoute>
                <VisitsListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/procedure-categories"
            element={
              <ProtectedRoute>
                <ProcedureCategoriesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/procedures"
            element={
              <ProtectedRoute>
                <ProceduresPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchases"
            element={
              <ProtectedRoute>
                <PurchasesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchases/:id"
            element={
              <ProtectedRoute>
                <PurchaseOrderDetailPage /> {/* We'll create this next */}
              </ProtectedRoute>
            }
          />
          {/* <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <InventoryPage />
              </ProtectedRoute>
            }
          /> */}
          <Route
            path="/fixed-assets"
            element={
              <ProtectedRoute>
                <FixedAssetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute>
                <SuppliersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute>
                <ExpensesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses/categories"
            element={
              <ProtectedRoute>
                <ExpenseCategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/categories"
            element={
              <ProtectedRoute>
                <InventoryCategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock-ledger"
            element={
              <ProtectedRoute>
                <StockLogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stockmoves"
            element={
              <ProtectedRoute>
                <StockTransfersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplierpayment"
            element={
              <ProtectedRoute>
                <SupplierPaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/prescriptions-list"
            element={
              <ProtectedRoute>
                <PrescriptionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/drug-inventory"
            element={
              <ProtectedRoute>
                <DrugsPage />
              </ProtectedRoute>
            }
          />
          {/* <Route
            path="/pharmacysales"
            element={
              <ProtectedRoute>
                <PharmacySalesPage />
              </ProtectedRoute>
            }
          /> */}
          <Route
            path="/drugs"
            element={
              <ProtectedRoute>
                <DrugsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/appointments/:appointmentId/visit"
            element={<VisitPage />}
          />
          {/* <Route
            path="/visits"
            element={
              <ProtectedRoute>
                <VisitPage />
              </ProtectedRoute>
            }
          /> */}
          <Route
            path="/appointments/:appointmentId/visit"
            element={
              <ProtectedRoute>
                <VisitPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visits"
            element={
              <ProtectedRoute>
                <VisitPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visits/new"
            element={
              <ProtectedRoute>
                <VisitPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visits/:id"
            element={
              <ProtectedRoute>
                <VisitPage />
              </ProtectedRoute>
            }
          />
          {/* Appointment Detail Page (if you need it) */}
          <Route
            path="/appointments/:id"
            element={
              <ProtectedRoute>
                {/* Create this component or redirect */}
                <AppointmentsPage />
              </ProtectedRoute>
            }
          />
          {/* Staff Management Routes - Admin Only */}
          <Route
            path="/staff"
            element={
              <ProtectedRoute>
                <StaffListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/create"
            element={
              <ProtectedRoute>
                <StaffCreatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/:id"
            element={
              <AdminRoute>
                <StaffDetailPage />
              </AdminRoute>
            }
          />
          <Route
            path="/staff/:id/edit"
            element={
              <AdminRoute>
                <StaffEditPage />
              </AdminRoute>
            }
          />
          <Route
            path="/staff/:id/schedule"
            element={
              <AdminRoute>
                <StaffSchedulePage />
              </AdminRoute>
            }
          />
          <Route
            path="/staff/:id/performance"
            element={
              <AdminRoute>
                <StaffPerformancePage />
              </AdminRoute>
            }
          />
          <Route
            path="/audit-log"
            element={
              <ProtectedRoute>
                <AuditLogPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
