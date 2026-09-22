import { env } from "@/lib/env";

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && env.ADMIN_EMAILS.includes(email.toLowerCase());
}
