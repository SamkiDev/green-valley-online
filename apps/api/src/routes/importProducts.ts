// Load the shop's real catalogue from a spreadsheet saved as CSV.
// POST /api/admin/products/import?dryRun=1  -> preview (nothing saved)
// POST /api/admin/products/import           -> apply
// Columns (header row, any order, case-insensitive): name, category, price, unit (kg | each), stock,
// description, available (yes/no), store (slug, admins only), image_url.
// A row whose name already exists in that store updates the product; otherwise a new product is created.
import express from 'express';
import multer from 'multer';
import { db, fail, h, me, scope } from '../core';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const MAX_ROWS = 2000;

/** Minimal RFC 4180 CSV parser: quoted fields, "" escapes, commas and newlines inside quotes. Also accepts ; separators. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? undefined : src.indexOf('\n'));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','; // Excel in SA often saves with ;
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f.trim() !== '')) rows.push(row);
  return rows;
}

const money = (s: string) => Number(s.replace(/[R\s]/gi, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, ''));
const yes = (s: string) => !/^(no|n|false|0|unavailable|off)$/i.test(s.trim());

type RowResult = { row: number; name: string; store: string; action: 'create' | 'update' | 'error'; errors: string[]; changes?: string[] };

export const importRoutes = express.Router(); // mounted under /api/admin (ADMIN or STORE_STAFF)

importRoutes.post('/products/import', upload.single('file'), h(async (req, res) => {
  if (!req.file) throw fail(400, 'Choose a CSV file');
  const dryRun = req.query.dryRun === '1';
  const rows = parseCsv(req.file.buffer.toString('utf8'));
  if (rows.length < 2) throw fail(400, 'The file needs a header row and at least one product row');
  if (rows.length - 1 > MAX_ROWS) throw fail(400, `Import at most ${MAX_ROWS} products at a time`);
  const header = rows[0].map(hd => hd.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const col = (n: string) => header.indexOf(n);
  for (const need of ['name', 'category', 'price']) if (col(need) < 0) throw fail(400, `Missing column "${need}". Required columns: name, category, price.`);

  const isAdmin = me(res).role === 'ADMIN';
  const stores = await db.store.findMany({ where: isAdmin ? {} : { id: me(res).storeId }, select: { id: true, slug: true } });
  const defaultStore = isAdmin ? stores.find(s => s.slug === 'meat-market') ?? stores[0] : stores[0];
  const existing = await db.product.findMany({ where: { deletedAt: null, ...scope(res) }, include: { inventory: true, category: true } });
  const byKey = new Map(existing.map(p => [`${p.storeId}|${p.name.trim().toLowerCase()}`, p]));
  const seen = new Set<string>();

  const results: RowResult[] = [];
  const valid: { r: RowResult; storeId: string; data: { name: string; category: string; price: number; soldByWeight: boolean; stock?: number; description?: string; active: boolean; imageUrl?: string | null }; existingId?: string }[] = [];
  rows.slice(1).forEach((cells, idx) => {
    const get = (n: string) => (col(n) >= 0 ? (cells[col(n)] ?? '').trim() : '');
    const errors: string[] = [];
    const name = get('name'), category = get('category'), priceRaw = get('price');
    const storeSlug = get('store') || defaultStore?.slug || '';
    const store = stores.find(s => s.slug === storeSlug);
    if (!name) errors.push('name is empty'); else if (name.length > 100) errors.push('name is longer than 100 characters');
    if (!category) errors.push('category is empty');
    const price = money(priceRaw);
    if (!priceRaw || !Number.isFinite(price) || price <= 0 || price > 100000) errors.push(`price "${priceRaw}" is not a valid amount`);
    const unit = get('unit').toLowerCase();
    const soldByWeight = unit ? /^(kg|per kg|kilogram|weight|weighed)$/.test(unit) : false;
    if (unit && !soldByWeight && !/^(each|item|unit|per item|pack)$/.test(unit)) errors.push(`unit "${unit}" should be kg or each`);
    const stockRaw = get('stock'); const stock = stockRaw ? money(stockRaw) : undefined;
    if (stock !== undefined && (!Number.isFinite(stock) || stock < 0)) errors.push(`stock "${stockRaw}" is not a number`);
    const imageUrl = get('image_url');
    if (imageUrl && !/^https?:\/\/\S+$/.test(imageUrl)) errors.push('image_url must start with http(s)://');
    if (!store) errors.push(isAdmin ? `store "${storeSlug}" not found` : 'you can only import into your own store');
    const key = store ? `${store.id}|${name.toLowerCase()}` : '';
    if (key && seen.has(key)) errors.push('this product appears twice in the file');
    if (key) seen.add(key);
    const found = key ? byKey.get(key) : undefined;
    const r: RowResult = { row: idx + 2, name, store: storeSlug, action: errors.length ? 'error' : found ? 'update' : 'create', errors };
    if (!errors.length && store) {
      const data = { name, category, price, soldByWeight, stock, description: get('description') || undefined, active: col('available') >= 0 ? yes(get('available')) : true, imageUrl: imageUrl || undefined };
      if (found) {
        const ch: string[] = [];
        if (Number(found.price) !== price) ch.push(`price R${Number(found.price).toFixed(2)} → R${price.toFixed(2)}`);
        if (stock !== undefined && Number(found.inventory?.quantity ?? 0) !== stock) ch.push(`stock ${Number(found.inventory?.quantity ?? 0)} → ${stock}`);
        if (found.category.name !== category) ch.push(`category ${found.category.name} → ${category}`);
        if (found.soldByWeight !== soldByWeight && unit) ch.push(soldByWeight ? 'now sold per kg' : 'now sold per item');
        if (data.description && data.description !== found.description) ch.push('description');
        if (found.active !== data.active) ch.push(data.active ? 'made available' : 'marked unavailable');
        r.changes = ch.length ? ch : ['no changes'];
      }
      valid.push({ r, storeId: store.id, data, existingId: found?.id });
    }
    results.push(r);
  });

  const summary = { create: results.filter(x => x.action === 'create').length, update: results.filter(x => x.action === 'update').length, errors: results.filter(x => x.action === 'error').length };
  if (dryRun) return res.json({ dryRun: true, summary, results });
  if (summary.errors) throw Object.assign(fail(400, `Fix the ${summary.errors} row(s) with errors first; nothing was imported.`), {});

  await db.$transaction(async tx => {
    const cats = new Map((await tx.category.findMany()).map(c => [c.name.toLowerCase(), c.id]));
    for (const v of valid) {
      let categoryId = cats.get(v.data.category.toLowerCase());
      if (!categoryId) { categoryId = (await tx.category.create({ data: { name: v.data.category } })).id; cats.set(v.data.category.toLowerCase(), categoryId); }
      const fields = { name: v.data.name, price: v.data.price, soldByWeight: v.data.soldByWeight, active: v.data.active, categoryId, isDemo: false,
        ...(v.data.description !== undefined ? { description: v.data.description } : {}), ...(v.data.imageUrl !== undefined ? { imageUrl: v.data.imageUrl } : {}) };
      if (v.existingId) {
        await tx.product.update({ where: { id: v.existingId }, data: fields });
        if (v.data.stock !== undefined) await tx.inventory.upsert({ where: { productId: v.existingId }, update: { quantity: v.data.stock }, create: { productId: v.existingId, quantity: v.data.stock } });
      } else {
        await tx.product.create({ data: { ...fields, description: v.data.description ?? '', storeId: v.storeId, inventory: { create: { quantity: v.data.stock ?? 0 } } } });
      }
    }
  }, { timeout: 60_000 });
  res.json({ dryRun: false, summary, results });
}));

importRoutes.use((e: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (e instanceof multer.MulterError) return res.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'The CSV file must be 2 MB or smaller' : e.message });
  next(e);
});
