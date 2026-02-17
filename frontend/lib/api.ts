/**
 * API Client for SkyRate AI Backend
 * Handles all HTTP requests to the FastAPI backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface User {
  id: number;
  email: string;
  role: 'consultant' | 'vendor' | 'admin' | 'applicant';
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

// ==================== FRN STATUS MONITORING TYPES (Sprint 2) ====================

export interface FRNStatusRecord {
  frn: string;
  application_number: string;
  ben?: string;
  entity_name?: string;
  state?: string;
  funding_year: string;
  spin_name: string;
  service_type: string;
  status: string;
  pending_reason: string;
  commitment_amount: number;
  disbursed_amount: number;
  discount_rate: number;
  award_date: string;
  fcdl_date: string;
  last_invoice_date: string;
  service_start: string;
  service_end: string;
  invoicing_mode: string;
  invoicing_ready: string;
  f486_status: string;
  wave_number: string;
  fcdl_comment: string;
}

export interface FRNStatusSummary {
  funded: { count: number; amount: number };
  denied: { count: number; amount: number };
  pending: { count: number; amount: number };
}

export interface FRNStatusResponse {
  success: boolean;
  spin: string;
  spin_name: string;
  total_frns: number;
  summary: FRNStatusSummary;
  frns: FRNStatusRecord[];
  error?: string;
}

export interface FRNStatusSummaryResponse {
  success: boolean;
  spin: string;
  spin_name: string;
  total_frns: number;
  summary: FRNStatusSummary;
  year_filter?: number;
  error?: string;
}

export interface EntityFRNStatusResponse {
  success: boolean;
  ben: string;
  entity_name: string;
  entity_state: string;
  total_frns: number;
  years: string[];
  summary: FRNStatusSummary;
  frns: FRNStatusRecord[];
  years_breakdown?: {
    year: string;
    funded: { count: number; amount: number };
    denied: { count: number; amount: number };
    pending: { count: number; amount: number };
    total: number;
    frns: FRNStatusRecord[];
  }[];
  error?: string;
}

// ==================== ALERTS TYPES ====================

export interface AlertRecord {
  id: number;
  user_id: number;
  alert_type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  metadata?: Record<string, any>;
  is_read: boolean;
  is_dismissed: boolean;
  is_actioned: boolean;
  email_sent: boolean;
  created_at: string;
  read_at?: string;
}

export interface AlertConfig {
  id: number;
  user_id: number;
  alert_on_denial: boolean;
  alert_on_status_change: boolean;
  alert_on_deadline: boolean;
  alert_on_disbursement: boolean;
  alert_on_funding_approved: boolean;
  alert_on_form_470: boolean;
  alert_on_competitor: boolean;
  deadline_warning_days: number;
  min_alert_amount: number;
  email_notifications: boolean;
  in_app_notifications: boolean;
  daily_digest: boolean;
  notification_email?: string;
  alert_filters?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AlertType {
  type: string;
  name: string;
  description: string;
  roles: string[];
}

// ==================== FORM 470 LEAD GENERATION TYPES (Sprint 3) ====================

export interface Form470Service {
  service_category: string;
  service_type: string;
  function: string;
  manufacturer: string | null;
  quantity: string;
  unit: string;
  min_capacity: string | null;
  max_capacity: string | null;
  installation_required: string;
}

export interface Form470Lead {
  application_number: string;
  funding_year: string;
  ben: string;
  entity_name: string;
  state: string;
  city: string;
  applicant_type: string;
  status: string;
  posting_date: string;
  allowable_contract_date: string;
  // Contacts
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  technical_contact: string | null;
  technical_email: string | null;
  technical_phone: string | null;
  // Descriptions
  cat1_description: string | null;
  cat2_description: string | null;
  // Services
  services: Form470Service[];
  manufacturers: string[];
  service_types: string[];
  categories: string[];
}

export interface Form470LeadsResponse {
  success: boolean;
  total_leads: number;
  leads: Form470Lead[];
  filters_applied: {
    year?: number;
    state?: string;
    category?: string;
    service_type?: string;
    manufacturer?: string;
  };
  error?: string;
}

export interface Form470DetailEntity {
  ben: string;
  name: string;
  type: string;
  address: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string | null;
  website: string | null;
  eligible_entities: string;
}

export interface Form470Contact {
  name: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  title?: string;
}

export interface Form470DetailResponse {
  success: boolean;
  application_number: string;
  funding_year: string;
  status: string;
  form_nickname: string;
  entity: Form470DetailEntity;
  contact: Form470Contact;
  technical_contact: Form470Contact;
  authorized_person: Form470Contact;
  category_one_description: string | null;
  category_two_description: string | null;
  posting_date: string;
  allowable_contract_date: string;
  created_date: string;
  services: Form470Service[];
  total_services: number;
  manufacturers: string[];
  service_types: string[];
  categories: string[];
  error?: string;
}

// ==================== SAVED LEADS TYPES ====================

export interface EnrichedContactData {
  linkedin_url?: string;
  twitter?: string;
  additional_contacts?: {
    name: string;
    email: string;
    position?: string;
    phone?: string;
    linkedin?: string;
    confidence?: number;
    verified?: boolean;
  }[];
  person?: {
    name?: string;
    position?: string;
    linkedin?: string;
    twitter?: string;
    phone?: string;
    location?: string;
  };
  company?: {
    name?: string;
    domain?: string;
    linkedin?: string;
    description?: string;
    industry?: string;
    employees?: string;
    location?: string;
    logo?: string;
    phone?: string;
  };
  linkedin_search_url?: string;
  source?: string;
  enriched_at?: string;
  api_available?: boolean;
  error?: string;
}

export interface USACContact {
  source: string;
  year?: number | string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  role: string;
}

export interface SavedLead {
  id: number;
  form_type: '470' | '471';
  application_number: string;
  ben: string;
  frn?: string;
  entity_name: string | null;
  entity_type: string | null;
  entity_state: string | null;
  entity_city: string | null;
  entity_address?: string;
  entity_zip?: string;
  entity_phone?: string;
  entity_website?: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_title?: string;
  all_contacts?: USACContact[];
  enriched_data: EnrichedContactData;
  enrichment_date: string | null;
  lead_status: 'new' | 'contacted' | 'qualified' | 'won' | 'lost';
  notes: string | null;
  tags?: string[];
  application_status?: string;
  frn_status?: string;
  funding_year: number | null;
  funding_amount?: number;
  committed_amount?: number;
  funded_amount?: number;
  service_type?: string;
  categories: string[];
  services: string[];
  manufacturers: string[];
  created_at: string;
  updated_at: string;
}

// Entity enrichment response from USAC data
export interface EntityEnrichmentResponse {
  success: boolean;
  ben: string;
  entity: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    website?: string;
    entity_type?: string;
  };
  applications: {
    application_number: string;
    funding_year: string;
    application_status: string;
    category?: string;
    total_requested: number;
    certified_date?: string;
    billed_entity_name?: string;
  }[];
  frns: {
    frn: string;
    frn_status: string;
    funding_year: string;
    application_number?: string;
    commitment_amount: number;
    original_request: number;
    funded_amount: number;
    denied_amount: number;
    pending_amount: number;
    service_type?: string;
    category?: string;
    frn_nickname?: string;
    wave_number?: string;
    fcdl_date?: string;
    fcdl_comment?: string;
  }[];
  frn_status: {
    success: boolean;
    summary?: {
      total_frns: number;
      funded_count: number;
      denied_count: number;
      pending_count: number;
      total_committed: number;
      total_funded: number;
      total_denied: number;
    };
  };
  contacts: USACContact[];
  funding_summary: {
    total_frns: number;
    total_committed: number;
    total_funded: number;
    years_with_funding: number;
    funding_years: string[];
    status_breakdown?: {
      funded: number;
      denied: number;
      pending: number;
    };
  };
}

export interface SavedLeadsResponse {
  success: boolean;
  total: number;
  leads: SavedLead[];
  limit: number;
  offset: number;
}

export interface SaveLeadRequest {
  form_type: '470' | '471';
  application_number: string;
  ben: string;
  entity_name?: string;
  entity_type?: string;
  entity_state?: string;
  entity_city?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  funding_year?: number;
  categories?: string[];
  services?: string[];
  manufacturers?: string[];
}

export interface EnrichmentResponse {
  success: boolean;
  lead?: SavedLead;
  enrichment?: EnrichedContactData;
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

  // Generic HTTP method wrappers
  async get<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(`/api/v1${endpoint}`, { method: 'GET' });
  }

  async post<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(`/api/v1${endpoint}`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(`/api/v1${endpoint}`, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(`/api/v1${endpoint}`, { method: 'DELETE' });
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

  async getConsultantSchools(includeUsacData: boolean = false): Promise<ApiResponse<{ schools: ConsultantSchool[]; count: number; synced?: boolean }>> {
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

  // ==================== COMPREHENSIVE SCHOOL DATA ====================

  /**
   * Get comprehensive C2 budget data for a school
   */
  async getSchoolBudget(ben: string): Promise<ApiResponse<{
    success: boolean;
    ben: string;
    school_name: string;
    current_cycle: {
      cycle: string;
      c2_budget: number;
      funded_amount: number;
      pending_amount: number;
      available_amount: number;
      budget_algorithm: string;
      child_entity_count: number;
      full_time_students: number;
    };
    previous_cycle?: Record<string, any>;
    all_cycles: Record<string, any>;
    summary: {
      total_c2_budget: number;
      total_funded: number;
      total_available: number;
    };
  }>> {
    return this.request(`/api/v1/consultant/schools/${ben}/budget`);
  }

  /**
   * Get comprehensive data for a school (funding + budget + history)
   */
  async getComprehensiveSchoolData(ben: string): Promise<ApiResponse<{
    success: boolean;
    school: {
      ben: string;
      name: string;
      state: string;
      entity_type: string | null;
    };
    c2_budget: Record<string, {
      c2_budget: number;
      funded: number;
      pending: number;
      available: number;
    }>;
    c2_budget_summary: {
      current_cycle: Record<string, any>;
      previous_cycle: Record<string, any>;
    };
    funding_totals: {
      category_1: { funded: number; requested: number };
      category_2: { funded: number; requested: number };
      lifetime_total: number;
    };
    years: Array<{
      year: string;
      applications: any[];
      c1_funded: number;
      c1_requested: number;
      c2_funded: number;
      c2_requested: number;
      status_summary: Record<string, number>;
    }>;
    applications_count: number;
  }>> {
    return this.request(`/api/v1/consultant/schools/${ben}/comprehensive`);
  }

  // ==================== NATIONAL INSTITUTION SEARCH ====================

  /**
   * Search for institutions nationwide
   */
  async searchInstitutions(query: string, state?: string, limit: number = 50): Promise<ApiResponse<{
    success: boolean;
    count: number;
    results: Array<{
      ben: string;
      name: string;
      city: string;
      state: string;
      entity_type: string;
      c2_budget: number;
      c2_funded: number;
      c2_available: number;
      has_consultant: boolean;
      in_portfolio: boolean;
    }>;
    query: string;
    state_filter: string | null;
  }>> {
    const params = new URLSearchParams();
    params.set('query', query);
    if (state) params.set('state', state);
    if (limit) params.set('limit', String(limit));
    return this.request(`/api/v1/consultant/search/institutions?${params.toString()}`);
  }

  /**
   * Get details for any institution by BEN (national search result details)
   */
  async getInstitutionDetails(ben: string): Promise<ApiResponse<{
    success: boolean;
    ben: string;
    entity: {
      name: string;
      state: string;
      entity_type: string;
      contact_name?: string;
      contact_email?: string;
    };
    c2_budgets: Record<string, {
      budget: number;
      funded: number;
      pending: number;
      available: number;
    }>;
    years: Array<{
      year: string;
      frn_count: number;
      total_committed: number;
      statuses: Record<string, number>;
    }>;
    total_applications: number;
    in_portfolio: boolean;
  }>> {
    return this.request(`/api/v1/consultant/search/institutions/${ben}`);
  }

  // ==================== CONSULTANT FRN STATUS MONITORING ====================

  /**
   * Get FRN status for all schools in consultant's portfolio
   */
  async getConsultantFRNStatus(year?: number, status?: string, limit: number = 500): Promise<ApiResponse<{
    success: boolean;
    total_frns: number;
    total_schools: number;
    summary: {
      funded: { count: number; amount: number };
      denied: { count: number; amount: number };
      pending: { count: number; amount: number };
      other: { count: number; amount: number };
    };
    year_filter?: number;
    schools: Array<{
      ben: string;
      entity_name: string;
      total_frns: number;
      funded: number;
      denied: number;
      pending: number;
      total_amount: number;
      frns: FRNStatusRecord[];
    }>;
  }>> {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (status) params.set('status_filter', status);
    if (limit) params.set('limit', String(limit));
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/v1/consultant/frn-status${queryString}`);
  }

  /**
   * Get FRN status summary for consultant's portfolio
   */
  async getConsultantFRNStatusSummary(year?: number): Promise<ApiResponse<{
    success: boolean;
    total_schools: number;
    total_frns: number;
    summary: {
      funded: { count: number; amount: number };
      denied: { count: number; amount: number };
      pending: { count: number; amount: number };
    };
    year_filter?: number;
  }>> {
    const params = year ? `?year=${year}` : '';
    return this.request(`/api/v1/consultant/frn-status/summary${params}`);
  }

  /**
   * Get FRN status for a specific school in consultant's portfolio
   */
  async getConsultantSchoolFRNStatus(ben: string, year?: number): Promise<ApiResponse<{
    success: boolean;
    ben: string;
    entity_name: string;
    total_frns: number;
    frns: FRNStatusRecord[];
    years: string[];
    summary: {
      funded: { count: number; amount: number };
      denied: { count: number; amount: number };
      pending: { count: number; amount: number };
    };
  }>> {
    const params = year ? `?year=${year}` : '';
    return this.request(`/api/v1/consultant/frn-status/school/${ben}${params}`);
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

  /**
   * Get comprehensive enriched data for an entity/school
   * Queries multiple USAC datasets for full lead profile including:
   * - Entity information (name, address, type)
   * - Application status and details
   * - FRN history with actual status (Funded/Denied/Pending)
   * - Contact information from Form 470 and Entity Supplemental data
   * - Funding summary
   */
  async enrichEntity(ben: string, options?: {
    year?: number;
    application_number?: string;
    frn?: string;
  }): Promise<ApiResponse<EntityEnrichmentResponse>> {
    const params = new URLSearchParams();
    if (options?.year) params.set('year', String(options.year));
    if (options?.application_number) params.set('application_number', options.application_number);
    if (options?.frn) params.set('frn', options.frn);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/v1/vendor/entity/${ben}/enrich${queryString}`);
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

  // ==================== FRN STATUS MONITORING (Sprint 2) ====================

  /**
   * Get FRN status for all your contracts (filtered by your SPIN)
   */
  async getFRNStatus(year?: number, status?: string, limit: number = 500): Promise<ApiResponse<FRNStatusResponse>> {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (status) params.set('status', status);
    if (limit) params.set('limit', String(limit));
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/v1/vendor/frn-status${queryString}`);
  }

  /**
   * Get FRN status summary (counts and totals without individual FRN details)
   */
  async getFRNStatusSummary(year?: number): Promise<ApiResponse<FRNStatusSummaryResponse>> {
    const params = year ? `?year=${year}` : '';
    return this.request(`/api/v1/vendor/frn-status/summary${params}`);
  }

  /**
   * Get FRN status for a specific entity (school)
   */
  async getEntityFRNStatus(ben: string, year?: number): Promise<ApiResponse<EntityFRNStatusResponse>> {
    const params = year ? `?year=${year}` : '';
    return this.request(`/api/v1/vendor/frn-status/entity/${ben}${params}`);
  }

  // ==================== FORM 470 LEAD GENERATION (Sprint 3) ====================

  /**
   * Get Form 470 leads (core sales workflow)
   * KEY DIFFERENTIATOR: Supports manufacturer filtering - exclusive to SkyRate!
   */
  async get470Leads(filters: {
    year?: number;
    state?: string;
    category?: string;
    service_type?: string;
    manufacturer?: string;
    limit?: number;
  }): Promise<ApiResponse<Form470LeadsResponse>> {
    const params = new URLSearchParams();
    if (filters.year) params.append('year', filters.year.toString());
    if (filters.state) params.append('state', filters.state);
    if (filters.category) params.append('category', filters.category);
    if (filters.service_type) params.append('service_type', filters.service_type);
    if (filters.manufacturer) params.append('manufacturer', filters.manufacturer);
    if (filters.limit) params.append('limit', filters.limit.toString());
    const queryString = params.toString();
    return this.request(`/api/v1/vendor/470/leads${queryString ? '?' + queryString : ''}`);
  }

  /**
   * Get Form 470 leads by state
   */
  async get470ByState(state: string, year?: number, category?: string, limit: number = 500): Promise<ApiResponse<Form470LeadsResponse>> {
    const params = new URLSearchParams();
    if (year) params.append('year', year.toString());
    if (category) params.append('category', category);
    params.append('limit', limit.toString());
    return this.request(`/api/v1/vendor/470/state/${state}?${params}`);
  }

  /**
   * Get Form 470 leads by manufacturer - KEY DIFFERENTIATOR!
   * Exclusive manufacturer filtering - only available in SkyRate
   */
  async get470ByManufacturer(manufacturer: string, year?: number, state?: string, limit: number = 500): Promise<ApiResponse<Form470LeadsResponse>> {
    const params = new URLSearchParams();
    if (year) params.append('year', year.toString());
    if (state) params.append('state', state);
    params.append('limit', limit.toString());
    return this.request(`/api/v1/vendor/470/manufacturer/${encodeURIComponent(manufacturer)}?${params}`);
  }

  /**
   * Get detailed Form 470 application info
   */
  async get470Detail(applicationNumber: string): Promise<ApiResponse<Form470DetailResponse>> {
    return this.request(`/api/v1/vendor/470/${applicationNumber}`);
  }

  /**
   * Search Form 470 with advanced filters
   */
  async search470(filters: {
    year?: number;
    state?: string;
    category?: string;
    service_type?: string;
    manufacturer?: string;
    limit?: number;
  }): Promise<ApiResponse<Form470LeadsResponse>> {
    return this.request('/api/v1/vendor/470/search', {
      method: 'POST',
      body: JSON.stringify(filters),
    });
  }

  // ==================== SAVED LEADS ====================

  /**
   * Get all saved leads for the vendor
   */
  async getSavedLeads(filters?: {
    lead_status?: string;
    form_type?: string;
    state?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<SavedLeadsResponse>> {
    const params = new URLSearchParams();
    if (filters?.lead_status) params.append('lead_status', filters.lead_status);
    if (filters?.form_type) params.append('form_type', filters.form_type);
    if (filters?.state) params.append('state', filters.state);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    const query = params.toString();
    return this.request(`/api/v1/vendor/saved-leads${query ? `?${query}` : ''}`);
  }

  /**
   * Save a lead for follow-up
   */
  async saveLead(data: SaveLeadRequest): Promise<ApiResponse<{ success: boolean; lead?: SavedLead; error?: string }>> {
    return this.request('/api/v1/vendor/saved-leads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Check if a lead is already saved
   */
  async checkLeadSaved(formType: string, applicationNumber: string): Promise<ApiResponse<{
    success: boolean;
    is_saved: boolean;
    lead: SavedLead | null;
  }>> {
    return this.request(`/api/v1/vendor/saved-leads/check/${formType}/${applicationNumber}`);
  }

  /**
   * Get a specific saved lead
   */
  async getSavedLead(leadId: number): Promise<ApiResponse<{ success: boolean; lead: SavedLead }>> {
    return this.request(`/api/v1/vendor/saved-leads/${leadId}`);
  }

  /**
   * Update a saved lead's status or notes
   */
  async updateSavedLead(leadId: number, data: {
    lead_status?: string;
    notes?: string;
  }): Promise<ApiResponse<{ success: boolean; lead: SavedLead }>> {
    return this.request(`/api/v1/vendor/saved-leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a saved lead
   */
  async deleteSavedLead(leadId: number): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return this.request(`/api/v1/vendor/saved-leads/${leadId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Enrich a saved lead with additional contact info from Hunter.io
   */
  async enrichSavedLead(leadId: number, data?: {
    contact_email?: string;
    contact_name?: string;
    company_domain?: string;
  }): Promise<ApiResponse<EnrichmentResponse>> {
    return this.request(`/api/v1/vendor/saved-leads/${leadId}/enrich`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  /**
   * Export saved leads
   */
  async exportSavedLeads(options?: {
    lead_ids?: number[];
    lead_status?: string;
  }): Promise<ApiResponse<{
    success: boolean;
    count: number;
    data: Record<string, any>[];
    columns: string[];
  }>> {
    return this.request('/api/v1/vendor/saved-leads/export', {
      method: 'POST',
      body: JSON.stringify(options || {}),
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

  // ==================== ALERTS ====================

  /**
   * Get all alerts for the current user
   */
  async getAlerts(options?: {
    unread_only?: boolean;
    alert_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<{
    success: boolean;
    total: number;
    unread_count: number;
    limit: number;
    offset: number;
    alerts: AlertRecord[];
  }>> {
    const params = new URLSearchParams();
    if (options?.unread_only) params.set('unread_only', 'true');
    if (options?.alert_type) params.set('alert_type', options.alert_type);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/v1/alerts${queryString}`);
  }

  /**
   * Get count of unread alerts (for badge display)
   */
  async getUnreadAlertCount(): Promise<ApiResponse<{ unread_count: number }>> {
    return this.request('/api/v1/alerts/unread-count');
  }

  /**
   * Get alert configuration/preferences
   */
  async getAlertConfig(): Promise<ApiResponse<{ success: boolean; config: AlertConfig }>> {
    return this.request('/api/v1/alerts/config');
  }

  /**
   * Update alert configuration/preferences
   */
  async updateAlertConfig(config: Partial<AlertConfig>): Promise<ApiResponse<{ success: boolean; config: AlertConfig }>> {
    return this.request('/api/v1/alerts/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  /**
   * Mark specific alerts as read
   */
  async markAlertsRead(alertIds: number[]): Promise<ApiResponse<{ success: boolean; marked_read: number }>> {
    return this.request('/api/v1/alerts/mark-read', {
      method: 'POST',
      body: JSON.stringify({ alert_ids: alertIds }),
    });
  }

  /**
   * Mark all alerts as read
   */
  async markAllAlertsRead(): Promise<ApiResponse<{ success: boolean; marked_read: number }>> {
    return this.request('/api/v1/alerts/mark-all-read', {
      method: 'POST',
    });
  }

  /**
   * Dismiss specific alerts (soft delete)
   */
  async dismissAlerts(alertIds: number[]): Promise<ApiResponse<{ success: boolean; dismissed: number }>> {
    return this.request('/api/v1/alerts/dismiss', {
      method: 'POST',
      body: JSON.stringify({ alert_ids: alertIds }),
    });
  }

  /**
   * Delete an alert permanently
   */
  async deleteAlert(alertId: number): Promise<ApiResponse<{ success: boolean; deleted: boolean }>> {
    return this.request(`/api/v1/alerts/${alertId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get available alert types with descriptions
   */
  async getAlertTypes(): Promise<ApiResponse<{ success: boolean; alert_types: AlertType[] }>> {
    return this.request('/api/v1/alerts/types');
  }

  /**
   * Get alerts summary for the last N days
   */
  async getAlertsSummary(days: number = 7): Promise<ApiResponse<{
    success: boolean;
    period_days: number;
    total_alerts: number;
    unread_count: number;
    by_type: Record<string, number>;
    by_priority: Record<string, number>;
  }>> {
    return this.request(`/api/v1/alerts/summary?days=${days}`);
  }

  // ==================== ADMIN APIs ====================

  /**
   * Get admin dashboard overview
   */
  async getAdminDashboard(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/admin/dashboard');
  }

  /**
   * List all users (admin)
   */
  async getAdminUsers(params?: { role?: string; search?: string; limit?: number; offset?: number }): Promise<ApiResponse<any>> {
    const qs = new URLSearchParams();
    if (params?.role) qs.set('role', params.role);
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', params.limit.toString());
    if (params?.offset) qs.set('offset', params.offset.toString());
    return this.request(`/api/v1/admin/users?${qs.toString()}`);
  }

  /**
   * Get admin analytics
   */
  async getAdminAnalytics(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/admin/analytics');
  }

  /**
   * List all support tickets (admin)
   */
  async getAdminTickets(params?: { status?: string; priority?: string; search?: string; limit?: number; offset?: number }): Promise<ApiResponse<any>> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status_filter', params.status);
    if (params?.priority) qs.set('priority', params.priority);
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', params.limit.toString());
    if (params?.offset) qs.set('offset', params.offset.toString());
    return this.request(`/api/v1/admin/tickets?${qs.toString()}`);
  }

  /**
   * Get a specific ticket with messages (admin)
   */
  async getAdminTicket(ticketId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/admin/tickets/${ticketId}`);
  }

  /**
   * Update ticket status/priority (admin)
   */
  async updateAdminTicket(ticketId: number, data: { status?: string; priority?: string; admin_notes?: string }): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/admin/tickets/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Reply to a ticket (admin)
   */
  async replyToTicket(ticketId: number, message: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/admin/tickets/${ticketId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  /**
   * Get FRN monitor data (admin)
   */
  async getAdminFRNMonitor(params?: { status?: string; funding_year?: number; search?: string; limit?: number }): Promise<ApiResponse<any>> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status_filter', params.status);
    if (params?.funding_year) qs.set('funding_year', params.funding_year.toString());
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', params.limit.toString());
    return this.request(`/api/v1/admin/frn-monitor?${qs.toString()}`);
  }

  /**
   * Get recent FRN denials (admin)
   */
  async getAdminDenials(days?: number): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/admin/frn-monitor/denials?days=${days || 30}`);
  }

  /**
   * Send email to a specific user (admin)
   */
  async emailUser(userId: number, subject: string, message: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/admin/users/${userId}/email`, {
      method: 'POST',
      body: JSON.stringify({ subject, message }),
    });
  }

  // ==================== SUPPORT TICKET APIs ====================

  /**
   * Create a support ticket (works for guests too)
   */
  async createSupportTicket(data: {
    subject: string;
    message: string;
    category?: string;
    source?: string;
    guest_name?: string;
    guest_email?: string;
  }): Promise<ApiResponse<any>> {
    return this.request('/api/v1/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * List current user's support tickets
   */
  async getMySupportTickets(status?: string): Promise<ApiResponse<any>> {
    const qs = status ? `?status_filter=${status}` : '';
    return this.request(`/api/v1/support/tickets${qs}`);
  }

  /**
   * Get a specific support ticket with messages
   */
  async getSupportTicket(ticketId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/support/tickets/${ticketId}`);
  }

  /**
   * Add message to a support ticket
   */
  async addTicketMessage(ticketId: number, message: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  // ==================== ONBOARDING ====================

  /**
   * Discover FRNs from USAC based on user's BEN/CRN/SPIN
   */
  async discoverFRNs(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/onboarding/discover-frns');
  }

  /**
   * Save selected FRNs for monitoring
   */
  async selectFRNs(frnNumbers: string[]): Promise<ApiResponse<any>> {
    return this.request('/api/v1/onboarding/select-frns', {
      method: 'POST',
      body: JSON.stringify({ frn_numbers: frnNumbers }),
    });
  }

  /**
   * Get alert preferences
   */
  async getAlertPreferences(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/onboarding/alert-preferences');
  }

  /**
   * Update alert preferences
   */
  async updateAlertPreferences(prefs: {
    status_changes?: boolean;
    new_denials?: boolean;
    deadline_reminders?: boolean;
    funding_updates?: boolean;
    form_470_matches?: boolean;
    email_notifications?: boolean;
    push_notifications?: boolean;
    sms_notifications?: boolean;
    notification_frequency?: string;
  }): Promise<ApiResponse<any>> {
    return this.request('/api/v1/onboarding/alert-preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  }

  /**
   * Send phone verification code
   */
  async sendPhoneVerification(phoneNumber: string): Promise<ApiResponse<any>> {
    return this.request('/api/v1/onboarding/phone/send-code', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber }),
    });
  }

  /**
   * Verify phone code
   */
  async verifyPhoneCode(phoneNumber: string, code: string): Promise<ApiResponse<any>> {
    return this.request('/api/v1/onboarding/phone/verify-code', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber, code }),
    });
  }

  /**
   * Send email verification code
   */
  async sendEmailVerification(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/onboarding/email/send-code', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /**
   * Verify email code
   */
  async verifyEmailCode(code: string): Promise<ApiResponse<any>> {
    return this.request('/api/v1/onboarding/email/verify-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  /**
   * Complete onboarding
   */
  async completeOnboarding(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/onboarding/complete', { method: 'POST' });
  }

  /**
   * Get onboarding status
   */
  async getOnboardingStatus(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/onboarding/status');
  }

  // ==================== ADMIN BROADCAST ====================

  /**
   * Send broadcast notification to users (admin)
   */
  async adminBroadcast(data: {
    user_ids?: number[];
    channels: string[];
    subject: string;
    message: string;
    role_filter?: string;
  }): Promise<ApiResponse<any>> {
    return this.request('/api/v1/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Send SMS to a specific user (admin)
   */
  async sendSMSToUser(userId: number, message: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/admin/users/${userId}/sms`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  /**
   * Send push notification to a specific user (admin)
   */
  async sendPushToUser(userId: number, message: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/admin/users/${userId}/push`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  // ==================== BLOG MANAGEMENT ====================

  /**
   * List published blog posts (public)
   */
  async getBlogPosts(params?: { limit?: number; offset?: number; category?: string }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.category) searchParams.set('category', params.category);
    const qs = searchParams.toString();
    return this.request(`/api/v1/blog/posts${qs ? '?' + qs : ''}`);
  }

  /**
   * Get a single published blog post by slug (public)
   */
  async getBlogPost(slug: string): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/blog/posts/${slug}`);
  }

  /**
   * List all blog posts for admin (includes drafts)
   */
  async getAdminBlogPosts(params?: { limit?: number; offset?: number; status_filter?: string }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.status_filter) searchParams.set('status_filter', params.status_filter);
    const qs = searchParams.toString();
    return this.request(`/api/v1/blog/admin/posts${qs ? '?' + qs : ''}`);
  }

  /**
   * Get a single blog post by ID for admin
   */
  async getAdminBlogPost(postId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/blog/admin/posts/${postId}`);
  }

  /**
   * Create a blog post manually (admin)
   */
  async createBlogPost(data: {
    title: string;
    slug: string;
    content_html: string;
    meta_description?: string;
    category?: string;
    status?: string;
  }): Promise<ApiResponse<any>> {
    return this.request('/api/v1/blog/admin/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a blog post (admin)
   */
  async updateBlogPost(postId: number, data: Record<string, any>): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/blog/admin/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a blog post (admin)
   */
  async deleteBlogPost(postId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/blog/admin/posts/${postId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Publish a blog post (admin)
   */
  async publishBlogPost(postId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/blog/admin/posts/${postId}/publish`, {
      method: 'POST',
    });
  }

  /**
   * Unpublish a blog post (admin)
   */
  async unpublishBlogPost(postId: number): Promise<ApiResponse<any>> {
    return this.request(`/api/v1/blog/admin/posts/${postId}/unpublish`, {
      method: 'POST',
    });
  }

  /**
   * Generate a blog post using AI (admin)
   */
  async generateBlogPost(data: {
    topic: string;
    target_keyword: string;
    additional_instructions?: string;
    preferred_model?: string;
  }): Promise<ApiResponse<any>> {
    return this.request('/api/v1/blog/admin/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

// Singleton instance
export const api = new ApiClient();
