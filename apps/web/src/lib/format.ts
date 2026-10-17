// "R1,234.56", matching how prices are written on the shop's boards.
export const rand = (n: number | string) =>
  'R' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Line totals are rounded half-up to the cent, the same rule the server uses.
export const lineTotal = (price: number | string, qty: number) => Math.round(Number(price) * qty * 100 + 1e-7) / 100;

export const qtyLabel = (qty: number, soldByWeight: boolean) =>
  soldByWeight ? `${qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} kg` : `${qty} ×`;

export const unitLabel = (soldByWeight: boolean) => (soldByWeight ? '/kg' : ' each');

export function firstName(name: string) { return name.trim().split(/\s+/)[0] ?? name; }

// Accepts "under R300", "below 300", "<300" inside a search string and returns the cleaned text + price cap.
export function parseSearch(raw: string): { text: string; max?: number } {
  const m = raw.match(/(?:under|below|less than|<)\s*r?\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return { text: raw.trim() };
  return { text: raw.replace(m[0], '').replace(/\s{2,}/g, ' ').trim(), max: Number(m[1].replace(',', '.')) };
}
