import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Me } from './api';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), staleTime: 60_000 });
}

export function useAuthActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries();
  const login = useMutation({ mutationFn: (b: { email: string; password: string }) => api<Me>('/auth/login', { method: 'POST', body: b }), onSuccess: done });
  const register = useMutation({ mutationFn: (b: { name: string; email: string; password: string; phone?: string; acceptPrivacy: boolean }) => api<Me>('/auth/register', { method: 'POST', body: b }), onSuccess: done });
  const signedOut = () => { qc.setQueryData(['me'], null); qc.removeQueries({ queryKey: ['orders'] }); };
  const logout = useMutation({ mutationFn: () => api('/auth/logout', { method: 'POST' }), onSuccess: signedOut });
  // Signs out this device and every other device (phone, shared computer) at once.
  const logoutAll = useMutation({ mutationFn: () => api('/account/logout-all', { method: 'POST' }), onSuccess: signedOut });
  return { login, register, logout, logoutAll };
}
