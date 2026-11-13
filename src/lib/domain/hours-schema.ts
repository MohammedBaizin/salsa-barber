/** Weekly hours validation (mirrors app.valid_weekly_hours() in SQL). Server and dashboard code only. */
import { z } from "zod";
import { WEEKDAYS } from "./hours";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30");

export const dayHoursSchema = z
  .object({ open: hhmm, close: hhmm })
  .strict()
  .refine((d) => d.close > d.open, { message: "Closing time must be after opening time", path: ["close"] })
  .nullable();

export const weeklyHoursSchema = z.partialRecord(z.enum(WEEKDAYS), dayHoursSchema);
