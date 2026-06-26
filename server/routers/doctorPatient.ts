import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

/**
 * Doctor-Patient relationship and upload token routers
 */
export const doctorPatientRouter = router({
  // Assign a patient to a doctor
  assignPatient: protectedProcedure
    .input(z.object({
      patientId: z.number(),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "doctor" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only doctors can assign patients",
        });
      }
      
      await db.assignPatientToDoctor(ctx.user.id, input.patientId, input.isPrimary);
      return { success: true };
    }),
  
  // Get all patients assigned to the current doctor
  myPatients: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "doctor" && ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only doctors can view their patients",
      });
    }
    
    return await db.getDoctorPatients(ctx.user.id);
  }),
  
  // Get all doctors assigned to a patient
  patientDoctors: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Patients can only see their own doctors
      // Doctors and admins can see any patient's doctors
      if (ctx.user.role === "patient") {
        // TODO: Check if this patient belongs to the current user
        // For now, allow all authenticated users
      }
      
      return await db.getPatientDoctors(input.patientId);
    }),
});

export const studySharingRouter = router({
  // Grant access to a study for another doctor
  grantAccess: protectedProcedure
    .input(z.object({
      studyId: z.number(),
      doctorId: z.number(),
      accessLevel: z.enum(["view", "edit", "report"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "doctor" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only doctors can grant study access",
        });
      }
      
      await db.grantStudyAccess(
        input.studyId,
        input.doctorId,
        ctx.user.id,
        input.accessLevel || "view"
      );
      
      return { success: true };
    }),
  
  // Revoke access to a study
  revokeAccess: protectedProcedure
    .input(z.object({
      studyId: z.number(),
      doctorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "doctor" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only doctors can revoke study access",
        });
      }
      
      await db.revokeStudyAccess(input.studyId, input.doctorId);
      return { success: true };
    }),
  
  // Get list of doctors who have access to a study
  getAccessList: protectedProcedure
    .input(z.object({ studyId: z.number() }))
    .query(async ({ input }) => {
      return await db.getStudyAccessList(input.studyId);
    }),
  
  // Get all studies accessible to the current doctor
  myAccessibleStudies: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "doctor" && ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only doctors can view accessible studies",
      });
    }
    
    return await db.getDoctorAccessibleStudies(ctx.user.id);
  }),
});

export const uploadTokenRouter = router({
  // Generate a new upload token
  generate: protectedProcedure
    .input(z.object({
      patientId: z.number().optional(),
      patientName: z.string().optional(),
      patientEmail: z.string().email().optional(),
      expiresInDays: z.number().default(7),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "doctor" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only doctors can generate upload tokens",
        });
      }
      
      // Generate secure random token
      const token = crypto.randomBytes(32).toString("hex");
      
      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
      
      await db.createUploadToken({
        token,
        doctorId: ctx.user.id,
        patientId: input.patientId,
        patientName: input.patientName,
        patientEmail: input.patientEmail,
        expiresAt,
        isActive: true,
      });
      
      return {
        token,
        uploadUrl: `/upload/${token}`,
        expiresAt,
      };
    }),
  
  // Get all upload tokens created by the current doctor
  myTokens: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "doctor" && ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only doctors can view their upload tokens",
      });
    }
    
    return await db.getDoctorUploadTokens(ctx.user.id);
  }),
  
  // Validate an upload token (public endpoint for guest uploads)
  validate: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const tokenData = await db.getUploadTokenByToken(input.token);
      
      if (!tokenData) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid upload token",
        });
      }
      
      // Check if token is expired
      if (new Date() > tokenData.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload token has expired",
        });
      }
      
      // Check if token is still active
      if (!tokenData.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload token has already been used",
        });
      }
      
      return {
        valid: true,
        patientName: tokenData.patientName,
        patientEmail: tokenData.patientEmail,
      };
    }),
  
  // Mark token as used after successful upload
  markUsed: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      await db.markTokenAsUsed(input.token);
      return { success: true };
    }),
});
