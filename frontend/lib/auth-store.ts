/**
 * Authentication Store for SkyRate AI
 * Uses Zustand for state management
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// API base URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// User interface
export interface User {
  id: number;
  email: string;
  role: "consultant" | "vendor" | "admin";
  first_name?: string;
  last_name?: string;
  full_name?: string;
  company_name?: string;
  phone?: string;
  is_active: boolean;
  is_verified: boolean;
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
  role: "consultant" | "vendor";
  crn?: string;  // For consultants
  spin?: string; // For vendors
}

// Auth state interface
interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: (credential: string) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  setUser: (user: User | null) => void;
  refreshAccessToken: () => Promise<boolean>;
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

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        
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
              error: data.detail || "Login failed. Please check your credentials." 
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

      loginWithGoogle: async (credential: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`${API_URL}/api/v1/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential }),
          });

          const data = await response.json();

          if (!response.ok) {
            set({ 
              isLoading: false, 
              error: data.detail || "Google login failed." 
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
              error: result.detail || "Registration failed." 
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

      logout: () => {
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });
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
    }
  }

  return response;
};
