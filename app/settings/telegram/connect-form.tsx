"use client";

import { useActionState } from "react";
import { connectTelegram, type ConnectState } from "./actions";

export function ConnectForm() {
  const [state, action, pending] = useActionState<ConnectState>(connectTelegram, {
    status: "idle",
  });

  return (
    <div className="flex flex-col gap-4">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Generating…" : state.status === "ok" ? "Get a new code" : "Connect Telegram"}
        </button>
      </form>

      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

      {state.status === "ok" && (
        <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p>
            <a
              href={state.deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sky-600 underline"
            >
              Open Telegram to link
            </a>{" "}
            and tap <b>Start</b>. Or send this to the bot:
          </p>
          <code className="self-start rounded bg-neutral-100 px-3 py-2 font-mono text-lg tracking-widest dark:bg-neutral-900">
            /link {state.code}
          </code>
          <p className="text-neutral-500">
            This code works once and expires at{" "}
            {new Date(state.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            . Reload this page once the bot confirms.
          </p>
        </div>
      )}
    </div>
  );
}
