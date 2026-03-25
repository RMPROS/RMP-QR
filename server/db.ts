import { neon } from "@neondatabase/serverless";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { qrCodes, scanLogs, type InsertScanLog } from "../drizzle/schema";

// ── Connection singleton ───────────────────────────────────────────────────────
// Re-creating the client on every request wastes time in serverless environments.
// Cache it per cold-start (the module is re-evaluated on each cold start anyway).
let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (_db) return _db;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  _db = drizzle(neon(databaseUrl));
  return _db;
}

// ── QR Codes ──────────────────────────────────────────────────────────────────

export async function listQrCodes(opts: {
  page: number;
  pageSize: number;
  search?: string;
  status?: "active" | "inactive" | "all";
}) {
  const db = getDb();
  const offset = (opts.page - 1) * opts.pageSize;

  const conditions = [];
  if (opts.search) {
    const term = `%${opts.search}%`;
    conditions.push(
      or(
        ilike(qrCodes.redirectPath, term),
        // COALESCE avoids null-matching issues on nullable destination column
        sql`coalesce(${qrCodes.destinationUrl}, '') ilike ${term}`,
        sql`cast(${qrCodes.qrNumber} as text) ilike ${term}`
      )
    );
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

export async function getQrCodeByPath(path: string) {
  const db = getDb();
  const rows = await db.select().from(qrCodes).where(eq(qrCodes.redirectPath, path)).limit(1);
  return rows[0] ?? null;
}

export async function updateQrCodeDestination(id: number, destinationUrl: string) {
  const db = getDb();
  await db.update(qrCodes).set({ destinationUrl, updatedAt: new Date() }).where(eq(qrCodes.id, id));
}

export async function bulkUpdateDestination(ids: number[], destinationUrl: string) {
  const db = getDb();
  // Use Drizzle's inArray — fully parameterized, no sql.raw interpolation needed.
  await db
    .update(qrCodes)
    .set({ destinationUrl, updatedAt: new Date() })
    .where(inArray(qrCodes.id, ids));
}

export async function toggleQrCodeStatus(id: number, isActive: boolean) {
  const db = getDb();
  await db.update(qrCodes).set({ isActive, updatedAt: new Date() }).where(eq(qrCodes.id, id));
}

export async function incrementScanCount(id: number) {
  const db = getDb();
  await db
    .update(qrCodes)
    .set({
      scanCount: sql`${qrCodes.scanCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(qrCodes.id, id));
}

export async function getQrStats() {
  const db = getDb();
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`sum(case when ${qrCodes.isActive} then 1 else 0 end)::int`,
      inactive: sql<number>`sum(case when not ${qrCodes.isActive} then 1 else 0 end)::int`,
      configured: sql<number>`sum(case when ${qrCodes.destinationUrl} is not null then 1 else 0 end)::int`,
      totalScans: sql<number>`coalesce(sum(${qrCodes.scanCount}), 0)::int`,
    })
    .from(qrCodes);
  return rows[0] ?? { total: 0, active: 0, inactive: 0, configured: 0, totalScans: 0 };
}

export async function getTopQrCodes(limit = 10) {
  const db = getDb();
  return db.select().from(qrCodes).orderBy(desc(qrCodes.scanCount)).limit(limit);
}

// ── Scan Logs ─────────────────────────────────────────────────────────────────

export async function insertScanLog(log: InsertScanLog) {
  const db = getDb();
  await db.insert(scanLogs).values(log);
}

export async function getScanLogsByQrId(qrCodeId: number, limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(scanLogs)
    .where(eq(scanLogs.qrCodeId, qrCodeId))
    .orderBy(desc(scanLogs.scannedAt))
    .limit(limit);
}

export async function getAllScanLogs(opts: { page: number; pageSize: number; search?: string }) {
  const db = getDb();
  const offset = (opts.page - 1) * opts.pageSize;
  const conditions = [];
  if (opts.search) {
    const term = `%${opts.search}%`;
    conditions.push(
      or(
        sql`coalesce(${scanLogs.city}, '') ilike ${term}`,
        sql`coalesce(${scanLogs.country}, '') ilike ${term}`,
        sql`coalesce(${scanLogs.deviceType}, '') ilike ${term}`,
        sql`cast(${scanLogs.qrNumber} as text) ilike ${term}`
      )
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(scanLogs).where(where).orderBy(desc(scanLogs.scannedAt)).limit(opts.pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(scanLogs).where(where),
  ]);
  return { rows, total: countRows[0]?.count ?? 0 };
}
