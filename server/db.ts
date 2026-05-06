import { eq, desc, and, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, patients, studies, series, instances, reports, InsertPatient, InsertStudy, InsertSeries, InsertInstance, InsertReport, doctorPatients, InsertDoctorPatient, studyAccess, InsertStudyAccess, uploadTokens, InsertUploadToken } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(result.count);
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Patient queries
export async function getAllPatients() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(patients).orderBy(desc(patients.createdAt));
}

export async function getPatientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function searchPatients(searchTerm: string) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(patients).where(
    sql`${patients.name} LIKE ${`%${searchTerm}%`} OR ${patients.patientId} LIKE ${`%${searchTerm}%`}`
  ).orderBy(desc(patients.createdAt));
}

export async function createPatient(patient: InsertPatient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(patients).values(patient);
  return result;
}

export async function updatePatient(id: number, patient: Partial<InsertPatient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(patients).set(patient).where(eq(patients.id, id));
}

// Study queries
export async function getAllStudies() {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select({
      study: studies,
      patient: patients,
    })
    .from(studies)
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .orderBy(desc(studies.studyDate));
  
  return result;
}

export async function getStudiesByPatientId(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(studies).where(eq(studies.patientId, patientId)).orderBy(desc(studies.studyDate));
}

export async function getStudyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db
    .select({
      study: studies,
      patient: patients,
    })
    .from(studies)
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .where(eq(studies.id, id))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function createStudy(study: InsertStudy) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(studies).values(study);
  return result;
}

export async function updateStudy(id: number, study: Partial<InsertStudy>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(studies).set(study).where(eq(studies.id, id));
}

// Series queries
export async function getSeriesByStudyId(studyId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(series).where(eq(series.studyId, studyId));
}

export async function createSeries(s: InsertSeries) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(series).values(s);
}

// Instance queries
export async function getInstancesBySeriesId(seriesId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(instances).where(eq(instances.seriesId, seriesId));
}

export async function getInstancesByStudyId(studyId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select({ instance: instances })
    .from(instances)
    .innerJoin(series, eq(instances.seriesId, series.id))
    .where(eq(series.studyId, studyId))
    .orderBy(instances.instanceNumber);
}

export async function createInstance(i: InsertInstance) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(instances).values(i);
}

// Report queries
export async function getReportsByStudyId(studyId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(reports).where(eq(reports.studyId, studyId)).orderBy(desc(reports.createdAt));
}

export async function getAllReports() {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select({ report: reports, study: studies, patient: patients })
    .from(reports)
    .leftJoin(studies, eq(reports.studyId, studies.id))
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .orderBy(desc(reports.createdAt));
}

export async function createReport(report: InsertReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(reports).values(report);
}

export async function updateReport(id: number, data: Partial<InsertReport>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(reports).set(data).where(eq(reports.id, id));
}

// Dashboard statistics
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return {
    totalPatients: 0,
    totalStudies: 0,
    pendingStudies: 0,
    completedStudies: 0,
  };
  
  const [patientsCount] = await db.select({ count: sql<number>`count(*)` }).from(patients);
  const [studiesCount] = await db.select({ count: sql<number>`count(*)` }).from(studies);
  const [pendingCount] = await db.select({ count: sql<number>`count(*)` }).from(studies).where(eq(studies.status, 'pending'));
  const [completedCount] = await db.select({ count: sql<number>`count(*)` }).from(studies).where(eq(studies.status, 'completed'));
  
  return {
    totalPatients: Number(patientsCount.count),
    totalStudies: Number(studiesCount.count),
    pendingStudies: Number(pendingCount.count),
    completedStudies: Number(completedCount.count),
  };
}

// Doctor-Patient relationship queries
export async function assignPatientToDoctor(doctorId: number, patientId: number, isPrimary: boolean = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(doctorPatients).values({
    doctorId,
    patientId,
    isPrimary: isPrimary ? 1 : 0,
  });
}

export async function getDoctorPatients(doctorId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select({
      patient: patients,
      relationship: doctorPatients,
    })
    .from(doctorPatients)
    .leftJoin(patients, eq(doctorPatients.patientId, patients.id))
    .where(eq(doctorPatients.doctorId, doctorId))
    .orderBy(desc(doctorPatients.isPrimary), desc(patients.createdAt));
  
  return result;
}

export async function getPatientDoctors(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select({
      doctor: users,
      relationship: doctorPatients,
    })
    .from(doctorPatients)
    .leftJoin(users, eq(doctorPatients.doctorId, users.id))
    .where(eq(doctorPatients.patientId, patientId))
    .orderBy(desc(doctorPatients.isPrimary));
  
  return result;
}

// Study access/sharing queries
export async function grantStudyAccess(studyId: number, doctorId: number, grantedBy: number, accessLevel: "view" | "edit" | "report" = "view") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(studyAccess).values({
    studyId,
    doctorId,
    grantedBy,
    accessLevel,
  });
}

export async function getStudyAccessList(studyId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select({
      doctor: users,
      access: studyAccess,
    })
    .from(studyAccess)
    .leftJoin(users, eq(studyAccess.doctorId, users.id))
    .where(eq(studyAccess.studyId, studyId));
  
  return result;
}

export async function getDoctorAccessibleStudies(doctorId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select({
      study: studies,
      patient: patients,
      access: studyAccess,
    })
    .from(studyAccess)
    .leftJoin(studies, eq(studyAccess.studyId, studies.id))
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .where(eq(studyAccess.doctorId, doctorId))
    .orderBy(desc(studies.studyDate));
  
  return result;
}

export async function revokeStudyAccess(studyId: number, doctorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(studyAccess).where(
    sql`${studyAccess.studyId} = ${studyId} AND ${studyAccess.doctorId} = ${doctorId}`
  );
}

// Upload token queries
export async function createUploadToken(token: InsertUploadToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(uploadTokens).values(token);
  return result;
}

export async function getUploadTokenByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(uploadTokens).where(eq(uploadTokens.token, token)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function markTokenAsUsed(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(uploadTokens).set({
    usedAt: new Date(),
    isActive: 0,
  }).where(eq(uploadTokens.token, token));
}

export async function getDoctorUploadTokens(doctorId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(uploadTokens).where(eq(uploadTokens.doctorId, doctorId)).orderBy(desc(uploadTokens.createdAt));
}
