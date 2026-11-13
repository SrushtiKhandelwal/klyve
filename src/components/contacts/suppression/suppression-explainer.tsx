import { Info } from "lucide-react";

/** "What is this page?": suppression vs unsubscribed, and what's added automatically. */
export function SuppressionExplainer() {
  return (
    <section
      aria-labelledby="suppression-explainer-heading"
      className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-950"
    >
      <Info className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
      <div className="flex min-w-0 flex-col gap-2">
        <h2 id="suppression-explainer-heading" className="font-medium text-emerald-900">
          How the suppression list works
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-emerald-900/90">
          <li>
            Addresses here are <strong>never emailed</strong> by this workspace, even if they are in a list,
            are imported again, or were deleted as contacts.
          </li>
          <li>
            <strong>Unsubscribed contacts</strong> are different: they also get no campaigns, but they can
            subscribe again themselves (for example through the preference centre). A suppressed address
            can&apos;t come back until someone removes it here.
          </li>
          <li>
            <strong>Hard bounces</strong> (the address doesn&apos;t exist) and <strong>spam complaints</strong>{" "}
            are added automatically. People who asked to be forgotten (GDPR) are kept only as a fingerprint,
            never as their address.
          </li>
        </ul>
      </div>
    </section>
  );
}
