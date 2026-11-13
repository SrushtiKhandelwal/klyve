import { CheckIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { CtaLink } from "@/components/landing/cta-link";
import { SectionHeading } from "@/components/landing/section-heading";

const POINTS = [
  "API keys you can create and revoke per workspace",
  "Idempotency keys, so a retry never sends twice",
  "Merge tags and saved templates",
  "A delivery log for every email",
];

// Tiny colour helpers for the code sample (keeps the JSX below readable).
const Key = ({ children }: { children: string }) => <span className="text-sky-800">{children}</span>;
const Str = ({ children }: { children: string }) => <span className="text-emerald-700">{children}</span>;
const Dim = ({ children }: { children: string }) => <span className="text-zinc-500">{children}</span>;

// The "for developers" section, with a real request to POST /api/v1/emails.
// The body matches sendEmailInputSchema in src/lib/transactional/schema.ts.
export function Developers() {
  return (
    <section id="developers" aria-labelledby="developers-title" className="scroll-mt-16 border-t border-zinc-200/70">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
        <div>
          <SectionHeading id="developers-title" eyebrow="For developers" title="Transactional email, through the same pipes">
            Send receipts, password resets and notifications from your app with one clean API call, through the
            provider and verified senders you already use.
          </SectionHeading>

          <ul className="mt-8 grid gap-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[15px] leading-6 text-zinc-700">
                <Glyph icon={CheckIcon} size="sm" strokeWidth={2.25} className="mt-1" />
                {point}
              </li>
            ))}
          </ul>

          <CtaLink href="/docs/api" variant="outline" arrow className="mt-10">
            Read the API docs
          </CtaLink>
        </div>

        <figure className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04),0_20px_48px_-24px_rgb(0_0_0/0.16)]">
          <figcaption className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <span className="flex items-center gap-2.5 font-mono text-xs">
              <span className="font-semibold text-emerald-700">POST</span>
              <span className="text-zinc-700">/api/v1/emails</span>
              <span className="sr-only">: an example request, in cURL</span>
            </span>
            <span aria-hidden="true" className="text-xs text-zinc-500">
              cURL
            </span>
          </figcaption>
          {/* tabIndex lets keyboard users scroll the code sideways on small screens. */}
          <pre
            tabIndex={0}
            className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-zinc-800 outline-none focus-visible:ring-3 focus-visible:ring-emerald-600/40 focus-visible:ring-inset sm:p-5"
          >
            <code>
              {"curl -X POST "}<Str>https://klyveapp.tech/api/v1/emails</Str>{" \\\n"}
              {"  -H "}<Str>{'"Authorization: Bearer $KLYVE_API_KEY"'}</Str>{" \\\n"}
              {"  -H "}<Str>{'"Content-Type: application/json"'}</Str>{" \\\n"}
              {"  -H "}<Str>{'"Idempotency-Key: order-1234-shipped"'}</Str>{" \\\n"}
              {"  -d '{\n"}
              {"    "}<Key>{'"from"'}</Key>{": "}<Str>{'"Your Shop <hello@yourshop.com>"'}</Str>{",\n"}
              {"    "}<Key>{'"to"'}</Key>{": "}<Str>{'"anita@example.com"'}</Str>{",\n"}
              {"    "}<Key>{'"subject"'}</Key>{": "}<Str>{'"Your order has shipped"'}</Str>{",\n"}
              {"    "}<Key>{'"html"'}</Key>{": "}<Str>{'"<p>Hi {{ params.name }}, it is on the way!</p>"'}</Str>{",\n"}
              {"    "}<Key>{'"params"'}</Key>{": { "}<Key>{'"name"'}</Key>{": "}<Str>{'"Anita"'}</Str>{" }\n"}
              {"  }'\n"}
              {"\n"}
              <Dim>{"# 202 Accepted"}</Dim>{"\n"}
              <Dim>{'# { "id": "cm4x8b2k...", "status": "queued", ... }'}</Dim>
            </code>
          </pre>
        </figure>
      </div>
    </section>
  );
}
