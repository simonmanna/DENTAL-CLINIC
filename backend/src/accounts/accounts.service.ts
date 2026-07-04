// src/accounts/accounts.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // adjust if needed
import { CreateAccountDto, UpdateAccountDto } from './dto/cashflow.dto';
import { generateCode } from '../utils/code-generator';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAccountDto) {
    const accountCode = generateCode('ACC');

    // Unset existing default for same type+currency if this one is set as default
    if (dto.isDefault) {
      await this.prisma.account.updateMany({
        where: {
          currency: dto.currency ?? 'UGX',
          type: dto.type,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const account = await this.prisma.account.create({
      data: {
        accountCode,
        name: dto.name,
        type: dto.type,
        currency: (dto.currency ?? 'UGX') as any,
        bankName: dto.bankName,
        bankBranch: dto.bankBranch,
        accountNumber: dto.accountNumber,
        description: dto.description,
        isDefault: dto.isDefault ?? false,
        currentBalance: dto.openingBalance ?? 0,
      },
    });

    return account;
  }

  // async findAll(includeInactive = false) {
  //   return this.prisma.account.findMany({
  //     where: includeInactive ? {} : { isActive: true },
  //     orderBy: { createdAt: 'desc' },
  //   });
  // }

  async findAll(includeInactive = false) {
  return this.prisma.account.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [
      { orderNumber: 'asc' },  // Primary sort
      { createdAt: 'desc' }    // Secondary sort (tie-breaker)
    ],
  });
}
  // async findAll(includeInactive = false) {
  //   return this.prisma.account.findMany({
  //     where: includeInactive ? {} : { isActive: true },
  //     include: {
  //       _count: { select: { cashFlowEntries: true } },
  //     },
  //     orderBy: [{ type: 'asc' }, { name: 'asc' }],
  //   });
  // }

  async findOne(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        accountPeriods: {
          where: { status: 'OPEN' }, // Optional: filter to open periods
        orderBy: { startDate: 'desc' },
        take: 7,
        },
      },
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  async update(id: string, dto: UpdateAccountDto) {
    await this.findOne(id); // ensures 404 if not found
    return this.prisma.account.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.account.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getSummary() {
    const accounts = await this.prisma.account.findMany({
      where: { isActive: true },
    });

    const byType: Record<string, { count: number; totalBalance: number; currency: string }> = {};
    for (const acc of accounts) {
      const key = acc.type;
      if (!byType[key]) byType[key] = { count: 0, totalBalance: 0, currency: acc.currency };
      byType[key].count++;
      byType[key].totalBalance += Number(acc.currentBalance);
    }

    return { accounts, byType };
  }
}