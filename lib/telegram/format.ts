/** Formatting for Telegram's HTML parse mode (https://core.telegram.org/bots/api#html-style). */

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

/** Reverses escapeHtml/escapeAttr and drops tags; used for the plain-text fallback. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/**
 * Converts the small Markdown subset LLMs commonly emit into Telegram HTML:
 * fenced code blocks, `inline code`, **bold**, and [text](http(s) url).
 * Everything else is escaped and sent as literal text.
 */
export function markdownToTelegramHtml(markdown: string): string {
  // Pull code out first so its contents aren't treated as Markdown.
  const slots: string[] = [];
  const stash = (html: string) => `\u0000${slots.push(html) - 1}\u0000`;

  let text = markdown
    .replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang: string, code: string) => {
      const body = escapeHtml(code.replace(/\n$/, ""));
      return stash(
        lang
          ? `<pre><code class="language-${escapeAttr(lang)}">${body}</code></pre>`
          : `<pre>${body}</pre>`,
      );
    })
    .replace(/`([^`\n]+)`/g, (_, code: string) => stash(`<code>${escapeHtml(code)}</code>`));

  text = escapeHtml(text)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<b>$1</b>")
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_, label: string, url: string) => `<a href="${url.replace(/"/g, "&quot;")}">${label}</a>`,
    );

  return text.replace(/\u0000(\d+)\u0000/g, (_, i: string) => slots[Number(i)]);
}
