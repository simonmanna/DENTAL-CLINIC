import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PatientConditionQueryDto } from './patient-condition-query.dto';
import { UpdatePatientConditionDto } from './update-patient-condition.dto';

// Ids in this schema are cuids. A UUID validator here rejected every real
// patient id, which silently emptied the patient Conditions tab.
describe('condition DTOs accept cuid ids', () => {
  const cuid = 'cm1x2y3z40000abcd1234efgh';

  it('PatientConditionQueryDto', () => {
    const dto = plainToInstance(PatientConditionQueryDto, {
      patientId: cuid,
      visitId: cuid,
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('PatientConditionQueryDto still requires a patientId', () => {
    const dto = plainToInstance(PatientConditionQueryDto, {});
    expect(validateSync(dto).map((e) => e.property)).toContain('patientId');
  });

  it('UpdatePatientConditionDto.visitId', () => {
    const dto = plainToInstance(UpdatePatientConditionDto, { visitId: cuid });
    expect(validateSync(dto)).toHaveLength(0);
  });
});
