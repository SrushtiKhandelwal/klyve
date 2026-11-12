import { SOCIAL_NETWORK_LABELS, type BrandFormValues } from "./brand-values";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const color = (value: string, fallback: string) => (HEX.test(value) ? value : fallback);

/**
 * A tiny email drawn with plain inline styles, so it looks like what readers
 * will get (email apps only understand simple styles, not our Tailwind classes).
 * Updates live while the brand form is edited.
 */
export function BrandPreview({ values }: { values: BrandFormValues }) {
  const primary = color(values.primaryColor, "#059669");
  const secondary = color(values.secondaryColor, "#0f172a");
  const background = color(values.backgroundColor, "#f4f4f5");
  const text = color(values.textColor, "#27272a");
  const company = values.companyName.trim() || "Your company";
  const address = values.address.trim() || "Your street, City, Country";
  const socials = Object.entries(values.socialLinks).filter(([, url]) => url.trim());

  return (
    <div
      aria-label="Preview of an email in your brand"
      role="img"
      style={{ backgroundColor: background, padding: 16, borderRadius: 12, fontFamily: values.fontFamily }}
    >
      <div style={{ backgroundColor: "#ffffff", borderRadius: 8, overflow: "hidden", maxWidth: 420, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
          {values.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={values.logoUrl} alt="" style={{ maxHeight: 40, maxWidth: 160, display: "inline-block" }} />
          ) : (
            <span style={{ fontSize: 18, fontWeight: 700, color: secondary }}>{company}</span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "20px 20px 8px" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: secondary, lineHeight: 1.3 }}>Hello there!</div>
          <p style={{ fontSize: 14, color: text, lineHeight: 1.6, margin: "8px 0 0" }}>
            This is how your emails will look. Headings use your secondary colour, text uses your text colour and{" "}
            <span style={{ color: primary, textDecoration: "underline" }}>links</span> use your primary colour.
          </p>
          <div style={{ textAlign: "center", padding: "18px 0 12px" }}>
            <span
              style={{
                display: "inline-block",
                backgroundColor: primary,
                color: "#ffffff",
                padding: "10px 20px",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Shop now
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px 18px", textAlign: "center", fontSize: 11, color: "#71717a", lineHeight: 1.6 }}>
          {socials.length > 0 && (
            <div style={{ marginBottom: 6, color: primary }}>
              {socials.map(([network]) => SOCIAL_NETWORK_LABELS[network as keyof typeof SOCIAL_NETWORK_LABELS]).join(" · ")}
            </div>
          )}
          <div style={{ whiteSpace: "pre-line" }}>
            {company} · {address}
          </div>
          <div>
            You received this email because you signed up with us.{" "}
            <span style={{ textDecoration: "underline" }}>Unsubscribe</span>
          </div>
        </div>
      </div>
    </div>
  );
}
