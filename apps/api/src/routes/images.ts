// Product photos: single upload (camera or file) and bulk upload matched by file name.
// Every image is re-encoded with sharp: auto-rotated, resized to at most 1200px, saved as WebP,
// and stripped of metadata (phone photos often carry GPS location in EXIF).
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { db, fail, h, scope } from '../core';
import { storage } from '../storage';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 50 } });

async function toWebp(bytes: Buffer) {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try { meta = await sharp(bytes).metadata(); } catch { throw fail(400, 'That file is not an image we can read. Use a JPG, PNG or WebP photo.'); }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw fail(400, `Unsupported image type (${meta.format ?? 'unknown'}). Use a JPG, PNG or WebP photo.`);
  return sharp(bytes).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
}

async function setImage(productId: string, bytes: Buffer, where: object) {
  const p = await db.product.findFirst({ where: { id: productId, deletedAt: null, ...where }, select: { id: true, imageUrl: true } });
  if (!p) throw fail(404, 'Product not found');
  const url = await storage.save('products', await toWebp(bytes), 'webp');
  await db.product.update({ where: { id: p.id }, data: { imageUrl: url } });
  if (p.imageUrl) await storage.remove(p.imageUrl); // tidy up the old file (only if we stored it)
  return url;
}

// "Beef Short Ribs.jpg", "beef-short-ribs.png" and "BEEF_SHORT_RIBS.webp" all match "Beef Short Ribs".
const slug = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const imageRoutes = express.Router(); // mounted under /api/admin (already ADMIN or STORE_STAFF only)

imageRoutes.post('/products/:id/image', upload.single('image'), h(async (req, res) => {
  if (!req.file) throw fail(400, 'Choose a photo to upload');
  res.json({ imageUrl: await setImage(req.params.id, req.file.buffer, scope(res)) });
}));

imageRoutes.delete('/products/:id/image', h(async (req, res) => {
  const p = await db.product.findFirst({ where: { id: req.params.id, deletedAt: null, ...scope(res) }, select: { id: true, imageUrl: true } });
  if (!p) throw fail(404, 'Product not found');
  await db.product.update({ where: { id: p.id }, data: { imageUrl: null } });
  if (p.imageUrl) await storage.remove(p.imageUrl);
  res.json({ ok: true });
}));

imageRoutes.post('/products/images/bulk', upload.array('images', 50), h(async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw fail(400, 'Choose one or more photos');
  const products = await db.product.findMany({ where: { deletedAt: null, ...scope(res) }, select: { id: true, name: true } });
  const bySlug = new Map(products.map(p => [slug(p.name), p]));
  const byId = new Map(products.map(p => [p.id, p]));
  const results: { file: string; product?: string; ok: boolean; error?: string }[] = [];
  for (const f of files) {
    const key = slug(f.originalname);
    const p = bySlug.get(key) ?? byId.get(key);
    if (!p) { results.push({ file: f.originalname, ok: false, error: 'No product with this name' }); continue; }
    try { await setImage(p.id, f.buffer, scope(res)); results.push({ file: f.originalname, product: p.name, ok: true }); }
    catch (e) { results.push({ file: f.originalname, product: p.name, ok: false, error: (e as Error).message }); }
  }
  res.json({ matched: results.filter(r => r.ok).length, results });
}));

// Turn multer's size/count errors into friendly 400s.
imageRoutes.use((e: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (e instanceof multer.MulterError) return res.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'Photos must be 8 MB or smaller' : e.code === 'LIMIT_FILE_COUNT' ? 'Upload at most 50 photos at a time' : e.message });
  next(e);
});
