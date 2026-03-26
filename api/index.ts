import express from "express";
import { neon } from "@neondatabase/serverless";
import { TRPCError, initTRPC } from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import superjson from "superjson";
import { z } from "zod";
import { SignJWT, jwtVerify } from "jose";
import { serialize as serializeCookie, parse as parseCookies } from "cookie";
import type { Request, Response } from "express";

// ── DB ────────────────────────────────────────────────────────────────────────
function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

async function listQrCodes(opts: { page: number; pageSize: number; search?: string; status?: string }) {
  const sql = getSql();
  const offset = (opts.page - 1) * opts.pageSize;
  const params: any[] = [];

  const conditions: string[] = [];
  if (opts.search) {
    params.push(`%${opts.search}%`);
    const p = params.length;
    conditions.push(`(redirect_path ILIKE $${p} OR COALESCE(destination_url,'') ILIKE $${p} OR CAST(qr_number AS TEXT) ILIKE $${p})`);
  }
  if (opts.status === "active") conditions.push("is_active = true");
  if (opts.status === "inactive") conditions.push("is_active = false");

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  params.push(opts.pageSize);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  const [rows, countRows] = await Promise.all([
    sql(`SELECT * FROM qr_codes ${where} ORDER BY qr_number LIMIT $${limitParam} OFFSET $${offsetParam}`, params),
    sql(`SELECT COUNT(*)::int as count FROM qr_codes ${where}`, params.slice(0, params.length - 2)),
  ]);

  return {
    rows: rows.map((r: any) => ({
      id: r.id,
      qrNumber: r.qr_number,
      redirectPath: r.redirect_path,
      destinationUrl: r.destination_url,
      isActive: r.is_active,
      scanCount: r.scan_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total: countRows[0]?.count ?? 0,
  };
}

async function getQrCodeByPath(path: string) {
  const sql = getSql();
  const rows = await sql(`SELECT * FROM qr_codes WHERE redirect_path = $1 LIMIT 1`, [path]);
  if (!rows[0]) return null;
  const r = rows[0] as any;
  return { id: r.id, qrNumber: r.qr_number, redirectPath: r.redirect_path, destinationUrl: r.destination_url, isActive: r.is_active, scanCount: r.scan_count };
}

async function updateQrCodeDestination(id: number, destinationUrl: string) {
  const sql = getSql();
  await sql(`UPDATE qr_codes SET destination_url = $1, updated_at = NOW() WHERE id = $2`, [destinationUrl, id]);
}

async function bulkUpdateDestination(ids: number[], destinationUrl: string) {
  const sql = getSql();
  await sql(`UPDATE qr_codes SET destination_url = $1, updated_at = NOW() WHERE id = ANY($2::int[])`, [destinationUrl, ids]);
}

async function toggleQrCodeStatus(id: number, isActive: boolean) {
  const sql = getSql();
  await sql(`UPDATE qr_codes SET is_active = $1, updated_at = NOW() WHERE id = $2`, [isActive, id]);
}

async function incrementScanCount(id: number) {
  const sql = getSql();
  await sql(`UPDATE qr_codes SET scan_count = scan_count + 1, updated_at = NOW() WHERE id = $1`, [id]);
}

async function getQrStats() {
  const sql = getSql();
  const rows = await sql(`
    SELECT
      COUNT(*)::int as total,
      SUM(CASE WHEN is_active THEN 1 ELSE 0 END)::int as active,
      SUM(CASE WHEN NOT is_active THEN 1 ELSE 0 END)::int as inactive,
      SUM(CASE WHEN destination_url IS NOT NULL THEN 1 ELSE 0 END)::int as configured,
      COALESCE(SUM(scan_count), 0)::int as total_scans
    FROM qr_codes
  `);
  const r = rows[0] as any;
  return { total: r.total, active: r.active, inactive: r.inactive, configured: r.configured, totalScans: r.total_scans };
}

async function getTopQrCodes(limit: number) {
  const sql = getSql();
  const rows = await sql(`SELECT * FROM qr_codes ORDER BY scan_count DESC LIMIT ${limit}`);
  return rows.map((r: any) => ({ id: r.id, qrNumber: r.qr_number, redirectPath: r.redirect_path, destinationUrl: r.destination_url, isActive: r.is_active, scanCount: r.scan_count }));
}

async function insertScanLog(log: { qrCodeId: number; qrNumber: number; ipAddress: string | null; city: string | null; region: string | null; country: string | null; deviceType: string; userAgent: string | null; referrer: string | null }) {
  const sql = getSql();
  await sql(
    `INSERT INTO scan_logs (qr_code_id, qr_number, ip_address, city, region, country, device_type, user_agent, referrer) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [log.qrCodeId, log.qrNumber, log.ipAddress, log.city, log.region, log.country, log.deviceType, log.userAgent, log.referrer]
  );
}

async function getScanLogsByQrId(qrCodeId: number, limit: number) {
  const sql = getSql();
  const rows = await sql(`SELECT * FROM scan_logs WHERE qr_code_id = $1 ORDER BY scanned_at DESC LIMIT ${limit}`, [qrCodeId]);
  return rows.map((r: any) => ({ id: r.id, qrCodeId: r.qr_code_id, qrNumber: r.qr_number, ipAddress: r.ip_address, city: r.city, region: r.region, country: r.country, deviceType: r.device_type, userAgent: r.user_agent, referrer: r.referrer, scannedAt: r.scanned_at }));
}

async function getAllScanLogs(opts: { page: number; pageSize: number; search?: string }) {
  const sql = getSql();
  const offset = (opts.page - 1) * opts.pageSize;
  const params: any[] = [];

  const conditions: string[] = [];
  if (opts.search) {
    params.push(`%${opts.search}%`);
    const p = params.length;
    conditions.push(`(COALESCE(city,'') ILIKE $${p} OR COALESCE(country,'') ILIKE $${p} OR COALESCE(device_type,'') ILIKE $${p} OR CAST(qr_number AS TEXT) ILIKE $${p})`);
  }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  params.push(opts.pageSize);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  const [rows, countRows] = await Promise.all([
    sql(`SELECT * FROM scan_logs ${where} ORDER BY scanned_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`, params),
    sql(`SELECT COUNT(*)::int as count FROM scan_logs ${where}`, params.slice(0, params.length - 2)),
  ]);
  return {
    rows: rows.map((r: any) => ({ id: r.id, qrCodeId: r.qr_code_id, qrNumber: r.qr_number, ipAddress: r.ip_address, city: r.city, region: r.region, country: r.country, deviceType: r.device_type, userAgent: r.user_agent, referrer: r.referrer, scannedAt: r.scanned_at })),
    total: countRows[0]?.count ?? 0,
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────
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
    const token = parseCookies(req.headers.cookie ?? "")[COOKIE_NAME];
    if (token) { await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] }); return { req, res, isAdmin: true }; }
  } catch {}
  return { req, res, isAdmin: false };
}

// ── tRPC ──────────────────────────────────────────────────────────────────────
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
        const token = await new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000)).sign(getJwtSecret());
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
    topCodes: adminProcedure.input(z.object({ limit: z.number().min(1).max(50).default(10) })).query(({ input }) => getTopQrCodes(input.limit)),
    scanLogs: adminProcedure.input(z.object({ qrCodeId: z.number(), limit: z.number().default(50) })).query(({ input }) => getScanLogsByQrId(input.qrCodeId, input.limit)),
    allScanLogs: adminProcedure
      .input(z.object({ page: z.number().min(1).default(1), pageSize: z.number().min(1).max(100).default(50), search: z.string().optional() }))
      .query(({ input }) => getAllScanLogs(input)),
  }),
});

export type AppRouter = typeof appRouter;

// ── Express ───────────────────────────────────────────────────────────────────
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
    try { await Promise.all([incrementScanCount(qr.id), insertScanLog({ qrCodeId: qr.id, qrNumber: qr.qrNumber, ipAddress: ip, city: null, region: null, country: null, deviceType, userAgent: ua || null, referrer: (req.headers.referer as string) || null })]); } catch {}
  } catch { if (!res.headersSent) res.status(500).send("Server error."); }
});

app.use("/api/trpc", trpcExpress.createExpressMiddleware({ router: appRouter, createContext }));

export default app;
