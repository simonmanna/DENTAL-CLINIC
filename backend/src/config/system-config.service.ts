// src/config/system-config.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_CONFIGS = [
  { key: 'stock_sessions_enabled', value: 'false', description: 'Enable bar/kitchen stock sessions (opening & closing counts)' },
  { key: 'alcohol_weight_scale_enabled', value: 'false', description: 'Enable weight scale input for alcohol stock sessions' },
  { key: 'default_tax_rate', value: '0', description: 'Default tax rate as percentage (e.g. 18 for 18%)' },
  { key: 'cost_method', value: 'WAVG', description: 'Costing method: FIFO or WAVG (Weighted Average)' },
  { key: 'reorder_alert_enabled', value: 'true', description: 'Enable low stock reorder alerts' },
  { key: 'strict_stock_mode', value: 'false', description: 'Prevent sales if stock goes below 0' },
  { key: 'currency', value: 'UGX', description: 'System currency code' },
  { key: 'currency_symbol', value: 'UGX', description: 'Currency display symbol' },
  { key: 'business_name', value: 'My Restaurant', description: 'Business name for receipts' },
  { key: 'receipt_footer', value: 'Thank you for visiting!', description: 'Receipt footer message' },
];

@Injectable()
export class SystemConfigService {
  constructor(private prisma: PrismaService) {}

  async seedDefaults() {
    for (const cfg of DEFAULT_CONFIGS) {
      await this.prisma.systemConfig.upsert({
        where: { key: cfg.key },
        create: cfg,
        update: {},
      });
    }
    return { seeded: DEFAULT_CONFIGS.length };
  }

  async findAll() {
    return this.prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
  }

  async get(key: string): Promise<string | null> {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { key } });
    return cfg?.value ?? null;
  }

  async set(key: string, value: string, description?: string) {
    return this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value, description },
      update: { value },
    });
  }

  async setBulk(items: { key: string; value: string }[]) {
    return Promise.all(
      items.map(item => this.set(item.key, item.value))
    );
  }
}