import { PrismaClient, AppointmentType, AppointmentStatus } from '@prisma/client';

export async function seedAppointments(prisma: PrismaClient) {
  console.log('📅 Seeding appointments...');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(14, 0, 0, 0);

  const dentistId = 'staff_dr_sarah';

  const APPOINTMENTS = [
    {
      id: 'apt_001',
      appointmentCode: 'APT-240328-001',
      patientId: 'pt_grace_nakato',
      dentistId,
      type: AppointmentType.CONSULTATION,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: tomorrow,
      duration: 30,
      chiefComplaint: 'Toothache in lower right jaw',
      notes: 'First visit, possible root canal needed',
    },
    {
      id: 'apt_002',
      appointmentCode: 'APT-240328-002',
      patientId: 'pt_john_mukasa',
      dentistId,
      type: AppointmentType.CLEANING,
      status: AppointmentStatus.CONFIRMED,
      scheduledAt: new Date(tomorrow.getTime() + 60 * 60 * 1000),
      duration: 45,
      chiefComplaint: 'Routine cleaning',
      notes: '6-month follow-up',
    },
    {
      id: 'apt_003',
      appointmentCode: 'APT-240328-003',
      patientId: 'pt_michael_ochieng',
      dentistId,
      type: AppointmentType.EXTRACTION,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: nextWeek,
      duration: 60,
      chiefComplaint: 'Wisdom tooth pain',
      notes: 'Third molar extraction, upper left',
    },
    {
      id: 'apt_004',
      appointmentCode: 'APT-240328-004',
      patientId: 'pt_patricia_auma',
      dentistId,
      type: AppointmentType.FILLING,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: new Date(nextWeek.getTime() + 24 * 60 * 60 * 1000),
      duration: 45,
      chiefComplaint: 'Cavity in front tooth',
      isWalkIn: false,
    },
    {
      id: 'apt_005',
      appointmentCode: 'APT-240328-005',
      patientId: 'pt_grace_nakato',
      dentistId,
      type: AppointmentType.CONSULTATION,
      status: AppointmentStatus.CANCELLED,
      scheduledAt: new Date(nextWeek.getTime() + 2 * 24 * 60 * 60 * 1000),
      duration: 30,
      chiefComplaint: 'Jaw clicking',
      notes: 'Patient cancelled due to travel',
    },
    {
      id: 'apt_006',
      appointmentCode: 'APT-240328-006',
      patientId: 'pt_john_mukasa',
      dentistId,
      type: AppointmentType.CLEANING,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: new Date(nextWeek.getTime() + 3 * 24 * 60 * 60 * 1000),
      duration: 40,
      chiefComplaint: 'Plaque buildup',
      notes: 'Patient prefers ultrasonic cleaning',
    },
    {
      id: 'apt_007',
      appointmentCode: 'APT-240328-007',
      patientId: 'pt_michael_ochieng',
      dentistId,
      type: AppointmentType.CONSULTATION,
      status: AppointmentStatus.COMPLETED,
      scheduledAt: new Date(nextWeek.getTime() - 2 * 24 * 60 * 60 * 1000),
      duration: 30,
      chiefComplaint: 'Sensitivity to cold drinks',
      notes: 'Completed, fluoride treatment recommended',
    },
    {
      id: 'apt_008',
      appointmentCode: 'APT-240328-008',
      patientId: 'pt_patricia_auma',
      dentistId,
      type: AppointmentType.FILLING,
      status: AppointmentStatus.CONFIRMED,
      scheduledAt: new Date(nextWeek.getTime() + 4 * 24 * 60 * 60 * 1000),
      duration: 50,
      chiefComplaint: 'Cavity in molar',
      notes: 'Composite filling planned',
    },
    {
      id: 'apt_009',
      appointmentCode: 'APT-240328-009',
      patientId: 'pt_grace_nakato',
      dentistId,
      type: AppointmentType.EXTRACTION,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: new Date(nextWeek.getTime() + 5 * 24 * 60 * 60 * 1000),
      duration: 60,
      chiefComplaint: 'Broken tooth',
      notes: 'Extraction of fractured premolar',
    },
    {
      id: 'apt_010',
      appointmentCode: 'APT-240328-010',
      patientId: 'pt_john_mukasa',
      dentistId,
      type: AppointmentType.CONSULTATION,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: new Date(nextWeek.getTime() + 6 * 24 * 60 * 60 * 1000),
      duration: 30,
      chiefComplaint: 'Orthodontic evaluation',
      notes: 'Discuss braces options',
    },
  ];

  for (const appointment of APPOINTMENTS) {
    await prisma.appointment.upsert({
      where: { id: appointment.id },
      update: {
        appointmentCode: appointment.appointmentCode,
        patientId: appointment.patientId,
        dentistId: appointment.dentistId,
        type: appointment.type,
        status: appointment.status,
        scheduledAt: appointment.scheduledAt,
        duration: appointment.duration,
        chiefComplaint: appointment.chiefComplaint,
        notes: appointment.notes,
        isWalkIn: appointment.isWalkIn || false,
      },
      create: appointment,
    });
  }

  console.log(`✅ Seeded ${APPOINTMENTS.length} appointments`);
  return APPOINTMENTS;
}
