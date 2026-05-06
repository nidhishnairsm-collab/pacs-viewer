import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import dicomParser from "dicom-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { storagePut } from "../storage";
import * as db from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Serve locally uploaded DICOM files
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  // OAuth routes (no-op locally)
  registerOAuthRoutes(app);

  // DICOM file upload endpoint
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
  app.post("/api/upload-dicom", upload.array("files"), async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) { res.status(400).json({ error: "No files provided" }); return; }

      const patientName = (req.body.patientName as string)?.trim() || "Unknown Patient";

      // Group files by Study Instance UID
      type FileEntry = { buffer: Buffer; sopUID: string; seriesUID: string; instanceNumber: number };
      type StudyEntry = {
        modality: string; description: string; bodyPart: string; studyDate: Date;
        series: Map<string, FileEntry[]>;
      };
      const studyMap = new Map<string, StudyEntry>();

      for (const file of files) {
        try {
          const dataset = dicomParser.parseDicom(new Uint8Array(file.buffer));
          const studyUID = dataset.string("x0020000d") ?? crypto.randomUUID();
          const seriesUID = dataset.string("x0020000e") ?? crypto.randomUUID();
          const sopUID = dataset.string("x00080018") ?? crypto.randomUUID();
          const modality = dataset.string("x00080060") ?? "OT";
          const instanceNumber = parseInt(dataset.string("x00200013") ?? "1", 10) || 1;
          const description = dataset.string("x00081030") ?? dataset.string("x0008103e") ?? "Uploaded Study";
          const bodyPart = dataset.string("x00180015") ?? "";
          const dateStr = dataset.string("x00080020") ?? "";
          let studyDate = new Date();
          if (dateStr.length === 8) {
            studyDate = new Date(
              parseInt(dateStr.slice(0, 4), 10),
              parseInt(dateStr.slice(4, 6), 10) - 1,
              parseInt(dateStr.slice(6, 8), 10)
            );
          }

          if (!studyMap.has(studyUID)) {
            studyMap.set(studyUID, { modality, description, bodyPart, studyDate, series: new Map() });
          }
          const studyEntry = studyMap.get(studyUID)!;
          if (!studyEntry.series.has(seriesUID)) studyEntry.series.set(seriesUID, []);
          studyEntry.series.get(seriesUID)!.push({ buffer: file.buffer, sopUID, seriesUID, instanceNumber });
        } catch (e) {
          console.error("[Upload] Failed to parse DICOM file:", file.originalname, e);
        }
      }

      if (studyMap.size === 0) { res.status(400).json({ error: "No valid DICOM files" }); return; }

      const studyIds: number[] = [];

      for (const [studyUID, studyEntry] of Array.from(studyMap)) {
        const patientRecord = await db.createPatient({
          patientId: `PAT-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
          name: patientName,
          createdBy: user.id,
        });
        const patientId = Number((patientRecord as any)[0]?.insertId ?? (patientRecord as any).insertId);

        let totalInstances = 0;
        for (const instances of Array.from(studyEntry.series.values())) totalInstances += instances.length;

        const studyRecord = await db.createStudy({
          studyId: studyUID,
          patientId,
          studyDate: studyEntry.studyDate,
          modality: studyEntry.modality,
          description: studyEntry.description,
          bodyPart: studyEntry.bodyPart,
          numberOfSeries: studyEntry.series.size,
          numberOfInstances: totalInstances,
          uploadedBy: user.id,
        });
        const dbStudyId = Number((studyRecord as any)[0]?.insertId ?? (studyRecord as any).insertId);
        studyIds.push(dbStudyId);

        for (const [seriesUID, instanceFiles] of Array.from(studyEntry.series)) {
          const seriesRecord = await db.createSeries({
            seriesId: seriesUID,
            studyId: dbStudyId,
            modality: studyEntry.modality,
            numberOfInstances: instanceFiles.length,
          });
          const dbSeriesId = Number((seriesRecord as any)[0]?.insertId ?? (seriesRecord as any).insertId);

          for (const inst of instanceFiles) {
            const relKey = `dicom/${studyUID}/${inst.sopUID}.dcm`;
            const stored = await storagePut(relKey, inst.buffer, "application/dicom");
            await db.createInstance({
              sopInstanceUID: inst.sopUID,
              seriesId: dbSeriesId,
              instanceNumber: inst.instanceNumber,
              fileUrl: stored.url,
              fileKey: stored.key,
              fileSize: inst.buffer.length,
            });
          }
        }
      }

      res.json({ studyIds, studyId: studyIds[0] });
    } catch (error) {
      console.error("[Upload] Error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
