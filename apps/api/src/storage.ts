// Where uploaded files live, chosen by STORAGE_PROVIDER:
// - local (default): files under apps/api/uploads, served at /uploads.
// - database: files kept in Postgres (StoredFile), for hosts that wipe their disk on restart, such as Render's free tier.
// An S3 or Cloudinary implementation can replace either later without touching the routes.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from './core';

export interface StorageProvider {
  name: string;
  /** Saves bytes and returns the public URL path, e.g. /uploads/products/abc.webp */
  save(folder: string, bytes: Buffer, ext: string): Promise<string>;
  /** Removes a file previously returned by save(); ignores URLs it does not own. */
  remove(url: string): Promise<void>;
}

export const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads');
export const UPLOAD_URL = '/uploads';

export const LocalStorage: StorageProvider = {
  name: 'local',
  async save(folder, bytes, ext) {
    const dir = path.join(UPLOAD_ROOT, folder);
    await fs.mkdir(dir, { recursive: true });
    const file = `${crypto.randomUUID()}.${ext}`;
    await fs.writeFile(path.join(dir, file), bytes);
    return `${UPLOAD_URL}/${folder}/${file}`;
  },
  async remove(url) {
    if (!url.startsWith(UPLOAD_URL + '/')) return;
    const full = path.resolve(UPLOAD_ROOT, url.slice(UPLOAD_URL.length + 1));
    if (!full.startsWith(UPLOAD_ROOT + path.sep)) return; // never leave the uploads folder
    await fs.rm(full, { force: true });
  },
};

const keyOf = (url: string) => (url.startsWith(UPLOAD_URL + '/') ? url.slice(UPLOAD_URL.length + 1) : null);
const TYPES: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

export const DatabaseStorage: StorageProvider = {
  name: 'database',
  async save(folder, bytes, ext) {
    const id = `${folder}/${crypto.randomUUID()}.${ext}`;
    await db.storedFile.create({ data: { id, contentType: TYPES[ext] ?? 'application/octet-stream', bytes } });
    return `${UPLOAD_URL}/${id}`;
  },
  async remove(url) {
    const id = keyOf(url); if (id) await db.storedFile.deleteMany({ where: { id } });
  },
};

/** Reads a file saved by DatabaseStorage (null if missing). */
export const readStoredFile = (id: string) => db.storedFile.findUnique({ where: { id } });

export const storage: StorageProvider = process.env.STORAGE_PROVIDER === 'database' ? DatabaseStorage : LocalStorage;
