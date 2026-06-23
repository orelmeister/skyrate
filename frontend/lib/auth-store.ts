/**
 * Authentication Store for SkyRate AI
 * Uses Zustand for state management
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// API base URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

/**
 * Normalize a FastAPI/Pydantic error `detail` field into a single string.
 *
 * FastAPI returns `detail` as either:
 *   - a string (custom HTTPException)            -> use as-is
 *   - an array of {type,loc,msg,input,ctx,url}  -> Pydantic validation errors
 *   - undefined/null                             -> use fallback
 *
 * Rendering the raw array as a React child crashes the tree with React error
 * #31 ("Objects are not valid as a React child"), which surfaces as a frozen
 * sign-in page (the ErrorBoundary swallows the error and the redirect to the
 * dashboard never fires). Always coerce to a plain string before storing in
 * the `error` slot.
 */
function normalizeErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim().length > 0) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d: any) => {
        if (typeof d === "string") return d;
        if (d && typeof d.msg === "string") return d.msg;
        return null;
      })
      .filter(Boolean);
    if (msgs.length > 0) return msgs.join("; ");
  }
  if (detail && typeof detail === "object") {
    const anyDetail = detail as any;
    if (typeof anyDetail.msg === "string") return anyDetail.msg;
    if (typeof anyDetail.message === "string") return anyDetail.message;
  }
  return fallback;
}

// User interface
export interface User {
  id: number;
  email: string;
  role: "consultant" | "vendor" | "admin" | "applicant" | "super";
  first_name?: string;
  last_name?: string;
  full_name?: string;
  company_name?: string;
  phone?: string;
  phone_verified?: boolean;
  is_active: boolean;
  is_verified: boolean;
  email_verified?: boolean;
  sms_opt_in?: boolean;
  onboarding_completed?: boolean;
  created_at: string;
  last_login?: string;
  subscription?: {
    id: number;
    user_id: number;
    plan: 'monthly' | 'yearly';
    status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
    price_cents: number;
    start_date: string;
    trial_end?: string;
    current_period_start: string;
    current_period_end: string;
  };
}

// Registration data interface
export interface RegisterData {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone?: string;  // Optional phone for SMS verification
  role: "consultant" | "vendor" | "applicant";
  crn?: string;  // For consultants
  spin?: string; // For vendors
  ben?: string;  // For applicants
  promo_token?: string; // For promo invite registrations
}

/**
 * Derive whether a user needs to complete payment setup, using ONLY the
 * `user.subscription` object that is already persisted client-side by the
 * Zustand `persist` middleware. This lets dashboard pages avoid a per-mount
 * round-trip to `/api/v1/subscriptions/payment-status`.
 *
 * Returns:
 *   - `false` -> user has valid access (active OR active trial). Skip network.
 *   - `true`  -> user clearly needs to set up payment. Skip network, redirect.
 *   - `null`  -> indeterminate (no user, or no subscription record yet).
 *               Caller should fall back to the network call.
 *
 * Mirrors the rules in backend/app/api/v1/subscriptions.py::get_payment_status,
 * minus the test-account / promo-invite branches which require server-side
 * state (those still flow through the `null` fallback path on first load).
 */
export function deriveRequiresPaymentSetup(user: User | null): boolean | null {
  if (!user) return null;
  if (user.role === "admin" || user.role === "super") return false;
  const sub = user.subscription;
  if (!sub) return null;
  if (sub.status === "active") return false;
  if (sub.status === "trialing") {
    if (sub.trial_end) {
      const trialEnd = new Date(sub.trial_end).getTime();
      if (!Number.isNaN(trialEnd) && trialEnd > Date.now()) return false;
    }
    return true;
  }
  // past_due | canceled | incomplete -> require setup
  return true;
}

