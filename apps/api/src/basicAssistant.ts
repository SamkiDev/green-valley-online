// Vallerie "basic mode": used when no AI key is configured. It answers the common questions directly from the
// database (names, prices, stock, zones, the customer's own order) with fixed wording. Nothing is invented:
// every product, price and fee in a reply comes from the rows passed in.
import type { Prisma } from '@prisma/client';

type P = Prisma.ProductGetPayload<{ include: { category: true; inventory: true } }>;
type Zone = { name: string; fee: Prisma.Decimal; suburbs: string[] };
export type BasicInput = {
  message: string; products: P[]; storeName: string; zones: Zone[]; windowMinutes?: [number, number];
  latestOrder?: { number: string; status: string; delivery?: string | null; fulfilment: string } | null; signedIn: boolean;
};
export type BasicOutput = { reply: string; products: P[] };

const r = (n: number) => 'R' + n.toFixed(2);
const stock = (p: P) => Number(p.inventory?.quantity ?? 0);
const inStock = (p: P) => stock(p) > 0;
const price = (p: P) => `${r(Number(p.price))}${p.soldByWeight ? '/kg' : ' each'}`;
const line = (p: P) => `- **${p.name}**: ${price(p)}${inStock(p) ? '' : ' (out of stock)'}`;
const half = (kg: number) => Math.max(0.5, Math.round(kg * 2) / 2); // nearest 0.5 kg, at least 0.5

const STATUS: Record<string, string> = {
  PLACED: 'waiting for payment', PAID: 'paid', PREPARING: 'being prepared', PACKED: 'packed', OUT_FOR_DELIVERY: 'on its way',
  DELIVERED: 'delivered', READY_FOR_COLLECTION: 'ready for collection', COLLECTED: 'collected', CANCELLED: 'cancelled',
};

