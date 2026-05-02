import { pgTable, integer, real, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
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
  familyRateCode: text("family_rate_code").notNull().default(''),
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
  agreedPrice: real("agreed_price"),
  rateType: text("rate_type").notNull().default('standard'),
  bookingType: text("booking_type").notNull().default('standard'),
  extraDetails: text("extra_details").notNull().default(''),
  status: text("status").notNull().default('pending_approval'),
  confirmationToken: text("confirmation_token").unique(),
});

export const ownerApprovalsTable = pgTable("owner_approvals", {
  id: serial("id").primaryKey(),
  rentalId: integer("rental_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  ownerName: text("owner_name").notNull().default(''),
  approved: boolean("approved").notNull().default(false),
  approvedAt: timestamp("approved_at"),
});

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(''),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default('viewer'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cottageInfoTable = pgTable("cottage_info", {
  id: integer("id").primaryKey().default(1),
  title: text("title").notNull().default('Our Cottage'),
  description: text("description").notNull().default(''),
  photosJson: text("photos_json").notNull().default('[]'),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable);
export const insertDayOverrideSchema = createInsertSchema(dayOverridesTable);
export const insertChangeHistorySchema = createInsertSchema(changeHistoryTable).omit({ id: true, createdAt: true });
export const insertRentalSchema = createInsertSchema(rentalsTable).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export const insertCottageInfoSchema = createInsertSchema(cottageInfoTable).omit({ updatedAt: true });

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type InsertDayOverride = z.infer<typeof insertDayOverrideSchema>;
export type InsertChangeHistory = z.infer<typeof insertChangeHistorySchema>;
export type InsertRental = z.infer<typeof insertRentalSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Settings = typeof settingsTable.$inferSelect;
export type DayOverride = typeof dayOverridesTable.$inferSelect;
export type ChangeHistory = typeof changeHistoryTable.$inferSelect;
export type Rental = typeof rentalsTable.$inferSelect;
export type User = typeof usersTable.$inferSelect;
export type CottageInfo = typeof cottageInfoTable.$inferSelect;
export type OwnerApproval = typeof ownerApprovalsTable.$inferSelect;
