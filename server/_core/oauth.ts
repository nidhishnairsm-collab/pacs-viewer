// OAuth routes removed — local auth is handled via tRPC in routers.ts
import type { Express } from "express";

export function registerOAuthRoutes(_app: Express) {
  // no-op: kept for import compatibility
}
