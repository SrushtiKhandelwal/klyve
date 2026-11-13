import type { CSSProperties, JSX } from "react";
import { HONEYPOT_FIELD, type FormConfig, type FormField } from "@/lib/forms/schema";

// The sign-up form itself, exactly as visitors see it.
//
// Used in three places, so it must work everywhere:
//  - the public form page (/f/<publicId>), also shown inside other websites'
//    <iframe>s: a plain HTML <form method="post"> that works WITHOUT JavaScript;
//  - the live preview in the form builder (a client component);
//  - the small previews on the /forms page.
// That's why there are no hooks, no event handlers and no external fonts here:
// it's a pure function of its props. All text goes through React, which
// escapes it, so a form title like "<script>" shows up as text, never as code.

export type AttributeKind = "TEXT" | "NUMBER" | "DATE" | "BOOLEAN";

export type FormViewProps = {
  config: FormConfig;
  brand: { name: string; logoUrl: string | null };
  /** Where the form posts to (URL), or a Server Action. */
  action?: string | ((formData: FormData) => void | Promise<void>);
  /** Extra hidden inputs, e.g. the signed "shown at" timestamp. */
  hiddenFields?: Record<string, string>;
  /** Field target ("EMAIL", "attr:CITY", "consent") → message. "_form" = a message for the whole form. */
  errors?: Record<string, string>;
  /** Values to put back in the inputs after a failed submit. Key = field target ("consent" = "yes"). */
  values?: Record<string, string>;
  /** Preview mode: everything shows but nothing can be typed or submitted. */
  disabled?: boolean;
  /** Custom field types, keyed by attribute key ("CITY") or target ("attr:CITY"). Unknown = text. */
  attributeTypes?: Record<string, AttributeKind>;
  /**
   * Prefix for the element ids that tie labels to inputs. Only needed when
   * several forms are on one page (e.g. the /forms list), so ids stay unique.
   */
  idPrefix?: string;
};

export function FormView({
  config,
  brand,
  action,
  hiddenFields,
  errors,
  values,
  disabled = false,
  attributeTypes,
  idPrefix = "kf",
}: FormViewProps): JSX.Element {
  const { style } = config;
  const formError = errors?._form;
  const consentRequired = config.consentText.trim().length > 0;
  const consentError = errors?.consent;
  const ids = (suffix: string) => `${idPrefix}-${suffix.replace(/[^A-Za-z0-9_-]/g, "-")}`;

  // The colours come from the (validated) config and are handed to the CSS
  // below as variables, so focus rings and hovers can use them too.
  const vars = {
    "--kf-accent": style.accentColor,
    "--kf-on-accent": readableTextOn(style.accentColor),
    "--kf-bg": style.backgroundColor,
    "--kf-text": style.textColor,
  } as CSSProperties;

  const showBrand = style.showLogo && (brand.logoUrl || brand.name.trim());

  return (
    <div className={`kf-root kf-${style.layout === "plain" ? "plain" : "card"}`} style={vars}>
      {/* Static CSS (no user input inside), scoped to .kf-root. */}
      <style dangerouslySetInnerHTML={{ __html: FORM_CSS }} />
      <form
        className="kf-form"
        // In preview mode the form has nowhere to go (and the fieldset below is disabled).
        method={disabled ? undefined : "post"}
        action={disabled ? undefined : action}
        aria-labelledby={config.title ? ids("title") : undefined}
      >
        {showBrand && (
          <div className="kf-brand">
            {brand.logoUrl ? (
              // A plain <img>: next/image needs JavaScript and our own domain.
              // eslint-disable-next-line @next/next/no-img-element
              <img className="kf-logo" src={brand.logoUrl} alt={brand.name || "Logo"} />
            ) : (
              <span className="kf-company">{brand.name}</span>
            )}
          </div>
        )}

        {config.title && (
          <h2 id={ids("title")} className="kf-title">
            {config.title}
          </h2>
        )}
        {config.description && <p className="kf-desc">{config.description}</p>}

        {formError && (
          <p className="kf-alert" role="alert">
            {formError}
          </p>
        )}

        {/* A disabled fieldset disables every input and the button in one go (preview mode). */}
        <fieldset className="kf-fieldset" disabled={disabled}>
          {config.fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              id={ids(field.target)}
              error={errors?.[field.target]}
              value={values?.[field.target]}
              kind={fieldKind(field, attributeTypes)}
            />
          ))}

          {consentRequired && (
            <div className="kf-row">
              <label className="kf-consent">
                <input
                  className="kf-check"
                  type="checkbox"
                  name="consent"
                  value="yes"
                  required
                  defaultChecked={values?.consent === "yes"}
                  aria-invalid={consentError ? true : undefined}
                  aria-describedby={consentError ? ids("consent-error") : undefined}
                />
                <span>{config.consentText}</span>
              </label>
              {consentError && (
                <p id={ids("consent-error")} className="kf-error">
                  {consentError}
                </p>
              )}
            </div>
          )}

          {/*
            Honeypot: a field real people never see or fill in, but form-filling
            bots do. Moved off-screen with CSS (not display:none, which some bots
            check for), skipped by Tab and hidden from screen readers.
          */}
          <div className="kf-hp" aria-hidden="true">
            <label htmlFor={ids("hp")}>Website</label>
            <input id={ids("hp")} type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>

          {hiddenFields &&
            Object.entries(hiddenFields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}

          <button className="kf-button" type="submit">
            {config.buttonLabel}
          </button>
        </fieldset>

        <p className="kf-fine">
          We&apos;ll only email you about {brand.name || "us"}. Unsubscribe anytime.
        </p>
      </form>
    </div>
  );
}

