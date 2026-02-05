"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  data?: any[];
}

export default function DashboardPage() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setIsLoading(true);

    try {
      // TODO: Connect to FastAPI backend
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001"}/api/v1/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMessage.content }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.analysis || "Query processed successfully.",
        timestamp: new Date(),
        data: data.results,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I couldn't process your request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen flex bg-[var(--bg-main)]">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } transition-all duration-300 overflow-hidden border-r border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col`}
      >
        <div className="p-4 border-b border-[var(--border-color)]">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--brand-blue)] to-[var(--brand-purple)] flex items-center justify-center text-white font-bold text-sm">
              S
            </div>
            <span className="font-semibold">SkyRate AI</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]">
            <span>💬</span>
            <span>Chat</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-main)] text-[var(--text-muted)]">
            <span>🔍</span>
            <span>Vendor Scout</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-main)] text-[var(--text-muted)]">
            <span>📊</span>
            <span>Reports</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-main)] text-[var(--text-muted)]">
            <span>📧</span>
            <span>Campaigns</span>
          </button>
        </nav>

        <div className="p-4 border-t border-[var(--border-color)]">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-main)] text-[var(--text-muted)]">
            <span>⚙️</span>
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 border-b border-[var(--border-color)] flex items-center px-4 gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-lg"
          >
            ☰
          </button>
          <h1 className="font-semibold">E-Rate Intelligence</h1>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <h2 className="text-2xl font-semibold mb-2">Welcome to SkyRate AI</h2>
                <p className="text-[var(--text-muted)] mb-6">
                  Ask anything about E-Rate funding data. Try:
                </p>
                <div className="space-y-2">
                  {[
                    "Show denied schools in California for 2024",
                    "Find vendors with highest approval rates",
                    "Analyze denial reasons for Category 2",
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(suggestion)}
                      className="block w-full p-3 text-left border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-secondary)] transition"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-[var(--brand-blue)] text-white"
                        : "bg-[var(--bg-card)] border border-[var(--border-color)]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.data && msg.data.length > 0 && (
                      <div className="mt-3 overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr>
                              {Object.keys(msg.data[0]).slice(0, 5).map((key) => (
                                <th key={key} className="px-2 py-1 text-left font-medium">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.data.slice(0, 5).map((row, i) => (
                              <tr key={i}>
                                {Object.values(row).slice(0, 5).map((val: any, j) => (
                                  <td key={j} className="px-2 py-1 border-t border-[var(--border-color)]">
                                    {String(val).substring(0, 50)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {msg.data.length > 5 && (
                          <p className="text-xs text-[var(--text-muted)] mt-2">
                            Showing 5 of {msg.data.length} results
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:0.1s]" />
                      <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:0.2s]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border-color)] p-4">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about E-Rate funding data..."
                className="w-full px-4 py-3 pr-12 border border-[var(--border-color)] rounded-xl bg-[var(--bg-card)] focus:outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              />
              <button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[var(--brand-blue)] text-white rounded-lg disabled:opacity-50"
              >
                ↑
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
