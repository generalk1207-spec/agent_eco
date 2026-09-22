import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { adminListUsers, adminSetUserStatus } from "@/lib/db/queries/admin";
import type { UserStatus } from "@/lib/db/schema";

async function setStatus(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = formData.get("userId");
  const status = formData.get("status");
  if (typeof userId !== "string" || (status !== "active" && status !== "waitlist")) return;
  await adminSetUserStatus(userId, status satisfies UserStatus);
  revalidatePath("/admin");
}

export default async function AdminPage() {
  await requireAdmin();
  const users = await adminListUsers();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Users ({users.length})</h1>
      <table className="w-full text-left text-sm">
        <thead className="text-neutral-500">
          <tr>
            <th className="py-2">Email</th>
            <th>Name</th>
            <th>Plan</th>
            <th>Joined</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const next: UserStatus = u.status === "active" ? "waitlist" : "active";
            return (
              <tr key={u.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-2">{u.email}</td>
                <td>{u.name}</td>
                <td>{u.plan}</td>
                <td>{u.createdAt.toISOString().slice(0, 10)}</td>
                <td>
                  <form action={setStatus} className="flex items-center gap-3">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="status" value={next} />
                    <span>{u.status}</span>
                    <button type="submit" className="underline">
                      {next === "active" ? "Activate" : "Move to waitlist"}
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
