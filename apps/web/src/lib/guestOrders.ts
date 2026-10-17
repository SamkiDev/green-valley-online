// Guest orders placed (or looked up) on this device. Each has an access token the API issued for that one order;
// it is sent as X-Order-Token so the guest can pay for and track it without an account.
import { load, save } from './storage';

export type GuestOrder = { id: string; orderNumber: string; token: string; at: string };
const KEY = 'gv-guest-orders-v1';

export const guestOrders = (): GuestOrder[] => load<GuestOrder[]>(KEY, []);
export function rememberGuestOrder(o: Omit<GuestOrder, 'at'>) {
  save(KEY, [{ ...o, at: new Date().toISOString() }, ...guestOrders().filter(g => g.id !== o.id)].slice(0, 20));
}
export const tokenFor = (orderId: string) => guestOrders().find(g => g.id === orderId)?.token;
