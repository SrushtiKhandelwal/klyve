// Free mailbox domains. Nobody can add DNS records (SPF/DKIM/DMARC) for them,
// and their owners (Google, Yahoo, Microsoft…) restrict bulk sending.
// Safe to import from server AND client code.

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.in",
  "ymail.com",
  "rocketmail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "mail.com",
  "yandex.com",
  "yandex.ru",
  "zoho.com",
  "zohomail.com",
  "rediffmail.com",
  "qq.com",
  "163.com",
]);

/** "news@Gmail.com" or "gmail.com" → true. */
export function isFreeMailDomain(emailOrDomain: string): boolean {
  const domain = emailOrDomain.slice(emailOrDomain.lastIndexOf("@") + 1).trim().toLowerCase();
  return FREE_MAIL_DOMAINS.has(domain);
}

export const FREE_MAIL_NOTE =
  "This is a free mailbox domain, so you can't set its DNS records (SPF, DKIM, DMARC). It's a poor choice for bulk sending: inboxes often reject or spam-folder newsletters from free addresses sent through other services. Use an address on a domain you own if you can.";
