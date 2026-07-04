// prisma/seed/utils.ts
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

export const prisma = new PrismaClient();

// Ugandan/East African context helpers
export const ugandanPhones = () => {
  const prefixes = ['+25670', '+25671', '+25675', '+25677', '+25678'];
  const prefix = faker.helpers.arrayElement(prefixes);
  return `${prefix}${faker.string.numeric(7)}`;
};

export const ugandanAddresses = () => {
  const areas = [
    'Kampala Road', 'Nakasero', 'Kololo', 'Bugolobi', 'Ntinda',
    'Wandegeya', 'Makerere', 'Najjera', 'Kyanja', 'Bukoto',
    'Entebbe Road', 'Jinja Road', 'Gayaza Road', 'Bombo Road'
  ];
  return `${faker.string.numeric(3)} ${faker.helpers.arrayElement(areas)}, Kampala, Uganda`;
};

export const ugandanEmail = (firstName: string, lastName: string) => {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'dhms.co.ug'];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${faker.string.numeric(2)}@${faker.helpers.arrayElement(domains)}`;
};

export const randomDate = (start: Date, end: Date) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

export const logSuccess = (model: string, count: number) => {
  console.log(`✅ Seeded ${count} ${model}${count === 1 ? '' : 's'}`);
};

export const logError = (model: string, error: any) => {
  console.error(`❌ Error seeding ${model}:`, error.message);
};