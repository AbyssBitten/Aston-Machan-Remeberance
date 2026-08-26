import { index, pgTable, serial, smallint, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * A single act of remembering Aston Machan.
 *
 * PRIVACY: the visitor's IP address is used only at request time to resolve the
 * country the remembrance came from. It is never written to the database, never
 * hashed, and never logged. Only the country + a timestamp survive.
 */
export const remembrances = pgTable(
  "remembrances",
  {
    id: serial("id").primaryKey(),
    countryCode: varchar("country_code", { length: 8 }).notNull(),
    countryName: text("country_name").notNull(),
    region: text("region").notNull().default(""),
    flag: text("flag").notNull().default(""),
    /** Coarse 1°x1° bucket derived from the geo lookup — no address is recoverable. */
    precision: smallint("precision").notNull().default(0),
    rememberedAt: timestamp("remembered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("remembrances_remembered_at_idx").on(table.rememberedAt),
    index("remembrances_country_idx").on(table.countryCode),
  ],
);

export type Remembrance = typeof remembrances.$inferSelect;
export type NewRemembrance = typeof remembrances.$inferInsert;
