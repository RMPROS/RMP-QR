import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { SignJWT } from "jose";
import { serialize as serializeCookie } from "cookie";
import type { TrpcContext } from "./context";
import { COOKIE_NAME } from "./context";
import * as db from "./db";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

const publicProcedure = t.procedure;
const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.isAdmin) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  return next({ ctx });
});

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "JWT_SECRET not configured" });
  return new TextEncoder().encode(s);
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export const appRouter = t.router({
  auth: t.router({
    login: publicProcedure
      .input(z.object({ password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const stored = (process.env.ADMIN_PASSWORD ?? "").trim();
        if (!stored) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ADMIN_PASSWORD not configured" });
        }
        if (input.password.trim() !== stored) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });
        }

        const secret = getJwtSecret();
        const token = await new SignJWT({ role: "admin" })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
          .sign(secret);

        const cookieStr = serializeCookie(COOKIE_NAME, token, {
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure: isProduction(),
          maxAge: ONE_YEAR_MS / 1000,
        });

        ctx.res.setHeader("Set-Cookie", cookieStr);
        return { success: true };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieStr = serializeCookie(COOKIE_NAME, "", {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: isProduction(),
        maxAge: -1,
      });
      ctx.res.setHeader("Set-Cookie", cookieStr);
      return { success: true };
    }),

    me: publicProcedure.query(({ ctx }) => {
      return ctx.isAdmin ? { role: "admin" as const } : null;
    }),
  }),

  qr: t.router({
    list: adminProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
        search: z.string().optional(),
        status: z.enum(["active", "inactive", "all"]).default("all"),
      }))
      .query(({ input }) => db.listQrCodes(input)),

    updateDestination: adminProcedure
      .input(z.object({ id: z.number(), destinationUrl: z.string().url() }))
      .mutation(({ input }) => db.updateQrCodeDestination(input.id, input.destinationUrl)),

    bulkUpdateDestination: adminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1).max(500), destinationUrl: z.string().url() }))
      .mutation(({ input }) => db.bulkUpdateDestination(input.ids, input.destinationUrl)),

    toggleStatus: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(({ input }) => db.toggleQrCodeStatus(input.id, input.isActive)),

    stats: adminProcedure.query(() => db.getQrStats()),

    topCodes: adminProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
      .query(({ input }) => db.getTopQrCodes(input.limit)),

    scanLogs: adminProcedure
      .input(z.object({ qrCodeId: z.number(), limit: z.number().default(50) }))
      .query(({ input }) => db.getScanLogsByQrId(input.qrCodeId, input.limit)),

    allScanLogs: adminProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
        search: z.string().optional(),
      }))
      .query(({ input }) => db.getAllScanLogs(input)),
  }),
});

export type AppRouter = typeof appRouter;
