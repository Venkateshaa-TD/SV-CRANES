import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Sign in" };

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl && params.callbackUrl.startsWith("/") ? params.callbackUrl : "/dashboard";

  // Live check (re-validates against the database, unlike the JWT the
  // middleware sees) — only redirect away from the login page when the
  // account is genuinely still active. A deactivated user with a stale
  // session cookie lands here and can simply sign back in (which fails,
  // correctly, until reactivated) instead of bouncing in a loop.
  const user = await getCurrentUser();
  if (user) {
    redirect(callbackUrl);
  }

  return <LoginForm callbackUrl={callbackUrl} />;
}
