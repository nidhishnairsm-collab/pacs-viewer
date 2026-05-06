import fs from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const filePath = path.join(UPLOADS_DIR, relKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data as Buffer);
  return { key: relKey, url: `/uploads/${relKey}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  return { key: relKey, url: `/uploads/${relKey}` };
}
