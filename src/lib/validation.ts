import { z } from "zod";
import { toMinor } from "@/lib/money";

/** Positive money amount as a canonical decimal string, validated against the org currency. */
export const amountField = (currency: string) =>
  z
    .string()
    .trim()
    .refine((v) => {
      try {
        return toMinor(v, currency) > 0n;
      } catch {
        return false;
      }
    }, "Enter an amount greater than zero")
    .transform((v) => v.replace(/,/g, ""));

/** Non-negative amount (e.g. opening balance, which may be zero). */
export const nonNegativeAmountField = (currency: string) =>
  z
    .string()
    .trim()
    .refine((v) => {
      try {
        return toMinor(v || "0", currency) >= 0n;
      } catch {
        return false;
      }
    }, "Enter a valid amount")
    .transform((v) => (v === "" ? "0" : v.replace(/,/g, "")));

export const uuid = z.string().uuid();
export const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

/** First human-readable validation message, for returning from server actions. */
export const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input";

/** Postgres/Supabase errors → message safe to show. Constraint messages we wrote are already readable. */
export function dbMessage(error: { message: string; code?: string }): string {
  if (error.code === "42501") return "You don't have permission to do that.";
  if (error.code === "23505") return "That already exists.";
  if (error.code === "23514") return error.message.replace(/^.*?: /, "");
  return error.message;
}
