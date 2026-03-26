import express from "express";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/context";
import * as db from "../server/db";
import { insertScanLog } from "../server/db";

const app = express();
app.use(express.json());

// ── DATABASE DEBUG ENDPOINT ───────────────────────────────────────────────────
app.get("/api/debug", async (_req, res) => {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const result: Record<string, any> = {
    hasDbUrl: !!dbUrl,
    dbUrlLength: dbUrl.length,
    dbUrlPrefix: dbUrl.substring(0, 30) + "...",
    nodeEnv: process.env.NODE_ENV,
    hasAdminPassword: !!process.env.ADMIN_PASSWORD,
    hasJwtSecret: !!process.env.JWT_SECRET,
  };

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(dbUrl);
    const rows = await sql`SELECT count(*)::int as count FROM qr_codes`;
    result.dbConnected = true;
    result.qrCodeCount = rows[0]?.count ?? 0;
  } catch (err: any) {
    result.dbConnected = false;
    result.dbError = err?.message ?? String(err);
  }

  res.json(result);
});

// ── Public QR redirect endpoint ───────────────────────────────────────────────
app.get("/qr/:id", async (req, res) => {
  const id = req.params.id;
  const paddedId = id.padStart(3, "0");

  try {
    const qr = await db.getQrCodeByPath(`/qr/${paddedId}`);

    if (!qr) return res.status(404).send("QR code not found.");
    if (!qr.isActive) return res.status(410).send("This QR code is no longer active.");
    if (!qr.destinationUrl) return res.status(503).send("This QR code has not been configured yet.");

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;
    const ua = req.headers["user-agent"] || "";
    let deviceType = "desktop";
    if (/mobile|android|iphone|ipad|tablet/i.test(ua)) deviceType = "mobile";
    else if (/bot|crawler|spider/i.test(ua)) deviceType = "bot";
    const referrer = (req.headers.referer as string) || null;
    const { destinationUrl, id: qrId, qrNumber } = qr;

    res.redirect(302, destinationUrl);

    try {
      let city: string | null = null;
      let region: string | null = null;
      let country: string | null = null;
      if (ip && ip !== "::1" && ip !== "127.0.0.1") {
        const geo = await fetch(`https://ip-api.com/json/${ip}?fields=city,regionName,country`);
        if (geo.ok) {
          const data = await geo.json() as { city?: string; regionName?: string; country?: string };
          city = data.city ?? null;
          region = data.regionName ?? null;
          country = data.country ?? null;
        }
      }
      await Promise.all([
        db.incrementScanCount(qrId),
        insertScanLog({ qrCodeId: qrId, qrNumber, ipAddress: ip, city, region, country, deviceType, userAgent: ua || null, referrer }),
      ]);
    } catch (logErr) {
      console.error("[QR] Log error:", logErr);
    }
  } catch (err) {
    console.error("[QR] Error:", err);
    if (!res.headersSent) res.status(500).send("Server error.");
  }
});

// ── tRPC ──────────────────────────────────────────────────────────────────────
app.use(
  "/api/trpc",
  trpcExpress.createExpressMiddleware({ router: appRouter, createContext })
);

export default app;
