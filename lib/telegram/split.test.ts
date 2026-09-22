import { describe, expect, it } from "vitest";
import { escapeHtml, htmlToPlainText, markdownToTelegramHtml } from "./format";
import { splitTelegramHtml, TELEGRAM_MESSAGE_LIMIT } from "./split";

/** Every chunk must be within the limit and have balanced tags. */
function expectWellFormed(chunks: string[], limit: number) {
  for (const chunk of chunks) {
    expect(chunk.length).toBeLessThanOrEqual(limit);
    const stack: string[] = [];
    for (const [, slash, name] of chunk.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
      if (slash) expect(stack.pop()).toBe(name);
      else stack.push(name);
    }
    expect(stack).toEqual([]);
  }
}

describe("splitTelegramHtml", () => {
  it("returns short messages unchanged", () => {
    expect(splitTelegramHtml("hello <b>world</b>")).toEqual(["hello <b>world</b>"]);
  });

  it("returns exactly-at-limit messages unchanged", () => {
    const text = "a".repeat(TELEGRAM_MESSAGE_LIMIT);
    expect(splitTelegramHtml(text)).toEqual([text]);
  });

  it("splits messages longer than 4096 characters, preferring newlines", () => {
    const line = "x".repeat(99);
    const text = Array.from({ length: 100 }, () => line).join("\n"); // 9999 chars
    const chunks = splitTelegramHtml(text);

    expect(chunks.length).toBe(3);
    expectWellFormed(chunks, TELEGRAM_MESSAGE_LIMIT);
    for (const chunk of chunks) {
      for (const l of chunk.split("\n")) expect(l).toBe(line); // no line was cut
    }
    expect(chunks.join("\n")).toBe(text);
  });

  it("falls back to spaces, then hard cuts, for text without newlines", () => {
    const words = "word ".repeat(2000).trim();
    const wordChunks = splitTelegramHtml(words, 100);
    expectWellFormed(wordChunks, 100);
    expect(wordChunks.every((c) => /^(word ?)+$/.test(c))).toBe(true);
    expect(wordChunks.join(" ")).toBe(words);

    const blob = "z".repeat(250);
    expect(splitTelegramHtml(blob, 100)).toEqual(["z".repeat(100), "z".repeat(100), "z".repeat(50)]);
  });

  it("closes and reopens tags that span a split", () => {
    const html = `<pre><code class="language-ts">${"let x = 1;\n".repeat(40)}</code></pre>`;
    const chunks = splitTelegramHtml(html, 120);

    expect(chunks.length).toBeGreaterThan(1);
    expectWellFormed(chunks, 120);
    for (const chunk of chunks) {
      expect(chunk.startsWith('<pre><code class="language-ts">')).toBe(true);
      expect(chunk.endsWith("</code></pre>")).toBe(true);
    }
    expect(chunks.map(htmlToPlainText).join("\n")).toBe("let x = 1;\n".repeat(40));
  });

  it("never splits entities or surrogate pairs", () => {
    const html = "&amp;😀".repeat(50);
    const chunks = splitTelegramHtml(html, 21);
    expectWellFormed(chunks, 21);
    for (const chunk of chunks) {
      expect(chunk).toMatch(/^(&amp;|😀)+$/);
    }
    expect(chunks.join("")).toBe(html);
  });

  it("drops chunks that would be empty", () => {
    expect(splitTelegramHtml("\n\n\n")).toEqual([]);
  });
});

describe("markdownToTelegramHtml", () => {
  it("escapes HTML so model output can't inject markup", () => {
    expect(markdownToTelegramHtml("<script> & </b>")).toBe(escapeHtml("<script> & </b>"));
  });

  it("converts bold, inline code, code blocks and http(s) links", () => {
    expect(markdownToTelegramHtml("**hi** `a<b` [site](https://x.com/?a=1&b=2)")).toBe(
      '<b>hi</b> <code>a&lt;b</code> <a href="https://x.com/?a=1&amp;b=2">site</a>',
    );
    expect(markdownToTelegramHtml("```js\nif (a < b) **x**\n```")).toBe(
      '<pre><code class="language-js">if (a &lt; b) **x**</code></pre>',
    );
  });

  it("does not turn non-http links into anchors", () => {
    expect(markdownToTelegramHtml("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
  });
});
