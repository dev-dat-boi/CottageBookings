import { pgTable, integer, real, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  basePrice: real("base_price").notNull().default(300),
  familyRate: real("family_rate").notNull().default(200),
  dayMonday: real("day_monday").notNull().default(0.95),
  dayTuesday: real("day_tuesday").notNull().default(0.95),
  dayWednesday: real("day_wednesday").notNull().default(0.95),
  dayThursday: real("day_thursday").notNull().default(0.95),
  dayFriday: real("day_friday").notNull().default(1.1),
  daySaturday: real("day_saturday").notNull().default(1.25),
  daySunday: real("day_sunday").notNull().default(1.05),
  seasonsJson: text("seasons_json").notNull().default('[]'),
  holidaysJson: text("holidays_json").notNull().default('[]'),
  holidaysByYearJson: text("holidays_by_year_json").notNull().default('{}'),
  ownersJson: text("owners_json").notNull().default('[]'),
});

export const dayOverridesTable = pgTable("day_overrides", {
  date: text("date").primaryKey(),
  seasonOverride: text("season_override"),
  holidayOverride: text("holiday_override"),
  dayOverride: text("day_override"),
});

export const changeHistoryTable = pgTable("change_history", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  changeType: text("change_type").notNull(),
  description: text("description").notNull(),
  metadata: text("metadata").notNull().default('{}'),
});

export const rentalsTable = pgTable("rentals", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  renterName: text("renter_name").notNull(),
  phone: text("phone").notNull().default(''),
  email: text("email").notNull().default(''),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  nights: integer("nights").notNull().default(0),
  totalPrice: real("total_price").notNull().default(0),
  rateType: text("rate_type").notNull().default('standard'),
  extraDetails: text("extra_details").notNull().default(''),
  status: text("status").notNull().default('submitted'),
});

export const insertSettingsSchema = createInsertSchema(settingsTable);
export const insertDayOverrideSchema = createInsertSchema(dayOverridesTable);
export const insertChangeHistorySchema = createInsertSchema(changeHistoryTable).omit({ id: true, createdAt: true });
export const insertRentalSchema = createInsertSchema(rentalsTable).omit({ id: true, createdAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type InsertDayOverride = z.infer<typeof insertDayOverrideSchema>;
export type InsertChangeHistory = z.infer<typeof insertChangeHistorySchema>;
export type InsertRental = z.infer<typeof insertRentalSchema>;
export type Settings = typeof settingsTable.$inferSelect;
export type DayOverride = typeof dayOverridesTable.$inferSelect;
export type ChangeHistory = typeof changeHistoryTable.$inferSelect;
export type Rental = typeof rentalsTable.$inferSelect;
