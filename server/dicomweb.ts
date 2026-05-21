import express, { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { eq, and } from "drizzle-orm";
import dicomParser from "dicom-parser";
import { getDb } from "./db";
import { studies, series, instances, patients } from "../drizzle/schema";
import type { Study, Series, Instance, Patient } from "../drizzle/schema";
import { sdk } from "./_core/sdk";

const router = express.Router();
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Authenticate every DICOMweb request using the same session cookie as tRPC
router.use(async (req, res, next) => {
  console.log(`[DICOMweb] ${req.method} ${req.path}`);
  try {
    await sdk.authenticateRequest(req);
    next();
  } catch (e) {
    console.error(`[DICOMweb] Auth FAILED for ${req.method} ${req.path}:`, e);
    res.status(401).send("Unauthorized");
  }
});

// ─── QIDO-RS ──────────────────────────────────────────────────────────────

// GET /api/dicomweb/studies[?StudyInstanceUID=...]
router.get("/studies", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) { res.status(503).json([]); return; }

    const uid = req.query["StudyInstanceUID"] as string | undefined;
    const base = db
      .select({ study: studies, patient: patients })
      .from(studies)
      .leftJoin(patients, eq(studies.patientId, patients.id));

    const rows = uid ? await base.where(eq(studies.studyId, uid)) : await base;

    res.setHeader("Content-Type", "application/dicom+json");
    res.json(rows.map(({ study, patient }) => studyToJson(study, patient)));
  } catch (err) {
    console.error("[DICOMweb] QIDO /studies:", err);
    res.status(500).json([]);
  }
});

// GET /api/dicomweb/studies/:studyUID/series
router.get("/studies/:studyUID/series", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) { res.status(503).json([]); return; }

    const { studyUID } = req.params;
    const [study] = await db.select().from(studies).where(eq(studies.studyId, studyUID)).limit(1);
    if (!study) { res.setHeader("Content-Type", "application/dicom+json"); res.json([]); return; }

    const rows = await db.select().from(series).where(eq(series.studyId, study.id));

    res.setHeader("Content-Type", "application/dicom+json");
    res.json(rows.map(s => seriesToJson(s, studyUID)));
  } catch (err) {
    console.error("[DICOMweb] QIDO /series:", err);
    res.status(500).json([]);
  }
});

// GET /api/dicomweb/studies/:studyUID/series/:seriesUID/instances
router.get("/studies/:studyUID/series/:seriesUID/instances", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) { res.status(503).json([]); return; }

    const { studyUID, seriesUID } = req.params;
    const ser = await findSeries(db, studyUID, seriesUID);
    if (!ser) { res.setHeader("Content-Type", "application/dicom+json"); res.json([]); return; }

    const rows = await db.select().from(instances).where(eq(instances.seriesId, ser.id));

    res.setHeader("Content-Type", "application/dicom+json");
    res.json(rows.map(inst => instanceToJson(inst, seriesUID, studyUID, ser.modality ?? "OT")));
  } catch (err) {
    console.error("[DICOMweb] QIDO /instances:", err);
    res.status(500).json([]);
  }
});

// ─── STOW-RS ──────────────────────────────────────────────────────────────
// OHIF's measurement-tracking mode calls POST /studies (and /studies/:uid) to
// persist annotations as DICOM SR objects. We acknowledge the request so OHIF
// doesn't throw, but don't store anything — measurements are saved in our own
// report panel instead.

function stowAck(_req: Request, res: Response) {
  res.setHeader("Content-Type", "application/dicom+json");
  res.json({ "00081199": { vr: "SQ", Value: [] }, "00081198": { vr: "SQ", Value: [] } });
}
router.post("/studies", stowAck);
router.post("/studies/:studyUID", stowAck);

// ─── WADO-RS ──────────────────────────────────────────────────────────────
// Note: /metadata and /frames routes must be registered before the bare /:sopUID
// route, because Express matches in definition order and /:sopUID would swallow them.

