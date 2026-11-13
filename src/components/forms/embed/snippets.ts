// Builds the copy-paste codes shown in the "Share & embed" panel.
//
// Pure string functions (no React, no database), so the panel, the server
// action and our test scripts all produce exactly the same codes.
//
// SECURITY: the codes only contain public things (the form's public id and
// its texts). Anything from the form's settings is HTML-escaped, so a label
// like `"><script>` shows up as text instead of breaking the page it's pasted
// into.
import type { AttributeTypeValue } from "@/lib/contacts/common";
import { HONEYPOT_FIELD, type FormConfig, type FormField } from "@/lib/forms/schema";

/** Type of each custom field, keyed by attribute key ("CITY" for "attr:CITY"). */
export type AttributeTypes = Record<string, AttributeTypeValue>;

/** The three public addresses of a form. */
export type FormUrls = {
  /** The hosted page people can visit directly (share link, QR code). */
  hostedUrl: string;
  /** The same page in "embed" mode, for iframes. */
  embedUrl: string;
  /** Where a plain HTML form posts to. */
  submitUrl: string;
};

/** `appUrl` is the app's public origin, e.g. "https://klyve.example" (no trailing slash). */
export function formUrls(appUrl: string, publicId: string): FormUrls {
  const base = appUrl.replace(/\/+$/, "");
  const id = encodeURIComponent(publicId);
  return {
    hostedUrl: `${base}/f/${id}`,
    embedUrl: `${base}/f/${id}?embed=1`,
    submitUrl: `${base}/api/forms/${id}/submit`,
  };
}

/** Makes text safe inside HTML, both between tags and inside "quoted" attributes. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The iframe code: the hosted form inside a frame, styles included. */
export function iframeSnippet(urls: FormUrls, title: string): string {
  return (
    `<iframe src="${escapeHtml(urls.embedUrl)}" ` +
    `style="width:100%;max-width:480px;border:0;" height="520" ` +
    `title="${escapeHtml(title || "Sign-up form")}" loading="lazy"></iframe>`
  );
}

/** Black or white, whichever reads better on the given #rrggbb background. */
function readableTextOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  // Relative luminance (WCAG formula) of the background colour.
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contrast against white vs. against black; pick the larger.
  return (1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05) ? "#ffffff" : "#111111";
}

/** A colour from the config, or a fallback if it isn't a plain #hex colour. */
function safeColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : fallback;
}

/** Browser autofill hints, so phones can fill in the fields in one tap. */
function autocompleteFor(field: FormField): string {
  if (field.target === "EMAIL") return "email";
  if (field.target === "FIRSTNAME") return "given-name";
  if (field.target === "LASTNAME") return "family-name";
  return "off";
}

/**
 * A self-contained HTML form (no iframe, no JavaScript) that posts straight to
 * the submit endpoint. All styling is inline so it looks the same on any site
 * and can't clash with the site's own CSS.
 */
