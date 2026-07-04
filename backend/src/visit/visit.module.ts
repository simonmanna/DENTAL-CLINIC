// src/visits/visit.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VisitsService } from './visit.service';
import { VisitsController } from './visit.controller';
import { ProgressReportsController } from './progress-reports.controller';
import { ProgressReportsService } from './progress-reports.service';

@Module({
  imports: [PrismaModule],
  controllers: [VisitsController, ProgressReportsController],
  providers: [VisitsService, ProgressReportsService],
  exports: [VisitsService, ProgressReportsService],
})
export class VisitModule {}

// ─────────────────────────────────────────────────────────────
// INTEGRATION CHECKLIST
// ─────────────────────────────────────────────────────────────
// 1. Copy visit.service.ts    → src/visits/visit.service.ts
// 2. Copy visit.controller.ts → src/visits/visit.controller.ts
// 3. Copy visit.module.ts     → src/visits/visit.module.ts
//
// 4. In src/app.module.ts, add to imports array:
//      import { VisitModule } from './visits/visit.module';
//      imports: [..., VisitModule]
//
// 5. In src/lib/api.ts, add:
//      export const visitApi = {
//        getDashboard: (id: string) =>
//          api.get(`/visits/${id}/dashboard`).then(r => r.data),
//        checkIn: (id: string, dentistId: string) =>
//          api.post(`/visits/${id}/check-in`, { dentistId }).then(r => r.data),
//        startExamination: (id: string) =>
//          api.patch(`/visits/${id}/start-examination`).then(r => r.data),
//        updateSOAP: (emrId: string, data: any) =>
//          api.patch(`/visits/emr/${emrId}/soap`, data).then(r => r.data),
//        updateTooth: (data: any) =>
//          api.patch('/visits/chart/tooth', data).then(r => r.data),
//        addToothProcedure: (data: any) =>
//          api.post('/visits/chart/tooth-procedure', data).then(r => r.data),
//        writePrescription: (apptId: string, data: any) =>
//          api.post(`/visits/${apptId}/prescription`, data).then(r => r.data),
//        generateInvoice: (apptId: string, data: any) =>
//          api.post(`/visits/${apptId}/invoice`, data).then(r => r.data),
//        processPayment: (data: any) =>
//          api.post('/visits/payment', data).then(r => r.data),
//        completeVisit: (apptId: string, data?: any) =>
//          api.post(`/visits/${apptId}/complete`, data ?? {}).then(r => r.data),
//        searchDrugs: (q: string) =>
//          api.get('/visits/drugs/search', { params: { q } }).then(r => r.data),
//        getProcedures: (q?: string) =>
//          api.get('/visits/procedures/search', { params: { q } }).then(r => r.data),
//      };
//
// 6. In React Router (App.tsx or routes file), add:
//      import { AppointmentVisitPage } from './pages/visits/AppointmentVisitPage';
//      <Route path="/appointments/:appointmentId/visit" element={<AppointmentVisitPage />} />
//
// 7. Add "Start Visit" button on appointment list/detail page:
//      <Button onClick={() => navigate(`/appointments/${apt.id}/visit`)}>
//        Start Visit
//      </Button>
// ─────────────────────────────────────────────────────────────
