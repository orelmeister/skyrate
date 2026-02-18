"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { api, ConsultantSchool, ConsultantProfile, AppealRecord } from "@/lib/api";
import { SearchResultsTable } from "@/components/SearchResultsTable";
import { AppealChat } from "@/components/AppealChat";

// Extended school type with USAC data
interface EnhancedSchool {
  id: number;
  ben: string;
  name?: string | null;
  school_name?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  status_color?: string;
  latest_year?: string;
  applications_count?: number;
  notes?: string | null;
  // Enriched fields from USAC
  entity_type?: string | null;
  address?: string | null;
  zip_code?: string | null;
  frn_number?: string | null;
  total_funding_committed?: number;
  total_funding_requested?: number;
  funding_years?: number[];
  has_category1?: boolean;
  has_category2?: boolean;
  discount_rate?: number | null;
}

// Validation result type
interface ValidationResult {
  ben: string;
  is_valid: boolean;
  valid?: boolean;
  already_exists: boolean;
  school_name?: string | null;
  state?: string | null;
  error?: string | null;
}

// Application type
interface Application {
  frn: string;
  application_number: string;
  funding_year: string;
  status: string;
  frn_status?: string;
  service_type: string;
  committed_amount: number;
  pre_discount_costs: number;
  discount_rate: number;
  original_request?: number;
  amount?: number;
  is_denied: boolean;
  denial_reason: string | null;
}

// Dashboard stats type
interface DashboardStats {
  total_schools: number;
  total_c2_funding: number;
  total_c1_funding: number;
  total_funding: number;
  total_applications: number;
  denied_count: number;
  funded_count: number;
  pending_count: number;
  schools_with_denials: number;
}

