// backend/src/imaging/pipes/transform-imaging-data.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class TransformImagingDataPipe implements PipeTransform {
  transform(value: any) {
    // Parse toothNumbers if it's a string
    if (value.toothNumbers && typeof value.toothNumbers === 'string') {
      try {
        value.toothNumbers = JSON.parse(value.toothNumbers);
      } catch (e) {
        // If it's not JSON, try to split by comma
        if (value.toothNumbers.includes(',')) {
          value.toothNumbers = value.toothNumbers.split(',').map(Number);
        } else {
          value.toothNumbers = [Number(value.toothNumbers)];
        }
      }
    }
    
    // Ensure arrays are valid
    if (value.toothNumbers && !Array.isArray(value.toothNumbers)) {
      value.toothNumbers = [value.toothNumbers];
    }
    
    // Filter out NaN values
    if (Array.isArray(value.toothNumbers)) {
      value.toothNumbers = value.toothNumbers.filter(num => !isNaN(num));
    }
    
    return value;
  }
}