export function htmlFormSnippet(
  config: FormConfig,
  urls: FormUrls,
  opts: { publicId: string; formName?: string; attributeTypes?: AttributeTypes },
): string {
  const accent = safeColor(config.style.accentColor, "#059669");
  const text = safeColor(config.style.textColor, "#18181b");
  const background = safeColor(config.style.backgroundColor, "#ffffff");
  const card = config.style.layout === "card";
  // Prefix ids so two forms on one page don't clash.
  const idPrefix = `klyve-${opts.publicId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  const boxStyle = [
    "max-width:480px",
    "margin:0 auto",
    "box-sizing:border-box",
    `font-family:${font}`,
    `color:${text}`,
    "text-align:left",
    ...(card
      ? [`background:${background}`, "padding:24px", "border:1px solid #e4e4e7", "border-radius:12px", "box-shadow:0 1px 3px rgba(0,0,0,.08)"]
      : ["padding:0"]),
  ].join(";");
  const labelStyle = "display:block;margin:0 0 6px;font-size:14px;font-weight:600;line-height:1.4;color:inherit";
  const inputStyle =
    "display:block;width:100%;box-sizing:border-box;margin:0;padding:10px 12px;font-size:16px;line-height:1.4;" +
    "color:#18181b;background:#ffffff;border:1px solid #d4d4d8;border-radius:8px;font-family:inherit";

  const lines: string[] = [];
  const add = (indent: number, line: string) => lines.push(`${"  ".repeat(indent)}${line}`);

  add(0, `<!-- Sign-up form${opts.formName ? `: ${escapeHtml(opts.formName).replace(/--/g, "- -")}` : ""}. Paste this where you want the form to appear. -->`);
  add(0, `<div style="${boxStyle}">`);
  add(1, `<form method="post" action="${escapeHtml(urls.submitUrl)}" accept-charset="UTF-8" style="margin:0">`);
  if (config.title) {
    add(2, `<h2 style="margin:0 0 8px;font-size:22px;line-height:1.3;font-weight:700;color:inherit">${escapeHtml(config.title)}</h2>`);
  }
  if (config.description) {
    add(2, `<p style="margin:0 0 18px;font-size:15px;line-height:1.5;opacity:.85">${escapeHtml(config.description)}</p>`);
  }

  for (const field of config.fields) {
    const key = field.target.startsWith("attr:") ? field.target.slice(5) : null;
    const type = key ? opts.attributeTypes?.[key] : undefined;
    // A custom field that was deleted after the form was built: the hosted
    // form drops it too (its answer couldn't be stored anyway).
    if (key && opts.attributeTypes && !type) continue;

    const id = `${idPrefix}-${field.target.replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const name = escapeHtml(field.target);
    const required = field.required
      ? ` <span aria-hidden="true" style="color:#dc2626">*</span>`
      : ` <span style="font-weight:400;opacity:.7">(optional)</span>`;
    add(2, `<div style="margin:0 0 14px">`);
    add(3, `<label for="${id}" style="${labelStyle}">${escapeHtml(field.label)}${required}</label>`);
    if (type === "BOOLEAN") {
      // Yes/No as a dropdown, like the hosted form ("yes"/"no" are understood by the endpoint).
      add(3, `<select id="${id}" name="${name}"${field.required ? " required" : ""} style="${inputStyle}">`);
      add(4, `<option value="">${escapeHtml(field.placeholder || "Choose…")}</option>`);
      add(4, `<option value="yes">Yes</option>`);
      add(4, `<option value="no">No</option>`);
      add(3, `</select>`);
    } else {
      const inputType = field.target === "EMAIL" ? "email" : type === "NUMBER" ? "number" : type === "DATE" ? "date" : "text";
      add(
        3,
        `<input id="${id}" type="${inputType}" name="${name}"` +
          (field.placeholder && inputType !== "date" ? ` placeholder="${escapeHtml(field.placeholder)}"` : "") +
          ` autocomplete="${autocompleteFor(field)}"` +
          (field.required ? " required" : "") +
          (inputType === "number" ? ` step="any" inputmode="decimal"` : "") +
          (inputType === "email" ? ` maxlength="254"` : inputType === "text" ? ` maxlength="1000"` : "") +
          ` style="${inputStyle}">`,
      );
    }
    add(2, `</div>`);
  }

  // Honeypot: hidden from people (off-screen, skipped by Tab and screen
  // readers). Bots fill in every field they find, so a value here = spam.
  add(2, `<div aria-hidden="true" style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden">`);
  add(3, `<label>Leave this field empty <input type="text" name="${HONEYPOT_FIELD}" tabindex="-1" autocomplete="off" value=""></label>`);
  add(2, `</div>`);

  if (config.consentText) {
    add(2, `<label style="display:flex;gap:8px;align-items:flex-start;margin:4px 0 16px;font-size:14px;line-height:1.45;cursor:pointer">`);
    add(3, `<input type="checkbox" name="consent" value="yes" required style="margin:3px 0 0;width:16px;height:16px;flex:none;accent-color:${accent}">`);
    add(3, `<span>${escapeHtml(config.consentText)}</span>`);
    add(2, `</label>`);
  }

  add(
    2,
    `<button type="submit" style="display:block;width:100%;box-sizing:border-box;margin:0;padding:12px 16px;border:0;border-radius:8px;` +
      `background:${accent};color:${readableTextOn(accent)};font-size:16px;font-weight:600;line-height:1.3;cursor:pointer;font-family:inherit">` +
      `${escapeHtml(config.buttonLabel)}</button>`,
  );
  if (!config.consentText) {
    add(2, `<p style="margin:10px 0 0;font-size:12px;line-height:1.4;opacity:.7">By subscribing you agree to receive our emails. You can unsubscribe at any time.</p>`);
  }
  add(1, `</form>`);
  add(0, `</div>`);
  return lines.join("\n") + "\n";
}