// Auth state interface
interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  _hasHydrated: boolean;
  
  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: (
    credential: string,
    role?: "consultant" | "vendor" | "applicant",
    identifier?: string,
  ) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  acceptSeat: (payload: { token: string; password: string; first_name?: string; last_name?: string }) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  setUser: (user: User | null) => void;
  refreshAccessToken: () => Promise<boolean>;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      _hasHydrated: false,

      setHasHydrated: (v: boolean) => set({ _hasHydrated: v }),

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        
        // Clear any stale legacy tokens before login
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('token');
        }
        
        try {
          const response = await fetch(`${API_URL}/api/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          const data = await response.json();

          if (!response.ok) {
            set({ 
              isLoading: false, 
              error: normalizeErrorDetail(data?.detail, "Login failed. Please check your credentials.") 
            });
            return false;
          }

          set({
            user: data.user,
            token: data.access_token,
            refreshToken: data.refresh_token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          return true;
        } catch (error) {
          set({ 
            isLoading: false, 
            error: "Network error. Please check your connection." 
          });
          return false;
        }
      },

      loginWithGoogle: async (
        credential: string,
        role: "consultant" | "vendor" | "applicant" = "consultant",
        identifier?: string,
      ) => {
        set({ isLoading: true, error: null });
        
        // Clear any stale legacy tokens before login
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('token');
        }
        
        // Map identifier -> role-specific field expected by backend.
        const trimmed = (identifier || "").trim();
        const payload: Record<string, string> = { id_token: credential, role };
        if (trimmed) {
          if (role === "consultant") payload.crn = trimmed;
          else if (role === "vendor") payload.spin = trimmed;
          else if (role === "applicant") payload.ben = trimmed;
        }
        
        try {
          const response = await fetch(`${API_URL}/api/v1/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const data = await response.json();

          if (!response.ok) {
            set({ 
              isLoading: false, 
              error: normalizeErrorDetail(data?.detail, "Google login failed.") 
            });
            return false;
          }

          set({
            user: data.user,
            token: data.access_token,
            refreshToken: data.refresh_token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          return true;
        } catch (error) {
          set({ 
            isLoading: false, 
            error: "Network error. Please check your connection." 
          });
          return false;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`${API_URL}/api/v1/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });

          const result = await response.json();

          if (!response.ok) {
            set({ 
              isLoading: false, 
              error: normalizeErrorDetail(result?.detail, "Registration failed.") 
            });
            return false;
          }

          set({
            user: result.user,
            token: result.access_token,
            refreshToken: result.refresh_token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          return true;
        } catch (error) {
          set({ 
            isLoading: false, 
            error: "Network error. Please check your connection." 
          });
          return false;
        }
      },

      acceptSeat: async (payload) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/api/v1/auth/accept-seat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const result = await response.json();
          if (!response.ok) {
            set({ isLoading: false, error: normalizeErrorDetail(result?.detail, "Could not accept invite.") });
            return false;
          }
          set({
            user: result.user,
            token: result.access_token,
            refreshToken: result.refresh_token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          return true;
        } catch (error) {
          set({ isLoading: false, error: "Network error. Please check your connection." });
          return false;
        }
      },

      logout: () => {
        // Clear Zustand state
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });
        
        // Also clear legacy localStorage keys to prevent stale token issues
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('token');  // Some components use 'token' key
        }
      },

      clearError: () => {
        set({ error: null });
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user });
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        try {
          const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });

          const data = await response.json();

          if (!response.ok) {
            // Refresh failed, logout user
            get().logout();
            return false;
          }

          set({
            token: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
          });

          return true;
        } catch (error) {
          get().logout();
          return false;
        }
      },
    }),
    {
      name: "skyrate-auth",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Helper function to get auth header
export const getAuthHeader = () => {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Authenticated fetch wrapper
export const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = useAuthStore.getState().token;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // If unauthorized, try to refresh token
  if (response.status === 401) {
    const refreshed = await useAuthStore.getState().refreshAccessToken();
    if (refreshed) {
      // Retry with new token
      const newToken = useAuthStore.getState().token;
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          "Content-Type": "application/json",
          ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
        },
      });
    } else {
      // Refresh failed — redirect to signin for clean re-auth
      if (typeof window !== "undefined") {
        const path = window.location.pathname + window.location.search;
        if (!window.location.pathname.startsWith('/sign-in') && !window.location.pathname.startsWith('/auth')) {
          window.location.href = `/sign-in?from=${encodeURIComponent(path)}&reason=expired`;
        }
      }
    }
  }

  return response;
};
