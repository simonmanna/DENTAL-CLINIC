import { ClinicalReportsService } from './clinical-report.service';
import { ClinicalReportType } from './dto/clinical-report.dto';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('ClinicalReportsService', () => {
  let service: ClinicalReportsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ClinicalReportsService(prisma as any);
  });

  it('getStaff queries dentists', async () => {
    prisma.staff.findMany.mockResolvedValue([{ id: 'd1' }]);
    const out = await service.getStaff();
    expect(prisma.staff.findMany).toHaveBeenCalled();
    expect(out).toHaveLength(1);
  });

  it('getPatients applies a search filter', async () => {
    prisma.patient.findMany.mockResolvedValue([]);
    await service.getPatients('john');
    const arg = prisma.patient.findMany.mock.calls[0][0];
    expect(arg.where.OR).toBeDefined();
  });

  it('routes TREATMENT_HISTORY and returns a structured report', async () => {
    prisma.treatmentPlan.findMany.mockResolvedValue([]);
    prisma.treatmentPlan.count.mockResolvedValue(0);
    const out = await service.getClinicalReport({ type: ClinicalReportType.TREATMENT_HISTORY } as any);
    expect(out.type).toBe(ClinicalReportType.TREATMENT_HISTORY);
    expect(out.pagination).toBeDefined();
  });
});
