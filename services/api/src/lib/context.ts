import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Address } from 'viem';
import type { BundlerClient, EnclaveSigner, PaymasterClient } from '../adapters/types';

/** Dependencias inyectadas (Constitución V: todo proveedor es reemplazable). */
export type AppContext = {
  db: PrismaClient;
  redis: Redis;
  enclave: EnclaveSigner;
  bundler: BundlerClient;
  paymaster: PaymasterClient;
  notify(userId: string, msg: { title: string; body: string; screen?: string; hash?: string; channels: ('push' | 'email' | 'sms')[] }): Promise<void>;
  config: {
    rpId: string; origin: string; jwtSecret: string; stepUpSecret: Buffer;
    entryPoint: Address; implementation: Address;
    modules: { webauthn: Address; policy: Address; recovery: Address; sessions: Address };
  };
};
