import { PrismaClient } from "@prisma/client";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalDb.prisma ?? new PrismaClient({
  datasourceUrl: process.env.POOL_DATABASE_URL || process.env.DATABASE_URL,
});
if (process.env.NODE_ENV !== "production") globalDb.prisma = prisma;
