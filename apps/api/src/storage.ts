// Where uploaded files live. LocalStorage writes under apps/api/uploads and serves them at /uploads;
// an S3 or Cloudinary implementation can replace it later without touching the routes.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

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

export const storage: StorageProvider = LocalStorage; // choose by process.env.STORAGE_PROVIDER once others exist
