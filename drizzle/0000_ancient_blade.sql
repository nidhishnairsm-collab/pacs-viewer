CREATE TABLE "doctor_patients" (
	"id" serial PRIMARY KEY NOT NULL,
	"doctorId" integer NOT NULL,
	"patientId" integer NOT NULL,
	"isPrimary" boolean DEFAULT false NOT NULL,
	"assignedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"sopInstanceUID" varchar(128) NOT NULL,
	"seriesId" integer NOT NULL,
	"instanceNumber" integer,
	"fileUrl" text NOT NULL,
	"fileKey" text NOT NULL,
	"fileSize" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "instances_sopInstanceUID_unique" UNIQUE("sopInstanceUID")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" serial PRIMARY KEY NOT NULL,
	"patientId" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"dateOfBirth" date,
	"gender" text,
	"contactNumber" varchar(50),
	"email" varchar(320),
	"address" text,
	"medicalHistory" text,
	"createdBy" integer NOT NULL,
	"userId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "patients_patientId_unique" UNIQUE("patientId")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"studyId" integer NOT NULL,
	"reportedBy" integer NOT NULL,
	"findings" text NOT NULL,
	"impression" text NOT NULL,
	"recommendations" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" serial PRIMARY KEY NOT NULL,
	"seriesId" varchar(128) NOT NULL,
	"studyId" integer NOT NULL,
	"seriesNumber" integer,
	"modality" varchar(16),
	"description" text,
	"numberOfInstances" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "series_seriesId_unique" UNIQUE("seriesId")
);
--> statement-breakpoint
CREATE TABLE "studies" (
	"id" serial PRIMARY KEY NOT NULL,
	"studyId" varchar(128) NOT NULL,
	"patientId" integer NOT NULL,
	"studyDate" timestamp NOT NULL,
	"modality" varchar(16) NOT NULL,
	"description" text,
	"bodyPart" varchar(128),
	"referringPhysician" varchar(255),
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'routine' NOT NULL,
	"numberOfSeries" integer DEFAULT 0,
	"numberOfInstances" integer DEFAULT 0,
	"uploadedBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "studies_studyId_unique" UNIQUE("studyId")
);
--> statement-breakpoint
CREATE TABLE "study_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"studyId" integer NOT NULL,
	"doctorId" integer NOT NULL,
	"grantedBy" integer NOT NULL,
	"accessLevel" text DEFAULT 'view' NOT NULL,
	"grantedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"doctorId" integer NOT NULL,
	"patientId" integer,
	"patientName" varchar(255),
	"patientEmail" varchar(320),
	"expiresAt" timestamp NOT NULL,
	"usedAt" timestamp,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "upload_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" text DEFAULT 'patient' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	"passwordHash" varchar(255),
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
ALTER TABLE "doctor_patients" ADD CONSTRAINT "doctor_patients_doctorId_users_id_fk" FOREIGN KEY ("doctorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_patients" ADD CONSTRAINT "doctor_patients_patientId_patients_id_fk" FOREIGN KEY ("patientId") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instances" ADD CONSTRAINT "instances_seriesId_series_id_fk" FOREIGN KEY ("seriesId") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_studyId_studies_id_fk" FOREIGN KEY ("studyId") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedBy_users_id_fk" FOREIGN KEY ("reportedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_studyId_studies_id_fk" FOREIGN KEY ("studyId") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_patientId_patients_id_fk" FOREIGN KEY ("patientId") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_uploadedBy_users_id_fk" FOREIGN KEY ("uploadedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access" ADD CONSTRAINT "study_access_studyId_studies_id_fk" FOREIGN KEY ("studyId") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access" ADD CONSTRAINT "study_access_doctorId_users_id_fk" FOREIGN KEY ("doctorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access" ADD CONSTRAINT "study_access_grantedBy_users_id_fk" FOREIGN KEY ("grantedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_tokens" ADD CONSTRAINT "upload_tokens_doctorId_users_id_fk" FOREIGN KEY ("doctorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_tokens" ADD CONSTRAINT "upload_tokens_patientId_patients_id_fk" FOREIGN KEY ("patientId") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;