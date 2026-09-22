import { z } from "zod";

/** Just enough of the Telegram update shape for a text-message bot. Extend as needed. */

export const telegramChatSchema = z.object({
  id: z.number(),
  type: z.string(),
  username: z.string().optional(),
});

export const telegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean(),
  first_name: z.string(),
  username: z.string().optional(),
});

export const telegramMessageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  chat: telegramChatSchema,
  from: telegramUserSchema.optional(),
  text: z.string().optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessageSchema.optional(),
  edited_message: telegramMessageSchema.optional(),
});

export type TelegramChat = z.infer<typeof telegramChatSchema>;
export type TelegramMessage = z.infer<typeof telegramMessageSchema>;
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
