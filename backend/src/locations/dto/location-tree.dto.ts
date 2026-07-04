import { LocationResponseDto } from './location-response.dto';

export class LocationTreeDto extends LocationResponseDto {
  declare children: LocationTreeDto[]; // Use declare to avoid property override error
  expanded?: boolean;
}
