import { z } from "zod";

// Query string pieces several list endpoints share.

/** ?limit=1…100 (default 20). */
export const limitParam = z.coerce
  .number({ error: "limit must be a number." })
  .int("limit must be a whole number.")
  .min(1, "limit must be between 1 and 100.")
  .max(100, "limit must be between 1 and 100.")
  .default(20);

/** ?cursor=… : the `nextCursor` of the previous page. */
export const cursorParam = z.string().trim().min(1).max(200).optional();

/** Ids we generate (cuid) are short letters/digits; anything else can't exist. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
