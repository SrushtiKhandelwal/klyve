import { AlertTriangleIcon } from "lucide-react";

/**
 * Shows why the provider wouldn't send the verification email, with the
 * provider's own message and the most common fixes.
 */
export function ProviderErrorBox({ error, providerError }: { error: string; providerError?: string }) {
  return (
    <div role="alert" className="grid gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <p className="flex items-start gap-2 font-medium">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        {error}
      </p>
      {providerError && (
        <p className="rounded-md bg-white/70 px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap text-red-900">
          {providerError}
        </p>
      )}
      {providerError && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-red-700">
          <li>Your provider must allow this From address: verify the domain or address in Amazon SES, Resend, SendGrid, Mailgun or Postmark first.</li>
          <li>Gmail / Outlook SMTP can only send as your own mailbox address (or its configured aliases).</li>
          <li>Check the provider&apos;s credentials on the Sending providers page.</li>
        </ul>
      )}
    </div>
  );
}
