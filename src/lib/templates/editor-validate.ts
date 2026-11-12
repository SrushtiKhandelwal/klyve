// Turns schema errors into friendly messages that say WHERE the problem is
// ("Row 2 › Button: Buttons need a label."), and which item to select so the
// user can fix it in one click.
import { emailDocumentSchema, type BlockType, type EmailDocument } from "@/lib/templates/document";

export type DocumentProblem = {
  message: string;
  /** Where to jump to fix it (null = the email settings). */
  target: { kind: "block" | "column" | "section"; id: string } | null;
};

const BLOCK_NAMES: Record<BlockType, string> = {
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  divider: "Divider",
  spacer: "Spacer",
  social: "Social links",
  video: "Video",
  html: "HTML",
  footer: "Footer",
};

/** Validates a document. Returns [] when it's fine to save. */
export function validateDocument(doc: EmailDocument): DocumentProblem[] {
  const result = emailDocumentSchema.safeParse(doc);
  if (result.success) return [];

  const problems: DocumentProblem[] = [];
  const seen = new Set<string>();
  for (const issue of result.error.issues) {
    const path = issue.path;
    const where: string[] = [];
    let target: DocumentProblem["target"] = null;

    if (path[0] === "sections" && typeof path[1] === "number") {
      const section = doc.sections[path[1]];
      where.push(`Row ${path[1] + 1}`);
      if (section) target = { kind: "section", id: section.id };
      if (section && path[2] === "columns" && typeof path[3] === "number") {
        const column = section.columns[path[3]];
        if (section.columns.length > 1) where.push(`Column ${path[3] + 1}`);
        if (column) target = { kind: "column", id: column.id };
        if (column && path[4] === "blocks" && typeof path[5] === "number") {
          const block = column.blocks[path[5]];
          if (block) {
            where.push(BLOCK_NAMES[block.type] ?? "Block");
            target = { kind: "block", id: block.id };
          }
        }
      }
    } else if (path[0] === "settings") {
      where.push("Email settings");
    }

    const message = `${where.length ? `${where.join(" › ")}: ` : ""}${issue.message}`;
    if (seen.has(message)) continue;
    seen.add(message);
    problems.push({ message, target });
  }
  return problems;
}
