"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { startNewChat } from "@/app/chat-actions";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

type Props = {
  initialMessages: ChatMessage[];
  initialChatId?: string;
  agentName: string;
};

export function Chat({ initialMessages, initialChatId, agentName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [chatId, setChatId] = useState(initialChatId);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStartingNew, startNew] = useTransition();

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;

    setInput("");
    setError(null);
    setPending(true);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, chatId }),
      });
      const data = (await res.json()) as { text?: string; chatId?: string; error?: string };

      if (!res.ok || !data.text) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setChatId(data.chatId);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: data.text! },
      ]);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function onNewChat() {
    startNew(async () => {
      setChatId(await startNewChat());
      setMessages([]);
      setError(null);
      inputRef.current?.focus();
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h1 className="text-sm font-medium">{agentName}</h1>
        <button
          type="button"
          onClick={onNewChat}
          disabled={isStartingNew || pending}
          className="text-sm text-neutral-500 underline disabled:opacity-50"
        >
          New chat
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-6">
          {messages.length === 0 && !pending && (
            <p className="py-12 text-center text-neutral-500">
              Ask me anything, or tell me something to remember.
            </p>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-foreground text-background"
                    : "bg-neutral-100 dark:bg-neutral-900"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {pending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-neutral-100 px-4 py-3 dark:bg-neutral-900">
                <span className="flex gap-1" aria-label="Thinking">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-bounce rounded-full bg-neutral-400"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-center text-sm text-red-500">
              {error}
            </p>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-neutral-200 px-4 py-4 dark:border-neutral-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="mx-auto flex w-full max-w-2xl items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter starts a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Message your assistant…"
            aria-label="Message"
            className="max-h-40 flex-1 resize-none rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-500 dark:border-neutral-700"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="rounded-xl bg-foreground px-4 py-3 text-background disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
