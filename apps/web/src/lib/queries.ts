import { useQuery } from '@tanstack/react-query';
import { api, type Category, type Product, type QA, type Store, type StoreDetail } from './api';

export type ProductFilters = { q?: string; category?: string; max?: number; inStock?: boolean; sort?: 'popular' | 'low' | 'high'; store?: string };

export const useStores = () => useQuery({ queryKey: ['stores'], queryFn: () => api<Store[]>('/stores'), staleTime: 5 * 60_000 });
export const useStore = (slug: string) => useQuery({ queryKey: ['store', slug], queryFn: () => api<StoreDetail>(`/stores/${slug}`), staleTime: 5 * 60_000 });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories'), staleTime: 10 * 60_000 });
export const useProduct = (id: string) => useQuery({ queryKey: ['product', id], queryFn: () => api<Product>(`/products/${id}`) });
export const useQA = (id: string) => useQuery({ queryKey: ['qa', id], queryFn: () => api<QA[]>(`/products/${id}/qa`) });

export function useProducts(f: ProductFilters = {}) {
  const p = new URLSearchParams();
  if (f.store) p.set('store', f.store);
  if (f.q) p.set('q', f.q);
  if (f.category) p.set('category', f.category);
  if (f.max) p.set('max', String(f.max));
  if (f.inStock) p.set('inStock', '1');
  if (f.sort) p.set('sort', f.sort);
  const qs = p.toString();
  return useQuery({ queryKey: ['products', qs], queryFn: ({ signal }) => api<Product[]>(`/products${qs ? '?' + qs : ''}`, { signal }), placeholderData: prev => prev });
}
