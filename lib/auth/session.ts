import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";

/**
 * Server-side guards. proxy.ts is not a security boundary, so every protected
 * page, route handler, and server action should call one of these.
 */

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session;
}

export async function requireActiveUser(): Promise<Session> {
  const session = await requireSession();
  if (session.user.status !== "active") redirect("/waitlist");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.isAdmin) notFound();
  return session;
}
