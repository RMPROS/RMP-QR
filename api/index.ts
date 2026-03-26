import express from "express";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { boolean, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { TRPCError, initTRPC } from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import superjson from "superjson";
import { z } from "zod";
import { SignJWT, jwtVerify } from "jose";
import { serialize as serializeCookie, parse as parseCookies } from "cookie";
import type { Request, Response } from "express";

// ── Schema ────────────────────────────────────────────────────────────────────
const qrCodes = pgTable("qr_codes", {
  id: serial("id").primaryKey(),
  qrNumber: integer("qr_number").notNull().unique(),
  redirectPath: varchar("redirect_path", { length: 100 }).notNull().unique(),
  destinationUrl: text("destination_url"),
  isActive: boolean("is_active").notNull().default(true),
  scanCount: integer("scan_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const scanLogs = pgTable("scan_logs", {
  id: serial("id").primaryKey(),
  qrCodeId: integer("qr_code_id").notNull().references(() => qrCodes.id, { onDelete: "cascade" }),
  qrNumber: integer("qr_number").notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  city: varchar("city", { length: 128 }),
  region: varchar("region", { length: 128 }),
  country: varchar("country", { length: 64 }),
  deviceType: varchar("device_type", { length: 32 }),
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  scannedAt: timestamp("scanned_at").defaultNow().notNull(),
});

type InsertScanLog = typeof scanLogs.$inferInsert;

// ── DB ────────────────────────────────────────────────────────────────────────
let _db: ReturnType<typeof drizzle> | null = null;
function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _db = drizzle(neon(url));
  return _db;
}

async function listQrCodes(opts: { page: number; pageSize: number; search?: string; status?: "active" | "inactive" | "all" }) {
  const db = getDb();
  const offset = (opts.page - 1) * opts.pageSize;
  const conditions = [];
  if (opts.search) {
    const term = `%${opts.search}%`;
    conditions.push(or(ilike(qrCodes.redirectPath, term), sql`coalesce(${qrCodes.destinationUrl}, '') ilike ${term}`, sql`cast(${qrCodes.qrNumber} as text) ilike ${term}`));
  }
  if (opts.status === "active") conditions.push(eq(qrCodes.isActive, true));
  if (opts.status === "inactive") conditions.push(eq(qrCodes.isActive, false));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(qrCodes).where(where).orderBy(qrCodes.qrNumber).limit(opts.pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(qrCodes).where(where),
  ]);
  return { rows, total: countRows[0]?.count ?? 0 };
}

async function getQrCodeByPath(path: string) {
  const db = getDb();
  const rows = await db.select().from(qrCodes).where(eq(qrCodes.redirectPath, path)).limit(1);
  return rows[0] ?? null;
}

async function updateQrCodeDestination(id: number, destinationUrl: string) {
  await getDb().update(qrCodes).set({ destinationUrl, updatedAt: new Date() }).where(eq(qrCodes.id, id));
}

async function bulkUpdateDestination(ids: number[], destinationUrl: string) {
  await getDb().update(qrCodes).set({ destinationUrl, updatedAt: new Date() }).where(inArray(qrCodes.id, ids));
}

async function toggleQrCodeStatus(id: number, isActive: boolean) {
  await getDb().update(qrCodes).set({ isActive, updatedAt: new Date() }).where(eq(qrCodes.id, id));
}

async function incrementScanCount(id: number) {
  await getDb().update(qrCodes).set({ scanCount: sql`${qrCodes.scanCount} + 1`, updatedAt: new Date() }).where(eq(qrCodes.id, id));
}

async function getQrStats() {
  const rows = await getDb().select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`sum(case when ${qrCodes.isActive} then 1 else 0 end)::int`,
    inactive: sql<number>`sum(case when not ${qrCodes.isActive} then 1 else 0 end)::int`,
    configured: sql<number>`sum(case when ${qrCodes.destinationUrl} is not null then 1 else 0 end)::int`,
    totalScans: sql<number>`coalesce(sum(${qrCodes.scanCount}), 0)::int`,
  }).from(qrCodes);
  return rows[0] ?? { total: 0, active: 0, inactive: 0, configured: 0, totalScans: 0 };
}

async function getTopQrCodes(limit = 10) {
  return getDb().select().from(qrCodes).orderBy(desc(qrCodes.scanCount)).limit(limit);
}

async function insertScanLog(log: InsertScanLog) {
  await getDb().insert(scanLogs).values(log);
}

async function getScanLogsByQrId(qrCodeId: number, limit = 50) {
  return getDb().select().from(scanLogs).where(eq(scanLogs.qrCodeId, qrCodeId)).orderBy(desc(scanLogs.scannedAt)).limit(limit);
}

