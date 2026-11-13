// Ready-to-run code samples for the transactional API, in four languages.
// Used by the public docs (/docs/api) and by the "key created" dialog, so the
// two always show the same thing.
//
// BASE_URL_TOKEN stands for "this Klyve's address". The docs page is static
// (built before anyone knows the domain), so the code components swap the
// token for the browser's current origin once the page runs (see code.tsx).

export const BASE_URL_TOKEN = "__KLYVE_BASE_URL__";
/** Shown until the browser tells us the real address (and in the static HTML). */
export const BASE_URL_PLACEHOLDER = "https://your-klyve-domain";

export type SnippetLang = "curl" | "node" | "python" | "php";

export const SNIPPET_LANGS: { id: SnippetLang; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "node", label: "Node.js" },
  { id: "python", label: "Python" },
  { id: "php", label: "PHP" },
];

/** Replaces the base-URL token with a real origin (or the placeholder). */
export function withBaseUrl(code: string, origin: string | null): string {
  return code.split(BASE_URL_TOKEN).join(origin ?? BASE_URL_PLACEHOLDER);
}

// ── "Send an email" in each language ─────────────────────────────────────────

/** The JSON body the quick start sends. Same in every language. */
const QUICK_BODY = {
  from: "Your Shop <hello@yourshop.com>",
  to: "anita@example.com",
  subject: "Your order has shipped",
  html: "<p>Hi {{ params.name }}, order #{{ params.order_id }} is on its way.</p>",
  params: { name: "Anita", order_id: 1234 },
};

type SendOptions = {
  /** A real key (right after creating one), or null to read it from an env variable. */
  apiKey?: string | null;
  /** Override the example sender, e.g. with the workspace's verified sender. */
  from?: string;
  to?: string;
};

/** Pretty JSON indented by `pad` extra spaces on every line after the first. */
function json(value: unknown, pad = 0): string {
  return JSON.stringify(value, null, 2).replace(/\n/g, `\n${" ".repeat(pad)}`);
}

/** Single-quoted for a shell: ' becomes '\'' so any text is safe inside -d '...'. */
function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** Code that sends one email, in the chosen language. */
export function sendEmailSnippet(lang: SnippetLang, opts: SendOptions = {}): string {
  const body = { ...QUICK_BODY, ...(opts.from ? { from: opts.from } : {}), ...(opts.to ? { to: opts.to } : {}) };
  const url = `${BASE_URL_TOKEN}/api/v1/emails`;
  const key = opts.apiKey ?? null;

  switch (lang) {
    case "curl":
      return [
        `curl -X POST ${url} \\`,
        `  -H "Authorization: Bearer ${key ?? "$KLYVE_API_KEY"}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d ${shellQuote(json(body, 2))}`,
      ].join("\n");

    case "node":
      return [
        `// Node.js 18+ (fetch is built in). Run this on your server, never in a browser.`,
        `const res = await fetch("${url}", {`,
        `  method: "POST",`,
        `  headers: {`,
        `    Authorization: ${key ? `"Bearer ${key}"` : "`Bearer ${process.env.KLYVE_API_KEY}`"},`,
        `    "Content-Type": "application/json",`,
        `  },`,
        `  body: JSON.stringify(${json(body, 2)}),`,
        `});`,
        ``,
        `const data = await res.json();`,
        `if (!res.ok) throw new Error(\`\${data.error.code}: \${data.error.message}\`);`,
        `console.log(data.id, data.status); // e.g. "cm4x...", "queued"`,
      ].join("\n");

    case "python":
      return [
        `import os`,
        `import requests  # pip install requests`,
        ``,
        `res = requests.post(`,
        `    "${url}",`,
        `    headers={"Authorization": ${key ? `"Bearer ${key}"` : `f"Bearer {os.environ['KLYVE_API_KEY']}"`}},`,
        `    json=${pyLiteral(body, 4)},`,
        `    timeout=15,`,
        `)`,
        `data = res.json()`,
        `if not res.ok:`,
        `    raise RuntimeError(f"{data['error']['code']}: {data['error']['message']}")`,
        `print(data["id"], data["status"])  # e.g. cm4x... queued`,
      ].join("\n");

    case "php":
      return [
        `<?php`,
        `$ch = curl_init("${url}");`,
        `curl_setopt_array($ch, [`,
        `    CURLOPT_POST => true,`,
        `    CURLOPT_RETURNTRANSFER => true,`,
        `    CURLOPT_HTTPHEADER => [`,
        `        "Authorization: Bearer " . ${key ? `"${key}"` : `getenv("KLYVE_API_KEY")`},`,
        `        "Content-Type: application/json",`,
        `    ],`,
        `    CURLOPT_POSTFIELDS => json_encode(${phpLiteral(body, 4)}),`,
        `]);`,
        `$data = json_decode(curl_exec($ch), true);`,
        `$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);`,
        `curl_close($ch);`,
        ``,
        `if ($status >= 400) {`,
        `    throw new Exception($data["error"]["code"] . ": " . $data["error"]["message"]);`,
        `}`,
        `echo $data["id"] . " " . $data["status"]; // e.g. cm4x... queued`,
      ].join("\n");
  }
}

// ── Tiny "JSON → Python/PHP literal" printers (only for our sample bodies) ────

function pyLiteral(value: unknown, indent: number): string {
  const pad = " ".repeat(indent);
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => pyLiteral(v, indent)).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  const inner = entries.map(([k, v]) => `${pad}    ${JSON.stringify(k)}: ${pyLiteral(v, indent + 4)},`).join("\n");
  return `{\n${inner}\n${pad}}`;
}

function phpLiteral(value: unknown, indent: number): string {
  const pad = " ".repeat(indent);
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  // Single quotes: PHP won't try to read "$..." or "{...}" inside them.
  if (typeof value === "string") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map((v) => phpLiteral(v, indent)).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  const inner = entries.map(([k, v]) => `${pad}    '${k}' => ${phpLiteral(v, indent + 4)},`).join("\n");
  return `[\n${inner}\n${pad}]`;
}
