import { Suspense } from "react";
import { connection } from "next/server";
import { ContactEmailLink } from "@/components/landing/contact-email-link";

// The owner's contact address, from the CONTACT_EMAIL environment variable
// (never written in the code: the repository is public). When it's empty or
// not an email address, every contact bit on the site is simply left out.
//
// The landing page is prerendered, and a value read during prerendering would
// be frozen at build time. `await connection()` makes these small pieces read
// the variable when someone visits instead (the rest of the page stays
// prerendered), so changing CONTACT_EMAIL only needs a restart, not a rebuild.

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** The address, reversed and base64-encoded (decoded in the browser), or null. */
async function contactCode(): Promise<string | null> {
  await connection();
  const email = (process.env.CONTACT_EMAIL ?? "").trim();
  if (!EMAIL_RE.test(email)) return null;
  return Buffer.from([...email].reverse().join(""), "utf8").toString("base64");
}

const linkClass =
  "rounded-sm font-medium text-emerald-700 underline underline-offset-4 outline-none [overflow-wrap:anywhere] hover:text-emerald-800 focus-visible:ring-3 focus-visible:ring-emerald-600/40";

/** "Questions? Email us" + the address, for the footer. */
export function FooterContact() {
  return (
    <Suspense fallback={null}>
      <FooterContactInner />
    </Suspense>
  );
}

async function FooterContactInner() {
  const code = await contactCode();
  if (!code) return null;
  return (
    <div className="mt-6 text-sm leading-6">
      <p className="text-zinc-600">Questions? Email us</p>
      <p>
        <ContactEmailLink code={code} className={linkClass} />
      </p>
    </div>
  );
}

/** "Still have a question? Email us at …", for the end of the FAQ. */
export function FaqContact() {
  return (
    <Suspense fallback={null}>
      <FaqContactInner />
    </Suspense>
  );
}

async function FaqContactInner() {
  const code = await contactCode();
  if (!code) return null;
  return (
    <p className="mt-8 text-[15px] leading-7 text-zinc-600">
      Still have a question?{" "}
      <ContactEmailLink code={code} before="Email us at " after="." fallback="Email us." className={linkClass} />
    </p>
  );
}
