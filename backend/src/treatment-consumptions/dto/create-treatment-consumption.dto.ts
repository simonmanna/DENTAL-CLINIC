import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Consumables used in treatment outside a recorded session. The item leaves
 * stock through StockMovementService; its cost is the cost of the batch it is
 * drawn from (a client unitCost is not accepted). The actor is the JWT user.
 */
export class CreateTreatmentConsumptionDto {
  @IsOptional() @IsString() treatmentPlanId?: string;
  @IsOptional() @IsString() patientId?: string;

  @IsIn(['DRUG', 'INVENTORY'])
  itemType: 'DRUG' | 'INVENTORY';

  /** Drug id (DRUG) or inventory item id (INVENTORY). */
  @IsString() @IsNotEmpty() itemId: string;

  @IsNumber() @Min(0.0001) quantity: number;

  /** Stock location; defaults to CLINICAL_STOCK_LOCATION / the default location. */
  @IsOptional() @IsString() locationId?: string;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
