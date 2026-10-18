// "Order again": rebuild the cart from a past order. Items in short supply are added with what is in stock,
// unavailable ones are skipped, and the cart page tells the customer which ones and why.
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from './api';
import { useCart } from './cart';

type ReorderResponse = { storeSlug: string; items: { productId: string; name: string; quantity: number; wanted?: number; available: boolean; partial?: boolean; reason: string | null }[] };
export type ReorderNotice = { added: string[]; partial: { name: string; reason: string }[]; skipped: { name: string; reason: string }[] };

export function useReorder() {
  const cart = useCart();
  const nav = useNavigate();
  return useMutation({
    mutationFn: (orderId: string) => api<ReorderResponse>(`/orders/${orderId}/reorder`, { method: 'POST' }),
    onSuccess: r => {
      const ok = r.items.filter(i => i.available);
      if (!ok.length) return; // the caller shows why (see ReorderButton)
      if (cart.lines.length && cart.storeSlug !== r.storeSlug
        && !window.confirm('Your cart has items from another store. Orders are placed one store at a time.\n\nReplace your cart with this order?')) return;
      ok.forEach((i, n) => cart.add(i.productId, i.quantity, r.storeSlug, { replace: n === 0 }));
      const notice: ReorderNotice = { added: ok.map(i => i.name), partial: ok.filter(i => i.partial).map(i => ({ name: i.name, reason: i.reason ?? 'less in stock' })), skipped: r.items.filter(i => !i.available).map(i => ({ name: i.name, reason: i.reason ?? 'unavailable' })) };
      nav('/cart', { state: { reorder: notice } });
    },
  });
}