// ── One input ───────────────────────────────────────────────────────────────

type Kind = "email" | "text" | "number" | "date" | "boolean";

function FieldRow({
  field,
  id,
  error,
  value,
  kind,
}: {
  field: FormField;
  id: string;
  error?: string;
  value?: string;
  kind: Kind;
}) {
  const errorId = `${id}-error`;
  const common = {
    id,
    name: field.target,
    required: field.required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  } as const;

  return (
    <div className="kf-row">
      <label className="kf-label" htmlFor={id}>
        {field.label}
        {field.required && (
          <span className="kf-req" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {kind === "boolean" ? (
        <select className="kf-input" {...common} defaultValue={normalizeYesNo(value)}>
          <option value="">{field.placeholder || "Choose…"}</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      ) : (
        <input
          className="kf-input"
          {...common}
          type={kind}
          placeholder={kind === "date" ? undefined : field.placeholder || undefined}
          defaultValue={value ?? ""}
          autoComplete={autocompleteFor(field.target)}
          inputMode={kind === "number" ? "decimal" : undefined}
          step={kind === "number" ? "any" : undefined}
          maxLength={kind === "email" ? 254 : kind === "text" ? 1000 : undefined}
          spellCheck={kind === "email" ? false : undefined}
        />
      )}
      {error && (
        <p id={errorId} className="kf-error">
          {error}
        </p>
      )}
    </div>
  );
}

function fieldKind(field: FormField, attributeTypes?: Record<string, AttributeKind>): Kind {
  if (field.target === "EMAIL") return "email";
  if (!field.target.startsWith("attr:")) return "text";
  const key = field.target.slice(5);
  const type = attributeTypes?.[field.target] ?? attributeTypes?.[key];
  if (type === "NUMBER") return "number";
  if (type === "DATE") return "date";
  if (type === "BOOLEAN") return "boolean";
  return "text";
}

function normalizeYesNo(value: string | undefined): string {
  const v = (value ?? "").trim().toLowerCase();
  if (["yes", "true", "y", "1"].includes(v)) return "yes";
  if (["no", "false", "n", "0"].includes(v)) return "no";
  return "";
}

/** Browser autofill hints, so phones can fill the form in one tap. */
function autocompleteFor(target: string): string {
  if (target === "EMAIL") return "email";
  if (target === "FIRSTNAME") return "given-name";
  if (target === "LASTNAME") return "family-name";
  const key = target.slice(5);
  if (/PHONE|MOBILE|WHATSAPP/.test(key)) return "tel";
  if (/^(COMPANY|ORGANI[SZ]ATION)$/.test(key)) return "organization";
  if (/^CITY$/.test(key)) return "address-level2";
  if (/^COUNTRY$/.test(key)) return "country-name";
  if (/^(ZIP|POSTCODE|POSTAL_CODE|PINCODE|PIN_CODE)$/.test(key)) return "postal-code";
  if (/^(BIRTHDAY|BIRTHDATE|DOB|DATE_OF_BIRTH)$/.test(key)) return "bday";
  return "off";
}

/**
 * White or near-black text, whichever reads well on the given colour
 * (uses the WCAG "relative luminance" formula).
 */
export function readableTextOn(hex: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // White text unless it would be hard to read (contrast below 3:1), e.g. on
  // yellow or light grey. Brand colours like emerald keep their white text.
  return 1.05 / (luminance + 0.05) >= 3 ? "#ffffff" : "#111111";
}

// ── Styles ──────────────────────────────────────────────────────────────────
// Plain CSS so the form looks the same on the public page, inside an iframe on
// someone's website and in the dashboard (where it wins over Tailwind's base
// styles because those live in a CSS layer). System fonts only.

const FORM_CSS = `
.kf-root{position:relative;box-sizing:border-box;width:100%;max-width:480px;margin:0 auto;color:var(--kf-text);background:var(--kf-bg);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:16px;line-height:1.5;text-align:left}
.kf-root *,.kf-root *::before,.kf-root *::after{box-sizing:border-box}
.kf-card{border:1px solid color-mix(in srgb,var(--kf-text) 12%,transparent);border-radius:16px;
  box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.06);padding:28px 24px}
.kf-plain{padding:8px 4px}
.kf-form{margin:0}
.kf-brand{margin:0 0 16px}
.kf-logo{display:block;max-height:44px;max-width:180px;width:auto;height:auto}
.kf-company{font-weight:600;font-size:15px;letter-spacing:.01em}
.kf-title{margin:0 0 6px;font-size:24px;line-height:1.25;font-weight:700;color:var(--kf-text)}
.kf-desc{margin:0 0 20px;font-size:15px;opacity:.8;white-space:pre-line}
.kf-alert{margin:0 0 16px;padding:10px 12px;border-radius:10px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-size:14px}
.kf-fieldset{margin:0;padding:0;border:0;min-width:0}
.kf-row{margin:0 0 14px}
.kf-label{display:block;margin:0 0 6px;font-size:14px;font-weight:600;color:var(--kf-text)}
.kf-req{color:var(--kf-accent)}
.kf-input{display:block;width:100%;margin:0;padding:11px 12px;font:inherit;font-size:16px;line-height:1.3;color:#18181b;background:#ffffff;
  border:1px solid color-mix(in srgb,var(--kf-text) 22%,#d4d4d8);border-radius:10px;outline:none;appearance:auto;
  transition:border-color .15s,box-shadow .15s}
.kf-input::placeholder{color:#a1a1aa;opacity:1}
.kf-input:focus{border-color:var(--kf-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--kf-accent) 28%,transparent)}
.kf-input[aria-invalid=true]{border-color:#dc2626}
.kf-input:disabled{opacity:1;cursor:default;color:#18181b;background:#ffffff}
.kf-error{margin:6px 0 0;font-size:13px;color:#dc2626}
.kf-consent{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;cursor:pointer}
.kf-check{flex:none;width:18px;height:18px;margin:2px 0 0;accent-color:var(--kf-accent)}
.kf-check:focus-visible{outline:2px solid var(--kf-accent);outline-offset:2px}
.kf-check:disabled{opacity:1}
.kf-hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}
.kf-button{display:block;width:100%;margin:6px 0 0;padding:12px 16px;font:inherit;font-size:16px;font-weight:600;line-height:1.3;
  color:var(--kf-on-accent);background:var(--kf-accent);border:0;border-radius:10px;cursor:pointer;transition:filter .15s}
.kf-button:hover{filter:brightness(.93)}
.kf-button:focus-visible{outline:none;box-shadow:0 0 0 3px var(--kf-bg),0 0 0 6px var(--kf-accent)}
.kf-button:disabled{cursor:default;filter:none;opacity:1}
.kf-fine{margin:12px 0 0;font-size:12px;text-align:center;opacity:.65}
@media (max-width:420px){.kf-card{padding:22px 16px;border-radius:14px}.kf-title{font-size:21px}}
`;
