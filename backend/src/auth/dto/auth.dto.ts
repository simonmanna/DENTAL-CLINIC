// ═══════════════════════════════════════════════════════════════
// AUTH MODULE
// ═══════════════════════════════════════════════════════════════

// src/auth/dto/auth.dto.ts
import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

// Login only looks the credentials up, so it does not police their shape —
// the format rules live on RegisterDto / ChangePasswordDto. This lets a demo
// install sign in with a plain "admin" account.
export class LoginDto {
  @ApiProperty() @IsString() @MinLength(1) email: string;
  @ApiProperty() @IsString() @MinLength(1) password: string;
}

export class RegisterDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(6) password: string;
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiProperty({ enum: UserRole }) @IsEnum(UserRole) role: UserRole;
  @ApiProperty({ required: false }) @IsOptional() @IsString() specialization?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() currentPassword: string;
  @ApiProperty() @IsString() @MinLength(6) newPassword: string;
}

export class RefreshTokenDto {
  @ApiProperty() @IsString() refreshToken: string;
}
