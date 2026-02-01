"use client";

import { useState, useRef, useEffect } from "react";
import { api, AppealRecord, ChatMessage } from "@/lib/api";

interface AppealChatProps {
  appeal: AppealRecord;
  onAppealUpdate: (appeal: AppealRecord) => void;
  onClose: () => void;
}

export function AppealChat({ appeal, onAppealUpdate, onClose }: AppealChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(appeal.chat_history || []);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [appealLetter, setAppealLetter] = useState(appeal.appeal_letter);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Default to "letter" tab so users see the appeal first, then can refine via chat
  const [activeTab, setActiveTab] = useState<"chat" | "letter">("letter");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: inputMessage.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const response = await api.chatWithAppeal(appeal.id, userMessage.content);
      
      if (response.success && response.data) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: response.data.response,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setAppealLetter(response.data.updated_letter);
        
        // Update parent with full appeal data
        onAppealUpdate({
          ...appeal,
          appeal_letter: response.data.updated_letter,
          chat_history: response.data.chat_history,
        });
      } else {
        // Show error message
        const errorMessage: ChatMessage = {
          role: "assistant",
          content: `Error: ${response.error || "Failed to process your request. Please try again."}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "An error occurred. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSaveLetter = async () => {
    setIsSaving(true);
    try {
      const response = await api.saveAppeal(appeal.id, appealLetter);
      if (response.success && response.data) {
        onAppealUpdate(response.data);
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async (format: "txt" | "json") => {
    try {
      const blob = format === "txt" 
        ? await api.downloadAppealText(appeal.id)
        : await api.downloadAppealJson(appeal.id);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `appeal_${appeal.frn}_${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(appealLetter);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Appeal for FRN: {appeal.frn}
            </h2>
            <p className="text-sm text-slate-600">
              {appeal.organization_name || "Unknown Organization"} • 
              Status: <span className={`font-medium ${
                appeal.status === "finalized" ? "text-green-600" : 
                appeal.status === "submitted" ? "text-blue-600" : "text-amber-600"
              }`}>{appeal.status}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === "chat"
                ? "text-indigo-600 border-b-2 border-indigo-600 bg-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            💬 Chat & Refine
          </button>
          <button
            onClick={() => setActiveTab("letter")}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === "letter"
                ? "text-indigo-600 border-b-2 border-indigo-600 bg-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📄 Appeal Letter
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === "chat" ? (
            /* Chat Panel */
            <div className="flex-1 flex flex-col">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-slate-500 py-12">
                    <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">💬</span>
                    </div>
                    <p className="font-medium">Start a conversation</p>
                    <p className="text-sm mt-1">Ask questions or request changes to refine your appeal</p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                      {[
                        "Make it more formal",
                        "Add more details about our compliance",
                        "Emphasize the procedural issues",
                        "Shorten the letter",
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setInputMessage(suggestion)}
                          className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          msg.role === "user"
                            ? "bg-indigo-600 text-white"
                            : msg.role === "system"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-slate-100 text-slate-900"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        <div className={`text-xs mt-1 ${
                          msg.role === "user" ? "text-indigo-200" : "text-slate-400"
                        }`}>
                          {formatTime(msg.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                        <span className="text-sm text-slate-500">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-slate-200 bg-slate-50">
                <div className="flex gap-3">
                  <textarea
                    ref={textareaRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask to modify the appeal... (Press Enter to send)"
                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={2}
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || isLoading}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Letter Panel */
            <div className="flex-1 flex flex-col">
              {/* Toolbar */}
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleSaveLetter}
                        disabled={isSaving}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                      >
                        {isSaving ? (
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setAppealLetter(appeal.appeal_letter);
                          setIsEditing(false);
                        }}
                        className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyToClipboard}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </button>
                  <div className="relative group">
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                    <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <button
                        onClick={() => handleDownload("txt")}
                        className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 rounded-t-lg"
                      >
                        Download as .txt
                      </button>
                      <button
                        onClick={() => handleDownload("json")}
                        className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 rounded-b-lg"
                      >
                        Download as .json
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Letter Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {isEditing ? (
                  <textarea
                    value={appealLetter}
                    onChange={(e) => setAppealLetter(e.target.value)}
                    className="w-full h-full min-h-[500px] p-6 bg-white border border-slate-200 rounded-xl font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                    <div className="prose prose-slate max-w-none whitespace-pre-wrap font-serif">
                      {appealLetter}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Last updated: {new Date(appeal.updated_at).toLocaleString()}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
