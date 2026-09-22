import Link from "next/link";
import { requireActiveUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/sign-out-button";

export default async function Home() {
  const session = await requireActiveUser();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Hi{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}
        </h1>
        <SignOutButton />
      </header>
      <p className="text-neutral-500">Chat is coming soon.</p>
      <nav className="flex gap-4 text-sm underline">
        <Link href="/settings">Settings</Link>
        {session.user.isAdmin && <Link href="/admin">Admin</Link>}
      </nav>
    </main>
  );
}
