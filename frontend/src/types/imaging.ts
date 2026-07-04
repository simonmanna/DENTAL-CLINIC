// frontend/src/types/imaging.ts
export enum ImagingType {
  PERIAPICAL = 'PERIAPICAL',
  BITEWING = 'BITEWING',
  PANORAMIC = 'PANORAMIC',
  CEPHALOMETRIC = 'CEPHALOMETRIC',
  CBCT = 'CBCT',
  PHOTO_INTRAORAL = 'PHOTO_INTRAORAL',
  PHOTO_EXTRAORAL = 'PHOTO_EXTRAORAL',
  OTHER = 'OTHER',
}

export enum ImagingStage {
  BEFORE = 'BEFORE',
  AFTER = 'AFTER',
  PROGRESS = 'PROGRESS',
  BASELINE = 'BASELINE',
}

export enum ImagingSource {
  CHART = 'CHART',
  PROCEDURE = 'PROCEDURE',
  IMAGING_TAB = 'IMAGING_TAB',
  IMPORT = 'IMPORT',
}

export interface ImagingRecord {
  id: string;
  patientId: string;
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
  };
  appointmentId?: string;
  appointment?: {
    id: string;
    appointmentCode: string;
    scheduledAt: string;
  };
  visitId?: string;
  visit?: {
    id: string;
    visitCode: string;
    status: string;
  };
  dentistId?: string;
  dentist?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  procedureId?: string;
  chartEntryId?: string;
  type: ImagingType;
  stage?: ImagingStage;
  source?: ImagingSource;
  groupId?: string;
  fileUrl: string;
  thumbnailUrl?: string;
  storagePath?: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  toothNumbers: number[];
  notes?: string;
  findings?: string;
  annotations?: any;
  takenAt: string;
  createdAt: string;
  updatedAt: string;
  comparisons?: ImagingComparison[];
  comparedWith?: ImagingComparison[];
}

export interface ImagingComparison {
  id: string;
  baseImageId: string;
  compareImageId: string;
  notes?: string;
  createdAt: string;
  baseImage?: ImagingRecord;
  compareImage?: ImagingRecord;
}

export interface ImagingQueryParams {
  visitId?: string;
  patientId?: string;
  type?: ImagingType;
  stage?: ImagingStage;
  groupId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}