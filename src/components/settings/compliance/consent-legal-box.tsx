import Link from "next/link";
import { ScaleIcon, TriangleAlertIcon } from "lucide-react";
import { BRAND } from "@/lib/brand";

// "Consent & legal": the basics of the main anti-spam and privacy laws, in
// plain English. Not legal advice, but enough to know what Klyve does for
// you and what is still your job.

const LAWS = [
  {
    name: "CAN-SPAM (United States)",
    points: [
      "Don't use misleading From names or subject lines.",
      "Include your real postal address in every email.",
      `Give an easy way to unsubscribe and honour it within 10 days. ${BRAND.name} adds the link and does this instantly.`,
    ],
  },
  {
    name: "GDPR (European Union and UK)",
    points: [
      "Only email people who clearly agreed (no pre-ticked boxes, no bought lists).",
      `Be able to prove when and how each person agreed. ${BRAND.name} keeps a consent record for every contact.`,
      "People can ask to see or delete their data. You can export or erase a contact from their page.",
    ],
  },
  {
    name: "DPDP Act (India)",
    points: [
      "Consent must be free, specific and clear, for a stated purpose.",
      "Withdrawing consent must be as easy as giving it: the unsubscribe link and preference page cover this.",
      "Delete personal data once it's no longer needed or the person asks.",
    ],
  },
];

export function ConsentLegalBox({ addressMissing }: { addressMissing: boolean }) {
  return (
    <section className="grid gap-4 rounded-xl border bg-white p-5" aria-labelledby="consent-legal-title">
      <div className="flex items-start gap-3">
        <ScaleIcon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        <div className="grid gap-0.5">
          <h2 id="consent-legal-title" className="font-semibold text-zinc-900">
            Consent &amp; legal
          </h2>
          <p className="text-sm text-zinc-500">
            The basics of the main email laws. This is a summary, not legal advice.
          </p>
        </div>
      </div>

      {addressMissing && (
        <div
          role="alert"
          className="flex gap-2.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-600/20 ring-inset"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <p>
            You haven&apos;t added a postal address yet. Many countries require one in every marketing email.{" "}
            <Link href="/settings/brand" className="font-medium underline underline-offset-2">
              Add it in Settings → Brand
            </Link>
            .
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {LAWS.map((law) => (
          <div key={law.name} className="grid content-start gap-2 rounded-lg bg-zinc-50 p-4">
            <h3 className="text-sm font-medium text-zinc-900">{law.name}</h3>
            <ul className="grid list-disc gap-1.5 pl-4 text-sm text-zinc-600">
              {law.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-sm text-zinc-600">
        Your postal address is shown in your email footers. You can change it in{" "}
        <Link href="/settings/brand" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
          Settings → Brand
        </Link>
        .
      </p>
    </section>
  );
}
