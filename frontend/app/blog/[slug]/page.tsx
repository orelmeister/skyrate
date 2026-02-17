"use client";

import { useState, useEffect } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  ArrowRight,
  ArrowLeft,
  Clock,
  User,
  Calendar,
  Sparkles,
} from "lucide-react";

export default function DynamicBlogPost() {
  const params = useParams();
  const slug = params?.slug as string;

  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

  useEffect(() => {
    if (!slug) return;
    loadPost();
  }, [slug]);

  async function loadPost() {
    setLoading(true);
    try {
      const res = await api.getBlogPost(slug);
      if (res.data?.post) {
        setPost(res.data.post);
      } else {
        setNotFoundState(true);
      }
    } catch (e) {
      setNotFoundState(true);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (notFoundState || !post) {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/10">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
              <span className="text-white font-bold text-xl">SkyRate<span className="text-purple-400">.AI</span></span>
            </Link>
          </nav>
        </header>
        <div className="max-w-3xl mx-auto px-4 py-24 text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Post Not Found</h1>
          <p className="text-slate-600 mb-8">This blog post doesn&apos;t exist or has been unpublished.</p>
          <Link href="/blog" className="text-purple-600 hover:underline font-medium">← Back to Blog</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-white font-bold text-xl">SkyRate<span className="text-purple-400">.AI</span></span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="/blog" className="text-purple-300 text-sm font-medium flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Blog
            </Link>
            <Link href="/features/consultants" className="text-slate-300 hover:text-white text-sm transition-colors">For Consultants</Link>
            <Link href="/features/vendors" className="text-slate-300 hover:text-white text-sm transition-colors">For Vendors</Link>
            <Link href="/pricing" className="text-slate-300 hover:text-white text-sm transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-slate-300 hover:text-white text-sm transition-colors hidden sm:block">Sign In</Link>
            <Link href="/sign-up" className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Sign Up</Link>
          </div>
        </nav>
      </header>

      {/* Breadcrumb */}
      <div className="bg-slate-50 border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-purple-600">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-purple-600">Blog</Link>
            <span>/</span>
            <span className="text-slate-900 font-medium truncate">{post.title}</span>
          </div>
        </div>
      </div>

      {/* Article */}
      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Category + Read Time */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">
            {post.category || "Guide"}
          </span>
          <div className="flex items-center gap-1 text-slate-500 text-sm">
            <Clock className="w-3.5 h-3.5" />
            {post.read_time_minutes || 8} min read
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-6">
          {post.title}
        </h1>

        {/* Author + Date */}
        <div className="flex items-center gap-4 text-sm text-slate-500 mb-10 pb-8 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-purple-600" />
            </div>
            <span>{post.author_name || "SkyRate AI Team"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {post.published_at ? new Date(post.published_at).toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric"
            }) : "Draft"}
          </div>
        </div>

        {/* Hero Image */}
        {post.has_hero_image && (
          <div className="rounded-xl overflow-hidden mb-10 shadow-lg">
            <img
              src={`${apiBaseUrl}/api/v1/blog/posts/${slug}/hero-image`}
              alt={post.title}
              className="w-full h-64 sm:h-80 lg:h-96 object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div
          className="prose prose-lg prose-slate max-w-none
            prose-headings:text-slate-900 prose-headings:font-bold
            prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-slate-600 prose-p:leading-relaxed
            prose-a:text-purple-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-l-purple-500 prose-blockquote:bg-purple-50 prose-blockquote:py-3 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:text-sm prose-blockquote:text-slate-600 prose-blockquote:not-italic
            prose-li:text-slate-600
            prose-strong:text-slate-900"
          dangerouslySetInnerHTML={{ __html: post.content_html }}
        />

        {/* Mid-Article Image */}
        {post.has_mid_image && (
          <div className="my-10 flex justify-center">
            <div className="rounded-xl overflow-hidden shadow-md max-w-2xl w-full">
              <img
                src={`${apiBaseUrl}/api/v1/blog/posts/${slug}/mid-image`}
                alt={`Illustration for ${post.title}`}
                className="w-full h-48 sm:h-56 object-cover"
              />
            </div>
          </div>
        )}
      </article>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-purple-600 to-indigo-700 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Sparkles className="w-10 h-10 text-purple-200 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to Simplify Your E-Rate Process?
          </h2>
          <p className="text-lg text-purple-100 mb-8 max-w-2xl mx-auto">
            Stop struggling with E-Rate complexity. Let SkyRate AI&apos;s intelligent platform handle the heavy lifting — from denial analysis to appeal generation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/sign-up" className="inline-flex items-center gap-2 bg-white text-purple-700 hover:bg-purple-50 font-semibold px-8 py-3.5 rounded-xl transition-colors text-lg">
              Start Free Trial <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/contact" className="inline-flex items-center gap-2 border border-white/30 hover:border-white/60 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-lg">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/images/logos/logo-icon-transparent.png" alt="" width={24} height={24} className="rounded" />
              <span className="text-white font-bold">SkyRate<span className="text-purple-400">.AI</span></span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/about" className="hover:text-white transition-colors">About</Link>
              <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            </div>
            <p className="text-xs">&copy; {new Date().getFullYear()} SkyRate AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
