import { eq, desc, and, or, like, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  User,
  InsertUser,
  users,
  patients,
  studies,
  series,
  instances,
  reports,
  InsertPatient,
  InsertStudy,
  InsertSeries,
  InsertInstance,
  InsertReport,
  doctorPatients,
  InsertDoctorPatient,
  studyAccess,
  InsertStudyAccess,
  uploadTokens,
  InsertUploadToken,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      _db = drizzle(pool);
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

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
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

// ─── Access control ───────────────────────────────────────────────────────────

export async function canUserAccessStudy(user: User, studyId: number): Promise<boolean> {
  if (user.role === "admin") return true;

  const db = await getDb();
  if (!db) return false;

  if (user.role === "doctor") {
    const [owned] = await db
      .select({ id: studies.id })
      .from(studies)
      .where(and(eq(studies.id, studyId), eq(studies.uploadedBy, user.id)))
      .limit(1);
    if (owned) return true;

    const [shared] = await db
      .select({ id: studyAccess.id })
      .from(studyAccess)
      .where(and(eq(studyAccess.studyId, studyId), eq(studyAccess.doctorId, user.id)))
      .limit(1);
    return !!shared;
  }

  if (user.role === "patient") {
    const [row] = await db
      .select({ id: studies.id })
      .from(studies)
      .innerJoin(patients, eq(studies.patientId, patients.id))
      .where(and(eq(studies.id, studyId), eq(patients.userId, user.id)))
      .limit(1);
    return !!row;
  }

  return false;
}

// ─── Patient queries ──────────────────────────────────────────────────────────

export async function getAllPatients() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(patients).orderBy(desc(patients.createdAt));
}

export async function getPatientsForUser(user: User) {
  const db = await getDb();
  if (!db) return [];

  if (user.role === "admin") {
    return await db.select().from(patients).orderBy(desc(patients.createdAt));
  }

  if (user.role === "doctor") {
    const rows = await db
      .select({ patient: patients })
      .from(doctorPatients)
      .innerJoin(patients, eq(doctorPatients.patientId, patients.id))
      .where(eq(doctorPatients.doctorId, user.id))
      .orderBy(desc(patients.createdAt));
    return rows.map(r => r.patient);
  }

  // patient role: only their own record
  return await db.select().from(patients).where(eq(patients.userId, user.id));
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
  return await db
    .select()
    .from(patients)
    .where(or(like(patients.name, `%${searchTerm}%`), like(patients.patientId, `%${searchTerm}%`)))
    .orderBy(desc(patients.createdAt));
}

export async function searchPatientsForUser(user: User, searchTerm: string) {
  const db = await getDb();
  if (!db) return [];

  if (user.role === "admin") {
    return await searchPatients(searchTerm);
  }

  if (user.role === "doctor") {
    const rows = await db
      .select({ patient: patients })
      .from(doctorPatients)
      .innerJoin(patients, eq(doctorPatients.patientId, patients.id))
      .where(
        and(
          eq(doctorPatients.doctorId, user.id),
          or(like(patients.name, `%${searchTerm}%`), like(patients.patientId, `%${searchTerm}%`))
        )
      )
      .orderBy(desc(patients.createdAt));
    return rows.map(r => r.patient);
  }

  return await db
    .select()
    .from(patients)
    .where(and(eq(patients.userId, user.id), like(patients.name, `%${searchTerm}%`)));
}

export async function findPatientByDicomId(dicomPatientId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(patients).where(eq(patients.patientId, dicomPatientId)).limit(1);
  return rows[0] ?? undefined;
}

export async function createPatient(patient: InsertPatient): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(patients).values(patient).returning({ id: patients.id });
  return row;
}

export async function updatePatient(id: number, patient: Partial<InsertPatient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(patients).set({ ...patient, updatedAt: new Date() }).where(eq(patients.id, id));
}

// ─── Study queries ────────────────────────────────────────────────────────────

export async function getAllStudies() {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({ study: studies, patient: patients })
    .from(studies)
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .orderBy(desc(studies.studyDate));
}

export async function getStudiesForUser(user: User) {
  const db = await getDb();
  if (!db) return [];

  if (user.role === "admin") {
    return await getAllStudies();
  }

  if (user.role === "doctor") {
    // Studies uploaded by this doctor, or shared with them via studyAccess
    const sharedIds = db
      .select({ studyId: studyAccess.studyId })
      .from(studyAccess)
      .where(eq(studyAccess.doctorId, user.id));

    return await db
      .select({ study: studies, patient: patients })
      .from(studies)
      .leftJoin(patients, eq(studies.patientId, patients.id))
      .where(or(eq(studies.uploadedBy, user.id), inArray(studies.id, sharedIds)))
      .orderBy(desc(studies.studyDate));
  }

  // patient role: studies linked to their patient record
  return await db
    .select({ study: studies, patient: patients })
    .from(studies)
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .where(eq(patients.userId, user.id))
    .orderBy(desc(studies.studyDate));
}

