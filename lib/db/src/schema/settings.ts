import { pgTable, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  basePrice: real("base_price").notNull().default(300),
  // Season multipliers
  seasonWinter: real("season_winter").notNull().default(1.25),
  seasonLow: real("season_low").notNull().default(0.85),
  seasonSpring: real("season_spring").notNull().default(0.9),
  seasonSummer: real("season_summer").notNull().default(1.3),
  seasonFall: real("season_fall").notNull().default(1.15),
  // Day multipliers
  dayMonday: real("day_monday").notNull().default(0.95),
  dayTuesday: real("day_tuesday").notNull().default(0.95),
  dayWednesday: real("day_wednesday").notNull().default(0.95),
  dayThursday: real("day_thursday").notNull().default(0.95),
  dayFriday: real("day_friday").notNull().default(1.1),
  daySaturday: real("day_saturday").notNull().default(1.25),
  daySunday: real("day_sunday").notNull().default(1.05),
  // Holiday boosts
  holidayNewYear: real("holiday_new_year").notNull().default(0.5),
  holidayStJean: real("holiday_st_jean").notNull().default(0.35),
  holidayCanadaDay: real("holiday_canada_day").notNull().default(0.35),
  holidayConstruction: real("holiday_construction").notNull().default(0.45),
  holidayLaborDay: real("holiday_labor_day").notNull().default(0.25),
  holidayThanksgiving: real("holiday_thanksgiving").notNull().default(0.25),
  holidayChristmas: real("holiday_christmas").notNull().default(0.6),
});

export const insertSettingsSchema = createInsertSchema(settingsTable);
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
