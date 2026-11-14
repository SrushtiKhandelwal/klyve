// "Continue with Google" is only offered when both Google settings are filled
// in (.env: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, from Google Cloud →
// Google Auth Platform → Clients). Without them the button is hidden and
// email + password login works as before.
//
// Server code only (it reads secrets from the environment). The login and
// sign-up pages read it when they're built, so after changing these settings
// rebuild the app (deploy/ec2/update.sh), not just restart it.

export type GoogleOAuthConfig = { clientId: string; clientSecret: string };

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function googleSignInEnabled(): boolean {
  return getGoogleOAuthConfig() !== null;
}
