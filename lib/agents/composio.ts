import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import type { ToolSet } from "ai";
import { env } from "@/lib/env";

let client: Composio<VercelProvider> | undefined;
const composio = () =>
  (client ??= new Composio({ apiKey: env.COMPOSIO_API_KEY, provider: new VercelProvider() }));

/**
 * Composio tools for the toolkits this user has actively connected, using our userId as the
 * Composio entity id. Returns {} if the user has no connections or Composio is unavailable.
 */
export async function loadComposioTools(userId: string): Promise<ToolSet> {
  try {
    const { items } = await composio().connectedAccounts.list({
      userIds: [userId],
      statuses: ["ACTIVE"],
      limit: 100,
    });
    const toolkits = [...new Set(items.map((account) => account.toolkit.slug))];
    if (toolkits.length === 0) return {};

    const session = await composio().create(userId, {
      toolkits,
      // Only expose what's already connected; don't let the agent start new OAuth flows.
      manageConnections: false,
      sandbox: { enable: false },
    });
    return (await session.tools()) as ToolSet;
  } catch (err) {
    console.error("[agents] composio tools unavailable", err);
    return {};
  }
}
