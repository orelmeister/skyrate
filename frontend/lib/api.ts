/**
 * API Client for SkyRate AI Backend
 * Handles all HTTP requests to the FastAPI backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface User {
  id: number;
  email: string;
  role: 'consultant' | 'vendor' | 'admin';
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login: string | null;
  subscription?: Subscription;
}

export interface Subscription {
  id: number;
  user_id: number;
  plan: 'monthly' | 'yearly';
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  price_cents: number;
  start_date: string;
  trial_end: string | null;
  current_period_start: string;
  current_period_end: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface ConsultantProfile {
  id: number;
  user_id: number;
  crn: string | null;  // Consultant Registration Number
  company_name: string;
  contact_name: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  settings: Record<string, any>;
  school_count: number;
  created_at: string;
}

export interface VendorProfile {
  id: number;
  user_id: number;
  spin: string | null;  // Service Provider Identification Number
  company_name: string;
  contact_name: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  equipment_types: string[];
  services_offered: string[];
  service_areas: string[];
  search_count: number;
  created_at: string;
}

export interface SpinValidationResult {
  valid: boolean;
  spin?: string;
  service_provider_name?: string;
  doing_business_as?: string;
  status?: string;
  fcc_registration_number?: string;
  general_contact_name?: string;
  general_contact_email?: string;
  phone_number?: string;
  mailing_address?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  physical_address?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  error?: string;
}

export interface ServicedEntity {
  ben: string;
  organization_name: string;
  state: string;
  funding_years: string[];
  total_amount: number;
  frn_count: number;
  service_types: string[];
  categories: string[];
  current_year?: string;
  current_cat1?: number;
  current_cat2?: number;
}

export interface ServicedEntitiesResponse {
  spin: string;
  service_provider_name: string | null;
  total_entities: number;
  total_authorized: number;
  funding_years: string[];
  entities: ServicedEntity[];
}

// Entity Detail Types for the modal view
export interface EntityYearData {
  year: string;
  cat1_total: number;
  cat2_total: number;
  total: number;
  frn_count: number;
  service_types: string[];
  line_items: EntityLineItem[];
}

export interface EntityLineItem {
  frn: string;
  service_type: string;
  category: string;
  amount: number;
  status: string;
}

export interface EntityDetailResponse {
  success: boolean;
  spin: string;
  entity: {
    ben: string;
    organization_name: string;
    state: string;
    city: string;
    service_provider_name: string;
  };
  total_cat1: number;
  total_cat2: number;
  total_all: number;
  current_year_budget: {
    year: string;
    cat1: number;
    cat2: number;
    total: number;
  } | null;
  all_service_types: string[];
  total_frns: number;
  years: EntityYearData[];
  funding_years: string[];
}

// ==================== FORM 471 COMPETITIVE ANALYSIS TYPES ====================

export interface Form471Record {
  funding_year: string;
  frn: string;
  application_number: string;
  service_provider_spin: string;
  service_provider_name: string;
  service_type: string;
  category: string;
  committed_amount: number;
  pre_discount_amount: number;
  discount_rate: number;
  frn_status: string;
  product_description: string;
}

export interface Form471Vendor {
  spin: string;
  name: string;
  frn_count: number;
  total_committed: number;
  entity_count?: number;
}

export interface Form471ByEntityResponse {
  success: boolean;
  ben: string;
  entity_name: string;
  entity_state: string;
  total_records: number;
  total_committed: number;
  funding_years: string[];
  vendors: Form471Vendor[];
  records: Form471Record[];
  error?: string;
}

export interface Form471ByStateResponse {
  success: boolean;
  state: string;
  year?: number;
  category?: string;
  total_records: number;
  records: {
    ben: string;
    entity_name: string;
    funding_year: string;
    frn: string;
    service_provider_spin: string;
    service_provider_name: string;
    service_type: string;
    category: string;
    committed_amount: number;
    frn_status: string;
  }[];
  error?: string;
}

export interface CompetitorAnalysisResponse {
  success: boolean;
  spin: string;
  entities_analyzed: number;
  my_frn_count: number;
  competitor_frn_count: number;
  competitors: Form471Vendor[];
  message?: string;
  error?: string;
}

// ==================== APPEALS TYPES ====================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface AppealRecord {
  id: number;
  user_id: number;
  frn: string;
  organization_name: string | null;
  denial_reason: string | null;
  denial_details: Record<string, any> | null;
  strategy: Record<string, any> | null;
  appeal_letter: string;
  chat_history: ChatMessage[];
  status: 'draft' | 'finalized' | 'submitted';
  created_at: string;
  updated_at: string;
}

export interface ConsultantSchool {
  id: number;
  consultant_id: number;
  ben: string;
  name: string;
  state: string;
  city: string | null;
  district: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
  last_sync: string | null;
  created_at: string;
}

class ApiClient {
  private getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    
    // First check the direct localStorage keys (legacy)
    let token = localStorage.getItem('access_token');
    if (token) return token;
    
    // Then check Zustand persist storage
    try {
      const stored = localStorage.getItem('skyrate-auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.state?.token || null;
      }
    } catch (e) {
      console.error('Failed to parse auth state:', e);
    }
    return null;
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    
    // First check the direct localStorage keys (legacy)
    let token = localStorage.getItem('refresh_token');
    if (token) return token;
    
    // Then check Zustand persist storage
    try {
      const stored = localStorage.getItem('skyrate-auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.state?.refreshToken || null;
      }
    } catch (e) {
      console.error('Failed to parse auth state:', e);
    }
    return null;
  }

  setTokens(access: string, refresh: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
    }
  }

  clearTokens() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;
    const accessToken = this.getAccessToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle 401 - try to refresh token
      const refreshToken = this.getRefreshToken();
      if (response.status === 401 && refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          const newToken = this.getAccessToken();
          headers['Authorization'] = `Bearer ${newToken}`;
          const retryResponse = await fetch(url, { ...options, headers });
          const retryData = await retryResponse.json();
          return { success: retryResponse.ok, data: retryData };
        }
      }

      const data = await response.json();
      
      if (!response.ok) {
        // Handle Pydantic validation errors (array of {type, loc, msg, input})
        let errorMessage = 'Request failed';
        if (data.detail) {
          if (Array.isArray(data.detail)) {
            // Pydantic validation errors
            errorMessage = data.detail.map((e: any) => e.msg || e.message || String(e)).join(', ');
          } else if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          } else if (typeof data.detail === 'object' && data.detail.msg) {
            errorMessage = data.detail.msg;
          }
        } else if (data.error) {
          errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        }
        return {
          success: false,
          error: errorMessage,
        };
      }

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        this.clearTokens();
        return false;
      }

      const data = await response.json();
      this.setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  // ==================== AUTH ====================

  async register(data: {
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
    company_name?: string;
    role: 'consultant' | 'vendor';
    crn?: string;  // Consultant Registration Number
    spin?: string; // Service Provider Identification Number
  }): Promise<ApiResponse<TokenResponse>> {
    const response = await this.request<TokenResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (response.success && response.data) {
      this.setTokens(response.data.access_token, response.data.refresh_token);
    }

    return response;
  }

  async login(email: string, password: string): Promise<ApiResponse<TokenResponse>> {
    const response = await this.request<TokenResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.success && response.data) {
      this.setTokens(response.data.access_token, response.data.refresh_token);
    }

    return response;
  }

  async loginWithGoogle(idToken: string, role: 'consultant' | 'vendor' = 'consultant'): Promise<ApiResponse<TokenResponse>> {
    const response = await this.request<TokenResponse>('/api/v1/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken, role }),
    });

    if (response.success && response.data) {
      this.setTokens(response.data.access_token, response.data.refresh_token);
    }

    return response;
  }

  async logout(): Promise<void> {
    this.clearTokens();
  }

  async getProfile(): Promise<ApiResponse<{ user: User }>> {
    return this.request('/api/v1/auth/me');
  }

  // ==================== CONSULTANT ====================

  async getConsultantProfile(): Promise<ApiResponse<{ profile: ConsultantProfile }>> {
    return this.request('/api/v1/consultant/profile');
  }

  async updateConsultantProfile(data: Partial<ConsultantProfile>): Promise<ApiResponse<{ profile: ConsultantProfile }>> {
    return this.request('/api/v1/consultant/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getDashboardStats(): Promise<ApiResponse<{
    total_schools: number;
    total_c2_funding: number;
    total_c1_funding: number;
    total_funding: number;
    total_applications: number;
    denied_count: number;
    funded_count: number;
    pending_count: number;
    schools_with_denials: number;
  }>> {
    return this.request('/api/v1/consultant/dashboard-stats');
  }

  async getDeniedApplications(year?: number): Promise<ApiResponse<{
    denied_applications: Array<{
      frn: string;
      ben: string;
      school_name: string;
      funding_year: string;
      status: string;
      service_type: string;
      amount_requested: number;
      denial_reason: string | null;
      application_number: string;
      has_appeal: boolean;
    }>;
    total_denied: number;
    total_denied_amount: number;
    year: number;
  }>> {
    const params = year ? `?year=${year}` : '';
    return this.request(`/api/v1/consultant/denied-applications${params}`);
  }

  async getConsultantSchools(includeUsacData: boolean = false): Promise<ApiResponse<{ schools: ConsultantSchool[]; count: number }>> {
    const params = includeUsacData ? '?include_usac_data=true' : '';
    return this.request(`/api/v1/consultant/schools${params}`);
  }

  async addConsultantSchool(ben: string, notes?: string): Promise<ApiResponse<{ school: ConsultantSchool }>> {
    return this.request('/api/v1/consultant/schools', {
      method: 'POST',
      body: JSON.stringify({ ben, notes }),
    });
  }

  async removeConsultantSchool(ben: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/consultant/schools/${ben}`, {
      method: 'DELETE',
    });
  }

  async validateBens(bens: string[]): Promise<ApiResponse<{
    total: number;
    valid_count: number;
    invalid_count: number;
    already_exists_count: number;
    results: Array<{
      ben: string;
      valid: boolean;
      school_name: string | null;
      state: string | null;
      already_exists: boolean;
      error: string | null;
    }>;
  }>> {
    return this.request('/api/v1/consultant/schools/validate-bens', {
      method: 'POST',
      body: JSON.stringify({ bens }),
    });
  }

  async downloadCsvTemplate(): Promise<Blob | null> {
    try {
      const token = this.getAccessToken();
      const response = await fetch(`${API_BASE_URL}/api/v1/consultant/schools/csv-template`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) return null;
      return response.blob();
    } catch {
      return null;
    }
  }

  async uploadSchoolsCsv(file: File, validateWithUsac: boolean = true): Promise<ApiResponse<{
    added: number;
    skipped: number;
    invalid: number;
    errors: string[];
    added_schools: Array<{ ben: string; school_name: string; state: string }>;
  }>> {
    const formData = new FormData();
    formData.append('file', file);

    const token = this.getAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/v1/consultant/upload-csv?validate_with_usac=${validateWithUsac}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const data = await response.json();
    return { success: response.ok, data };
  }

  async getSchoolApplications(ben: string, options?: {
    year?: number;
    status?: string;
    include_denial_reasons?: boolean;
  }): Promise<ApiResponse<{
    count: number;
    denial_count: number;
    funded_count: number;
    available_years: number[];
    applications: Array<{
      frn: string;
      application_number: string;
      funding_year: string;
      status: string;
      service_type: string;
      committed_amount: number;
      pre_discount_costs: number;
      discount_rate: number;
      is_denied: boolean;
      denial_reason: string | null;
    }>;
  }>> {
    const params = new URLSearchParams();
    if (options?.year) params.append('year', options.year.toString());
    if (options?.status) params.append('status_filter', options.status);
    if (options?.include_denial_reasons) params.append('include_denial_reasons', 'true');
    return this.request(`/api/v1/consultant/schools/${ben}/applications?${params}`);
  }

  async getSchoolFunding(ben: string, year?: number): Promise<ApiResponse<any>> {
    const params = year ? `?year=${year}` : '';
    return this.request(`/api/v1/consultant/schools/${ben}/funding${params}`);
  }

  // ==================== SCHOOL ENRICHMENT ====================

  /**
   * Get comprehensive enriched school data from USAC
   */
  async getSchoolEnrichment(ben: string, forceRefresh: boolean = false): Promise<ApiResponse<{
    source: string;
    cached_at?: string;
    data: {
      ben: string;
      organization_name: string | null;
      entity_type: string | null;
      address: string | null;
      street: string | null;
      city: string | null;
      state: string | null;
      zip_code: string | null;
      frn_number: string | null;
      total_funding_committed: number;
      total_funding_requested: number;
      funding_years: number[];
      applications_count: number;
      has_category1: boolean;
      has_category2: boolean;
      status: string;
      latest_year: number | null;
      discount_rate: number | null;
    };
  }>> {
    const params = forceRefresh ? '?force_refresh=true' : '';
    return this.request(`/api/v1/schools/${ben}/enrich${params}`);
  }

  /**
   * Get school funding history by year
   */
  async getSchoolHistory(ben: string, years: number = 5): Promise<ApiResponse<{
    ben: string;
    years_count: number;
    total_committed: number;
    total_requested: number;
    history: Array<{
      year: number;
      applications: any[];
      total_requested: number;
      total_committed: number;
      has_funded: boolean;
      has_denied: boolean;
      categories: string[];
    }>;
  }>> {
    return this.request(`/api/v1/schools/${ben}/history?years=${years}`);
  }

  /**
   * Force refresh cached school data
   */
  async refreshSchoolCache(ben: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/schools/${ben}/refresh-cache`, {
      method: 'POST',
    });
  }

  // ==================== APPEALS (New API with Chat History) ====================

  /**
   * Generate a new appeal for a denied FRN
   */
  async generateAppeal(frn: string, additionalContext?: string): Promise<ApiResponse<AppealRecord>> {
    return this.request('/api/v1/appeals/generate', {
      method: 'POST',
      body: JSON.stringify({ 
        frn, 
        additional_context: additionalContext 
      }),
    });
  }

  /**
   * Continue chat conversation to refine an appeal
   */
  async chatWithAppeal(appealId: number, message: string): Promise<ApiResponse<{
    appeal_id: number;
    response: string;
    updated_letter: string;
    chat_history: ChatMessage[];
  }>> {
    return this.request('/api/v1/appeals/chat', {
      method: 'POST',
      body: JSON.stringify({ 
        appeal_id: appealId, 
        message 
      }),
    });
  }

  /**
   * Get a specific appeal by ID
   */
  async getAppeal(appealId: number): Promise<ApiResponse<AppealRecord>> {
    return this.request(`/api/v1/appeals/${appealId}`);
  }

  /**
   * Save/update an appeal (manually edit letter)
   */
  async saveAppeal(appealId: number, appealLetter: string, status?: string): Promise<ApiResponse<AppealRecord>> {
    return this.request(`/api/v1/appeals/${appealId}/save`, {
      method: 'PUT',
      body: JSON.stringify({ 
        appeal_letter: appealLetter,
        status 
      }),
    });
  }

  /**
   * Get all appeals for the current user
   */
  async getAppeals(status?: string, skip?: number, limit?: number): Promise<ApiResponse<{
    appeals: AppealRecord[];
    total: number;
    skip: number;
    limit: number;
  }>> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (skip !== undefined) params.append('skip', skip.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    const queryString = params.toString();
    return this.request(`/api/v1/appeals/${queryString ? '?' + queryString : ''}`);
  }

  /**
   * Delete an appeal
   */
  async deleteAppeal(appealId: number): Promise<ApiResponse<{ message: string }>> {
    return this.request(`/api/v1/appeals/${appealId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Download appeal as text file
   */
  async downloadAppealText(appealId: number): Promise<Blob> {
    const token = this.getAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/v1/appeals/${appealId}/download/txt`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Failed to download appeal');
    return response.blob();
  }

  /**
   * Download appeal as JSON
   */
  async downloadAppealJson(appealId: number): Promise<Blob> {
    const token = this.getAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/v1/appeals/${appealId}/download/json`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Failed to download appeal');
    return response.blob();
  }

  // ==================== VENDOR ====================

  async getVendorProfile(): Promise<ApiResponse<{ profile: VendorProfile }>> {
    return this.request('/api/v1/vendor/profile');
  }

  async updateVendorProfile(data: Partial<VendorProfile>): Promise<ApiResponse<{ profile: VendorProfile }>> {
    return this.request('/api/v1/vendor/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async searchSchools(filters: {
    state?: string;
    status?: string;
    service_type?: string;
    year?: number;
    min_amount?: number;
    max_amount?: number;
    limit?: number;
  }): Promise<ApiResponse<any>> {
    return this.request('/api/v1/vendor/search', {
      method: 'POST',
      body: JSON.stringify(filters),
    });
  }

  async getSchoolDetail(ben: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/vendor/schools/${ben}`);
  }

  async exportLeads(schoolIds: number[]): Promise<ApiResponse<any>> {
    return this.request('/api/v1/vendor/export', {
      method: 'POST',
      body: JSON.stringify({ school_ids: schoolIds }),
    });
  }

  // ==================== SPIN VALIDATION & SERVICED ENTITIES ====================

  async validateSpin(spin: string): Promise<ApiResponse<{ valid: boolean; provider?: SpinValidationResult; error?: string }>> {
    return this.request('/api/v1/vendor/spin/validate', {
      method: 'POST',
      body: JSON.stringify({ spin }),
    });
  }

  async getServicedEntities(year?: number): Promise<ApiResponse<ServicedEntitiesResponse>> {
    const params = year ? `?year=${year}` : '';
    return this.request(`/api/v1/vendor/spin/serviced-entities${params}`);
  }

  async getEntityDetail(ben: string): Promise<ApiResponse<EntityDetailResponse>> {
    return this.request(`/api/v1/vendor/spin/entity/${ben}`);
  }

  async lookupSpin(spin: string, year?: number): Promise<ApiResponse<{
    provider: SpinValidationResult;
    total_entities: number;
    total_authorized: number;
    funding_years: string[];
    entities: ServicedEntity[];
  }>> {
    const params = year ? `?year=${year}` : '';
    return this.request(`/api/v1/vendor/spin/${spin}/lookup${params}`);
  }

  // ==================== FORM 471 COMPETITIVE ANALYSIS ====================

  async get471ByEntity(ben: string, year?: number): Promise<ApiResponse<Form471ByEntityResponse>> {
    const params = year ? `?year=${year}` : '';
    return this.request(`/api/v1/vendor/471/entity/${ben}${params}`);
  }

  async get471ByState(state: string, year?: number, category?: string, limit: number = 500): Promise<ApiResponse<Form471ByStateResponse>> {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (category) params.set('category', category);
    if (limit) params.set('limit', String(limit));
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/v1/vendor/471/state/${state}${queryString}`);
  }

  async get471Competitors(year?: number): Promise<ApiResponse<CompetitorAnalysisResponse>> {
    const params = year ? `?year=${year}` : '';
    return this.request(`/api/v1/vendor/471/competitors${params}`);
  }

  async search471(filters: {
    ben?: string;
    state?: string;
    year?: number;
    category?: string;
    limit?: number;
  }): Promise<ApiResponse<Form471ByEntityResponse | Form471ByStateResponse>> {
    return this.request('/api/v1/vendor/471/search', {
      method: 'POST',
      body: JSON.stringify(filters),
    });
  }

  // ==================== SUBSCRIPTIONS ====================

  async getPaymentStatus(): Promise<ApiResponse<{
    requires_payment_setup: boolean;
    subscription_status: string | null;
    trial_ends_at: string | null;
    plan: string | null;
  }>> {
    return this.request('/api/v1/subscriptions/payment-status');
  }

  async createCheckoutSession(data: {
    plan: 'monthly' | 'yearly';
    success_url: string;
    cancel_url: string;
  }): Promise<ApiResponse<{ checkout_url: string; session_id: string }>> {
    return this.request('/api/v1/subscriptions/create-checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async redeemCoupon(coupon_code: string): Promise<ApiResponse<{
    success: boolean;
    message: string;
    redirect_url?: string;
  }>> {
    return this.request('/api/v1/subscriptions/redeem-coupon', {
      method: 'POST',
      body: JSON.stringify({ coupon_code }),
    });
  }

  async getSubscription(): Promise<ApiResponse<{ 
    success: boolean;
    subscription: Subscription | null;
    requires_payment_setup: boolean;
  }>> {
    return this.request('/api/v1/subscriptions/status');
  }

  async cancelSubscription(reason?: string): Promise<ApiResponse<any>> {
    return this.request('/api/v1/subscriptions/cancel', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async reactivateSubscription(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/subscriptions/reactivate', {
      method: 'POST',
    });
  }

  // ==================== QUERY ====================

  async naturalLanguageQuery(query: string, year?: number): Promise<ApiResponse<any>> {
    return this.request('/api/v1/query/natural', {
      method: 'POST',
      body: JSON.stringify({ query, year }),
    });
  }

  async directSearch(filters: Record<string, any>): Promise<ApiResponse<any>> {
    return this.request('/api/v1/query/search', {
      method: 'POST',
      body: JSON.stringify(filters),
    });
  }

  // ==================== ADMIN ====================

  async getAdminStats(): Promise<ApiResponse<{
    total_users: number;
    active_subscriptions: number;
    monthly_revenue: number;
    total_queries: number;
  }>> {
    return this.request('/api/v1/admin/stats');
  }

  async getAdminUsers(filters: {
    role?: string;
    status?: string;
    skip?: number;
    limit?: number;
  }): Promise<ApiResponse<{ users: any[] }>> {
    const params = new URLSearchParams();
    if (filters.role) params.set('role', filters.role);
    if (filters.status) params.set('status', filters.status);
    if (filters.skip) params.set('skip', String(filters.skip));
    if (filters.limit) params.set('limit', String(filters.limit));
    return this.request(`/api/v1/admin/users?${params.toString()}`);
  }

  async updateUserStatus(userId: string, isActive: boolean): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  // ==================== CRN AUTO-IMPORT ====================

  async verifyCRN(crn: string, autoImport: boolean = true): Promise<ApiResponse<{
    success: boolean;
    valid: boolean;
    crn: string;
    consultant: {
      company_name: string | null;
      contact_name: string | null;
      city: string | null;
      state: string | null;
      zipcode: string | null;
      phone: string | null;
      email: string | null;
    };
    school_count: number;
    schools: Array<{
      ben: string;
      organization_name: string;
      state: string;
      applicant_type: string;
    }>;
    years_found: number[];
    imported_count: number;
    skipped_count: number;
    imported: Array<{ ben: string; school_name: string; state: string }>;
    skipped: string[];
  }>> {
    return this.request(`/api/v1/consultant/crn/verify?crn=${encodeURIComponent(crn)}&auto_import=${autoImport}`, {
      method: 'POST',
    });
  }

  async previewCRNSchools(crn: string): Promise<ApiResponse<{
    crn: string;
    school_count: number;
    schools: Array<{
      ben: string;
      organization_name: string;
      state: string;
      city: string;
      entity_type: string;
    }>;
    years_queried: number[];
    has_more: boolean;
  }>> {
    return this.request(`/api/v1/consultant/crn/preview?crn=${encodeURIComponent(crn)}`);
  }

  async getSchoolsByCRN(): Promise<ApiResponse<{
    success: boolean;
    crn: string;
    total_found: number;
    already_added: number;
    new_schools: number;
    schools: Array<{
      ben: string;
      organization_name: string;
      state: string;
      city: string;
      entity_type: string;
      already_added: boolean;
    }>;
  }>> {
    return this.request('/api/v1/consultant/crn/schools');
  }

  async importSchoolsFromCRN(): Promise<ApiResponse<{
    success: boolean;
    crn: string;
    imported_count: number;
    skipped_count: number;
    imported: Array<{ ben: string; school_name: string; state: string }>;
  }>> {
    return this.request('/api/v1/consultant/crn/import', {
      method: 'POST',
    });
  }
}

// Singleton instance
export const api = new ApiClient();
