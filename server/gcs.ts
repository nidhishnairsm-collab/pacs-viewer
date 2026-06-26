import { Storage } from "@google-cloud/storage";
import { ENV } from "./_core/env";

const storage = new Storage();

export function getGcsBucket() {
  return storage.bucket(ENV.gcsBucket);
}
