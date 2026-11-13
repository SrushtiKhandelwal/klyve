// What the hosted form's Server Action sends back to the page.
// A separate file because a "use server" file may only export functions.

export type HostedFormState =
  /** Nothing submitted yet. */
  | { status: "idle" }
  /** Something needs fixing. `values` re-fills the inputs. */
  | {
      status: "error";
      errors: Record<string, string>;
      values: Record<string, string>;
      /** A fresh signed timestamp, when the old one had expired. */
      ts?: string;
      /** The embedding page's address, carried over (see page.tsx). */
      src?: string;
    }
  /**
   * Signed up (or quietly ignored: the answer is always the same).
   * `continueUrl` is only set inside an iframe, where we can't redirect the
   * whole page from the server.
   */
  | { status: "success"; continueUrl: string | null };

export const IDLE_STATE: HostedFormState = { status: "idle" };
