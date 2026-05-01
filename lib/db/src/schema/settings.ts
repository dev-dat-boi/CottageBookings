import { pgTable, integer, real, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  basePrice: real("base_price").notNull().default(300),
  // Day of week multipliers (fixed 7 days)
  dayMonday: real("day_monday").notNull().default(0.95),
  dayTuesday: real("day_tuesday").notNull().default(0.95),
  dayWednesday: real("day_wednesday").notNull().default(0.95),
  dayThursday: real("day_thursday").notNull().default(0.95),
  dayFriday: real("day_friday").notNull().default(1.1),
  daySaturday: real("day_saturday").notNull().default(1.25),
  daySunday: real("day_sunday").notNull().default(1.05),
  // Dynamic seasons and holidays stored as JSON arrays
  seasonsJson: text("seasons_json").notNull().default('[]'),
  holidaysJson: text("holidays_json").notNull().default('[]'),
});

export const dayOverridesTable = pgTable("day_overrides", {
  date: text("date").primaryKey(), // YYYY-MM-DD
  seasonOverride: text("season_override"),
  holidayOverride: text("holiday_override"),
  dayOverride: text("day_override"),
});

export const insertSettingsSchema = createInsertSchema(settingsTable);
export const insertDayOverrideSchema = createInsertSchema(dayOverridesTable);
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type InsertDayOverride = z.infer<typeof insertDayOverrideSchema>;
export type Settings = typeof settingsTable.$inferSelect;
export type DayOverride = typeof dayOverridesTable.$inferSelect;