export async function getStudiesByPatientId(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(studies)
    .where(eq(studies.patientId, patientId))
    .orderBy(desc(studies.studyDate));
}

export async function getStudyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ study: studies, patient: patients })
    .from(studies)
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .where(eq(studies.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function findStudyByDicomUid(studyInstanceUid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(studies).where(eq(studies.studyId, studyInstanceUid)).limit(1);
  return rows[0] ?? undefined;
}

export async function createStudy(study: InsertStudy): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(studies).values(study).returning({ id: studies.id });
  return row;
}

export async function updateStudy(id: number, study: Partial<InsertStudy>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(studies).set({ ...study, updatedAt: new Date() }).where(eq(studies.id, id));
}

// ─── Series queries ───────────────────────────────────────────────────────────

export async function getSeriesByStudyId(studyId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(series).where(eq(series.studyId, studyId));
}

export async function createSeries(s: InsertSeries): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(series).values(s).returning({ id: series.id });
  return row;
}

// ─── Instance queries ─────────────────────────────────────────────────────────

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

export async function createInstance(i: InsertInstance): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(instances).values(i);
}

// ─── Report queries ───────────────────────────────────────────────────────────

export async function getReportsByStudyId(studyId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({
      id: reports.id,
      studyId: reports.studyId,
      reportedBy: reports.reportedBy,
      findings: reports.findings,
      impression: reports.impression,
      recommendations: reports.recommendations,
      status: reports.status,
      createdAt: reports.createdAt,
      updatedAt: reports.updatedAt,
      radiologistName: users.name,
    })
    .from(reports)
    .leftJoin(users, eq(reports.reportedBy, users.id))
    .where(eq(reports.studyId, studyId))
    .orderBy(desc(reports.createdAt));
}

export async function getAllReports() {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({ report: reports, study: studies, patient: patients, radiologistName: users.name })
    .from(reports)
    .leftJoin(studies, eq(reports.studyId, studies.id))
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .leftJoin(users, eq(reports.reportedBy, users.id))
    .orderBy(desc(reports.createdAt));
}

export async function getReportsForUser(user: User) {
  const db = await getDb();
  if (!db) return [];

  if (user.role === "admin") {
    return await getAllReports();
  }

  if (user.role === "doctor") {
    const sharedIds = db
      .select({ studyId: studyAccess.studyId })
      .from(studyAccess)
      .where(eq(studyAccess.doctorId, user.id));

    return await db
      .select({ report: reports, study: studies, patient: patients, radiologistName: users.name })
      .from(reports)
      .leftJoin(studies, eq(reports.studyId, studies.id))
      .leftJoin(patients, eq(studies.patientId, patients.id))
      .leftJoin(users, eq(reports.reportedBy, users.id))
      .where(or(eq(studies.uploadedBy, user.id), inArray(reports.studyId, sharedIds)))
      .orderBy(desc(reports.createdAt));
  }

  // patient role
  return await db
    .select({ report: reports, study: studies, patient: patients, radiologistName: users.name })
    .from(reports)
    .leftJoin(studies, eq(reports.studyId, studies.id))
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .leftJoin(users, eq(reports.reportedBy, users.id))
    .where(eq(patients.userId, user.id))
    .orderBy(desc(reports.createdAt));
}

export async function createReport(report: InsertReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(reports).values(report).returning({ id: reports.id });
  return row;
}

export async function updateReport(id: number, data: Partial<InsertReport>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(reports).set({ ...data, updatedAt: new Date() }).where(eq(reports.id, id));
}

// ─── User queries ─────────────────────────────────────────────────────────────

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(users).orderBy(users.name);
}

export async function updateUserRole(id: number, role: "admin" | "doctor" | "patient") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
}

// ─── Dashboard statistics ─────────────────────────────────────────────────────

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalPatients: 0, totalStudies: 0, pendingStudies: 0, completedStudies: 0 };

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

