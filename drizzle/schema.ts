import { boolean, date, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: text("role").$type<"admin" | "doctor" | "patient">().default("patient").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  patientId: varchar("patientId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  dateOfBirth: date("dateOfBirth"),
  gender: text("gender").$type<"male" | "female" | "other">(),
  contactNumber: varchar("contactNumber", { length: 50 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  medicalHistory: text("medicalHistory"),
  createdBy: integer("createdBy").notNull().references(() => users.id),
  userId: integer("userId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

export const studies = pgTable("studies", {
  id: serial("id").primaryKey(),
  studyId: varchar("studyId", { length: 128 }).notNull().unique(),
  patientId: integer("patientId").notNull().references(() => patients.id),
  studyDate: timestamp("studyDate").notNull(),
  modality: varchar("modality", { length: 16 }).notNull(),
  description: text("description"),
  bodyPart: varchar("bodyPart", { length: 128 }),
  referringPhysician: varchar("referringPhysician", { length: 255 }),
  status: text("status").$type<"pending" | "in_progress" | "completed" | "reported">().default("pending").notNull(),
  priority: text("priority").$type<"routine" | "urgent" | "stat">().default("routine").notNull(),
  numberOfSeries: integer("numberOfSeries").default(0),
  numberOfInstances: integer("numberOfInstances").default(0),
  uploadedBy: integer("uploadedBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Study = typeof studies.$inferSelect;
export type InsertStudy = typeof studies.$inferInsert;

export const series = pgTable("series", {
  id: serial("id").primaryKey(),
  seriesId: varchar("seriesId", { length: 128 }).notNull().unique(),
  studyId: integer("studyId").notNull().references(() => studies.id),
  seriesNumber: integer("seriesNumber"),
  modality: varchar("modality", { length: 16 }),
  description: text("description"),
  numberOfInstances: integer("numberOfInstances").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Series = typeof series.$inferSelect;
export type InsertSeries = typeof series.$inferInsert;

export const instances = pgTable("instances", {
  id: serial("id").primaryKey(),
  sopInstanceUID: varchar("sopInstanceUID", { length: 128 }).notNull().unique(),
  seriesId: integer("seriesId").notNull().references(() => series.id),
  instanceNumber: integer("instanceNumber"),
  fileUrl: text("fileUrl").notNull(),
  fileKey: text("fileKey").notNull(),
  fileSize: integer("fileSize"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Instance = typeof instances.$inferSelect;
export type InsertInstance = typeof instances.$inferInsert;

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  studyId: integer("studyId").notNull().references(() => studies.id),
  reportedBy: integer("reportedBy").notNull().references(() => users.id),
  findings: text("findings").notNull(),
  impression: text("impression").notNull(),
  recommendations: text("recommendations"),
  status: text("status").$type<"draft" | "final" | "amended">().default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

export const doctorPatients = pgTable("doctor_patients", {
  id: serial("id").primaryKey(),
  doctorId: integer("doctorId").notNull().references(() => users.id),
  patientId: integer("patientId").notNull().references(() => patients.id),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
});

export type DoctorPatient = typeof doctorPatients.$inferSelect;
export type InsertDoctorPatient = typeof doctorPatients.$inferInsert;

export const studyAccess = pgTable("study_access", {
  id: serial("id").primaryKey(),
  studyId: integer("studyId").notNull().references(() => studies.id),
  doctorId: integer("doctorId").notNull().references(() => users.id),
  grantedBy: integer("grantedBy").notNull().references(() => users.id),
  accessLevel: text("accessLevel").$type<"view" | "edit" | "report">().default("view").notNull(),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
});

export type StudyAccess = typeof studyAccess.$inferSelect;
export type InsertStudyAccess = typeof studyAccess.$inferInsert;

export const uploadTokens = pgTable("upload_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  doctorId: integer("doctorId").notNull().references(() => users.id),
  patientId: integer("patientId").references(() => patients.id),
  patientName: varchar("patientName", { length: 255 }),
  patientEmail: varchar("patientEmail", { length: 320 }),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UploadToken = typeof uploadTokens.$inferSelect;
export type InsertUploadToken = typeof uploadTokens.$inferInsert;
