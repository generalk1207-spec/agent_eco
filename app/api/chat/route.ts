import { z } from "zod";
import { runAgent } from "@/lib/agents";
import { isAgentError, RateLimitError } from "@/lib/agents/errors";
import { auth } from "@/auth";
import { NotFoundError } from "@/lib/db/queries";

// One agent turn, same budget the Telegram and job routes allow.
export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(8000),
  chatId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (user.status !== "active") {
    return Response.json({ error: "You're still on the waitlist." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  try {
    const { text, chatId } = await runAgent({
      userId: user.id,
      chatId: parsed.data.chatId,
      message: parsed.data.message,
      channel: "web",
    });
    return Response.json({ text, chatId });
  } catch (err) {
    // Rate limits and budget caps are expected; show the user-facing message as-is.
    if (isAgentError(err)) {
      return Response.json(
        { error: err.userMessage },
        { status: err instanceof RateLimitError ? 429 : 402 },
      );
    }
    if (err instanceof NotFoundError) {
      return Response.json({ error: "That conversation no longer exists." }, { status: 404 });
    }
    console.error("[api/chat] run failed", err);
    return Response.json(
      { error: "Something went wrong. Please try again in a moment." },
      { status: 500 },
    );
  }
}