export default function ConsultantPortalPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  
  const [activeTab, setActiveTab] = useState("dashboard");
  const [profile, setProfile] = useState<ConsultantProfile | null>(null);
  const [schools, setSchools] = useState<EnhancedSchool[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSchoolDetail, setShowSchoolDetail] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<EnhancedSchool | null>(null);
  const [enrichedSchoolData, setEnrichedSchoolData] = useState<EnhancedSchool | null>(null);
  const [loadingEnrichment, setLoadingEnrichment] = useState(false);
  const [schoolApplications, setSchoolApplications] = useState<Application[]>([]);
  const [applicationYears, setApplicationYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [newBen, setNewBen] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isRefreshingSchools, setIsRefreshingSchools] = useState(false);
  
  // Comprehensive school data state (includes C2 budget)
  const [comprehensiveSchoolData, setComprehensiveSchoolData] = useState<{
    c2_budget: Record<string, { c2_budget: number; funded: number; pending: number; available: number }>;
    funding_totals: { category_1: { funded: number; requested: number }; category_2: { funded: number; requested: number }; lifetime_total: number };
    years: Array<any>;
  } | null>(null);
  const [loadingComprehensiveData, setLoadingComprehensiveData] = useState(false);
  
  // CSV Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResult[] | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any>(null);
  
  // Appeal generation state
  const [generatingAppeal, setGeneratingAppeal] = useState<string | null>(null);
  const [appeals, setAppeals] = useState<AppealRecord[]>([]);
  const [selectedAppeal, setSelectedAppeal] = useState<AppealRecord | null>(null);
  const [showAppealChat, setShowAppealChat] = useState(false);
  const [isLoadingAppeals, setIsLoadingAppeals] = useState(false);
  const [showNewAppealModal, setShowNewAppealModal] = useState(false);
  const [newAppealFrn, setNewAppealFrn] = useState("");
  const [newAppealContext, setNewAppealContext] = useState("");
  const [appealError, setAppealError] = useState<string | null>(null);
  const [selectedDeniedApp, setSelectedDeniedApp] = useState<{
    frn: string;
    school_name: string;
    funding_year: string;
    service_type: string;
    amount_requested: number;
    denial_reason: string | null;
  } | null>(null);
  
  // Denied applications state (for appeals page)
  const [deniedApplications, setDeniedApplications] = useState<Array<{
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
    fcdl_date?: string;
    appeal_deadline?: string;
    days_remaining?: number;
    urgency?: string;
    urgency_color?: string;
    is_expired?: boolean;
    can_appeal_to_usac?: boolean;
  }>>([]);
  const [isLoadingDenied, setIsLoadingDenied] = useState(false);
  const [deniedStats, setDeniedStats] = useState<{ total: number; amount: number } | null>(null);
  
  // FRN Status Monitoring state
  const [portfolioFrnData, setPortfolioFrnData] = useState<any>(null);
  const [portfolioFrnLoading, setPortfolioFrnLoading] = useState(false);
  const [portfolioFrnYear, setPortfolioFrnYear] = useState<number | undefined>(undefined);
  const [portfolioFrnStatusFilter, setPortfolioFrnStatusFilter] = useState<string>("");
  const [portfolioFrnPendingReason, setPortfolioFrnPendingReason] = useState<string>("");
  const [expandedSchools, setExpandedSchools] = useState<Set<string>>(new Set());
  const [frnSortBy, setFrnSortBy] = useState<string>("name");
  
  // Query state
  const [queryInput, setQueryInput] = useState("");
  const [queryResults, setQueryResults] = useState<any>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<Array<{query: string; timestamp: Date; resultCount: number}>>([]);

  // CRN verification state
  const [crnInput, setCrnInput] = useState("");
  const [isVerifyingCRN, setIsVerifyingCRN] = useState(false);
  const [crnVerificationResult, setCrnVerificationResult] = useState<any>(null);
  const [crnError, setCrnError] = useState<string | null>(null);

  // School search and filter state
  const [schoolSearchQuery, setSchoolSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Status filter options
  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "denied", label: "🔴 Denied / Unfunded" },
    { value: "funded", label: "🟢 Funded" },
    { value: "pending", label: "🟡 Pending" },
    { value: "unknown", label: "⚪ Unknown" },
  ];

  // Smart amount formatter
  const formatAmount = (amount: number) => {
    if (!amount || amount === 0) return '$0';
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${Math.round(amount / 1_000).toLocaleString()}K`;
    return `$${amount.toLocaleString()}`;
  };

  // Sorted portfolio schools
  const sortedPortfolioSchools = useMemo(() => {
    if (!portfolioFrnData?.schools) return [];
    return [...portfolioFrnData.schools].sort((a: any, b: any) => {
      if (frnSortBy === "name") return (a.entity_name || a.ben || '').localeCompare(b.entity_name || b.ben || '');
      if (frnSortBy === "frns") return (b.total_frns || 0) - (a.total_frns || 0);
      if (frnSortBy === "amount") return (b.total_amount || 0) - (a.total_amount || 0);
      return 0;
    });
  }, [portfolioFrnData?.schools, frnSortBy]);

  // Toggle school expand/collapse
  const toggleSchoolExpand = (ben: string) => {
    setExpandedSchools(prev => {
      const next = new Set(prev);
      if (next.has(ben)) next.delete(ben);
      else next.add(ben);
      return next;
    });
  };

  // Expand/collapse all schools
  const toggleAllSchools = () => {
    if (expandedSchools.size === sortedPortfolioSchools.length) {
      setExpandedSchools(new Set());
    } else {
      setExpandedSchools(new Set(sortedPortfolioSchools.map((s: any) => s.ben)));
    }
  };

  // Filtered schools based on search and status filter
  const filteredSchools = useMemo(() => {
    let result = schools;
    
    // Apply status filter first
    if (statusFilter !== "all") {
      result = result.filter(school => {
        const status = (school.status || '').toLowerCase();
        const statusColor = (school.status_color || '').toLowerCase();
        
        if (statusFilter === "denied") {
          return status.includes("denied") || status.includes("unfunded") || statusColor === "red";
        } else if (statusFilter === "funded") {
          return status === "funded" || status === "committed" || statusColor === "green";
        } else if (statusFilter === "pending") {
          return status === "pending" || status.includes("review") || statusColor === "yellow";
        } else if (statusFilter === "unknown") {
          return status === "unknown" || status === "" || (!status && statusColor === "gray");
        }
        return true;
      });
    }
    
    // Apply text search
    if (schoolSearchQuery.trim()) {
      const query = schoolSearchQuery.toLowerCase().trim();
      result = result.filter(school => {
        const name = (school.school_name || school.name || '').toLowerCase();
        const ben = (school.ben || '').toLowerCase();
        const state = (school.state || '').toLowerCase();
        const city = (school.city || '').toLowerCase();
        return name.includes(query) || ben.includes(query) || state.includes(query) || city.includes(query);
      });
    }
    
    return result;
  }, [schools, schoolSearchQuery, statusFilter]);

  // Load query history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('skyrate_query_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setQueryHistory(parsed.map((q: any) => ({ ...q, timestamp: new Date(q.timestamp) })));
      } catch (e) {
        console.error('Failed to load query history');
      }
    }
  }, []);

  // Payment guard - check if user needs to complete payment setup
  const [checkingPayment, setCheckingPayment] = useState(true);
  
  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!isAuthenticated) {
        router.push("/sign-in");
        return;
      }
      if (user?.role !== "consultant" && user?.role !== "admin") {
        // Redirect to appropriate dashboard based on role
        const dashboard = user?.role === 'applicant' ? '/applicant' : '/vendor';
        router.push(dashboard);
        return;
      }
      
      // Check if payment setup is required
      try {
        const paymentStatus = await api.getPaymentStatus();
        if (paymentStatus.success && paymentStatus.data?.requires_payment_setup) {
          router.push("/subscribe");
          return;
        }
      } catch (error) {
        console.error("Error checking payment status:", error);
        // If we can't check payment status, continue to dashboard
        // The backend will enforce payment requirements on API calls
      }
      
      setCheckingPayment(false);
      loadData();
      loadDashboardStats();
    };
    
    checkPaymentStatus();
  }, [isAuthenticated, user, router]);

  const loadData = async (withUsacData: boolean = false) => {
    setIsLoading(true);
    try {
      const [profileRes, schoolsRes] = await Promise.all([
        api.getConsultantProfile(),
        api.getConsultantSchools(withUsacData),  // Backend auto-syncs schools with Unknown status
      ]);
      
      if (profileRes.success && profileRes.data) {
        setProfile(profileRes.data.profile);
        // Initialize CRN input with profile value if not already set
        if (profileRes.data.profile?.crn && !crnInput) {
          setCrnInput(profileRes.data.profile.crn);
        }
      }
      if (schoolsRes.success && schoolsRes.data) {
        const loadedSchools = schoolsRes.data.schools || [];
        setSchools(loadedSchools);
        // Backend now auto-syncs schools that have Unknown status or haven't been synced
        // No need for client-side sync check
        if (schoolsRes.data.synced) {
          console.log('Schools auto-synced from USAC');
        }
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDashboardStats = async () => {
    setIsLoadingStats(true);
    try {
      const response = await api.getDashboardStats();
      if (response.success && response.data) {
        setDashboardStats(response.data);
      }
    } catch (error) {
      console.error("Failed to load dashboard stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const loadAppeals = async () => {
    setIsLoadingAppeals(true);
    try {
      const response = await api.getAppeals();
      if (response.success && response.data) {
        setAppeals(response.data.appeals || []);
      }
    } catch (error) {
      console.error("Failed to load appeals:", error);
    } finally {
      setIsLoadingAppeals(false);
    }
  };

  const loadDeniedApplications = async () => {
    console.log("loadDeniedApplications called");
    setIsLoadingDenied(true);
    try {
      const response = await api.getDeniedApplications();
      console.log("getDeniedApplications response:", response);
      if (response.success && response.data) {
        console.log("Denied applications data:", response.data);
        setDeniedApplications(response.data.denied_applications || []);
        setDeniedStats({
          total: response.data.total_denied || 0,
          amount: response.data.total_denied_amount || 0,
        });
      }
    } catch (error) {
      console.error("Failed to load denied applications:", error);
    } finally {
      setIsLoadingDenied(false);
    }
  };

  // Load Portfolio FRN Status
  const loadPortfolioFRNStatus = async (year?: number, statusFilter?: string, pendingReason?: string) => {
    setPortfolioFrnLoading(true);
    try {
      const response = await api.getConsultantFRNStatus(year, statusFilter || undefined, 500, pendingReason || undefined);
      if (response.success && response.data) {
        setPortfolioFrnData(response.data);
      }
    } catch (error) {
      console.error("Failed to load portfolio FRN status:", error);
    } finally {
      setPortfolioFrnLoading(false);
    }
  };

  // Load appeals and denied applications when switching to appeals tab
  useEffect(() => {
    if (activeTab === "appeals") {
      // Always load both when switching to appeals tab
      loadAppeals();
      loadDeniedApplications();
    }
    // FRN status is NOT auto-loaded — user must click "Search" to prevent
    // slow loading (87+ sequential USAC API calls for large portfolios)
  }, [activeTab]);

  const refreshSchoolsWithUsac = async () => {
    setIsRefreshingSchools(true);
    try {
      const schoolsRes = await api.getConsultantSchools(true);
      if (schoolsRes.success && schoolsRes.data) {
        setSchools(schoolsRes.data.schools || []);
      }
    } catch (error) {
      console.error("Failed to refresh:", error);
    } finally {
      setIsRefreshingSchools(false);
    }
  };

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.addConsultantSchool(newBen, newNotes || undefined);
      if (response.success) {
        await loadData();
        setShowAddSchool(false);
        setNewBen("");
        setNewNotes("");
      }
    } catch (error) {
      console.error("Failed to add school:", error);
    }
  };

  // CRN Verification handler
  const handleVerifyCRN = async () => {
    const crn = (crnInput || profile?.crn || "").trim();
    if (!crn) {
      setCrnError("Please enter a CRN");
      return;
    }
    
    setIsVerifyingCRN(true);
    setCrnError(null);
    setCrnVerificationResult(null);
    
    try {
      const response = await api.verifyCRN(crn, true);
      if (response.success && response.data) {
        setCrnVerificationResult(response.data);
        setCrnInput(response.data.crn);  // Update input with verified CRN
        
        // Reload profile and schools with USAC data to show names
        await loadData(true);  // true = fetch USAC data for school names
        
        // Auto-switch to schools tab to show imported schools
        if (response.data.imported_count > 0) {
          setActiveTab("schools");
        }
        
        // Show success message
        alert(`✅ CRN Verified!\n\nCompany: ${response.data.consultant?.company_name || 'N/A'}\nSchools Found: ${response.data.school_count}\nImported: ${response.data.imported_count}\nAlready Added: ${response.data.skipped_count}`);
      } else {
        setCrnError(response.error || "Failed to verify CRN");
      }
    } catch (error: any) {
      console.error("CRN verification error:", error);
      setCrnError(error?.message || "Failed to verify CRN. Please check the number and try again.");
    } finally {
      setIsVerifyingCRN(false);
    }
  };

  // Function to add school from search results
  const handleAddSchoolFromSearch = async (school: { ben: string; school_name: string; state: string }) => {
    try {
      const response = await api.addConsultantSchool(school.ben, `Added from search. ${school.school_name || ''}`);
      if (response.success) {
        await loadData();
      }
    } catch (error) {
      console.error("Failed to add school from search:", error);
      throw error;
    }
  };

  // Memoized set of existing BENs for quick lookup
  const existingBens = useMemo(() => {
    return new Set(schools.map(s => String(s.ben)));
  }, [schools]);

  const handleDownloadTemplate = async () => {
    const blob = await api.downloadCsvTemplate();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'skyrate_school_import_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setValidationResults(null);
    setUploadResults(null);
    
    // Parse CSV and validate BENs
    setIsValidating(true);
    try {
      const text = await file.text();
      const lines = text.split('\n');
      const bens: string[] = [];
      
      // Skip header, extract BENs
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const ben = cols[0]?.trim();
        if (ben) bens.push(ben);
      }
      
      if (bens.length > 0) {
        const validationRes = await api.validateBens(bens);
        if (validationRes.success && validationRes.data?.results) {
          // Map the results to our ValidationResult format
          const mapped: ValidationResult[] = validationRes.data.results.map((r: any) => ({
            ben: r.ben,
            is_valid: r.valid ?? r.is_valid ?? false,
            already_exists: r.already_exists ?? false,
            school_name: r.school_name,
            state: r.state,
            error: r.error
          }));
          setValidationResults(mapped);
        }
      }
    } catch (error) {
      console.error("Validation failed:", error);
    } finally {
      setIsValidating(false);
    }
  };

  const handleUploadConfirm = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    try {
      const response = await api.uploadSchoolsCsv(uploadFile, true);
      if (response.success) {
        setUploadResults(response.data);
        await loadData();
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const openSchoolDetail = async (school: EnhancedSchool) => {
    setSelectedSchool(school);
    setEnrichedSchoolData(null);
    setComprehensiveSchoolData(null);
    setShowSchoolDetail(true);
    setSchoolApplications([]);
    setSelectedYear(null);
    setLoadingApplications(true);
    setLoadingEnrichment(true);
    setLoadingComprehensiveData(true);
    
    try {
      // Fetch applications, enrichment data, and comprehensive data in parallel
      const [appsRes, enrichRes, comprehensiveRes] = await Promise.all([
        api.getSchoolApplications(school.ben, { include_denial_reasons: true }),
        api.getSchoolEnrichment(school.ben),
        api.getComprehensiveSchoolData(school.ben),
      ]);
      
      if (appsRes.success && appsRes.data) {
        setSchoolApplications(appsRes.data.applications || []);
        setApplicationYears(appsRes.data.available_years || []);
      }
      
      if (enrichRes.success && enrichRes.data) {
        // Merge enriched data with school data
        const enriched: EnhancedSchool = {
          ...school,
          school_name: enrichRes.data.data.organization_name || school.school_name,
          entity_type: enrichRes.data.data.entity_type,
          address: enrichRes.data.data.address,
          city: enrichRes.data.data.city || school.city,
          state: enrichRes.data.data.state || school.state,
          zip_code: enrichRes.data.data.zip_code,
          frn_number: enrichRes.data.data.frn_number,
          total_funding_committed: enrichRes.data.data.total_funding_committed,
          total_funding_requested: enrichRes.data.data.total_funding_requested,
          funding_years: enrichRes.data.data.funding_years,
          applications_count: enrichRes.data.data.applications_count,
          has_category1: enrichRes.data.data.has_category1,
          has_category2: enrichRes.data.data.has_category2,
          status: enrichRes.data.data.status || school.status,
          latest_year: enrichRes.data.data.latest_year?.toString(),
          discount_rate: enrichRes.data.data.discount_rate,
        };
        setEnrichedSchoolData(enriched);
        setSelectedSchool(enriched);
      }
      
      if (comprehensiveRes.success && comprehensiveRes.data) {
        setComprehensiveSchoolData({
          c2_budget: comprehensiveRes.data.c2_budget,
          funding_totals: comprehensiveRes.data.funding_totals,
          years: comprehensiveRes.data.years,
        });
      }
    } catch (error) {
      console.error("Failed to load school data:", error);
    } finally {
      setLoadingApplications(false);
      setLoadingEnrichment(false);
      setLoadingComprehensiveData(false);
    }
  };

  const filterApplicationsByYear = async (year: number | null) => {
    setSelectedYear(year);
    if (!selectedSchool) return;
    setLoadingApplications(true);
    
    try {
      const res = await api.getSchoolApplications(selectedSchool.ben, {
        year: year || undefined,
        include_denial_reasons: true
      });
      if (res.success && res.data) {
        setSchoolApplications(res.data.applications || []);
      }
    } catch (error) {
      console.error("Failed to filter:", error);
    } finally {
      setLoadingApplications(false);
    }
  };

  const handleGenerateAppeal = async (frn: string, additionalContext?: string) => {
    setGeneratingAppeal(frn);
    setAppealError(null);
    try {
      const res = await api.generateAppeal(frn, additionalContext);
      if (res.success && res.data) {
        // Add to appeals list and open chat
        setAppeals(prev => [res.data!, ...prev]);
        setSelectedAppeal(res.data);
        setShowAppealChat(true);
        setShowNewAppealModal(false);
        setSelectedDeniedApp(null);
        setNewAppealFrn("");
        setNewAppealContext("");
      } else {
        setAppealError(res.error || "Failed to generate appeal");
      }
    } catch (error: any) {
      console.error("Appeal generation failed:", error);
      setAppealError(error.message || "Failed to generate appeal");
    } finally {
      setGeneratingAppeal(null);
    }
  };

  const handleDeleteAppeal = async (appealId: number) => {
    console.log("Delete appeal clicked, appealId:", appealId);
    if (!confirm("Are you sure you want to delete this appeal?")) {
      console.log("User cancelled delete");
      return;
    }
    console.log("User confirmed delete, calling API...");
    try {
      const res = await api.deleteAppeal(appealId);
      console.log("Delete API response:", res);
      if (res.success) {
        console.log("Delete successful, updating state");
        setAppeals(prev => prev.filter(a => a.id !== appealId));
        if (selectedAppeal?.id === appealId) {
          setSelectedAppeal(null);
          setShowAppealChat(false);
        }
      } else {
        console.error("Delete failed:", res.error);
        alert("Failed to delete appeal: " + (res.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Failed to delete appeal:", error);
      alert("Error deleting appeal: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const handleAppealUpdate = (updatedAppeal: AppealRecord) => {
    setAppeals(prev => prev.map(a => a.id === updatedAppeal.id ? updatedAppeal : a));
    setSelectedAppeal(updatedAppeal);
  };

  const handleRemoveSchool = async (ben: string) => {
    if (!confirm(`Remove school ${ben} from your portfolio?`)) return;
    try {
      await api.removeConsultantSchool(ben);
      await loadData();
    } catch (error) {
      console.error("Failed to remove:", error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    
    setIsQuerying(true);
    setQueryError(null);
    setQueryResults(null);
    
    try {
      const response = await api.naturalLanguageQuery(queryInput);
      if (response.success && response.data) {
        setQueryResults(response.data);
        // Save to history
        const newHistory = [
          { query: queryInput.trim(), timestamp: new Date(), resultCount: response.data.count || response.data.data?.length || 0 },
          ...queryHistory.filter(h => h.query !== queryInput.trim()).slice(0, 19) // Keep last 20, no duplicates
        ];
        setQueryHistory(newHistory);
        localStorage.setItem('skyrate_query_history', JSON.stringify(newHistory));
      } else {
        setQueryError(response.error || "Query failed");
      }
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "Query failed");
    } finally {
      setIsQuerying(false);
    }
  };

  const loadQueryFromHistory = (query: string) => {
    setQueryInput(query);
  };

  const clearQueryHistory = () => {
    setQueryHistory([]);
    localStorage.removeItem('skyrate_query_history');
  };

  // Show loading state while checking payment status
  if (checkingPayment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Verifying your subscription...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "schools", label: "My Schools", icon: "🏫" },
    { id: "funding", label: "Funding Data", icon: "💰" },
    { id: "frn-status", label: "FRN Status", icon: "📈" },
    { id: "appeals", label: "Appeals", icon: "📋" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200">
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="SkyRate AI" width={36} height={36} className="rounded-lg" />
            <div>
              <span className="font-bold text-slate-900">SkyRate AI</span>
              <span className="block text-xs text-slate-500">Consultant Portal</span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                activeTab === item.id
                  ? "bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 font-medium shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span>{item.label}</span>
              {activeTab === item.id && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-600"></span>
              )}
            </button>
          ))}
        </nav>

        {/* Subscription Card */}
        <div className="absolute bottom-20 left-4 right-4">
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-4 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">Pro Plan</span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">Active</span>
            </div>
            <div className="text-2xl font-bold">{schools.length} Schools</div>
            <div className="text-sm opacity-75 mt-1">Unlimited access</div>
          </div>
        </div>

        {/* User Profile */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center text-purple-700 font-semibold">
              {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900 truncate">{user?.full_name || user?.email}</div>
              <div className="text-xs text-slate-500 truncate">{profile?.company_name}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-semibold text-slate-900">
              {navItems.find(i => i.id === activeTab)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg relative">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <button
              onClick={() => { loadData(); loadDashboardStats(); }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Hero Banner */}
              <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-pink-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <span className="text-3xl">📋</span>
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold">{profile?.company_name || 'My Consulting Firm'}</h1>
                      <div className="flex items-center gap-3 mt-1 text-purple-100">
                        {profile?.crn && (
                          <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-sm">CRN: {profile.crn}</span>
                        )}
                        <span className="flex items-center gap-1 text-sm">
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                          E-Rate Consultant
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab("schools")}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors"
                  >
                    View All Schools →
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/20">
                  <div>
                    <div className="text-3xl font-bold">{schools.length}</div>
                    <div className="text-sm text-purple-200 mt-1">Total Schools</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">
                      {isLoadingStats ? '...' : dashboardStats ? `$${(dashboardStats.total_c2_funding / 1000000).toFixed(1)}M` : '$0'}
                    </div>
                    <div className="text-sm text-purple-200 mt-1">C2 Funding</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">
                      {isLoadingStats ? '...' : (dashboardStats?.total_applications || 0)}
                    </div>
                    <div className="text-sm text-purple-200 mt-1">Total Applications</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">
                      {isLoadingStats ? '...' : `${dashboardStats?.funded_count || 0}`}
                    </div>
                    <div className="text-sm text-purple-200 mt-1">Funded Apps</div>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                      <span className="text-2xl">🏫</span>
                    </div>
                    <span className="text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-full">{schools.length} total</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">{schools.length}</div>
                  <div className="text-sm text-slate-500 mt-1">Total Schools</div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                      <span className="text-2xl">💰</span>
                    </div>
                    {isLoadingStats ? (
                      <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-50 rounded-full">Loading...</span>
                    ) : (
                      <span className="text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-full">C2</span>
                    )}
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {isLoadingStats ? (
                      <span className="text-slate-400">...</span>
                    ) : dashboardStats ? (
                      `$${(dashboardStats.total_c2_funding / 1000000).toFixed(1)}M`
                    ) : (
                      "$0"
                    )}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Category 2 Funding</div>
                </div>
                
                <div 
                  className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:border-red-300"
                  onClick={() => setActiveTab("appeals")}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                      <span className="text-2xl">⚠️</span>
                    </div>
                    {isLoadingStats ? (
                      <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-50 rounded-full">Loading...</span>
                    ) : dashboardStats && dashboardStats.schools_with_denials > 0 ? (
                      <span className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded-full">Action needed</span>
                    ) : (
                      <span className="text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-full">All clear</span>
                    )}
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {isLoadingStats ? "..." : (dashboardStats?.schools_with_denials || 0)}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Schools with Denials</div>
                </div>
                
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                      <span className="text-2xl">📊</span>
                    </div>
                    {isLoadingStats ? (
                      <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-50 rounded-full">Loading...</span>
                    ) : (
                      <span className="text-xs text-blue-600 font-medium px-2 py-1 bg-blue-50 rounded-full">{dashboardStats?.funded_count || 0} funded</span>
                    )}
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {isLoadingStats ? "..." : (dashboardStats?.total_applications || 0)}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Total Applications</div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <button
                    onClick={() => setShowAddSchool(true)}
                    className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-all text-center group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">➕</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Add School</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("funding")}
                    className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all text-center group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-green-100 group-hover:bg-green-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">🔍</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Query Data</span>
                  </button>
                  <button className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-amber-300 hover:bg-amber-50 transition-all text-center group">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">📤</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Export Report</span>
                  </button>
                  <Link
                    href="/settings/notifications"
                    className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-rose-300 hover:bg-rose-50 transition-all text-center group block"
                  >
                    <div className="w-10 h-10 rounded-lg bg-rose-100 group-hover:bg-rose-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">🔔</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Notifications</span>
                  </Link>
                </div>
              </div>

              {/* Top Schools by Funding */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Top Schools by E-Rate Funding</h2>
                    <p className="text-sm text-slate-500">Your highest-value school relationships</p>
                  </div>
                  <button onClick={() => setActiveTab("schools")} className="text-sm text-purple-600 hover:underline font-medium">View All →</button>
                </div>
                {schools.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {schools.slice(0, 5).map((school, idx) => {
                      const statusColors: Record<string, string> = {
                        'Funded': 'bg-green-100 text-green-700',
                        'Has Denials': 'bg-red-100 text-red-700',
                        'Pending': 'bg-yellow-100 text-yellow-700',
                        'Active': 'bg-green-100 text-green-700',
                      };
                      const statusColor = statusColors[school.status || ''] || 'bg-slate-100 text-slate-600';
                      return (
                        <div key={school.id} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openSchoolDetail(school)}>
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center font-bold text-purple-600">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 truncate">{school.school_name || school.name || `BEN ${school.ben}`}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-slate-500">{school.state || 'Unknown'}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-xs text-slate-500">{school.entity_type || 'School'}</span>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>{school.status || 'Unknown'}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">🏫</div>
                    <h3 className="font-medium text-slate-900 mb-1">No schools yet</h3>
                    <p className="text-sm text-slate-500 mb-4">Add your first school to get started</p>
                    <button onClick={() => setShowAddSchool(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Add School</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "schools" && (
            <div className="space-y-6">
              {/* Search and Filter Bar */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={schoolSearchQuery}
                      onChange={(e) => setSchoolSearchQuery(e.target.value)}
                      placeholder="Search by school name, BEN, state, or city..."
                      className="w-full pl-12 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    {schoolSearchQuery && (
                      <button
                        onClick={() => setSchoolSearchQuery("")}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Status Filter Dropdown */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium text-slate-700 min-w-[180px]"
                  >
                    {statusOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                
                {/* Filter Status Message */}
                {(schoolSearchQuery || statusFilter !== "all") && (
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                      Showing {filteredSchools.length} of {schools.length} schools
                      {statusFilter !== "all" && ` • Filtered by: ${statusOptions.find(o => o.value === statusFilter)?.label}`}
                    </p>
                    {(schoolSearchQuery || statusFilter !== "all") && (
                      <button
                        onClick={() => { setSchoolSearchQuery(""); setStatusFilter("all"); }}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Actions Bar */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={refreshSchoolsWithUsac}
                    disabled={isRefreshingSchools}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    <svg className={`w-5 h-5 ${isRefreshingSchools ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-sm font-medium text-slate-700">
                      {isRefreshingSchools ? 'Syncing...' : 'Sync from USAC'}
                    </span>
                  </button>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="text-sm font-medium text-slate-700">CSV Template</span>
                  </button>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="text-sm font-medium text-slate-700">Upload CSV</span>
                  </button>
                  <button onClick={() => setShowAddSchool(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="font-medium">Add School</span>
                  </button>
                </div>
              </div>

              {/* Schools Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">School</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase w-24">BEN</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase w-16">State</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase w-32">Status</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSchools.map((school) => {
                      const statusColors: Record<string, string> = {
                        'Funded': 'bg-green-100 text-green-700',
                        'Has Denials': 'bg-red-100 text-red-700',
                        'Pending': 'bg-yellow-100 text-yellow-700',
                        'green': 'bg-green-100 text-green-700',
                        'red': 'bg-red-100 text-red-700',
                        'yellow': 'bg-yellow-100 text-yellow-700',
                      };
                      const statusColor = statusColors[school.status_color || school.status || ''] || 'bg-slate-100 text-slate-600';
                      
                      return (
                        <tr key={school.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openSchoolDetail(school)}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">🏫</div>
                              <div>
                                <div className="font-medium text-slate-900">{school.school_name || school.name || `BEN ${school.ben}`}</div>
                                {school.applications_count !== undefined && (
                                  <div className="text-sm text-slate-500">{school.applications_count} applications</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-sm text-slate-600">{school.ben}</td>
                          <td className="px-6 py-4 text-slate-600">{school.state || '-'}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusColor}`}>
                              {school.status || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); openSchoolDetail(school); }}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                title="View Details"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemoveSchool(school.ben); }}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                title="Remove School"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {schools.length === 0 && (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">🏫</div>
                    <h3 className="font-medium text-slate-900 mb-1">No schools yet</h3>
                    <p className="text-sm text-slate-500">Add your first school to get started</p>
                  </div>
                )}
                {schools.length > 0 && filteredSchools.length === 0 && (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">🔍</div>
                    <h3 className="font-medium text-slate-900 mb-1">No matching schools</h3>
                    <p className="text-sm text-slate-500">
                      {statusFilter !== "all" 
                        ? `No schools found with status "${statusOptions.find(o => o.value === statusFilter)?.label}"` 
                        : "Try a different search term or filter"}
                    </p>
                    <button 
                      onClick={() => { setSchoolSearchQuery(''); setStatusFilter('all'); }}
                      className="mt-4 px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "funding" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-8">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mx-auto mb-6">
                    <span className="text-4xl">🔍</span>
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">AI-Powered Funding Analysis</h2>
                  <p className="text-slate-500 mb-6 max-w-md mx-auto">Query E-Rate funding data using natural language.</p>
                </div>
                <form onSubmit={handleQuery} className="max-w-xl mx-auto mb-8">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      placeholder="Ask anything about E-Rate funding..." 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-28" 
                    />
                    <button 
                      type="submit"
                      disabled={isQuerying}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl disabled:opacity-50"
                    >
                      {isQuerying ? "..." : "Search"}
                    </button>
                  </div>
                </form>

                {/* Query History */}
                {queryHistory.length > 0 && (
                  <div className="max-w-xl mx-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-slate-600">Recent Queries</h3>
                      <button 
                        onClick={clearQueryHistory}
                        className="text-xs text-slate-400 hover:text-red-500"
                      >
                        Clear History
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {queryHistory.slice(0, 8).map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => loadQueryFromHistory(item.query)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 rounded-lg text-sm transition-colors flex items-center gap-2 max-w-xs truncate"
                          title={`${item.query} (${item.resultCount} results)`}
                        >
                          <span className="truncate">{item.query}</span>
                          <span className="text-xs text-slate-400">({item.resultCount})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              
              </div>

              {queryError && (
                <div className="max-w-2xl mx-auto mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                  {queryError}
                </div>
              )}
              
              {queryResults && (
                <div className="max-w-6xl mx-auto">
                  {queryResults.summary && (
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 mb-6">
                      <h3 className="font-semibold text-slate-900 mb-2">Summary</h3>
                      <p className="text-slate-700">{queryResults.summary}</p>
                    </div>
                  )}
                  
                  {queryResults.data && queryResults.data.length > 0 && (
                    <SearchResultsTable
                      data={queryResults.data}
                      onAddSchool={handleAddSchoolFromSearch}
                      existingBens={existingBens}
                      showAddButton={true}
                      totalCount={queryResults.count}
                    />
                  )}
                  
                  {queryResults.count !== undefined && (
                    <div className="mt-4 text-center text-sm text-slate-500">
                      Found {queryResults.count.toLocaleString()} matching records
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "appeals" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Appeals Management</h2>
                  <p className="text-slate-500">Generate, refine, and manage E-Rate appeals with AI assistance</p>
                </div>
                <button 
                  onClick={() => {
                    setSelectedDeniedApp(null);
                    setNewAppealFrn("");
                    setNewAppealContext("");
                    setShowNewAppealModal(true);
                  }}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl shadow-lg shadow-amber-200 hover:shadow-xl transition-all flex items-center gap-2 font-medium"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Appeal
                </button>
              </div>

              {/* Denied Applications Section */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-red-50 to-orange-50 px-6 py-4 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">Denied Applications</h3>
                        <p className="text-sm text-slate-500">FRNs from your schools that need appeals</p>
                      </div>
                    </div>
                    {deniedStats && (
                      <div className="text-right">
                        <p className="text-lg font-bold text-red-600">{deniedStats.total} denied</p>
                        <p className="text-sm text-slate-500">${deniedStats.amount.toLocaleString()} at risk</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="p-6">
                  {isLoadingDenied ? (
                    <div className="text-center py-8">
                      <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-slate-500">Loading denied applications...</p>
                    </div>
                  ) : deniedApplications.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h4 className="font-medium text-slate-900 mb-1">No denied applications</h4>
                      <p className="text-sm text-slate-500">All your schools&apos; funding requests are in good standing!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {deniedApplications.filter(app => !app.has_appeal).map((app) => {
                        // Urgency badge colors
                        const urgencyStyles = {
                          CRITICAL: 'bg-red-100 text-red-700 border-red-200',
                          HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
                          MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
                          LOW: 'bg-green-100 text-green-700 border-green-200',
                          EXPIRED: 'bg-gray-100 text-gray-700 border-gray-200'
                        };
                        
                        return (
                        <div 
                          key={app.frn}
                          className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-white border border-red-100 rounded-xl hover:shadow-md transition-all"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="font-mono text-sm font-medium text-slate-700">FRN: {app.frn}</span>
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                                Denied
                              </span>
                              <span className="text-xs text-slate-500">{app.funding_year}</span>
                              {app.urgency && (
                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium border ${urgencyStyles[app.urgency as keyof typeof urgencyStyles] || urgencyStyles.LOW}`}>
                                  {app.urgency}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-900 font-medium">{app.school_name}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                              <span>{app.service_type}</span>
                              <span>•</span>
                              <span className="text-red-600 font-medium">${app.amount_requested.toLocaleString()}</span>
                            </div>
                            
                            {/* Appeal deadline info */}
                            {app.fcdl_date && (
                              <div className="flex items-center gap-4 mt-2 text-xs">
                                <div className="flex items-center gap-1">
                                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span className="text-slate-500">FCDL: {new Date(app.fcdl_date).toLocaleDateString()}</span>
                                </div>
                                <span>•</span>
                                <div className="flex items-center gap-1">
                                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {app.is_expired ? (
                                    <span className="text-gray-600 font-medium">Expired - FCC Appeal Only</span>
                                  ) : (
                                    <span className={`font-medium ${
                                      (app.days_remaining ?? 0) <= 7 ? 'text-red-600' :
                                      (app.days_remaining ?? 0) <= 14 ? 'text-orange-600' :
                                      (app.days_remaining ?? 0) <= 30 ? 'text-yellow-600' :
                                      'text-green-600'
                                    }`}>
                                      {app.days_remaining} days left to appeal to USAC
                                    </span>
                                  )}
                                </div>
                                {app.appeal_deadline && (
                                  <>
                                    <span>•</span>
                                    <span className="text-slate-500">Deadline: {new Date(app.appeal_deadline).toLocaleDateString()}</span>
                                  </>
                                )}
                              </div>
                            )}
                            
                            {app.denial_reason && (
                              <p className="text-xs text-red-600 mt-2 bg-red-50 px-2 py-1 rounded">
                                {app.denial_reason.slice(0, 150)}{app.denial_reason.length > 150 ? '...' : ''}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setSelectedDeniedApp({
                                frn: app.frn,
                                school_name: app.school_name,
                                funding_year: app.funding_year,
                                service_type: app.service_type,
                                amount_requested: app.amount_requested,
                                denial_reason: app.denial_reason
                              });
                              setNewAppealFrn(app.frn);
                              setNewAppealContext(`School: ${app.school_name}\nAmount: $${app.amount_requested.toLocaleString()}\nService: ${app.service_type}\nDenial Reason: ${app.denial_reason || 'Not specified'}`);
                              setShowNewAppealModal(true);
                            }}
                            disabled={generatingAppeal === app.frn}
                            className="ml-4 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                          >
                            {generatingAppeal === app.frn ? (
                              <>
                                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                                Generating...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Generate Appeal
                              </>
                            )}
                          </button>
                        </div>
                      )})}
                      
                      {/* Show count of applications that already have appeals */}
                      {deniedApplications.filter(app => app.has_appeal).length > 0 && (
                        <div className="text-center pt-2 text-sm text-slate-500">
                          {deniedApplications.filter(app => app.has_appeal).length} denied application(s) already have appeals (shown below)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Your Appeals Section */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">Your Appeals</h3>
                      <p className="text-sm text-slate-500">Generated appeal letters you can refine and download</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  {isLoadingAppeals ? (
                    <div className="text-center py-8">
                      <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-slate-500">Loading appeals...</p>
                    </div>
                  ) : appeals.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">📄</span>
                      </div>
                      <h4 className="font-medium text-slate-900 mb-1">No appeals generated yet</h4>
                      <p className="text-sm text-slate-500">Generate an appeal from a denied application above, or create one manually</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {appeals.map((appeal) => (
                        <div 
                          key={appeal.id} 
                          className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-white border border-amber-100 rounded-xl hover:shadow-md transition-all cursor-pointer"
                          onClick={() => {
                            setSelectedAppeal(appeal);
                            setShowAppealChat(true);
                          }}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="font-mono text-sm font-medium text-slate-700">FRN: {appeal.frn}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                appeal.status === "finalized" 
                                  ? "bg-green-100 text-green-700" 
                                  : appeal.status === "submitted"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}>
                                {appeal.status}
                              </span>
                            </div>
                            <p className="text-sm text-slate-900">{appeal.organization_name || "Unknown Organization"}</p>
                            {appeal.denial_reason && (
                              <p className="text-xs text-red-600 mt-1">
                                Denial: {appeal.denial_reason.slice(0, 80)}{appeal.denial_reason.length > 80 ? '...' : ''}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                              <span>Updated: {new Date(appeal.updated_at).toLocaleDateString()}</span>
                              {appeal.chat_history && appeal.chat_history.length > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    {appeal.chat_history.length} messages
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAppeal(appeal);
                                setShowAppealChat(true);
                              }}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Open & Chat"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAppeal(appeal.id);
                              }}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* FRN Status Monitoring Tab */}
          {activeTab === "frn-status" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <span className="text-3xl">📈</span>
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold">Portfolio FRN Status</h1>
                      <p className="text-teal-100 mt-1">Track FRN status across all your schools</p>
                    </div>
                  </div>
                  <button
                    onClick={() => loadPortfolioFRNStatus(portfolioFrnYear, portfolioFrnStatusFilter, portfolioFrnPendingReason)}
                    disabled={portfolioFrnLoading}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {portfolioFrnLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : null}
                    Refresh Data
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label className="text-sm text-slate-600 mb-1 block">Funding Year</label>
                    <select
                      value={portfolioFrnYear || ""}
                      onChange={(e) => {
                        const year = e.target.value ? parseInt(e.target.value) : undefined;
                        setPortfolioFrnYear(year);
                        loadPortfolioFRNStatus(year, portfolioFrnStatusFilter, portfolioFrnPendingReason);
                      }}
                      className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
                    >
                      <option value="">All Years</option>
                      {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-slate-600 mb-1 block">Status</label>
                    <select
                      value={portfolioFrnStatusFilter}
                      onChange={(e) => {
                        setPortfolioFrnStatusFilter(e.target.value);
                        loadPortfolioFRNStatus(portfolioFrnYear, e.target.value, portfolioFrnPendingReason);
                      }}
                      className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
                    >
                      <option value="">All Statuses</option>
                      <option value="Funded">Funded</option>
                      <option value="Denied">Denied</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-slate-600 mb-1 block">Pending Reason</label>
                    <input
                      type="text"
                      value={portfolioFrnPendingReason}
                      onChange={(e) => setPortfolioFrnPendingReason(e.target.value)}
                      placeholder="e.g., PIA Review"
                      className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm w-48"
                    />
                  </div>
                  <button
                    onClick={() => loadPortfolioFRNStatus(portfolioFrnYear, portfolioFrnStatusFilter, portfolioFrnPendingReason)}
                    disabled={portfolioFrnLoading}
                    className="mt-5 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    {portfolioFrnLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span>🔍</span>
                    )}
                    Apply Filters
                  </button>
                </div>
              </div>

              {/* Summary Cards — Clickable to filter */}
              {portfolioFrnData && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <button
                    onClick={() => { setPortfolioFrnStatusFilter(""); loadPortfolioFRNStatus(portfolioFrnYear, "", portfolioFrnPendingReason); }}
                    className={`bg-white rounded-2xl border p-6 shadow-sm text-left transition-all hover:shadow-md ${
                      portfolioFrnStatusFilter === "" ? "border-slate-400 ring-2 ring-slate-200" : "border-slate-200"
                    }`}
                  >
                    <div className="text-sm text-slate-600 mb-1">Total FRNs</div>
                    <div className="text-3xl font-bold text-slate-900">{portfolioFrnData.total_frns}</div>
                    <div className="text-xs text-slate-500 mt-1">Across {portfolioFrnData.total_schools} schools</div>
                  </button>
                  <button
                    onClick={() => { setPortfolioFrnStatusFilter("Funded"); loadPortfolioFRNStatus(portfolioFrnYear, "Funded", portfolioFrnPendingReason); }}
                    className={`bg-white rounded-2xl border p-6 shadow-sm text-left transition-all hover:shadow-md ${
                      portfolioFrnStatusFilter === "Funded" ? "border-green-500 ring-2 ring-green-200" : "border-green-200"
                    }`}
                  >
                    <div className="text-sm text-green-600 mb-1">Funded</div>
                    <div className="text-3xl font-bold text-green-700">{portfolioFrnData.summary?.funded?.count || 0}</div>
                    <div className="text-xs text-green-600 mt-1" title={`$${(portfolioFrnData.summary?.funded?.amount || 0).toLocaleString()}`}>
                      {formatAmount(portfolioFrnData.summary?.funded?.amount || 0)}
                    </div>
                  </button>
                  <button
                    onClick={() => { setPortfolioFrnStatusFilter("Pending"); loadPortfolioFRNStatus(portfolioFrnYear, "Pending", portfolioFrnPendingReason); }}
                    className={`bg-white rounded-2xl border p-6 shadow-sm text-left transition-all hover:shadow-md ${
                      portfolioFrnStatusFilter === "Pending" ? "border-amber-500 ring-2 ring-amber-200" : "border-amber-200"
                    }`}
                  >
                    <div className="text-sm text-amber-600 mb-1">Pending</div>
                    <div className="text-3xl font-bold text-amber-700">{portfolioFrnData.summary?.pending?.count || 0}</div>
                    <div className="text-xs text-amber-600 mt-1" title={`$${(portfolioFrnData.summary?.pending?.amount || 0).toLocaleString()}`}>
                      {formatAmount(portfolioFrnData.summary?.pending?.amount || 0)}
                    </div>
                  </button>
                  <button
                    onClick={() => { setPortfolioFrnStatusFilter("Denied"); loadPortfolioFRNStatus(portfolioFrnYear, "Denied", portfolioFrnPendingReason); }}
                    className={`bg-white rounded-2xl border p-6 shadow-sm text-left transition-all hover:shadow-md ${
                      portfolioFrnStatusFilter === "Denied" ? "border-red-500 ring-2 ring-red-200" : "border-red-200"
                    }`}
                  >
                    <div className="text-sm text-red-600 mb-1">Denied</div>
                    <div className="text-3xl font-bold text-red-700">{portfolioFrnData.summary?.denied?.count || 0}</div>
                    <div className="text-xs text-red-600 mt-1" title={`$${(portfolioFrnData.summary?.denied?.amount || 0).toLocaleString()}`}>
                      {formatAmount(portfolioFrnData.summary?.denied?.amount || 0)}
                    </div>
                  </button>
                </div>
              )}

              {/* Schools Breakdown — Collapsible with sorting */}
              {portfolioFrnData?.schools && portfolioFrnData.schools.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">Schools ({sortedPortfolioSchools.length})</h3>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-slate-500">Sort by:</label>
                      <select
                        value={frnSortBy}
                        onChange={(e) => setFrnSortBy(e.target.value)}
                        className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="name">School Name</option>
                        <option value="frns">FRN Count</option>
                        <option value="amount">Total Amount</option>
                      </select>
                      <button
                        onClick={toggleAllSchools}
                        className="text-xs px-3 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        {expandedSchools.size === sortedPortfolioSchools.length ? "Collapse All" : "Expand All"}
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {sortedPortfolioSchools.map((school: any) => {
                      const isExpanded = expandedSchools.has(school.ben);
                      return (
                        <div key={school.ben} className="hover:bg-slate-50/50 transition-colors">
                          <button
                            onClick={() => toggleSchoolExpand(school.ben)}
                            className="w-full px-6 py-4 text-left"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                <span className="font-medium text-slate-900">{school.entity_name || school.ben}</span>
                                <span className="text-xs text-slate-500 font-mono">BEN: {school.ben}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-slate-500">{school.total_frns} FRNs</span>
                                <span className="text-sm font-medium text-slate-700">{formatAmount(school.total_amount || 0)}</span>
                              </div>
                            </div>
                            <div className="flex gap-3 text-xs mt-2 ml-6">
                              <span className="px-2 py-1 bg-green-50 text-green-700 rounded-full">{school.funded} Funded</span>
                              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-full">{school.pending} Pending</span>
                              <span className="px-2 py-1 bg-red-50 text-red-700 rounded-full">{school.denied} Denied</span>
                            </div>
                          </button>
                          {/* FRN details — visible only when expanded */}
                          {isExpanded && school.frns && school.frns.length > 0 && (
                            <div className="px-6 pb-4 space-y-1 ml-6">
                              {school.frns.map((frn: any, i: number) => (
                                <div key={i} className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded px-3 py-1.5">
                                  <span className="font-mono">FRN: {frn.funding_request_number || frn.frn}</span>
                                  <span className={`px-2 py-0.5 rounded-full ${
                                    (frn.frn_status || frn.status || '').toLowerCase().includes('funded') ? 'bg-green-100 text-green-700' :
                                    (frn.frn_status || frn.status || '').toLowerCase().includes('denied') ? 'bg-red-100 text-red-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {frn.frn_status || frn.status || 'Unknown'}
                                  </span>
                                  {frn.pending_reason && (
                                    <span className="text-amber-600 truncate max-w-[200px]">{frn.pending_reason}</span>
                                  )}
                                  <span className="text-slate-400">${parseFloat(frn.total_authorized_amount || frn.amount || 0).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty State — Prompt user to search */}
              {!portfolioFrnLoading && !portfolioFrnData && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <span className="text-4xl mb-4 block">📈</span>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Portfolio FRN Status</h3>
                  <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                    Select optional filters above (year, status, pending reason) and click the button below to load FRN data across your portfolio.
                  </p>
                  <button
                    onClick={() => loadPortfolioFRNStatus(portfolioFrnYear, portfolioFrnStatusFilter, portfolioFrnPendingReason)}
                    disabled={portfolioFrnLoading}
                    className="px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium inline-flex items-center gap-2"
                  >
                    <span>🔍</span>
                    Search FRN Status
                  </button>
                </div>
              )}

              {/* Loading State */}
              {portfolioFrnLoading && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <div className="w-8 h-8 border-3 border-teal-200 border-t-teal-600 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm text-slate-500">Loading FRN status across your portfolio...</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "settings" && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Profile Settings</h2>
                
                {/* CRN Section */}
                <div className="mb-6 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                  <label className="block text-sm font-medium text-indigo-700 mb-2">
                    CRN (Consultant Registration Number)
                  </label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="text" 
                      value={crnInput !== "" ? crnInput : (profile?.crn || "")} 
                      onChange={(e) => setCrnInput(e.target.value.toUpperCase())}
                      placeholder="Enter your USAC CRN"
                      className="flex-1 px-4 py-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono uppercase" 
                    />
                    <button 
                      onClick={handleVerifyCRN}
                      disabled={isVerifyingCRN}
                      className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isVerifyingCRN ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Verifying...
                        </>
                      ) : 'Verify & Import'}
                    </button>
                  </div>
                  {crnError && (
                    <p className="mt-2 text-xs text-red-600">{crnError}</p>
                  )}
                  {crnVerificationResult && crnVerificationResult.valid && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-800 font-medium">✅ CRN Verified Successfully!</p>
                      <p className="text-xs text-green-700 mt-1">
                        Company: {crnVerificationResult.consultant?.company_name || 'N/A'} | 
                        Schools: {crnVerificationResult.school_count} found, {crnVerificationResult.imported_count} imported
                      </p>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-indigo-600">
                    Your CRN is used to automatically import schools you represent from USAC.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
                    <input type="text" defaultValue={profile?.company_name || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Contact Name</label>
                    <input type="text" defaultValue={profile?.contact_name || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
                    <input type="text" defaultValue={profile?.phone || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Website</label>
                    <input type="text" defaultValue={profile?.website || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <button className="mt-6 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl">Save Changes</button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xl">🔔</span>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
                    <p className="text-sm text-slate-500">Alerts for FRN status changes, denials, long-pending items, and deadlines</p>
                  </div>
                </div>
                <Link
                  href="/settings/notifications"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 font-medium text-sm transition"
                >
                  🔔 Manage Notification Settings →
                </Link>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Subscription</h2>
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
                  <div>
                    <div className="font-semibold text-slate-900">{user?.subscription?.plan === 'yearly' ? 'Annual Plan' : 'Monthly Plan'}</div>
                    <div className="text-sm text-slate-600">Status: <span className="capitalize">{user?.subscription?.status || 'Unknown'}</span></div>
                  </div>
                  <button className="px-4 py-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50">Manage Billing</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add School Modal */}
      {showAddSchool && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">Add New School</h2>
              <p className="text-sm text-slate-500 mt-1">Enter the BEN to add a school</p>
            </div>
            <form onSubmit={handleAddSchool} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">BEN (Billed Entity Number)</label>
                <input type="text" value={newBen} onChange={(e) => setNewBen(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Enter BEN..." required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notes (Optional)</label>
                <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={3} placeholder="Add any notes..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddSchool(false)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl">Add School</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Upload Schools CSV</h2>
                <p className="text-sm text-slate-500 mt-1">Import multiple schools at once</p>
              </div>
              <button onClick={() => { setShowUploadModal(false); setValidationResults(null); setUploadResults(null); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Download Template */}
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">📄</div>
                  <div className="flex-1">
                    <h3 className="font-medium text-slate-900">Need a template?</h3>
                    <p className="text-sm text-slate-600 mt-1">Download our CSV template with the correct format and example data.</p>
                    <button onClick={handleDownloadTemplate} className="mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                      Download Template
                    </button>
                  </div>
                </div>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Select CSV File</label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-indigo-300 transition-colors">
                  <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" id="csvUpload" />
                  <label htmlFor="csvUpload" className="cursor-pointer">
                    <svg className="w-12 h-12 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-slate-600">Click to upload or drag and drop</p>
                    <p className="text-sm text-slate-400 mt-1">CSV file only</p>
                  </label>
                </div>
              </div>

              {/* Validation Results */}
              {validationResults && (
                <div className="space-y-4">
                  <h3 className="font-medium text-slate-900">Validation Results</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-green-50 rounded-xl text-center">
                      <div className="text-2xl font-bold text-green-600">{validationResults.filter(r => r.is_valid && !r.already_exists).length}</div>
                      <div className="text-sm text-green-700">Valid</div>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-xl text-center">
                      <div className="text-2xl font-bold text-yellow-600">{validationResults.filter(r => r.already_exists).length}</div>
                      <div className="text-sm text-yellow-700">Already Added</div>
                    </div>
                    <div className="p-4 bg-red-50 rounded-xl text-center">
                      <div className="text-2xl font-bold text-red-600">{validationResults.filter(r => !r.is_valid).length}</div>
                      <div className="text-sm text-red-700">Invalid</div>
                    </div>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left">BEN</th>
                          <th className="px-4 py-2 text-left">School Name</th>
                          <th className="px-4 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {validationResults.map((result, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2 font-mono">{result.ben}</td>
                            <td className="px-4 py-2">{result.school_name || '-'}</td>
                            <td className="px-4 py-2">
                              {result.already_exists ? (
                                <span className="text-yellow-600">Already exists</span>
                              ) : result.is_valid ? (
                                <span className="text-green-600">✓ Valid</span>
                              ) : (
                                <span className="text-red-600">{result.error || 'Not found'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Upload Results */}
              {uploadResults && (
                <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                  <div className="flex items-center gap-2 text-green-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium">Upload Complete!</span>
                  </div>
                  <p className="text-sm text-green-600 mt-1">
                    Successfully added {uploadResults.successful?.length || 0} schools. {uploadResults.failed?.length || 0} failed.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => { setShowUploadModal(false); setValidationResults(null); setUploadResults(null); }} className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              {validationResults && !uploadResults && (
                <button onClick={handleUploadConfirm} className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl">
                  Import {validationResults.filter(r => r.is_valid && !r.already_exists).length} Schools
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* School Detail Modal */}
      {showSchoolDetail && selectedSchool && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-slate-900">
                    {loadingEnrichment ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                        Loading...
                      </span>
                    ) : (
                      selectedSchool.school_name || selectedSchool.name || `BEN ${selectedSchool.ben}`
                    )}
                  </h2>
                  {selectedSchool.status && (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      selectedSchool.status === 'Funded' ? 'bg-green-100 text-green-700' :
                      selectedSchool.status === 'Has Denials' ? 'bg-red-100 text-red-700' :
                      selectedSchool.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {selectedSchool.status}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  BEN: {selectedSchool.ben}
                  {selectedSchool.entity_type && ` • ${selectedSchool.entity_type}`}
                  {selectedSchool.state && ` • ${selectedSchool.city || ''} ${selectedSchool.state}`}
                </p>
              </div>
              <button onClick={() => { setShowSchoolDetail(false); setSelectedSchool(null); setEnrichedSchoolData(null); setComprehensiveSchoolData(null); setSchoolApplications([]); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* School Overview Card - Enriched Data */}
              {enrichedSchoolData && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Funding Summary */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">💰</span>
                      <span className="text-sm font-medium text-green-700">Total Funding</span>
                    </div>
                    <div className="text-2xl font-bold text-green-800">
                      ${(enrichedSchoolData.total_funding_committed || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      {enrichedSchoolData.funding_years?.length || 0} years active
                    </div>
                  </div>
                  
                  {/* Applications Count */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📋</span>
                      <span className="text-sm font-medium text-indigo-700">Applications</span>
                    </div>
                    <div className="text-2xl font-bold text-indigo-800">
                      {enrichedSchoolData.applications_count || 0}
                    </div>
                    <div className="text-xs text-indigo-600 mt-1">
                      {enrichedSchoolData.has_category1 && 'Cat 1'} 
                      {enrichedSchoolData.has_category1 && enrichedSchoolData.has_category2 && ' & '}
                      {enrichedSchoolData.has_category2 && 'Cat 2'}
                    </div>
                  </div>
                  
                  {/* Discount Rate */}
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📊</span>
                      <span className="text-sm font-medium text-amber-700">Discount Rate</span>
                    </div>
                    <div className="text-2xl font-bold text-amber-800">
                      {enrichedSchoolData.discount_rate ? `${enrichedSchoolData.discount_rate}%` : 'N/A'}
                    </div>
                    <div className="text-xs text-amber-600 mt-1">
                      E-Rate discount
                    </div>
                  </div>
                </div>
              )}
              
              {/* School Details Row */}
              {enrichedSchoolData && enrichedSchoolData.address && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Address:</span>
                      <div className="font-medium text-slate-900">{enrichedSchoolData.address}</div>
                    </div>
                    {enrichedSchoolData.frn_number && (
                      <div>
                        <span className="text-slate-500">Latest FRN:</span>
                        <div className="font-medium text-slate-900 font-mono">{enrichedSchoolData.frn_number}</div>
                      </div>
                    )}
                    {enrichedSchoolData.latest_year && (
                      <div>
                        <span className="text-slate-500">Latest Year:</span>
                        <div className="font-medium text-slate-900">{enrichedSchoolData.latest_year}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Comprehensive Budget & Funding Section */}
              {loadingComprehensiveData ? (
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                  <div className="flex items-center justify-center gap-2 text-slate-500">
                    <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                    <span>Loading budget data...</span>
                  </div>
                </div>
              ) : comprehensiveSchoolData && (
                <div className="space-y-4">
                  {/* Category 2 Budget Section */}
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-5 border border-purple-100">
                    <h3 className="text-lg font-semibold text-purple-900 mb-4 flex items-center gap-2">
                      <span>📚</span> Category 2 Budget (Internal Connections)
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Current Cycle */}
                      {comprehensiveSchoolData.c2_budget['FY2026-2030'] && (
                        <div className="bg-white/70 rounded-lg p-4">
                          <div className="text-sm font-medium text-purple-700 mb-2">FY2026-2030 (Current Cycle)</div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-slate-600">Total Budget:</span>
                              <span className="font-semibold text-purple-900">${comprehensiveSchoolData.c2_budget['FY2026-2030'].c2_budget.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Funded:</span>
                              <span className="font-medium text-green-700">${comprehensiveSchoolData.c2_budget['FY2026-2030'].funded.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Pending:</span>
                              <span className="font-medium text-yellow-700">${comprehensiveSchoolData.c2_budget['FY2026-2030'].pending.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 mt-2">
                              <span className="text-slate-600 font-medium">Available:</span>
                              <span className="font-bold text-indigo-700">${comprehensiveSchoolData.c2_budget['FY2026-2030'].available.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Previous Cycle */}
                      {comprehensiveSchoolData.c2_budget['FY2021-2025'] && (
                        <div className="bg-white/70 rounded-lg p-4">
                          <div className="text-sm font-medium text-purple-700 mb-2">FY2021-2025 (Previous Cycle)</div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-slate-600">Total Budget:</span>
                              <span className="font-semibold text-purple-900">${comprehensiveSchoolData.c2_budget['FY2021-2025'].c2_budget.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Funded:</span>
                              <span className="font-medium text-green-700">${comprehensiveSchoolData.c2_budget['FY2021-2025'].funded.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Pending:</span>
                              <span className="font-medium text-yellow-700">${comprehensiveSchoolData.c2_budget['FY2021-2025'].pending.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 mt-2">
                              <span className="text-slate-600 font-medium">Available:</span>
                              <span className="font-bold text-indigo-700">${comprehensiveSchoolData.c2_budget['FY2021-2025'].available.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lifetime Funding Totals */}
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 border border-emerald-100">
                    <h3 className="text-lg font-semibold text-emerald-900 mb-4 flex items-center gap-2">
                      <span>💰</span> Lifetime Funding Summary
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Category 1 */}
                      <div className="bg-white/70 rounded-lg p-4 text-center">
                        <div className="text-sm font-medium text-emerald-700 mb-1">Category 1</div>
                        <div className="text-xs text-slate-500 mb-2">(Voice, Internet, Data)</div>
                        <div className="text-2xl font-bold text-emerald-800">
                          ${comprehensiveSchoolData.funding_totals.category_1.funded.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Requested: ${comprehensiveSchoolData.funding_totals.category_1.requested.toLocaleString()}
                        </div>
                      </div>
                      
                      {/* Category 2 */}
                      <div className="bg-white/70 rounded-lg p-4 text-center">
                        <div className="text-sm font-medium text-emerald-700 mb-1">Category 2</div>
                        <div className="text-xs text-slate-500 mb-2">(Internal Connections)</div>
                        <div className="text-2xl font-bold text-emerald-800">
                          ${comprehensiveSchoolData.funding_totals.category_2.funded.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Requested: ${comprehensiveSchoolData.funding_totals.category_2.requested.toLocaleString()}
                        </div>
                      </div>
                      
                      {/* Total */}
                      <div className="bg-emerald-100/70 rounded-lg p-4 text-center">
                        <div className="text-sm font-medium text-emerald-700 mb-1">Lifetime Total</div>
                        <div className="text-xs text-slate-500 mb-2">(All Categories)</div>
                        <div className="text-2xl font-bold text-emerald-900">
                          ${comprehensiveSchoolData.funding_totals.lifetime_total.toLocaleString()}
                        </div>
                        <div className="text-xs text-emerald-600 mt-1">
                          Total funded E-Rate
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Funding by Year (last 5 years) */}
                  {comprehensiveSchoolData.years.length > 0 && (
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 border border-blue-100">
                      <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
                        <span>📅</span> Funding by Year
                      </h3>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-blue-700 border-b border-blue-200">
                              <th className="pb-2 font-medium">Year</th>
                              <th className="pb-2 font-medium text-right">C1 Funded</th>
                              <th className="pb-2 font-medium text-right">C2 Funded</th>
                              <th className="pb-2 font-medium text-right">Total</th>
                              <th className="pb-2 font-medium text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comprehensiveSchoolData.years.slice(0, 5).map((year) => (
                              <tr key={year.year} className="border-b border-blue-100">
                                <td className="py-2 font-medium text-blue-900">{year.year}</td>
                                <td className="py-2 text-right text-slate-700">${year.c1_funded.toLocaleString()}</td>
                                <td className="py-2 text-right text-slate-700">${year.c2_funded.toLocaleString()}</td>
                                <td className="py-2 text-right font-medium text-blue-800">${(year.c1_funded + year.c2_funded).toLocaleString()}</td>
                                <td className="py-2 text-center">
                                  {Object.entries(year.status_summary).map(([status, count]) => (
                                    <span 
                                      key={status} 
                                      className={`inline-block px-2 py-0.5 rounded text-xs mr-1 ${
                                        status.includes('funded') || status.includes('committed') ? 'bg-green-100 text-green-700' :
                                        status.includes('denied') ? 'bg-red-100 text-red-700' :
                                        status.includes('pending') ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {count as number}x {status}
                                    </span>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Year Filter */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-slate-700">Filter by Year:</span>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => filterApplicationsByYear(null)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedYear === null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    All Years
                  </button>
                  {applicationYears.map(year => (
                    <button
                      key={year}
                      onClick={() => filterApplicationsByYear(year)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        selectedYear === year ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              {/* Applications Table */}
              {loadingApplications ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
                  <p className="mt-4 text-slate-500">Loading applications...</p>
                </div>
              ) : schoolApplications.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No applications found for this school.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Year</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">FRN</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Category</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {schoolApplications.map((app, idx) => {
                        const isDenied = app.frn_status?.toLowerCase().includes('denied') || app.status?.toLowerCase().includes('denied');
                        const statusColors: Record<string, string> = {
                          'funded': 'bg-green-100 text-green-700',
                          'denied': 'bg-red-100 text-red-700',
                          'pending': 'bg-yellow-100 text-yellow-700',
                          'committed': 'bg-blue-100 text-blue-700',
                        };
                        const statusKey = isDenied ? 'denied' : (app.frn_status?.toLowerCase().includes('funded') || app.frn_status?.toLowerCase().includes('committed') ? 'funded' : 'pending');
                        
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">{app.funding_year}</td>
                            <td className="px-4 py-3 font-mono text-sm text-slate-600">{app.frn}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[statusKey] || 'bg-slate-100 text-slate-600'}`}>
                                {app.frn_status || app.status || 'Unknown'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              ${(app.original_request || app.amount || 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">{app.service_type || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              {isDenied && (
                                <button
                                  onClick={() => handleGenerateAppeal(app.frn)}
                                  disabled={generatingAppeal === app.frn}
                                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-medium rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                                >
                                  {generatingAppeal === app.frn ? 'Generating...' : 'Generate Appeal'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Denial Reasons */}
              {schoolApplications.some(app => app.denial_reason) && (
                <div className="space-y-4">
                  <h3 className="font-medium text-slate-900">Denial Reasons</h3>
                  {schoolApplications.filter(app => app.denial_reason).map((app, idx) => (
                    <div key={idx} className="p-4 bg-red-50 rounded-xl border border-red-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-red-800">FRN {app.frn} ({app.funding_year})</span>
                      </div>
                      <p className="text-sm text-red-700">{app.denial_reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Appeal Modal */}
      {showNewAppealModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            {selectedDeniedApp ? (
              /* Confirmation view when generating from denied application */
              <>
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-xl font-semibold text-slate-900">Confirm Appeal Generation</h2>
                  <p className="text-sm text-slate-500 mt-1">Review the details and confirm to generate the appeal</p>
                </div>
                
                <div className="p-6 space-y-4">
                  {appealError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                      {appealError}
                    </div>
                  )}
                  
                  {/* Application Details */}
                  <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">School Name</span>
                      <span className="text-sm font-medium text-slate-900">{selectedDeniedApp.school_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">FRN</span>
                      <span className="text-sm font-mono font-semibold text-indigo-600">{selectedDeniedApp.frn}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Funding Year</span>
                      <span className="text-sm font-medium text-slate-900">{selectedDeniedApp.funding_year}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Service Type</span>
                      <span className="text-sm font-medium text-slate-900">{selectedDeniedApp.service_type}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Amount Requested</span>
                      <span className="text-sm font-medium text-slate-900">${selectedDeniedApp.amount_requested?.toLocaleString() || 'N/A'}</span>
                    </div>
                    {selectedDeniedApp.denial_reason && (
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-sm text-slate-500 block mb-1">Denial Reason</span>
                        <span className="text-sm text-red-600">{selectedDeniedApp.denial_reason}</span>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Additional Context (Optional)
                    </label>
                    <textarea
                      value={newAppealContext}
                      onChange={(e) => setNewAppealContext(e.target.value)}
                      placeholder="Add any additional information to help generate the appeal..."
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                  <button 
                    onClick={() => {
                      setShowNewAppealModal(false);
                      setSelectedDeniedApp(null);
                      setNewAppealFrn("");
                      setNewAppealContext("");
                      setAppealError(null);
                    }}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleGenerateAppeal(selectedDeniedApp.frn, newAppealContext)}
                    disabled={generatingAppeal !== null}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {generatingAppeal ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      'Generate Appeal'
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Manual entry view for new appeals */
              <>
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-xl font-semibold text-slate-900">Generate New Appeal</h2>
                  <p className="text-sm text-slate-500 mt-1">Enter a denied FRN to generate an appeal letter</p>
                </div>
                
                <div className="p-6 space-y-4">
                  {appealError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                      {appealError}
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      FRN (Funding Request Number) *
                    </label>
                    <input
                      type="text"
                      value={newAppealFrn}
                      onChange={(e) => setNewAppealFrn(e.target.value)}
                      placeholder="e.g., 2391012345"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Additional Context (Optional)
                    </label>
                    <textarea
                      value={newAppealContext}
                      onChange={(e) => setNewAppealContext(e.target.value)}
                      placeholder="Add any additional information to help generate the appeal..."
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                  <button 
                    onClick={() => {
                      setShowNewAppealModal(false);
                      setNewAppealFrn("");
                      setNewAppealContext("");
                      setAppealError(null);
                    }}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleGenerateAppeal(newAppealFrn, newAppealContext)}
                    disabled={!newAppealFrn.trim() || generatingAppeal !== null}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {generatingAppeal ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      'Generate Appeal'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Appeal Chat Modal */}
      {showAppealChat && selectedAppeal && (
        <AppealChat
          appeal={selectedAppeal}
          onAppealUpdate={handleAppealUpdate}
          onClose={() => {
            setShowAppealChat(false);
            setSelectedAppeal(null);
          }}
        />
      )}
    </div>
  );
}
