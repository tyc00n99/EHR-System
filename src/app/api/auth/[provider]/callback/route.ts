import { NextResponse, type NextRequest } from "next/server";
import { signInWithProvider } from "@/lib/auth";
import { exchangeCode, isOAuthProvider, oauthConfigured } from "@/lib/oauth";

export const runtime = "nodejs";

/** Finish the provider sign-in: check state, exchange the code, match the email to a login. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const fail = (message: string) => {
    const res = NextResponse.redirect(new URL("/login?error=" + encodeURIComponent(message), req.url));
    res.cookies.delete(`oauth_${provider}`);
    return res;
  };
  if (!isOAuthProvider(provider) || !oauthConfigured(provider)) return fail("That sign-in method is not set up.");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const kept = req.cookies.get(`oauth_${provider}`)?.value ?? "";
  const [keptState, verifier] = kept.split(".");
  if (!code || !state || !keptState || !verifier || state !== keptState) {
    return fail("The sign-in could not be completed. Try again.");
  }

  const redirectUri = new URL(`/api/auth/${provider}/callback`, req.url).toString();
  const identity = await exchangeCode(provider, { code, verifier, redirectUri });
  if (!identity.ok) return fail(identity.error);

  const result = await signInWithProvider(identity.email, provider);
  if (!result.ok) return fail(result.message);

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.delete(`oauth_${provider}`);
  return res;
}