// GET /api/dicomweb/studies/:studyUID/series/:seriesUID/metadata
// Returns DICOM JSON metadata for ALL instances in the series.
// OHIF's RetrieveMetadataLoaderAsync calls client.retrieveSeriesMetadata() which
// maps to this endpoint. Without it, dicomweb-client resolves with null →
// storeInstances(null) → crash at instances.map.
router.get(
  "/studies/:studyUID/series/:seriesUID/metadata",
  async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.setHeader("Content-Type", "application/dicom+json"); res.json([]); return; }

      const { studyUID, seriesUID } = req.params;
      const ser = await findSeries(db, studyUID, seriesUID);
      if (!ser) { res.setHeader("Content-Type", "application/dicom+json"); res.json([]); return; }

      const rows = await db.select().from(instances).where(eq(instances.seriesId, ser.id));

      const metadataArray: Record<string, unknown>[] = [];
      for (const inst of rows) {
        try {
          const filePath = path.join(UPLOADS_DIR, inst.fileKey);
          const fileBuffer = await fs.readFile(filePath);
          metadataArray.push(parseDicomMetadata(fileBuffer));
        } catch {
          // File missing: fall back to minimal QIDO-style metadata so OHIF can
          // still enumerate the instance without crashing.
          metadataArray.push(instanceToJson(inst, seriesUID, studyUID, ser.modality ?? "OT"));
        }
      }

      res.setHeader("Content-Type", "application/dicom+json");
      res.json(metadataArray);
    } catch (err) {
      console.error("[DICOMweb] WADO-RS /series/metadata:", err);
      res.status(500).json([]);
    }
  }
);

// GET /api/dicomweb/studies/:studyUID/series/:seriesUID/instances/:sopUID/metadata
router.get(
  "/studies/:studyUID/series/:seriesUID/instances/:sopUID/metadata",
  async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).json([]); return; }

      const { studyUID, seriesUID, sopUID } = req.params;
      const inst = await findInstance(db, studyUID, seriesUID, sopUID);
      if (!inst) { res.setHeader("Content-Type", "application/dicom+json"); res.json([]); return; }

      const filePath = path.join(UPLOADS_DIR, inst.fileKey);
      const fileBuffer = await fs.readFile(filePath);

      res.setHeader("Content-Type", "application/dicom+json");
      res.json([parseDicomMetadata(fileBuffer)]);
    } catch (err) {
      console.error("[DICOMweb] WADO-RS /metadata:", err);
      res.status(500).json([]);
    }
  }
);

// GET /api/dicomweb/studies/:studyUID/series/:seriesUID/instances/:sopUID/frames/:frameList
router.get(
  "/studies/:studyUID/series/:seriesUID/instances/:sopUID/frames/:frameList",
  async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).send("Service unavailable"); return; }

      const { studyUID, seriesUID, sopUID, frameList } = req.params;
      // DICOM frames are 1-indexed; convert to 0-indexed
      const frameIndex = (parseInt(frameList.split(",")[0], 10) || 1) - 1;

      const inst = await findInstance(db, studyUID, seriesUID, sopUID);
      if (!inst) { res.status(404).send("Instance not found"); return; }

      const filePath = path.join(UPLOADS_DIR, inst.fileKey);
      const fileBuffer = await fs.readFile(filePath);
      const { data, transferSyntax } = extractFramePixelData(fileBuffer, frameIndex);

      const boundary = "DICOMwebBoundary";
      const partType = transferSyntax
        ? `application/octet-stream; transfer-syntax=${transferSyntax}`
        : "application/octet-stream";

      res.setHeader(
        "Content-Type",
        `multipart/related; type="application/octet-stream"; boundary="${boundary}"`
      );
      res.end(buildMultipart(boundary, [{ contentType: partType, data }]));
    } catch (err) {
      console.error("[DICOMweb] WADO-RS /frames:", err);
      res.status(500).send("Internal error");
    }
  }
);

