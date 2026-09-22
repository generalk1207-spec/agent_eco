/**
 * Registers the shared bot's webhook and command menu.
 *
 *   node --env-file=.env.local scripts/set-webhook.ts
 *
 * Reads process.env directly (no @/ imports) so it runs with plain Node.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function call(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!data.ok) throw new Error(`${method} failed: ${data.description ?? res.status}`);
  return data.result;
}

async function main() {
  const token = required("TELEGRAM_BOT_TOKEN");
  const secret = required("TELEGRAM_WEBHOOK_SECRET");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET may only contain A-Z, a-z, 0-9, _ and - (1-256 chars)");
  }
  const url = new URL("/api/telegram", required("APP_URL")).toString();
  if (!url.startsWith("https://")) throw new Error(`Telegram requires an https webhook URL, got ${url}`);

  await call(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
  });
  console.log(`Webhook set to ${url}`);

  await call(token, "setMyCommands", {
    commands: [
      { command: "new", description: "Start a new conversation" },
      { command: "link", description: "Link your account: /link CODE" },
    ],
  });
  console.log("Bot commands registered");

  console.log(await call(token, "getWebhookInfo", {}));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

export {};
