// Shared patient types

// @/types/patients.ts
export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
  phone?: string;
  email?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth?: string;
  address?: string;
  city?: string;
  bloodGroup?: string;
  allergies?: string[];
  medicalConditions?: string[];
  currentMedications?: string[];
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  occupation?: string;
  previousCardNumber?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
  
  // ✅ ADD THESE MISSING FIELDS:
  registeredAt?: string;  // ← For registration date display
  
  // ✅ For nested relations (use optional + 'any' or define proper types):
  appointments?: Array<{
    id: string;
    dentist?: {
      firstName: string;
      lastName: string;
    };
  }>;
  
  _count?: {
    emrRecords?: number;
    appointments?: number;
  };
}

// export interface Patient {
//   id: string;
//   firstName: string;
//   lastName: string;
//   email?: string;
//   phone?: string;
//   dateOfBirth?: string;
//   gender?: 'male' | 'female' | 'other';
//   address?: {
//     street?: string;
//     city?: string;
//     country?: string;
//     postalCode?: string;
//   };
//   emergencyContact?: {
//     name: string;
//     phone: string;
//     relationship: string;
//   };
//   insurance?: PatientInsurance[];
//   createdAt: string;
//   updatedAt: string;
// }

export interface PatientInsurance {
  id: string;
  provider: string;
  policyNumber: string;
  coverageStart: string;
  coverageEnd?: string;
  isActive: boolean;
}

export interface PatientStats {
  total: number;
  newThisMonth: number;
  active: number;
  withOutstandingBalance: number;
}

export interface PatientVisit {
  id: string;
  date: string;
  reason: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  dentist?: {
    id: string;
    name: string;
  };
}

export interface CreatePatientForm {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  address?: {
    street?: string;
    city?: string;
    country?: string;
    postalCode?: string;
  };
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  allergies?: string[];
  medicalConditions?: string[];
  currentMedications?: string[];
}

export interface UpdatePatientForm extends Partial<CreatePatientForm> {}

export interface AddInsuranceForm {
  provider: string;
  policyNumber: string;
  coverageStart: string;
  coverageEnd?: string;
}