import { NextResponse, type NextRequest } from "next/server";
import { buildAuthRequest, isOAuthProvider, oauthConfigured } from "@/lib/oauth";

export const runtime = "nodejs";

/** Start "Sign in with Google / Microsoft": remember state + PKCE verifier, send the browser off. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isOAuthProvider(provider) || !oauthConfigured(provider)) {
    return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("That sign-in method is not set up."), req.url));
  }
  const redirectUri = new URL(`/api/auth/${provider}/callback`, req.url).toString();
  const { url, state, verifier } = buildAuthRequest(provider, redirectUri);
  const res = NextResponse.redirect(url);
  res.cookies.set(`oauth_${provider}`, `${state}.${verifier}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
