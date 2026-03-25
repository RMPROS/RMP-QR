import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function seed() {
  console.log("Seeding 500 QR codes...");

  const values = Array.from({ length: 500 }, (_, i) => {
    const num = i + 1;
    const padded = String(num).padStart(3, "0");
    return `(${num}, '/qr/${padded}')`;
  }).join(",\n");

  await sql.query(`
    INSERT INTO qr_codes (qr_number, redirect_path)
    VALUES ${values}
    ON CONFLICT (qr_number) DO NOTHING
  `);

  console.log("Seeded 500 QR codes successfully.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
