import "server-only";
import { db } from "@/lib/db";

// Database helpers for the Fields page and its Server Actions.
// They take a workspaceId, so ONLY pass the id from requireActiveWorkspace().

export type AttributeUsage = {
  /** Field key → how many contacts have a (non-empty) value for it. */
  contactCounts: Map<string, number>;
  /** Field key → how many saved segments use it in a condition. */
  segmentCounts: Map<string, number>;
};

/** How much each custom field is used, for the whole workspace, in two queries. */
export async function getAttributeUsage(workspaceId: string): Promise<AttributeUsage> {
  const [contactRows, segmentRows] = await Promise.all([
    // Look at every key/value pair in every contact's attributes and count
    // the keys whose value isn't empty (JSON null or blank text).
    db.$queryRaw<{ key: string; count: number }[]>`
      SELECT e.key, count(*)::int AS count
      FROM contact c,
        jsonb_each(
          CASE WHEN jsonb_typeof(c.attributes) = 'object' THEN c.attributes ELSE '{}'::jsonb END
        ) AS e(key, value)
      WHERE c."workspaceId" = ${workspaceId}
        AND e.value <> 'null'::jsonb
        AND NOT (jsonb_typeof(e.value) = 'string' AND btrim(e.value #>> '{}') = '')
      GROUP BY e.key
    `,
    // Same idea for segments: look inside each segment's list of conditions.
    db.$queryRaw<{ key: string; count: number }[]>`
      SELECT cond ->> 'key' AS key, count(DISTINCT s.id)::int AS count
      FROM segment s,
        jsonb_array_elements(
          CASE WHEN jsonb_typeof(s.rules -> 'conditions') = 'array'
            THEN s.rules -> 'conditions' ELSE '[]'::jsonb END
        ) AS cond
      WHERE s."workspaceId" = ${workspaceId}
        AND cond ->> 'field' = 'attribute'
      GROUP BY 1
    `,
  ]);

  return {
    contactCounts: new Map(contactRows.map((r) => [r.key, r.count])),
    segmentCounts: new Map(segmentRows.map((r) => [r.key, r.count])),
  };
}

/** How many contacts have each built-in field filled in (keys match BUILTIN_FIELDS). */
export async function getBuiltinFieldCounts(workspaceId: string): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ email: number; first: number; last: number }[]>`
    SELECT
      count(*)::int AS email,
      count(*) FILTER (WHERE btrim(coalesce(c."firstName", '')) <> '')::int AS first,
      count(*) FILTER (WHERE btrim(coalesce(c."lastName", '')) <> '')::int AS last
    FROM contact c
    WHERE c."workspaceId" = ${workspaceId}
  `;
  const row = rows[0] ?? { email: 0, first: 0, last: 0 };
  return new Map([
    ["EMAIL", row.email],
    ["FIRSTNAME", row.first],
    ["LASTNAME", row.last],
  ]);
}

/**
 * Deletes a custom field AND removes its value from every contact in the
 * workspace. Both happen in one transaction: either both or neither.
 * Returns false if the field doesn't exist in this workspace.
 */
export async function deleteAttributeEverywhere(
  workspaceId: string,
  attributeId: string,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    // Scoped by workspaceId, so an id from another workspace finds nothing.
    const attribute = await tx.contactAttribute.findFirst({
      where: { id: attributeId, workspaceId },
      select: { id: true, key: true },
    });
    if (!attribute) return false;

    await tx.contactAttribute.delete({ where: { id: attribute.id } });

    // One statement for all contacts. `attributes - key` returns the JSON
    // without that key. The key is a bound parameter, never pasted into SQL.
    await tx.$executeRaw`
      UPDATE contact
      SET attributes = attributes - ${attribute.key}::text,
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE "workspaceId" = ${workspaceId}
        AND attributes -> ${attribute.key}::text IS NOT NULL
    `;
    return true;
  });
}
