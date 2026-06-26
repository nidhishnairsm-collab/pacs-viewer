import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import * as db from "./db";
import { canUserAccessStudy } from "./db";
import { doctorPatientRouter, studySharingRouter, uploadTokenRouter } from "./routers/doctorPatient";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    register: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
      }))
      .mutation(async ({ input, ctx }) => {
        const openId = `local:${input.email}`;
        const existing = await db.getUserByOpenId(openId);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
        }

        const passwordHash = await bcrypt.hash(input.password, 10);
        const isFirstUser = (await db.getUserCount()) === 0;

        await db.upsertUser({
          openId,
          name: input.name,
          email: input.email,
          loginMethod: "local",
          lastSignedIn: new Date(),
          passwordHash,
          role: isFirstUser ? "admin" : "patient",
        });

        const user = await db.getUserByOpenId(openId);
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const sessionToken = await sdk.createSessionToken(openId, { name: input.name, expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true as const };
      }),

    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const openId = `local:${input.email}`;
        const user = await db.getUserByOpenId(openId);

        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }

        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }

        await db.upsertUser({ openId, lastSignedIn: new Date() });

        const sessionToken = await sdk.createSessionToken(openId, { name: user.name || "", expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true as const };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Admin user management
  users: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getAllUsers();
    }),

    updateRole: protectedProcedure
      .input(z.object({
        id: z.number(),
        role: z.enum(["admin", "doctor", "patient"]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (input.id === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
        }
        await db.updateUserRole(input.id, input.role);
        return { success: true };
      }),
  }),

  // Dashboard router
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return await db.getDashboardStatsForUser(ctx.user);
    }),
  }),

  // Patients router
  patients: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getPatientsForUser(ctx.user);
    }),

    search: protectedProcedure
      .input(z.object({ searchTerm: z.string() }))
      .query(async ({ input, ctx }) => {
        return await db.searchPatientsForUser(ctx.user, input.searchTerm);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getPatientById(input.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        patientId: z.string(),
        name: z.string(),
        dateOfBirth: z.date().optional(),
        gender: z.enum(["male", "female", "other"]).optional(),
        contactNumber: z.string().optional(),
        email: z.string().email().optional(),
        address: z.string().optional(),
        medicalHistory: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return await db.createPatient({
          ...input,
          dateOfBirth: input.dateOfBirth ? input.dateOfBirth.toISOString().split('T')[0] : undefined,
          createdBy: ctx.user.id,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          name: z.string().optional(),
          dateOfBirth: z.date().optional(),
          gender: z.enum(["male", "female", "other"]).optional(),
          contactNumber: z.string().optional(),
          email: z.string().email().optional(),
          address: z.string().optional(),
          medicalHistory: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const { dateOfBirth, ...rest } = input.data;
        await db.updatePatient(input.id, {
          ...rest,
          dateOfBirth: dateOfBirth ? dateOfBirth.toISOString().split('T')[0] : undefined,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "doctor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.deletePatient(input.id);
        return { success: true };
      }),
  }),

  // Studies router
  studies: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getStudiesForUser(ctx.user);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!(await canUserAccessStudy(ctx.user, input.id))) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getStudyById(input.id);
      }),

    getByPatientId: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return await db.getStudiesByPatientId(input.patientId);
      }),
    
    create: protectedProcedure
      .input(z.object({
        studyId: z.string(),
        patientId: z.number(),
        studyDate: z.date(),
        modality: z.string(),
        description: z.string().optional(),
        bodyPart: z.string().optional(),
        referringPhysician: z.string().optional(),
        priority: z.enum(["routine", "urgent", "stat"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return await db.createStudy({
          ...input,
          uploadedBy: ctx.user.id,
        });
      }),
    
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "in_progress", "completed", "reported"]),
      }))
      .mutation(async ({ input }) => {
        await db.updateStudy(input.id, { status: input.status });
        return { success: true };
      }),

    uploadDicom: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        files: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        // TODO: Implement actual DICOM upload logic
        // 1. Parse DICOM files and extract metadata
        // 2. Upload files to S3 using storagePut
        // 3. Create study/series/instance records

        // For now, return a placeholder study ID
        return { studyId: 1, success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          const studyData = await db.getStudyById(input.id);
          if (!studyData || studyData.study.uploadedBy !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
        }
        await db.deleteStudy(input.id);
        return { success: true };
      }),
  }),

  // Series router
  series: router({
    getByStudyId: protectedProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ input }) => {
        return await db.getSeriesByStudyId(input.studyId);
      }),
  }),

  // Instances router
  instances: router({
    getBySeriesId: protectedProcedure
      .input(z.object({ seriesId: z.number() }))
      .query(async ({ input }) => {
        return await db.getInstancesBySeriesId(input.seriesId);
      }),
    getByStudyId: protectedProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!(await canUserAccessStudy(ctx.user, input.studyId))) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getInstancesByStudyId(input.studyId);
      }),
  }),

  // Doctor-Patient relationships
  doctorPatient: doctorPatientRouter,
  
  // Study sharing
  studySharing: studySharingRouter,
  
  // Upload tokens
  uploadToken: uploadTokenRouter,
  
  // Reports router
  reports: router({
    getByStudyId: protectedProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ input }) => {
        return await db.getReportsByStudyId(input.studyId);
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getReportsForUser(ctx.user);
    }),

    create: protectedProcedure
      .input(z.object({
        studyId: z.number(),
        findings: z.string().min(1),
        impression: z.string().min(1),
        recommendations: z.string().optional(),
        status: z.enum(["draft", "final", "amended"]).default("draft"),
      }))
      .mutation(async ({ input, ctx }) => {
        return await db.createReport({ ...input, reportedBy: ctx.user.id });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        findings: z.string().optional(),
        impression: z.string().optional(),
        recommendations: z.string().optional(),
        status: z.enum(["draft", "final", "amended"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateReport(id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "doctor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.deleteReport(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