// GET /api/dicomweb/studies/:studyUID/series/:seriesUID/instances/:sopUID
router.get(
  "/studies/:studyUID/series/:seriesUID/instances/:sopUID",
  async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(503).send("Service unavailable"); return; }

      const { studyUID, seriesUID, sopUID } = req.params;
      const inst = await findInstance(db, studyUID, seriesUID, sopUID);
      if (!inst) { res.status(404).send("Instance not found"); return; }

      const filePath = path.join(UPLOADS_DIR, inst.fileKey);
      const fileBuffer = await fs.readFile(filePath);

      const boundary = "DICOMwebBoundary";
      res.setHeader(
        "Content-Type",
        `multipart/related; type="application/dicom"; boundary="${boundary}"`
      );
      res.end(buildMultipart(boundary, [{ contentType: "application/dicom", data: fileBuffer }]));
    } catch (err) {
      console.error("[DICOMweb] WADO-RS /instance:", err);
      res.status(500).send("Internal error");
    }
  }
);

export default router;

// ─── Helpers ──────────────────────────────────────────────────────────────

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function findSeries(db: Db, studyUID: string, seriesUID: string): Promise<Series | null> {
  const [study] = await db
    .select({ id: studies.id })
    .from(studies)
    .where(eq(studies.studyId, studyUID))
    .limit(1);
  if (!study) return null;

  const [ser] = await db
    .select()
    .from(series)
    .where(and(eq(series.studyId, study.id), eq(series.seriesId, seriesUID)))
    .limit(1);
  return ser ?? null;
}

async function findInstance(
  db: Db,
  studyUID: string,
  seriesUID: string,
  sopUID: string
): Promise<Instance | null> {
  const ser = await findSeries(db, studyUID, seriesUID);
  if (!ser) return null;

  const [inst] = await db
    .select()
    .from(instances)
    .where(and(eq(instances.seriesId, ser.id), eq(instances.sopInstanceUID, sopUID)))
    .limit(1);
  return inst ?? null;
}

