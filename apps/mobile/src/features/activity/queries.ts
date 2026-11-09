import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api/client';
import type { ActivityItem, Balances, Policy } from '@/core/api/types';
import { useWallet } from '@/state/wallet';

export function useBalances() {
  const id = useWallet((s) => s.account?.id);
  return useQuery({
    queryKey: ['balances', id],
    enabled: !!id,
    queryFn: () => api<{ balances: Balances }>(`/activity?accountId=${id}&only=balances`).then((r) => r.balances),
    refetchInterval: 15_000,
  });
}

export function useActivity() {
  const id = useWallet((s) => s.account?.id);
  return useQuery({
    queryKey: ['activity', id],
    enabled: !!id,
    queryFn: () => api<{ items: ActivityItem[] }>(`/activity?accountId=${id}`).then((r) => r.items),
    refetchInterval: 15_000,
  });
}

export function usePolicies() {
  const id = useWallet((s) => s.account?.id);
  return useQuery({ queryKey: ['policies', id], enabled: !!id, queryFn: () => api<Policy[]>(`/policies/${id}`) });
}
