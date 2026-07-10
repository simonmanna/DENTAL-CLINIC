// backend/src/storage/storage.service.ts
import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

// Define the file interface
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

@Injectable()
export class StorageService {
  private readonly uploadDir = path.resolve(__dirname, '..', '..', '..', 'uploads');

  constructor() {
    this.ensureUploadDirectory();
  }

  private async ensureUploadDirectory() {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(file: UploadedFile, filePath: string): Promise<{ url: string; path: string }> {
    const fullPath = path.join(this.uploadDir, filePath);
    const dir = path.dirname(fullPath);
    
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, file.buffer);
    
    // Generate URL for the file (adjust base URL as needed)
    const url = `/uploads/${filePath}`;
    
    return {
      url,
      path: fullPath,
    };
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  }

  async getFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }
}