import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { callbackUrl } = await searchParams;
  // Only allow same-origin relative redirects.
  const redirectTo =
    typeof callbackUrl === "string" && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/";

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border border-neutral-200 p-8 dark:border-neutral-800">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo });
          }}
          className="w-full"
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-foreground px-4 py-2 text-background hover:opacity-90"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
