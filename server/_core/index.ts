import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import AdmZip from "adm-zip";
import dicomParser from "dicom-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { storagePut } from "../storage";
import * as db from "../db";
import dicomwebRouter from "../dicomweb";
import { ENV } from "./env";

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
  // Serve local DICOM uploads in dev (GCS handles this in production)
  if (!ENV.gcsBucket) {
    app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  }
  // OAuth routes (no-op locally)
  registerOAuthRoutes(app);

  // DICOM file upload endpoint — accepts .dcm files or a .zip containing .dcm files
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

  const uploadMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) =>
    upload.array("files")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const msg = err.code === "LIMIT_FILE_SIZE"
          ? "File too large — maximum 500 MB per upload."
          : err.message;
        res.status(400).json({ error: msg }); return;
      }
      if (err) { res.status(400).json({ error: String(err) }); return; }
      next();
    });

  app.post("/api/upload-dicom", uploadMiddleware, async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

      const rawFiles = req.files as Express.Multer.File[];
      if (!rawFiles || rawFiles.length === 0) { res.status(400).json({ error: "No files provided" }); return; }

      // Returns true if the buffer looks like a DICOM file.
      // Standard DICOM: 128-byte preamble + "DICM" magic at offset 128.
      // Legacy ACR-NEMA: no preamble, starts with a low-group tag (0008,xxxx etc.).
      const isDicom = (buf: Buffer): boolean => {
        if (buf.length < 132) return false;
        if (buf[128] === 0x44 && buf[129] === 0x49 && buf[130] === 0x43 && buf[131] === 0x4d) return true; // "DICM"
        // ACR-NEMA heuristic: first two bytes are a low even group number (0002–0008)
        const group = buf[0] | (buf[1] << 8);
        return group >= 0x0002 && group <= 0x0008 && (group & 1) === 0;
      };

      // Expand any ZIP files into their constituent DICOM buffers.
      // Uses content-based detection (DICM magic bytes) so files without .dcm
      // extension (e.g. .ima, .img, or bare files common in clinical exports) are included.
      const files: Express.Multer.File[] = [];
      for (const f of rawFiles) {
        const isZip = f.originalname.toLowerCase().endsWith(".zip") || f.mimetype === "application/zip";
        if (isZip) {
          try {
            const zip = new AdmZip(f.buffer);
            const entries = zip.getEntries();
            console.log(`[Upload] ZIP "${f.originalname}" contains ${entries.length} total entries`);
            let skipped = 0;
            for (const entry of entries) {
              if (entry.isDirectory) continue;
              const entryName = entry.entryName;
              // Skip macOS metadata artifacts
              if (entryName.startsWith("__MACOSX") || entryName.includes("/.DS_Store")) continue;
              const buf = entry.getData();
              if (!isDicom(buf)) { skipped++; continue; }
              files.push({ ...f, originalname: entry.name || entryName, buffer: buf, size: buf.length });
            }
            console.log(`[Upload] Extracted ${files.length} DICOM file(s) from ZIP (skipped ${skipped} non-DICOM entries)`);
          } catch (e) {
            console.error("[Upload] Failed to extract ZIP:", f.originalname, e);
            res.status(400).json({ error: `Failed to open ZIP file: ${(e as Error).message}` }); return;
          }
        } else {
          files.push(f);
        }
      }

      if (files.length === 0) { res.status(400).json({ error: "No DICOM files found. If uploading a ZIP, ensure it contains .dcm files or standard DICOM images." }); return; }

      const priorityRaw = (req.body.priority as string) ?? "routine";
      const priority = (["routine", "urgent", "stat"].includes(priorityRaw) ? priorityRaw : "routine") as "routine" | "urgent" | "stat";

      const parseDicomPersonName = (raw: string | undefined): string => {
        if (!raw) return "Unknown Patient";
        const parts = raw.split("^").map(p => p.trim());
        const [family = "", given = "", middle = ""] = parts;
        return [given, middle, family].filter(Boolean).join(" ") || raw;
      };

      const parseDicomDate = (dateStr: string | undefined): Date | undefined => {
        if (dateStr?.length === 8 && /^\d{8}$/.test(dateStr)) {
          const y = parseInt(dateStr.slice(0, 4), 10);
          const m = parseInt(dateStr.slice(4, 6), 10) - 1;
          const d = parseInt(dateStr.slice(6, 8), 10);
          return new Date(Date.UTC(y, m, d)); // UTC avoids timezone-shift on serialization
        }
        return undefined;
      };

      const parseDicomSex = (raw: string | undefined): "male" | "female" | "other" | undefined => {
        switch (raw?.toUpperCase()) {
          case "M": return "male";
          case "F": return "female";
          case "O": return "other";
          default: return undefined;
        }
      };

      // Extract text from a DICOM SR content sequence, returns findings + impression
      const extractSrReport = (dataset: ReturnType<typeof dicomParser.parseDicom>): { findings: string; impression: string } => {
        const texts: string[] = [];
        const walk = (ds: ReturnType<typeof dicomParser.parseDicom>) => {
          const seq = ds.elements["x0040a730"];
          if (!seq?.items) return;
          for (const item of seq.items) {
            const d2 = item.dataSet;
            if (!d2) continue;
            try {
              if (d2.string("x0040a040")?.trim() === "TEXT") {
                const t = d2.string("x0040a160")?.trim();
                if (t) texts.push(t);
              }
              walk(d2);
            } catch {}
          }
        };
        walk(dataset);
        const full = texts.join("\n\n").trim();
        const impMatch = full.match(/IMPRESSION\s*:?\s*\r?\n([\s\S]*?)(?:\r?\n\s*\r?\n[A-Z][A-Z ]+:|$)/i);
        return { findings: full, impression: impMatch ? impMatch[1].trim() : "" };
      };

      // Group files by Study Instance UID, carrying patient data from tags
      type FileEntry = { buffer: Buffer; sopUID: string; instanceNumber: number };
      type SeriesEntry = { modality: string; files: FileEntry[] };
      type PatientInfo = { name: string; dicomPatientId: string; dateOfBirth?: Date; gender?: "male" | "female" | "other" };
      type StudyEntry = {
        modality: string; description: string; bodyPart: string; studyDate: Date;
        referringPhysician: string; patient: PatientInfo;
        series: Map<string, SeriesEntry>;
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
          const referringPhysician = parseDicomPersonName(dataset.string("x00080090"));
          const studyDate = parseDicomDate(dataset.string("x00080020")) ?? new Date();

          const patient: PatientInfo = {
            name: parseDicomPersonName(dataset.string("x00100010")),
            dicomPatientId: dataset.string("x00100020") ?? "",
            dateOfBirth: parseDicomDate(dataset.string("x00100030")),
            gender: parseDicomSex(dataset.string("x00100040")),
          };

          if (!studyMap.has(studyUID)) {
            studyMap.set(studyUID, { modality, description, bodyPart, studyDate, referringPhysician, patient, series: new Map() });
          }
          const studyEntry = studyMap.get(studyUID)!;
          // Use image-series modality for the study (not SR)
          if (modality !== "SR" && studyEntry.modality === "OT") studyEntry.modality = modality;
          if (!studyEntry.series.has(seriesUID)) studyEntry.series.set(seriesUID, { modality, files: [] });
          studyEntry.series.get(seriesUID)!.files.push({ buffer: file.buffer, sopUID, instanceNumber });
        } catch (e) {
          console.error("[Upload] Failed to parse DICOM file:", file.originalname, e);
        }
      }

      if (studyMap.size === 0) { res.status(400).json({ error: "No valid DICOM files" }); return; }

      const studyIds: number[] = [];

      for (const [studyUID, studyEntry] of Array.from(studyMap)) {
        const { patient } = studyEntry;

        // Find-or-create patient — patientId has a UNIQUE constraint so re-uploading
        // the same patient (e.g. two studies from the same ZIP) must not double-insert.
        const dicomPatientId = patient.dicomPatientId || `PAT-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
        let patientId: number;
        const existingPatient = await db.findPatientByDicomId(dicomPatientId);
        if (existingPatient) {
          patientId = existingPatient.id;
        } else {
          const patientRecord = await db.createPatient({
            patientId: dicomPatientId,
            name: patient.name,
            dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : undefined,
            gender: patient.gender,
            createdBy: user.id,
          });
          patientId = patientRecord.id;
        }

        // Skip studies that were already uploaded (same Study Instance UID).
        const existingStudy = await db.findStudyByDicomUid(studyUID);
        if (existingStudy) {
          console.log(`[Upload] Skipping duplicate study UID: ${studyUID}`);
          studyIds.push(existingStudy.id);
          continue;
        }

        let totalInstances = 0;
        for (const s of Array.from(studyEntry.series.values())) totalInstances += s.files.length;

        const studyRecord = await db.createStudy({
          studyId: studyUID,
          patientId,
          studyDate: studyEntry.studyDate,
          modality: studyEntry.modality,
          description: studyEntry.description,
          bodyPart: studyEntry.bodyPart,
          referringPhysician: studyEntry.referringPhysician,
          numberOfSeries: studyEntry.series.size,
          numberOfInstances: totalInstances,
          uploadedBy: user.id,
          priority,
        });
        const dbStudyId = studyRecord.id;
        studyIds.push(dbStudyId);

        for (const [seriesUID, seriesEntry] of Array.from(studyEntry.series)) {
          const seriesRecord = await db.createSeries({
            seriesId: seriesUID,
            studyId: dbStudyId,
            modality: seriesEntry.modality,
            numberOfInstances: seriesEntry.files.length,
          });
          const dbSeriesId = seriesRecord.id;

          for (const inst of seriesEntry.files) {
            const relKey = `dicom/${user.id}/${studyUID}/${inst.sopUID}.dcm`;
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

          // Auto-create a report from SR series (only if no report exists yet for this study)
          if (seriesEntry.modality === "SR" && seriesEntry.files.length > 0) {
            try {
              const existingSrReports = await db.getReportsByStudyId(dbStudyId);
              if (!existingSrReports || existingSrReports.length === 0) {
                const srDataset = dicomParser.parseDicom(new Uint8Array(seriesEntry.files[0].buffer));
                const { findings, impression } = extractSrReport(srDataset);
                if (findings) {
                  await db.createReport({
                    studyId: dbStudyId,
                    reportedBy: user.id,
                    findings,
                    impression,
                    status: "final",
                  });
                  await db.updateStudy(dbStudyId, { status: "reported" });
                  console.log("[Upload] Auto-created report from SR series for study", studyUID);
                }
              } else {
                console.log("[Upload] Skipping SR report — report already exists for study", studyUID);
              }
            } catch (e) {
              console.error("[Upload] Failed to extract SR report:", e);
            }
          }
        }
      }

      res.json({ studyIds, studyId: studyIds[0] });
    } catch (error) {
      console.error("[Upload] Unexpected error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: `Upload failed: ${msg}` });
    }
  });

  // DICOMweb shim (QIDO-RS + WADO-RS) — required by OHIF
  app.use("/api/dicomweb", dicomwebRouter);

  // OHIF Viewer v3 static site (built by scripts/build-ohif.sh)
  // Must be before the Vite/serveStatic catch-all so OHIF routes aren't swallowed.
  const ohifDir = path.join(process.cwd(), ENV.ohifStaticDir);

  // Serve app-config.js dynamically so config changes (bridge extension, data
  // source URLs) take effect immediately without rebuilding OHIF.
  app.get("/ohif/app-config.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.sendFile(path.join(process.cwd(), "scripts", "ohif-config.js"));
  });

  app.use("/ohif", express.static(ohifDir));
  // SPA fallback: any /ohif/* path not matching a real file serves OHIF's index.html
  app.get("/ohif/*", (_req, res) => {
    res.sendFile(path.join(ohifDir, "index.html"), err => {
      if (err) res.status(503).send("OHIF not built yet — run: bash scripts/build-ohif.sh");
    });
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
