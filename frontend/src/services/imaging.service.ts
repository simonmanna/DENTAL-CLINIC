// frontend/src/services/imaging.service.ts
import api from "@/lib/api/client";
import { ImagingRecord, ImagingQueryParams, PaginatedResponse, ImagingComparison } from '@/types/imaging';

class ImagingService {
  private baseUrl = '/imaging';

  // Helper function for debug logging
  private debugLog(level: 'info' | 'error' | 'warn', message: string, data?: any) {
    const logFn = level === 'info' ? console.log : level === 'error' ? console.error : console.warn;
    const timestamp = new Date().toISOString();
    
    logFn(`[${timestamp}] [ImagingService] ${message}`);
    if (data) {
      logFn('Data:', data);
    }
  }

// frontend/src/services/imaging.service.ts - Update uploadImage method
async uploadImage(
  file: File,
  data: Partial<ImagingRecord>,
  onProgress?: (progress: number) => void
): Promise<ImagingRecord> {
  this.debugLog('info', 'Starting uploadImage', { 
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    dataKeys: Object.keys(data)
  });

  const formData = new FormData();
  formData.append('image', file);
  
  // Append all data fields with proper formatting
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      let processedValue: any;
      
      // Handle special cases
      if (key === 'toothNumbers') {
        // Send as array, not JSON string
        if (Array.isArray(value)) {
          value.forEach((num, index) => {
            formData.append(`${key}[${index}]`, String(num));
          });
          return; // Skip the main append
        }
      } else if (typeof value === 'object') {
        processedValue = JSON.stringify(value);
      } else {
        processedValue = String(value);
      }
      
      formData.append(key, processedValue);
      this.debugLog('info', `Appended form field: ${key} = ${String(processedValue).substring(0, 100)}`);
    }
  });
  
  // Add fileName if not provided (use the actual file name)
  const fileName = data.fileName || file.name;
  formData.append('fileName', fileName);
  this.debugLog('info', `Appended form field: fileName = ${fileName}`);

  // Log all form data entries for debugging
  this.debugLog('info', 'FormData contents:');
  for (let pair of formData.entries()) {
    if (pair[1] instanceof File) {
      this.debugLog('info', `  ${pair[0]}: File(${pair[1].name}, ${pair[1].size} bytes, ${pair[1].type})`);
    } else {
      this.debugLog('info', `  ${pair[0]}: ${pair[1]}`);
    }
  }

  try {
    this.debugLog('info', `Sending POST request to ${this.baseUrl}`);
    
    const response = await api.post<ImagingRecord>(this.baseUrl, formData, {
      headers: { 
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
    
    this.debugLog('info', 'Upload successful!', {
      status: response.status,
      dataId: response.data?.id,
      dataFileName: response.data?.fileName
    });
    
    return response.data;
  } catch (error: any) {
    this.debugLog('error', 'Upload failed!', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error;
  }
}

  async getImages(params: ImagingQueryParams): Promise<PaginatedResponse<ImagingRecord>> {
    this.debugLog('info', 'Fetching images with params:', params);
    
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
        this.debugLog('info', `Query param: ${key}=${value}`);
      }
    });
    
    try {
      const url = `${this.baseUrl}?${queryParams.toString()}`;
      this.debugLog('info', `GET request to ${url}`);
      
      const response = await api.get<PaginatedResponse<ImagingRecord>>(url);
      
      this.debugLog('info', 'Images fetched successfully', {
        count: response.data?.data?.length,
        total: response.data?.meta?.total,
        page: response.data?.meta?.page
      });
      
      return response.data;
    } catch (error: any) {
      this.debugLog('error', 'Failed to fetch images', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  async getImagesByVisitId(visitId: string): Promise<ImagingRecord[]> {
    this.debugLog('info', `Fetching images for visit: ${visitId}`);
    
    try {
      const url = `${this.baseUrl}/visit/${visitId}`;
      this.debugLog('info', `GET request to ${url}`);
      
      const response = await api.get<ImagingRecord[]>(url);
      
      this.debugLog('info', `Found ${response.data?.length || 0} images for visit ${visitId}`);
      
      return response.data;
    } catch (error: any) {
      this.debugLog('error', `Failed to fetch images for visit ${visitId}`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  async getImageById(id: string): Promise<ImagingRecord> {
    this.debugLog('info', `Fetching image by ID: ${id}`);
    
    try {
      const response = await api.get<ImagingRecord>(`${this.baseUrl}/${id}`);
      this.debugLog('info', `Image fetched: ${response.data?.fileName}`);
      return response.data;
    } catch (error: any) {
      this.debugLog('error', `Failed to fetch image ${id}`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  async updateImage(id: string, data: Partial<ImagingRecord>): Promise<ImagingRecord> {
    this.debugLog('info', `Updating image ${id}`, { updateFields: Object.keys(data) });
    
    try {
      const response = await api.patch<ImagingRecord>(`${this.baseUrl}/${id}`, data);
      this.debugLog('info', `Image ${id} updated successfully`);
      return response.data;
    } catch (error: any) {
      this.debugLog('error', `Failed to update image ${id}`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  async deleteImage(id: string): Promise<void> {
    this.debugLog('info', `Deleting image: ${id}`);
    
    try {
      await api.delete(`${this.baseUrl}/${id}`);
      this.debugLog('info', `Image ${id} deleted successfully`);
    } catch (error: any) {
      this.debugLog('error', `Failed to delete image ${id}`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  async createComparison(baseImageId: string, compareImageId: string, notes?: string): Promise<ImagingComparison> {
    this.debugLog('info', 'Creating image comparison', {
      baseImageId,
      compareImageId,
      hasNotes: !!notes
    });
    
    try {
      const response = await api.post<ImagingComparison>(`${this.baseUrl}/compare`, {
        baseImageId,
        compareImageId,
        notes,
      });
      
      this.debugLog('info', `Comparison created: ${response.data?.id}`);
      return response.data;
    } catch (error: any) {
      this.debugLog('error', 'Failed to create comparison', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  async deleteComparison(comparisonId: string): Promise<void> {
    this.debugLog('info', `Deleting comparison: ${comparisonId}`);
    
    try {
      await api.delete(`${this.baseUrl}/compare/${comparisonId}`);
      this.debugLog('info', `Comparison ${comparisonId} deleted`);
    } catch (error: any) {
      this.debugLog('error', `Failed to delete comparison ${comparisonId}`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  async getGroupedImages(groupId: string): Promise<ImagingRecord[]> {
    this.debugLog('info', `Fetching grouped images: ${groupId}`);
    
    try {
      const response = await api.get<ImagingRecord[]>(`${this.baseUrl}/group/${groupId}`);
      this.debugLog('info', `Found ${response.data?.length || 0} images in group ${groupId}`);
      return response.data;
    } catch (error: any) {
      this.debugLog('error', `Failed to fetch grouped images for ${groupId}`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  async getStatistics(patientId: string): Promise<any> {
    this.debugLog('info', `Fetching imaging statistics for patient: ${patientId}`);
    
    try {
      const response = await api.get(`${this.baseUrl}/statistics/patient/${patientId}`);
      this.debugLog('info', 'Statistics fetched successfully', response.data);
      return response.data;
    } catch (error: any) {
      this.debugLog('error', `Failed to fetch statistics for patient ${patientId}`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }
}

export default new ImagingService();