async function getAllScanLogs(opts: { page: number; pageSize: number; search?: string }) {
  const db = getDb();
  const offset = (opts.page - 1) * opts.pageSize;
  const conditions = [];
  if (opts.search) {
    const term = `%${opts.search}%`;
    conditions.push(or(sql`coalesce(${scanLogs.city}, '') ilike ${term}`, sql`coalesce(${scanLogs.country}, '') ilike ${term}`, sql`coalesce(${scanLogs.deviceType}, '') ilike ${term}`, sql`cast(${scanLogs.qrNumber} as text) ilike ${term}`));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(scanLogs).where(where).orderBy(desc(scanLogs.scannedAt)).limit(opts.pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(scanLogs).where(where),
  ]);
  return { rows, total: countRows[0]?.count ?? 0 };
}

// ── Auth / tRPC context ───────────────────────────────────────────────────────
const COOKIE_NAME = "qr_admin_session";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

type TrpcContext = { req: Request; res: Response; isAdmin: boolean };

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

async function createContext({ req, res }: { req: Request; res: Response }): Promise<TrpcContext> {
  try {
    const cookies = parseCookies(req.headers.cookie ?? "");
    const token = cookies[COOKIE_NAME];
    if (token) await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    return { req, res, isAdmin: !!token };
  } catch {
    return { req, res, isAdmin: false };
  }
}

// ── tRPC router ───────────────────────────────────────────────────────────────
const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
const publicProcedure = t.procedure;
// AUTH TEMPORARILY DISABLED
const adminProcedure = t.procedure.use(({ ctx, next }) => next({ ctx }));

const appRouter = t.router({
  auth: t.router({
    login: publicProcedure
      .input(z.object({ password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const stored = (process.env.ADMIN_PASSWORD ?? "").trim();
        if (!stored) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ADMIN_PASSWORD not configured" });
        if (input.password.trim() !== stored) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });
        const token = await new SignJWT({ role: "admin" })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
          .sign(getJwtSecret());
        ctx.res.setHeader("Set-Cookie", serializeCookie(COOKIE_NAME, token, { httpOnly: true, path: "/", sameSite: "lax", secure: true, maxAge: ONE_YEAR_MS / 1000 }));
        return { success: true };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.setHeader("Set-Cookie", serializeCookie(COOKIE_NAME, "", { httpOnly: true, path: "/", sameSite: "lax", secure: true, maxAge: -1 }));
      return { success: true };
    }),
    me: publicProcedure.query(({ ctx }) => ctx.isAdmin ? { role: "admin" as const } : null),
  }),
  qr: t.router({
    list: adminProcedure
      .input(z.object({ page: z.number().min(1).default(1), pageSize: z.number().min(1).max(100).default(50), search: z.string().optional(), status: z.enum(["active", "inactive", "all"]).default("all") }))
      .query(({ input }) => listQrCodes(input)),
    updateDestination: adminProcedure
      .input(z.object({ id: z.number(), destinationUrl: z.string().url() }))
      .mutation(({ input }) => updateQrCodeDestination(input.id, input.destinationUrl)),
    bulkUpdateDestination: adminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1).max(500), destinationUrl: z.string().url() }))
      .mutation(({ input }) => bulkUpdateDestination(input.ids, input.destinationUrl)),
    toggleStatus: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(({ input }) => toggleQrCodeStatus(input.id, input.isActive)),
    stats: adminProcedure.query(() => getQrStats()),
    topCodes: adminProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
      .query(({ input }) => getTopQrCodes(input.limit)),
    scanLogs: adminProcedure
      .input(z.object({ qrCodeId: z.number(), limit: z.number().default(50) }))
      .query(({ input }) => getScanLogsByQrId(input.qrCodeId, input.limit)),
    allScanLogs: adminProcedure
      .input(z.object({ page: z.number().min(1).default(1), pageSize: z.number().min(1).max(100).default(50), search: z.string().optional() }))
      .query(({ input }) => getAllScanLogs(input)),
  }),
});

export type AppRouter = typeof appRouter;

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get("/qr/:id", async (req, res) => {
  const paddedId = req.params.id.padStart(3, "0");
  try {
    const qr = await getQrCodeByPath(`/qr/${paddedId}`);
    if (!qr) return res.status(404).send("QR code not found.");
    if (!qr.isActive) return res.status(410).send("QR code inactive.");
    if (!qr.destinationUrl) return res.status(503).send("QR code not configured yet.");
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || null;
    const ua = req.headers["user-agent"] || "";
    const deviceType = /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : /bot|crawler/i.test(ua) ? "bot" : "desktop";
    res.redirect(302, qr.destinationUrl);
    try {
      await Promise.all([
        incrementScanCount(qr.id),
        insertScanLog({ qrCodeId: qr.id, qrNumber: qr.qrNumber, ipAddress: ip, city: null, region: null, country: null, deviceType, userAgent: ua || null, referrer: (req.headers.referer as string) || null }),
      ]);
    } catch {}
  } catch (err) {
    if (!res.headersSent) res.status(500).send("Server error.");
  }
});

app.use("/api/trpc", trpcExpress.createExpressMiddleware({ router: appRouter, createContext }));

export default app;
