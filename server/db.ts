import { neon } from "@neondatabase/serverless";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { qrCodes, scanLogs, type InsertScanLog, type QrCode } from "../drizzle/schema";

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const client = neon(databaseUrl);
  return drizzle(client);
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
        ilike(qrCodes.destinationUrl ?? sql`''`, term),
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
  await db.update(qrCodes).set({ destinationUrl, updatedAt: new Date() }).where(
    sql`${qrCodes.id} = ANY(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)})`
  );
}

export async function toggleQrCodeStatus(id: number, isActive: boolean) {
  const db = getDb();
  await db.update(qrCodes).set({ isActive, updatedAt: new Date() }).where(eq(qrCodes.id, id));
}

export async function incrementScanCount(id: number) {
  const db = getDb();
  await db.update(qrCodes).set({
    scanCount: sql`${qrCodes.scanCount} + 1`,
    updatedAt: new Date(),
  }).where(eq(qrCodes.id, id));
}

export async function getQrStats() {
  const db = getDb();
  const rows = await db.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`sum(case when ${qrCodes.isActive} then 1 else 0 end)::int`,
    inactive: sql<number>`sum(case when not ${qrCodes.isActive} then 1 else 0 end)::int`,
    configured: sql<number>`sum(case when ${qrCodes.destinationUrl} is not null then 1 else 0 end)::int`,
    totalScans: sql<number>`sum(${qrCodes.scanCount})::int`,
  }).from(qrCodes);
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
  return db.select().from(scanLogs).where(eq(scanLogs.qrCodeId, qrCodeId)).orderBy(desc(scanLogs.scannedAt)).limit(limit);
}

export async function getAllScanLogs(opts: { page: number; pageSize: number; search?: string }) {
  const db = getDb();
  const offset = (opts.page - 1) * opts.pageSize;
  const conditions = [];
  if (opts.search) {
    const term = `%${opts.search}%`;
    conditions.push(
      or(
        ilike(scanLogs.city ?? sql`''`, term),
        ilike(scanLogs.country ?? sql`''`, term),
        ilike(scanLogs.deviceType ?? sql`''`, term),
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
