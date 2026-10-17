import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Me } from './api';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), staleTime: 60_000 });
}

export function useAuthActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries();
  const login = useMutation({ mutationFn: (b: { email: string; password: string }) => api<Me>('/auth/login', { method: 'POST', body: b }), onSuccess: done });
  const register = useMutation({ mutationFn: (b: { name: string; email: string; password: string; phone?: string }) => api<Me>('/auth/register', { method: 'POST', body: b }), onSuccess: done });
  const logout = useMutation({ mutationFn: () => api('/auth/logout', { method: 'POST' }), onSuccess: () => { qc.setQueryData(['me'], null); qc.removeQueries({ queryKey: ['orders'] }); } });
  return { login, register, logout };
}
