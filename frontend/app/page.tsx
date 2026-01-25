import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 px-6 py-4 bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold">
              S
            </div>
            <span className="text-xl font-semibold text-slate-900">
              SkyRate AI
            </span>
          </div>
          <nav className="flex items-center gap-4">
            <Link 
              href="/sign-in"
              className="text-slate-600 hover:text-slate-900 transition"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-3xl text-center">
          <h1 className="text-5xl font-bold text-slate-900 mb-6">
            AI-Powered E-Rate Intelligence
          </h1>
          <p className="text-xl text-slate-600 mb-8">
            Query E-Rate funding data with natural language. Analyze denials, generate appeal strategies, and manage compliance—all powered by AI.
          </p>
          
          {/* Search Bar Preview */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="relative">
              <input
                type="text"
                placeholder="Ask anything about E-Rate funding..."
                className="w-full px-6 py-4 text-lg border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
                disabled
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
                Search
              </button>
            </div>
            <p className="text-sm text-slate-500 mt-2">
              Try: "Show me denied schools in California for 2024"
            </p>
          </div>

          <div className="flex items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition shadow-sm"
            >
              Start Free Trial
            </Link>
            <Link
              href="/demo"
              className="px-6 py-3 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              Watch Demo
            </Link>
          </div>
        </div>
      </main>

      {/* Features */}
      <section className="border-t border-slate-200 py-16 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 hover:shadow-md transition">
              <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-4 text-2xl">
                📊
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Natural Language Queries</h3>
              <p className="text-slate-600">
                Search E-Rate data using plain English. No complex filters needed.
              </p>
            </div>
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 hover:shadow-md transition">
              <div className="w-12 h-12 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mb-4 text-2xl">
                🤖
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">AI-Powered Analysis</h3>
              <p className="text-slate-600">
                Get instant insights, denial analysis, and appeal strategies.
              </p>
            </div>
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 hover:shadow-md transition">
              <div className="w-12 h-12 rounded-lg bg-green-100 text-green-600 flex items-center justify-center mb-4 text-2xl">
                📧
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Email Campaigns</h3>
              <p className="text-slate-600">
                Reach out to schools with personalized, compliant outreach.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 px-6 bg-white">
        <div className="max-w-7xl mx-auto text-center text-slate-500">
          © 2026 SkyRate AI. Built for E-Rate consultants.
        </div>
      </footer>
    </div>
  );
}