function buildMultipart(
  boundary: string,
  parts: { contentType: string; data: Buffer }[]
): Buffer {
  const chunks: Buffer[] = [];
  for (const { contentType, data } of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`));
    chunks.push(data);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

// Extract the raw pixel bytes for a single frame from a DICOM file.
// For uncompressed data, slices the correct byte range.
// For encapsulated (compressed) data, extracts the Nth fragment.
// Falls back to the full file buffer on any parse error so Cornerstone can still try.
function extractFramePixelData(
  fileBuffer: Buffer,
  frameIndex: number
): { data: Buffer; transferSyntax: string | null } {
  try {
    const byteArray = new Uint8Array(fileBuffer);
    const dataset = dicomParser.parseDicom(byteArray);
    const transferSyntax = dataset.string("x00020010") ?? null;

    // dicom-parser types don't expose encapsulated pixel data fields, so cast.
    const pixelEl = dataset.elements["x7fe00010"] as (dicomParser.Element & {
      encapsulatedPixelData?: boolean;
      hadUndefinedLength?: boolean;
      // dicom-parser ≥1.8 API: .fragments with .position
      fragments?: Array<{ position: number; length: number }>;
      // dicom-parser legacy API: .items with .dataOffset (items[0]=BOT, items[1+]=fragments)
      items?: Array<{ dataOffset: number; length: number }>;
    }) | undefined;

    if (!pixelEl) {
      return { data: fileBuffer, transferSyntax };
    }

    if (pixelEl.encapsulatedPixelData || pixelEl.hadUndefinedLength) {
      // Current API: .fragments[N].position gives the byte offset in the full array
      if (pixelEl.fragments && pixelEl.fragments.length > 0) {
        const frag = pixelEl.fragments[Math.min(frameIndex, pixelEl.fragments.length - 1)];
        return {
          data: Buffer.from(byteArray.slice(frag.position, frag.position + frag.length)),
          transferSyntax,
        };
      }

      // Legacy API fallback: items[0]=BOT, items[1+]=frame fragments
      if (pixelEl.items && pixelEl.items.length > 1) {
        const frag = pixelEl.items[frameIndex + 1] ?? pixelEl.items[1];
        return {
          data: Buffer.from(byteArray.slice(frag.dataOffset, frag.dataOffset + frag.length)),
          transferSyntax,
        };
      }

      return { data: fileBuffer, transferSyntax };
    }

    // Uncompressed: calculate per-frame byte range
    const rows = dataset.uint16("x00280010") ?? 0;
    const cols = dataset.uint16("x00280011") ?? 0;
    const bitsAllocated = dataset.uint16("x00280100") ?? 8;
    const samplesPerPixel = dataset.uint16("x00280002") ?? 1;
    const frameSize = rows * cols * Math.ceil(bitsAllocated / 8) * samplesPerPixel;

    if (frameSize > 0) {
      const start = pixelEl.dataOffset + frameIndex * frameSize;
      return {
        data: Buffer.from(byteArray.slice(start, start + frameSize)),
        transferSyntax,
      };
    }

    return { data: fileBuffer, transferSyntax };
  } catch {
    return { data: fileBuffer, transferSyntax: null };
  }
}

// Parse a DICOM file and return a DICOM JSON object with all the metadata
// tags Cornerstone3D needs to render the image. Pixel data (7FE00010) is
// intentionally excluded — it is served separately via the /frames endpoint.
function parseDicomMetadata(fileBuffer: Buffer): Record<string, unknown> {
  const byteArray = new Uint8Array(fileBuffer);
  const dataset = dicomParser.parseDicom(byteArray);
  const out: Record<string, { vr: string; Value: unknown[] }> = {};

  function set(dicomTag: string, vr: string, values: unknown[]) {
    const filtered = values.filter(v => v !== undefined && v !== null && v !== "");
    if (filtered.length) out[dicomTag] = { vr, Value: filtered };
  }

  function ds(raw: string | undefined): string[] {
    return raw ? raw.split("\\") : [];
  }

  // File meta / transfer syntax
  set("00020010", "UI", [dataset.string("x00020010")]);

  // Instance identifiers
  set("00080016", "UI", [dataset.string("x00080016")]); // SOPClassUID
  set("00080018", "UI", [dataset.string("x00080018")]); // SOPInstanceUID
  set("00080060", "CS", [dataset.string("x00080060")]); // Modality
  set("00081030", "LO", [dataset.string("x00081030")]); // StudyDescription
  set("0008103E", "LO", [dataset.string("x0008103e")]); // SeriesDescription
  set("0020000D", "UI", [dataset.string("x0020000d")]); // StudyInstanceUID
  set("0020000E", "UI", [dataset.string("x0020000e")]); // SeriesInstanceUID
  set("00200013", "IS", [dataset.string("x00200013")]); // InstanceNumber

  // Spatial geometry (required for MPR)
  set("00200032", "DS", ds(dataset.string("x00200032"))); // ImagePositionPatient
  set("00200037", "DS", ds(dataset.string("x00200037"))); // ImageOrientationPatient
  set("00201041", "DS", [dataset.string("x00201041")]);  // SliceLocation
  set("00180050", "DS", [dataset.string("x00180050")]);  // SliceThickness
  set("00280030", "DS", ds(dataset.string("x00280030"))); // PixelSpacing

  // Pixel format (required for rendering)
  const samplesPerPixel = dataset.uint16("x00280002");
  if (samplesPerPixel !== undefined) set("00280002", "US", [samplesPerPixel]);
  set("00280004", "CS", [dataset.string("x00280004")]); // PhotometricInterpretation
  const rows = dataset.uint16("x00280010");
  if (rows !== undefined) set("00280010", "US", [rows]);
  const cols = dataset.uint16("x00280011");
  if (cols !== undefined) set("00280011", "US", [cols]);
  const bitsAlloc = dataset.uint16("x00280100");
  if (bitsAlloc !== undefined) set("00280100", "US", [bitsAlloc]);
  const bitsStored = dataset.uint16("x00280101");
  if (bitsStored !== undefined) set("00280101", "US", [bitsStored]);
  const highBit = dataset.uint16("x00280102");
  if (highBit !== undefined) set("00280102", "US", [highBit]);
  const pixelRep = dataset.uint16("x00280103");
  if (pixelRep !== undefined) set("00280103", "US", [pixelRep]);

  // Window / level presets
  set("00281050", "DS", ds(dataset.string("x00281050"))); // WindowCenter
  set("00281051", "DS", ds(dataset.string("x00281051"))); // WindowWidth
  set("00281052", "DS", [dataset.string("x00281052")]);   // RescaleIntercept
  set("00281053", "DS", [dataset.string("x00281053")]);   // RescaleSlope

  // Multi-frame
  set("00280008", "IS", [dataset.string("x00280008")]); // NumberOfFrames

  // Patient / study info (used by OHIF header)
  set("00100010", "PN", [{ Alphabetic: dataset.string("x00100010") ?? "" }]);
  set("00100020", "LO", [dataset.string("x00100020")]);
  set("00080020", "DA", [dataset.string("x00080020")]); // StudyDate
  set("00080030", "TM", [dataset.string("x00080030")]); // StudyTime

  return out;
}

function toDicomDate(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, "0"),
    String(dt.getDate()).padStart(2, "0"),
  ].join("");
}

function toDicomTime(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  return [
    String(dt.getHours()).padStart(2, "0"),
    String(dt.getMinutes()).padStart(2, "0"),
    String(dt.getSeconds()).padStart(2, "0"),
  ].join("");
}

function studyToJson(study: Study, patient: Patient | null) {
  return {
    "00080020": { vr: "DA", Value: [toDicomDate(study.studyDate)] },
    "00080030": { vr: "TM", Value: [toDicomTime(study.studyDate)] },
    "00080061": { vr: "CS", Value: [study.modality] },
    "00081030": { vr: "LO", Value: [study.description ?? ""] },
    "00100010": { vr: "PN", Value: [{ Alphabetic: patient?.name ?? "" }] },
    "00100020": { vr: "LO", Value: [patient?.patientId ?? ""] },
    "0020000D": { vr: "UI", Value: [study.studyId] },
    "00200010": { vr: "SH", Value: [String(study.id)] },
    "00201206": { vr: "IS", Value: [String(study.numberOfSeries ?? 0)] },
    "00201208": { vr: "IS", Value: [String(study.numberOfInstances ?? 0)] },
  };
}

function seriesToJson(ser: Series, studyUID: string) {
  return {
    "0020000D": { vr: "UI", Value: [studyUID] },
    "0020000E": { vr: "UI", Value: [ser.seriesId] },
    "00080060": { vr: "CS", Value: [ser.modality ?? "OT"] },
    "00200011": { vr: "IS", Value: [String(ser.seriesNumber ?? 1)] },
    "0008103E": { vr: "LO", Value: [ser.description ?? ""] },
    "00201209": { vr: "IS", Value: [String(ser.numberOfInstances ?? 0)] },
  };
}

const MODALITY_SOP_CLASS: Record<string, string> = {
  CT: "1.2.840.10008.5.1.4.1.1.2",
  MR: "1.2.840.10008.5.1.4.1.1.4",
  US: "1.2.840.10008.5.1.4.1.1.6.1",
  CR: "1.2.840.10008.5.1.4.1.1.1",
  DX: "1.2.840.10008.5.1.4.1.1.1.1",
  MG: "1.2.840.10008.5.1.4.1.1.1.2",
  NM: "1.2.840.10008.5.1.4.1.1.20",
  PT: "1.2.840.10008.5.1.4.1.1.128",
  XA: "1.2.840.10008.5.1.4.1.1.12.1",
  RF: "1.2.840.10008.5.1.4.1.1.12.2",
  OT: "1.2.840.10008.5.1.4.1.1.7",
  SC: "1.2.840.10008.5.1.4.1.1.7",
};

function instanceToJson(inst: Instance, seriesUID: string, studyUID: string, modality = "OT") {
  const sopClassUID = MODALITY_SOP_CLASS[modality] ?? MODALITY_SOP_CLASS.OT;
  return {
    "00080016": { vr: "UI", Value: [sopClassUID] },
    "00080018": { vr: "UI", Value: [inst.sopInstanceUID] },
    "0020000D": { vr: "UI", Value: [studyUID] },
    "0020000E": { vr: "UI", Value: [seriesUID] },
    "00200013": { vr: "IS", Value: [String(inst.instanceNumber ?? 1)] },
  };
}
