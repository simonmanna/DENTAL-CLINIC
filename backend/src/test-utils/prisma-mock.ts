// src/test-utils/prisma-mock.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight deep mock of PrismaService for unit tests.
//
// Every model access (e.g. `prisma.patientCondition`) returns an object whose
// CRUD methods are `jest.fn()` — created lazily on first access and cached, so a
// test can configure them with `.mockResolvedValue(...)`. `$transaction`
// supports both shapes the services use:
//   • interactive  — `$transaction(async (tx) => { ... })`  → callback gets the
//     same mock instance (so `tx.model.method` works and is assertable)
//   • batch        — `$transaction([opA, opB])`             → `Promise.all`
//
// Usage:
//   const prisma = createPrismaMock();
//   prisma.condition.findUnique.mockResolvedValue({ id: 'c1', ... });
//   const service = new ConditionsService(prisma as any);
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_METHODS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
] as const;

export type PrismaMock = any;

function makeModelMock(): Record<string, jest.Mock> {
  const model: Record<string, jest.Mock> = {};
  for (const m of MODEL_METHODS) model[m] = jest.fn();
  return model;
}

export function createPrismaMock(): PrismaMock {
  const cache = new Map<string, Record<string, jest.Mock>>();
  const target: any = {};

  // Client-level helpers used across services.
  target.$transaction = jest.fn((arg: any) => {
    if (typeof arg === 'function') return arg(proxy);
    if (Array.isArray(arg)) return Promise.all(arg);
    return Promise.resolve(arg);
  });
  target.$queryRaw = jest.fn();
  target.$queryRawUnsafe = jest.fn();
  target.$executeRaw = jest.fn();
  target.$executeRawUnsafe = jest.fn();
  target.$connect = jest.fn();
  target.$disconnect = jest.fn();
  target.$on = jest.fn();
  target.onModuleInit = jest.fn();
  target.enableShutdownHooks = jest.fn();

  const proxy: any = new Proxy(target, {
    get(t, prop: string | symbol) {
      if (typeof prop === 'symbol') return (t as any)[prop];
      if (prop in t) return (t as any)[prop];
      // Avoid being mistaken for a thenable if ever awaited directly.
      if (prop === 'then') return undefined;
      if (!cache.has(prop)) cache.set(prop, makeModelMock());
      return cache.get(prop);
    },
  });

  return proxy;
}

/**
 * Convenience for the very common single-dependency service shape. Returns the
 * mock typed as `any` so it can be passed straight to a service constructor.
 */
export function newServiceWithPrisma<T>(
  Ctor: new (prisma: any) => T,
): { service: T; prisma: PrismaMock } {
  const prisma = createPrismaMock();
  return { service: new Ctor(prisma), prisma };
}

/**
 * Generic auto-mock for an arbitrary dependency (a service, a gateway, etc.).
 * Any property access returns a cached `jest.fn()`, so the mock can be passed
 * to a constructor and individual methods remain assertable
 * (`mock.someMethod.mockResolvedValue(...)`, `expect(mock.x).toHaveBeenCalled()`).
 */
export function createAutoMock(): any {
  const cache = new Map<string, jest.Mock>();
  return new Proxy(
    {},
    {
      get(_t, prop: string | symbol) {
        if (typeof prop === 'symbol') return undefined;
        if (prop === 'then') return undefined;
        if (!cache.has(prop)) cache.set(prop, jest.fn());
        return cache.get(prop);
      },
    },
  );
}
