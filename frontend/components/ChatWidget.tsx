"use client";

import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

const CATEGORIES = [
  { value: "general", label: "General Question" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical Issue" },
  { value: "erate", label: "E-Rate Help" },
  { value: "feature_request", label: "Feature Request" },
  { value: "bug_report", label: "Bug Report" },
];

export default function ChatWidget() {
  const { user, isAuthenticated } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [stage, setStage] = useState<"form" | "success" | "conversations">("form");

  // Form state
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("general");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Conversations state
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Determine source based on current path
  const getSource = () => {
    if (typeof window === "undefined") return "chat_widget";
    const path = window.location.pathname;
    if (path === "/" || path === "") return "landing_page";
    return "dashboard";
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    if (!isAuthenticated && !guestEmail.trim()) {
      setError("Please provide your email");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await api.createSupportTicket({
        subject,
        message,
        category,
        source: getSource(),
        guest_name: !isAuthenticated ? guestName : undefined,
        guest_email: !isAuthenticated ? guestEmail : undefined,
      });
      setStage("success");
      setSubject("");
      setMessage("");
      setCategory("general");
      setGuestName("");
      setGuestEmail("");
    } catch (e: any) {
      setError(e.message || "Failed to submit. Please try again.");
    }
    setSubmitting(false);
  }

  async function loadTickets() {
    try {
      const res = await api.getMySupportTickets();
      setTickets(res.data?.tickets || []);
    } catch {
      // Ignore for non-authenticated users
    }
  }

  async function openTicket(ticket: any) {
    try {
      const res = await api.getSupportTicket(ticket.id);
      setSelectedTicket(res.data?.ticket);
    } catch {
      setSelectedTicket(ticket);
    }
  }

  async function handleReply() {
    if (!selectedTicket || !replyText.trim()) return;
    try {
      await api.addTicketMessage(selectedTicket.id, replyText);
      setReplyText("");
      openTicket(selectedTicket); // Refresh
    } catch {
      alert("Failed to send reply");
    }
  }

  useEffect(() => {
    if (isOpen && isAuthenticated && stage === "conversations") {
      loadTickets();
    }
  }, [isOpen, stage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedTicket?.messages]);

  // Don't render for admin users (must be after all hooks)
  if (user?.role === "admin") return null;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center"
        aria-label="Support Chat"
      >
        {isOpen ? (
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[520px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <img src="/images/logos/logo-icon-transparent.png" alt="" width={24} height={24} className="rounded" />
              <div>
                <h3 className="font-semibold text-sm">SkyRate Support</h3>
                <p className="text-xs text-purple-200">We typically reply within a few hours</p>
              </div>
            </div>
            {isAuthenticated && (
              <button
                onClick={() => {
                  if (stage === "conversations") {
                    setStage("form");
                    setSelectedTicket(null);
                  } else {
                    setStage("conversations");
                    setSelectedTicket(null);
                  }
                }}
                className="text-xs bg-white/20 rounded px-2 py-1 hover:bg-white/30 transition-colors"
              >
                {stage === "conversations" ? "New Ticket" : "My Tickets"}
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {stage === "success" ? (
              <div className="text-center py-8 space-y-3">
                <div className="text-4xl">✅</div>
                <h4 className="font-semibold text-slate-900">Message Sent!</h4>
                <p className="text-sm text-slate-600">
                  We&apos;ll get back to you as soon as possible.
                  {isAuthenticated && " Check 'My Tickets' for updates."}
                </p>
                <button
                  onClick={() => setStage("form")}
                  className="text-sm text-purple-600 hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : stage === "conversations" && isAuthenticated ? (
              selectedTicket ? (
                // Ticket Detail View
                <div className="space-y-3">
                  <button onClick={() => setSelectedTicket(null)} className="text-xs text-purple-600 hover:underline">&larr; Back</button>
                  <h4 className="font-semibold text-sm text-slate-900">#{selectedTicket.id} {selectedTicket.subject}</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {(selectedTicket.messages || []).map((m: any) => (
                      <div key={m.id} className={`p-2.5 rounded-lg text-xs ${
                        m.sender_type === "admin" ? "bg-purple-50 ml-4" : "bg-slate-50 mr-4"
                      }`}>
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-slate-700">{m.sender_name}{m.sender_type === "admin" ? " (Support)" : ""}</span>
                          <span className="text-slate-400">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-slate-700 whitespace-pre-wrap">{m.message}</p>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="flex gap-2 pt-2 border-t">
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type a reply..."
                      className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleReply()}
                    />
                    <button
                      onClick={handleReply}
                      disabled={!replyText.trim()}
                      className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                // Tickets List
                <div className="space-y-2">
                  {tickets.length === 0 ? (
                    <p className="text-center text-slate-500 text-sm py-4">No tickets yet</p>
                  ) : tickets.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => openTicket(t)}
                      className="p-3 rounded-lg border hover:border-purple-300 cursor-pointer transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <h5 className="text-sm font-medium text-slate-900 truncate flex-1">#{t.id} {t.subject}</h5>
                        <span className={`text-xs px-1.5 py-0.5 rounded ml-2 ${
                          t.status === "open" ? "bg-blue-100 text-blue-700" :
                          t.status === "waiting_user" ? "bg-orange-100 text-orange-700" :
                          t.status === "resolved" ? "bg-green-100 text-green-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>{t.status?.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{new Date(t.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              // New Ticket Form
              <form onSubmit={handleSubmit} className="space-y-3">
                {!isAuthenticated && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Your Name</label>
                      <input
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Your Email *</label>
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Subject *</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="How can we help?"
                    required
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Message *</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your issue or question..."
                    required
                    rows={4}
                    className="w-full px-3 py-2 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {error && <p className="text-red-600 text-xs">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
                >
                  {submitting ? "Sending..." : "Send Message"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
