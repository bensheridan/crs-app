import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

export const prisma = new PrismaClient();
// We assume REDIS_URL could be provided, or default to localhost
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
