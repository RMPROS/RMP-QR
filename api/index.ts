import express from "express";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

const app = express();
app.use(express.json());

// ── DEBUG ─────────────────────────────────────────────────────────────────────
app.get("/api/debug", async (_req, res) => {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const result: Record<string, any> = {
    hasDbUrl: !!dbUrl,
    dbUrlLength: dbUrl.length,
    dbUrlStart: dbUrl.substring(0, 25) + "...",
    nodeEnv: process.env.NODE_ENV,
    hasAdminPassword: !!process.env.ADMIN_PASSWORD,
    hasJwtSecret: !!process.env.JWT_SECRET,
  };

  try {
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

// ── tRPC + QR routes loaded separately ───────────────────────────────────────
// Lazy import to isolate any crash to the debug endpoint above
let routesAttached = false;
async function attachRoutes() {
  if (routesAttached) return;
  routesAttached = true;
  try {
    const [
      { default: trpcExpress },
      { appRouter },
      { createContext },
      db,
      { insertScanLog },
    ] = await Promise.all([
      import("@trpc/server/adapters/express"),
      import("../server/routers"),
      import("../server/context"),
      import("../server/db"),
      import("../server/db"),
    ]);

    app.get("/qr/:id", async (req, res) => {
      const paddedId = req.params.id.padStart(3, "0");
      try {
        const qr = await db.getQrCodeByPath(`/qr/${paddedId}`);
        if (!qr) return res.status(404).send("QR code not found.");
        if (!qr.isActive) return res.status(410).send("QR code inactive.");
        if (!qr.destinationUrl) return res.status(503).send("QR code not configured.");

        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || null;
        const ua = req.headers["user-agent"] || "";
        const deviceType = /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : /bot|crawler/i.test(ua) ? "bot" : "desktop";
        res.redirect(302, qr.destinationUrl);

        try {
          await Promise.all([
            db.incrementScanCount(qr.id),
            insertScanLog({ qrCodeId: qr.id, qrNumber: qr.qrNumber, ipAddress: ip, city: null, region: null, country: null, deviceType, userAgent: ua || null, referrer: (req.headers.referer as string) || null }),
          ]);
        } catch {}
      } catch (err) {
        if (!res.headersSent) res.status(500).send("Server error.");
      }
    });

    app.use("/api/trpc", trpcExpress.createExpressMiddleware({ router: appRouter, createContext }));
  } catch (err: any) {
    console.error("[ROUTE ATTACH ERROR]", err?.message ?? err);
  }
}

attachRoutes();

export default app;
