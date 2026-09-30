import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * "Sign in with Google / Microsoft" (Sept 30, 2026): standard OIDC authorization-code flow with
 * PKCE, no SDK. A provider's button renders only when its client id and secret are configured.
 *
 * Identity model: OAuth only *identifies* the person; it never creates an account. The verified
 * email from the provider must match an existing active login (`users.email`), the same record a
 * password sign-in uses — otherwise the callback refuses. So access is still granted and revoked
 * on the staff record's Login tab, and a random Google account gets nothing.
 *
 * Setup (Vercel env):
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET            — Google Cloud console OAuth client (web),
 *     redirect URI  https://<host>/api/auth/google/callback
 *   MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET      — Entra app registration (web),
 *     redirect URI  https://<host>/api/auth/microsoft/callback
 *   MICROSOFT_TENANT (optional, default "common")
 */
export type OAuthProvider = "google" | "microsoft";

const PROVIDERS: Record<OAuthProvider, { label: string; authUrl: () => string; tokenUrl: () => string; scope: string; idEnv: string; secretEnv: string }> = {
  google: {
    label: "Google",
    authUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    scope: "openid email",
    idEnv: "GOOGLE_CLIENT_ID",
    secretEnv: "GOOGLE_CLIENT_SECRET",
  },
  microsoft: {
    label: "Microsoft",
    authUrl: () => `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || "common"}/oauth2/v2.0/authorize`,
    tokenUrl: () => `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || "common"}/oauth2/v2.0/token`,
    scope: "openid email profile",
    idEnv: "MICROSOFT_CLIENT_ID",
    secretEnv: "MICROSOFT_CLIENT_SECRET",
  },
};

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "microsoft";
}

export function oauthConfigured(provider: OAuthProvider): boolean {
  const p = PROVIDERS[provider];
  return Boolean(process.env[p.idEnv] && process.env[p.secretEnv]);
}

export function oauthProviders(): { provider: OAuthProvider; label: string }[] {
  return (Object.keys(PROVIDERS) as OAuthProvider[]).filter(oauthConfigured).map((p) => ({ provider: p, label: PROVIDERS[p].label }));
}

const b64url = (buf: Buffer) => buf.toString("base64url");
export const sha256url = (value: string) => b64url(createHash("sha256").update(value).digest());

/** The URL to send the browser to, plus the state/verifier pair to keep in a short-lived cookie. */
export function buildAuthRequest(provider: OAuthProvider, redirectUri: string) {
  const p = PROVIDERS[provider];
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const url = new URL(p.authUrl());
  url.searchParams.set("client_id", process.env[p.idEnv]!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", p.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", sha256url(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  if (provider === "google") url.searchParams.set("prompt", "select_account");
  return { url: url.toString(), state, verifier };
}

/**
 * Exchange the code and return the verified email. The id_token arrives directly from the
 * provider's token endpoint over TLS, so its payload is trusted after checking aud/iss/exp;
 * there is no third party in that channel to forge it.
 */
export async function exchangeCode(provider: OAuthProvider, input: { code: string; verifier: string; redirectUri: string }): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const p = PROVIDERS[provider];
  const res = await fetch(p.tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env[p.idEnv]!,
      client_secret: process.env[p.secretEnv]!,
      code: input.code,
      code_verifier: input.verifier,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    }),
  });
  if (!res.ok) {
    console.error("[oauth]", provider, "token exchange failed", res.status, (await res.text()).slice(0, 300));
    return { ok: false, error: "The sign-in could not be completed. Try again." };
  }
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) return { ok: false, error: "The provider did not return an identity." };

  const parts = tokens.id_token.split(".");
  if (parts.length !== 3) return { ok: false, error: "The provider returned a malformed identity." };
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "The provider returned a malformed identity." };
  }
  const aud = claims.aud;
  const okAud = aud === process.env[p.idEnv] || (Array.isArray(aud) && aud.includes(process.env[p.idEnv]));
  const iss = String(claims.iss ?? "");
  const okIss = provider === "google" ? iss === "https://accounts.google.com" || iss === "accounts.google.com" : iss.startsWith("https://login.microsoftonline.com/");
  const okExp = typeof claims.exp === "number" && claims.exp * 1000 > Date.now();
  if (!okAud || !okIss || !okExp) return { ok: false, error: "The identity could not be verified." };

  const email = String(claims.email ?? claims.preferred_username ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "The provider did not share an email address." };
  if (provider === "google" && claims.email_verified === false) return { ok: false, error: "That Google email address is not verified." };
  return { ok: true, email };
}
