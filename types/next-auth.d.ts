import type { DefaultSession } from "next-auth";
import type { UserStatus } from "@/lib/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      status: UserStatus;
      timezone: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}
