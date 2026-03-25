import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./context";
import * as db from "./db";
import { insertScanLog } from "./db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

// ── Public QR redirect endpoint ───────────────────────────────────────────────
app.get("/qr/:id", async (req, res) => {
  const id = req.params.id;
  const paddedId = id.padStart(3, "0");

  try {
    const qr = await db.getQrCodeByPath(`/qr/${paddedId}`);

    if (!qr) {
      return res.status(404).send("QR code not found.");
    }

    if (!qr.isActive) {
      return res.status(410).send("This QR code is no longer active.");
    }

    if (!qr.destinationUrl) {
      return res.status(503).send("This QR code has not been configured yet.");
    }

    // Async scan logging — don't block the redirect
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    const ua = req.headers["user-agent"] || "";
    let deviceType = "desktop";
    if (/mobile|android|iphone|ipad|tablet/i.test(ua)) deviceType = "mobile";
    else if (/tablet|ipad/i.test(ua)) deviceType = "tablet";
    else if (/bot|crawler|spider/i.test(ua)) deviceType = "bot";

    // Fire-and-forget geo + log
    (async () => {
      let city: string | null = null;
      let region: string | null = null;
      let country: string | null = null;
      try {
        if (ip && ip !== "::1" && ip !== "127.0.0.1") {
          const geo = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,country`);
          if (geo.ok) {
            const data = await geo.json() as { city?: string; regionName?: string; country?: string };
            city = data.city ?? null;
            region = data.regionName ?? null;
            country = data.country ?? null;
          }
        }
      } catch { /* geo lookup is best-effort */ }

      await Promise.all([
        db.incrementScanCount(qr.id),
        insertScanLog({
          qrCodeId: qr.id,
          qrNumber: qr.qrNumber,
          ipAddress: ip,
          city,
          region,
          country,
          deviceType,
          userAgent: ua || null,
          referrer: (req.headers.referer as string) || null,
        }),
      ]);
    })();

    return res.redirect(302, qr.destinationUrl);
  } catch (err) {
    console.error("[QR Redirect] Error:", err);
    return res.status(500).send("Server error.");
  }
});

// ── tRPC API ──────────────────────────────────────────────────────────────────
app.use(
  "/api/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// ── Serve React frontend in production ────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "../dist/client");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const server = createServer(app);
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
