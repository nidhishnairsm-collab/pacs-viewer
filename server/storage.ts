import fs from "fs/promises";
import path from "path";
import { ENV } from "./_core/env";
import { getGcsBucket } from "./gcs";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function useGcs() {
  return !!ENV.gcsBucket;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array,
  contentType = "application/dicom"
): Promise<{ key: string; url: string }> {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (useGcs()) {
    await getGcsBucket().file(relKey).save(buf, { contentType });
    return { key: relKey, url: `/dicom-proxy/${relKey}` };
  }
  // Local dev: write to ./uploads/
  const filePath = path.join(UPLOADS_DIR, relKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buf);
  return { key: relKey, url: `/uploads/${relKey}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  return { key: relKey, url: useGcs() ? `/dicom-proxy/${relKey}` : `/uploads/${relKey}` };
}

export async function storageRead(relKey: string): Promise<Buffer> {
  if (useGcs()) {
    const [data] = await getGcsBucket().file(relKey).download();
    return data;
  }
  return fs.readFile(path.join(UPLOADS_DIR, relKey));
}
