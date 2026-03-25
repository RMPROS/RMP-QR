import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("Running migrations...");

  await sql`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id SERIAL PRIMARY KEY,
      qr_number INTEGER NOT NULL UNIQUE,
      redirect_path VARCHAR(100) NOT NULL UNIQUE,
      destination_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      scan_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scan_logs (
      id SERIAL PRIMARY KEY,
      qr_code_id INTEGER NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
      qr_number INTEGER NOT NULL,
      ip_address VARCHAR(64),
      city VARCHAR(128),
      region VARCHAR(128),
      country VARCHAR(64),
      device_type VARCHAR(32),
      user_agent TEXT,
      referrer TEXT,
      scanned_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `;

  // Indexes for fast redirect lookups and sort performance
  await sql`
    CREATE INDEX IF NOT EXISTS qr_codes_redirect_path_idx ON qr_codes (redirect_path)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS qr_codes_scan_count_idx ON qr_codes (scan_count DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS scan_logs_qr_code_id_idx ON scan_logs (qr_code_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS scan_logs_scanned_at_idx ON scan_logs (scanned_at DESC)
  `;

  console.log("Migrations complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
