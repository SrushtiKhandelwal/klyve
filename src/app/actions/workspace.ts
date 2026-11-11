"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import {
  createWorkspaceForUser,
  findMembership,
  setActiveWorkspaceCookie,
} from "@/lib/workspace";

// Server Actions are public endpoints: anyone can call them with any input.
// So every action below re-checks who is logged in and validates its input,
// even if the page that shows the form already did.

const CreateWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Workspace name must be at least 2 characters.")
    .max(50, "Workspace name must be 50 characters or fewer."),
});

/** What the onboarding form gets back when something is wrong. */
export type CreateWorkspaceState =
  | {
      errors?: { name?: string[] };
      message?: string;
      // Sent back so the form keeps what the user typed.
      values?: { name: string };
      // true once the workspace exists; the form then opens the dashboard.
      success?: boolean;
    }
  | undefined;

export async function createWorkspace(
  _prevState: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const user = await requireUser();

  const rawName = formData.get("name");
  const typedName = typeof rawName === "string" ? rawName : "";
  const parsed = CreateWorkspaceSchema.safeParse({ name: typedName });

  if (!parsed.success) {
    return {
      errors: z.flattenError(parsed.error).fieldErrors,
      values: { name: typedName },
    };
  }

  let workspaceId: string;
  try {
    const workspace = await createWorkspaceForUser(user.id, parsed.data.name);
    workspaceId = workspace.id;
  } catch (error) {
    console.error("createWorkspace failed:", error);
    return {
      message: "Something went wrong creating your workspace. Please try again.",
      values: { name: typedName },
    };
  }

  // Make the new workspace the selected one, then go to it.
  await setActiveWorkspaceCookie(workspaceId);
  // We report success and let the form do a FULL page load of /dashboard.
  // Why not redirect() here? The browser may still hold an old cached copy of
  // /dashboard from before this workspace existed (one that says "go to
  // onboarding"), and a client-side redirect can reuse it and bounce the user
  // straight back here. A full page load always asks the server fresh.
  return { success: true };
}

export type SwitchWorkspaceResult = { ok: true } | { ok: false; error: string };

export async function switchWorkspace(
  workspaceId: string,
): Promise<SwitchWorkspaceResult> {
  const user = await requireUser();

  // The id comes from the browser, so treat it as untrusted.
  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return { ok: false, error: "Invalid workspace." };
  }

  // Only allow switching to a workspace this user really belongs to.
  // We give the same answer whether the workspace doesn't exist or belongs to
  // someone else, so nobody can probe for other people's workspace ids.
  const workspace = await findMembership(user.id, workspaceId);
  if (!workspace) {
    return { ok: false, error: "Workspace not found." };
  }

  // Re-render with the new workspace, and drop cached copies of other pages
  // that still show the old one.
  await setActiveWorkspaceCookie(workspace.id);
  refresh();
  return { ok: true };
}
