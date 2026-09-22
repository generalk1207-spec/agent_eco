import { htmlToPlainText } from "./format";

/** Telegram rejects messages longer than this. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

// A tag, an HTML entity, or a single code point (the `u` flag keeps surrogate pairs intact).
const TOKEN = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*>|&#?[a-zA-Z0-9]+;|[\s\S]/gu;

type OpenTag = { name: string; open: string };
type Break = { index: number; stack: OpenTag[] };

const closers = (stack: OpenTag[]) =>
  stack
    .map((t) => `</${t.name}>`)
    .reverse()
    .join("");
const openers = (stack: OpenTag[]) => stack.map((t) => t.open).join("");

/**
 * Splits Telegram HTML into messages of at most `limit` characters. It prefers to break at a
 * newline, then at a space, and otherwise mid-word. It never splits a tag, an entity, or a
 * surrogate pair. Tags open at the break are closed at the end of one chunk and reopened at
 * the start of the next, so every chunk parses on its own.
 */
export function splitTelegramHtml(html: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  const chunks: string[] = [];
  let rest = html;
  while (rest.length > limit) {
    const [head, tail] = cutOnce(rest, limit);
    chunks.push(head);
    rest = tail;
  }
  chunks.push(rest);
  return chunks.filter((c) => htmlToPlainText(c).trim().length > 0);
}

function cutOnce(html: string, limit: number): [string, string] {
  let stack: OpenTag[] = [];
  let hard: Break | undefined;
  let newline: Break | undefined;
  let space: Break | undefined;
  let hasText = false;

  for (const m of html.matchAll(TOKEN)) {
    const [token, slash, rawName] = m;
    const end = m.index + token.length;

    let next = stack;
    if (rawName) {
      const name = rawName.toLowerCase();
      if (!slash) next = [...stack, { name, open: token }];
      else {
        const i = stack.findLastIndex((t) => t.name === name);
        if (i >= 0) next = stack.slice(0, i);
      }
    }

    if (end + closers(next).length > limit) break;

    stack = next;
    hasText ||= !rawName;
    hard = { index: end, stack };
    if (token === "\n") newline = hard;
    else if (/^\s$/.test(token)) space = hard;
  }

  // Nothing but tags fit (e.g. a huge tag): fall back to a raw cut so we always make
  // progress. Telegram may reject that chunk, which triggers the plain-text fallback.
  if (!hard || !hasText) return [html.slice(0, limit), html.slice(limit)];

  const minUseful = limit / 2;
  const at =
    newline && newline.index >= minUseful
      ? newline
      : space && space.index >= minUseful
        ? space
        : hard;

  const head = html.slice(0, at.index).replace(/[ \t\n]+$/, "") + closers(at.stack);
  const tail = openers(at.stack) + html.slice(at.index);
  return [head, tail];
}
