import { ImageResponse } from "next/og";

// The picture shown when someone shares a Klyve link (WhatsApp, LinkedIn, X,
// Slack...). Used by app/opengraph-image.tsx and app/twitter-image.tsx.
// Built once at build time (no request data), so it costs nothing per visit.
// Same look as the landing page: ivory background, the Soft K seal, and the
// hero headline with its saffron marker.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "Klyve: send emails people are glad to open. Free email marketing through your own provider.";

const C = {
  ivory: "#FBF8F2",
  ink: "#10201B",
  muted: "#52525B",
  badge: "#047857",
  saffron: "#F2B33D",
  marker: "#F7D58C",
};

function Seal({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="32" fill={C.badge} />
      <path d="M23 17V47" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <path
        d="M43 17C33 23 29 27 29 32C29 37 33 41 43 47"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="37.2" cy="32" r="3.4" fill={C.saffron} />
    </svg>
  );
}

export function renderOgImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 84px",
          background: C.ivory,
          color: C.ink,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Seal size={64} />
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.03em" }}>Klyve</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", fontSize: 78, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.08 }}>
          <div>Send emails people are</div>
          <div style={{ display: "flex" }}>
            <div style={{ backgroundImage: `linear-gradient(transparent 58%, ${C.marker} 58%, ${C.marker} 92%, transparent 92%)`, paddingRight: 6 }}>
              glad to open.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 28, color: C.muted }}>
          <div style={{ maxWidth: 820 }}>Free email marketing through your own provider: campaigns, automations and AI help.</div>
          <div style={{ color: C.badge, fontWeight: 700 }}>klyveapp.tech</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