export async function getDashboardStatsForUser(user: User) {
  const db = await getDb();
  if (!db) return { totalPatients: 0, totalStudies: 0, pendingStudies: 0, completedStudies: 0 };

  if (user.role === "admin") return getDashboardStats();

  if (user.role === "doctor") {
    const sharedIds = db
      .select({ studyId: studyAccess.studyId })
      .from(studyAccess)
      .where(eq(studyAccess.doctorId, user.id));

    const [patientsCount] = await db
      .select({ count: sql<number>`count(distinct ${doctorPatients.patientId})` })
      .from(doctorPatients)
      .where(eq(doctorPatients.doctorId, user.id));

    const accessibleStudies = db
      .select({ id: studies.id })
      .from(studies)
      .where(or(eq(studies.uploadedBy, user.id), inArray(studies.id, sharedIds)));

    const [studiesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(studies)
      .where(or(eq(studies.uploadedBy, user.id), inArray(studies.id, sharedIds)));

    const [pendingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(studies)
      .where(and(
        or(eq(studies.uploadedBy, user.id), inArray(studies.id, sharedIds)),
        eq(studies.status, 'pending')
      ));

    const [completedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(studies)
      .where(and(
        or(eq(studies.uploadedBy, user.id), inArray(studies.id, sharedIds)),
        eq(studies.status, 'completed')
      ));

    return {
      totalPatients: Number(patientsCount.count),
      totalStudies: Number(studiesCount.count),
      pendingStudies: Number(pendingCount.count),
      completedStudies: Number(completedCount.count),
    };
  }

  // patient role
  const [studiesCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(studies)
    .innerJoin(patients, eq(studies.patientId, patients.id))
    .where(eq(patients.userId, user.id));

  return {
    totalPatients: 1,
    totalStudies: Number(studiesCount.count),
    pendingStudies: 0,
    completedStudies: Number(studiesCount.count),
  };
}

// ─── Doctor-Patient relationships ─────────────────────────────────────────────

export async function assignPatientToDoctor(doctorId: number, patientId: number, isPrimary: boolean = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(doctorPatients).values({ doctorId, patientId, isPrimary });
}

export async function getDoctorPatients(doctorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({ patient: patients, relationship: doctorPatients })
    .from(doctorPatients)
    .leftJoin(patients, eq(doctorPatients.patientId, patients.id))
    .where(eq(doctorPatients.doctorId, doctorId))
    .orderBy(desc(doctorPatients.isPrimary), desc(patients.createdAt));
}

export async function getPatientDoctors(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({ doctor: users, relationship: doctorPatients })
    .from(doctorPatients)
    .leftJoin(users, eq(doctorPatients.doctorId, users.id))
    .where(eq(doctorPatients.patientId, patientId))
    .orderBy(desc(doctorPatients.isPrimary));
}

// ─── Study access/sharing ─────────────────────────────────────────────────────

export async function grantStudyAccess(
  studyId: number,
  doctorId: number,
  grantedBy: number,
  accessLevel: "view" | "edit" | "report" = "view"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(studyAccess).values({ studyId, doctorId, grantedBy, accessLevel });
}

export async function getStudyAccessList(studyId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({ doctor: users, access: studyAccess })
    .from(studyAccess)
    .leftJoin(users, eq(studyAccess.doctorId, users.id))
    .where(eq(studyAccess.studyId, studyId));
}

export async function getDoctorAccessibleStudies(doctorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({ study: studies, patient: patients, access: studyAccess })
    .from(studyAccess)
    .leftJoin(studies, eq(studyAccess.studyId, studies.id))
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .where(eq(studyAccess.doctorId, doctorId))
    .orderBy(desc(studies.studyDate));
}

export async function revokeStudyAccess(studyId: number, doctorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(studyAccess).where(
    and(eq(studyAccess.studyId, studyId), eq(studyAccess.doctorId, doctorId))
  );
}

// ─── Upload tokens ────────────────────────────────────────────────────────────

export async function createUploadToken(token: InsertUploadToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(uploadTokens).values(token);
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
  await db.update(uploadTokens).set({ usedAt: new Date(), isActive: false }).where(eq(uploadTokens.token, token));
}

export async function getDoctorUploadTokens(doctorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(uploadTokens).where(eq(uploadTokens.doctorId, doctorId)).orderBy(desc(uploadTokens.createdAt));
}

// ─── Delete operations ─────────────────────────────────────────────────────────

export async function deleteStudy(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [studyRow] = await db.select({ patientId: studies.patientId }).from(studies).where(eq(studies.id, id));

  const studySeries = await db.select({ id: series.id }).from(series).where(eq(series.studyId, id));
  const seriesIds = studySeries.map(s => s.id);

  if (seriesIds.length > 0) {
    await db.delete(instances).where(inArray(instances.seriesId, seriesIds));
  }
  await db.delete(series).where(eq(series.studyId, id));
  await db.delete(reports).where(eq(reports.studyId, id));
  await db.delete(studyAccess).where(eq(studyAccess.studyId, id));
  await db.delete(studies).where(eq(studies.id, id));

  if (studyRow) {
    const remaining = await db.select({ id: studies.id }).from(studies).where(eq(studies.patientId, studyRow.patientId));
    if (remaining.length === 0) {
      await db.delete(doctorPatients).where(eq(doctorPatients.patientId, studyRow.patientId));
      await db.delete(uploadTokens).where(eq(uploadTokens.patientId, studyRow.patientId));
      await db.delete(patients).where(eq(patients.id, studyRow.patientId));
    }
  }
}

export async function deletePatient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const patientStudies = await db.select({ id: studies.id }).from(studies).where(eq(studies.patientId, id));
  for (const study of patientStudies) {
    await deleteStudy(study.id);
  }

  await db.delete(doctorPatients).where(eq(doctorPatients.patientId, id));
  await db.delete(uploadTokens).where(eq(uploadTokens.patientId, id));
  await db.delete(patients).where(eq(patients.id, id));
}

export async function deleteReport(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(reports).where(eq(reports.id, id));
}