export function basicAnswer(i: BasicInput): BasicOutput {
  const m = i.message.toLowerCase();
  const all = i.products;

  // 1. Where is my order?
  if (/\b(my order|where is|track|order status|delivered yet|my delivery)\b/.test(m)) {
    if (!i.signedIn) return { reply: 'I can only see orders for signed-in customers. Sign in, or open **Track Order** and enter your order number and email.', products: [] };
    if (!i.latestOrder) return { reply: "I can't find any orders on your account yet. Once you place one, you can follow it on **Track Order**.", products: [] };
    const o = i.latestOrder;
    return { reply: `Your latest order **#${o.number}** is ${STATUS[o.status] ?? o.status.toLowerCase()}${o.fulfilment === 'COLLECTION' ? ' (collection)' : ''}. Open **Track Order** to see every step and the time it happened.`, products: [] };
  }

  // 2. Delivery and collection
  if (/\b(deliver|delivery|collect|collection|zone|fee|how long|shipping)\b/.test(m) && !/\bbraai\b/.test(m)) {
    const zones = i.zones.length
      ? i.zones.map(z => `- ${z.name}: ${r(Number(z.fee))}${z.suburbs.length ? ` (${z.suburbs.slice(0, 6).join(', ')}${z.suburbs.length > 6 ? ', …' : ''})` : ''}`).join('\n')
      : '- Delivery zones have not been set up yet.';
    const eta = i.windowMinutes ? `\n\nDeliveries usually arrive about ${i.windowMinutes[0]} to ${i.windowMinutes[1]} minutes after payment. That is an estimate, not a promise.` : '';
    return { reply: `${i.storeName} delivers to these zones (demo fees):\n\n${zones}\n- Collect from the store: free${eta}\n\nYou choose delivery or collection at checkout, and you can follow your order on **Track Order**.`, products: [] };
  }

  // 3. Braai planning: "a braai for 8 people"
  if (/\b(braai|party|guests|people|family|gathering)\b/.test(m) && /\b(braai|people|guests|party)\b/.test(m)) {
    const n = Math.min(Math.max(Number(m.match(/(\d{1,3})\s*(people|guests|persons|adults|of us)?/)?.[1] ?? 6), 1), 200);
    const pick: { p: P; qty: number; why: string }[] = [];
    const find = (re: RegExp, cat?: string) => all.find(p => inStock(p) && re.test(p.name.toLowerCase()) && (!cat || p.category.name === cat));
    const pack = find(/family braai pack/);
    let covered = 0;
    if (pack && n >= 5) {
      const serves = Number(pack.description.match(/(\d+)\s*people/)?.[1] ?? 6);
      const packs = Math.max(1, Math.min(Math.floor(n / serves), Math.floor(stock(pack))));
      pick.push({ p: pack, qty: packs, why: `a mix of wors, chops, chicken and steak for about ${serves} people each` });
      covered = packs * serves;
    }
    const rest = Math.max(0, n - covered);
    const wors = find(/boerewors/);
    if (wors) { const kg = Math.min(half(Math.max(rest, 2) * 0.2), stock(wors)); if (kg > 0) pick.push({ p: wors, qty: kg, why: 'every braai needs wors' }); }
    const wings = find(/chicken wings/) ?? find(/chicken drumsticks/);
    if (wings) { const kg = Math.min(half(n * 0.12), stock(wings)); if (kg > 0) pick.push({ p: wings, qty: kg, why: 'easy to marinate and popular with kids' }); }
    if (rest >= 3) { const chops = find(/lamb chops/) ?? find(/pork chops/); if (chops) { const kg = Math.min(half(rest * 0.15), stock(chops)); if (kg > 0) pick.push({ p: chops, qty: kg, why: 'quick to cook over the coals' }); } }
    if (!pick.length) return { reply: "The braai items are out of stock right now. Have a look at **Shop** for what's available today.", products: [] };
    const total = pick.reduce((s, x) => s + Number(x.p.price) * x.qty, 0);
    const lines = pick.map(x => `- **${x.p.name}**: ${x.p.soldByWeight ? `${x.qty} kg` : `${x.qty} ×`} at ${price(x.p)}: ${x.why}`).join('\n');
    return {
      reply: `For a braai for ${n}, here's a starting point from what's in stock today:\n\n${lines}\n\nThat comes to about **${r(total)}** (demo prices; weighed items may vary slightly). Portions follow the common guide of about 350 g of meat per person, so adjust for big eaters.\n\nAdd the items below, set the weights on each product page, then go to your cart to check out.`,
      products: pick.map(x => x.p),
    };
  }

  // 4. Budget: "under R300"
  const cap = m.match(/(?:under|below|less than|budget(?: of)?|max(?:imum)?)\s*r?\s*(\d{2,6})/);
  if (cap) {
    const max = Number(cap[1]);
    const fits = all.filter(p => inStock(p) && Number(p.price) <= max).sort((a, b) => b.popularity - a.popularity).slice(0, 8);
    if (!fits.length) return { reply: `Nothing in stock is priced under ${r(max)} right now.`, products: [] };
    return { reply: `In stock and priced under ${r(max)} (per kg for weighed items):\n\n${fits.map(line).join('\n')}\n\nWeighed items are priced per kg, so the total depends on the weight you choose.`, products: fits.slice(0, 6) };
  }

  // 5. A category or product: "show me chicken products"
  const cats = [...new Set(all.map(p => p.category.name))];
  const cat = cats.find(c => m.includes(c.toLowerCase()) || m.includes(c.toLowerCase().replace(/s$/, '')));
  const words = m.replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !['show', 'products', 'what', 'have', 'with', 'your', 'some', 'please', 'there', 'available'].includes(w));
  const named = cat ? all.filter(p => p.category.name === cat) : all.filter(p => words.some(w => p.name.toLowerCase().includes(w) || (w === 'wors' && /wors/i.test(p.name))));
  if (named.length) {
    const list = [...named].sort((a, b) => Number(inStock(b)) - Number(inStock(a)) || b.popularity - a.popularity).slice(0, 8);
    return { reply: `${cat ? `Our ${cat.toLowerCase()} range` : 'Here is what matches'}:\n\n${list.map(line).join('\n')}${list.some(p => p.soldByWeight) ? '\n\nWeighed items are priced per kg; choose the weight on the product page.' : ''}`, products: list.filter(inStock).slice(0, 6) };
  }

  // 6. Anything else
  return {
    reply: "I'm in basic mode, so I can answer these from the shop's live catalogue:\n\n- Braai ideas for a number of people (\"a braai for 8\")\n- A category, like chicken, beef, pork or lamb\n- What's available under an amount (\"under R300\")\n- How delivery and collection work\n- Where your latest order is\n\nFor anything else, browse **Shop** or use the WhatsApp button on the store page.",
    products: [],
  };
}
