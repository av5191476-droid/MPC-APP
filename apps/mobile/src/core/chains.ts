import Constants from 'expo-constants';
import { chains } from '@hw/config';

export type ChainKey = keyof typeof chains;
export const SUPPORTED: ChainKey[] = ['base', 'arbitrum', 'polygon'];
export const TESTNET: ChainKey = 'baseSepolia';

export const defaultChainId: number = Constants.expoConfig?.extra?.defaultChainId ?? 84532;
export const chainById = (id: number) => Object.values(chains).find((c) => c.id === id);
export { chains };
