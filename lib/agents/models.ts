import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { env } from "@/lib/env";

export const AGENT_MODEL_ID = "claude-sonnet-5";
/** Small, cheap model for background work such as extracting facts to remember. */
export const UTILITY_MODEL_ID = "claude-haiku-4-5-20251001";

let provider: ReturnType<typeof createAnthropic> | undefined;
const anthropic = () => (provider ??= createAnthropic({ apiKey: env.ANTHROPIC_API_KEY }));

export const agentModel = (): LanguageModel => anthropic()(AGENT_MODEL_ID);
export const utilityModel = (): LanguageModel => anthropic()(UTILITY_MODEL_ID);
