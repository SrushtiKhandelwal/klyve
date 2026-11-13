import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/landing/section-heading";

const POINTS = [
  "API keys you can create and revoke per workspace",
  "Idempotency keys, so a retry never sends twice",
  "Merge tags and saved templates",
  "Delivery logs for every email",
];

// Tiny colour helpers for the code sample (keeps the JSX below readable).
const Key = ({ children }: { children: string }) => <span className="text-sky-300">{children}</span>;
const Str = ({ children }: { children: string }) => <span className="text-emerald-300">{children}</span>;
const Dim = ({ children }: { children: string }) => <span className="text-zinc-500">{children}</span>;

// The "for developers" section with a real request to POST /api/v1/emails.
// The body matches sendEmailInputSchema in src/lib/transactional/schema.ts.
export function Developers() {
  return (
    <section id="developers" aria-labelledby="developers-title" className="scroll-mt-20">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        <div>
          <SectionHeading id="developers-title" eyebrow="For developers" title="A transactional email API" align="left">
            Send receipts, password resets and other one-to-one emails from your app, through the same provider
            and verified senders.
          </SectionHeading>

          <ul className="mt-8 grid gap-3">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-2.5 text-sm leading-6 text-zinc-700">
                <CheckIcon className="mt-1 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>

          <Button
            variant="outline"
            size="lg"
            nativeButton={false}
            render={<Link href="/docs/api" />}
            className="mt-8 h-10 px-4"
          >
            Read the API docs
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </Button>
        </div>

        <figure className="min-w-0 overflow-hidden rounded-2xl bg-zinc-950 shadow-xl shadow-zinc-900/10 ring-1 ring-zinc-900/10">
          <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <span className="flex items-center gap-2 font-mono text-xs">
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-300">POST</span>
              <span className="text-zinc-300">/api/v1/emails</span>
            </span>
            <span className="text-xs text-zinc-500">cURL</span>
          </figcaption>
          {/* tabIndex lets keyboard users scroll the code sideways on small screens. */}
          <pre
            tabIndex={0}
            className="overflow-x-auto p-4 [color-scheme:dark] font-mono text-[13px] leading-6 text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-inset sm:p-5"
          >
            <code>
              {"curl -X POST "}<Str>https://your-klyve-domain/api/v1/emails</Str>{" \\\n"}
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
