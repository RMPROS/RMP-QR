import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const qrCodes = pgTable(
  "qr_codes",
  {
    id: serial("id").primaryKey(),
    qrNumber: integer("qr_number").notNull().unique(),
    redirectPath: varchar("redirect_path", { length: 100 }).notNull().unique(),
    destinationUrl: text("destination_url"),
    isActive: boolean("is_active").notNull().default(true),
    scanCount: integer("scan_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // redirect_path is queried on every QR scan — needs an index
    index("qr_codes_redirect_path_idx").on(table.redirectPath),
    // scan_count is used for top-performers sort
    index("qr_codes_scan_count_idx").on(table.scanCount),
  ]
);

export const scanLogs = pgTable(
  "scan_logs",
  {
    id: serial("id").primaryKey(),
    qrCodeId: integer("qr_code_id")
      .notNull()
      .references(() => qrCodes.id, { onDelete: "cascade" }),
    qrNumber: integer("qr_number").notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    city: varchar("city", { length: 128 }),
    region: varchar("region", { length: 128 }),
    country: varchar("country", { length: 64 }),
    deviceType: varchar("device_type", { length: 32 }),
    userAgent: text("user_agent"),
    referrer: text("referrer"),
    scannedAt: timestamp("scanned_at").defaultNow().notNull(),
  },
  (table) => [
    // qrCodeId is the primary scan log lookup
    index("scan_logs_qr_code_id_idx").on(table.qrCodeId),
    // scannedAt is used for ordering all scan history
    index("scan_logs_scanned_at_idx").on(table.scannedAt),
  ]
);

export type QrCode = typeof qrCodes.$inferSelect;
export type InsertQrCode = typeof qrCodes.$inferInsert;
export type ScanLog = typeof scanLogs.$inferSelect;
export type InsertScanLog = typeof scanLogs.$inferInsert;
