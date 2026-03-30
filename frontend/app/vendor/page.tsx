"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { useVerificationGuard } from "@/lib/use-verification-guard";
import { api, VendorProfile, SpinValidationResult, ServicedEntity, EntityDetailResponse, EntityYearData, Form471ByEntityResponse, Form471Record, Form471Vendor, CompetitorAnalysisResponse, FRNStatusResponse, FRNStatusSummaryResponse, FRNStatusRecord, Form470Lead, Form470LeadsResponse, Form470DetailResponse, SavedLead, EnrichedContactData, FRNWatch, CreateWatchRequest, FRNReportHistory } from "@/lib/api";
import { useTabParam } from "@/hooks/useTabParam";
import PredictedLeadsTab from "@/components/PredictedLeadsTab";
import { TableExportBar } from "@/components/TableExportBar";
import { downloadCsv, csvFilename } from "@/lib/csv-export";

const VENDOR_TABS = ["dashboard", "my-entities", "frn-status", "470-leads", "predicted-leads", "competitive", "search", "leads", "settings"] as const;
type VendorTab = typeof VENDOR_TABS[number];

interface SearchResult {
  ben: string;
  name: string;
  state: string;
  city: string;
  status: string;
  funding_amount: number;
  service_type: string;
  funding_year?: number;
  application_number?: string;
  frn?: string;
  _raw?: any; // Raw USAC data for detail view
}

export default function VendorPortalWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    }>
      <VendorPortalPage />
    </Suspense>
  );
}

function VendorPortalPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout, _hasHydrated } = useAuthStore();
  const { verified: emailVerified, checking: checkingVerification } = useVerificationGuard();
  
  const [activeTab, setActiveTab] = useTabParam<VendorTab>("dashboard", VENDOR_TABS);
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Search filters
  const [searchState, setSearchState] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const [searchServiceType, setSearchServiceType] = useState("");
  const [searchYear, setSearchYear] = useState(2025);
  const [searchMinAmount, setSearchMinAmount] = useState("");
  const [searchMaxAmount, setSearchMaxAmount] = useState("");
  
  // SPIN state
  const [spinInput, setSpinInput] = useState("");
  const [spinValidating, setSpinValidating] = useState(false);
  const [spinValidation, setSpinValidation] = useState<SpinValidationResult | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [servicedEntities, setServicedEntities] = useState<ServicedEntity[]>([]);
  const [servicedEntitiesLoading, setServicedEntitiesLoading] = useState(false);
  const [servicedEntitiesStats, setServicedEntitiesStats] = useState<{
    total_entities: number;
    total_authorized: number;
    funding_years: string[];
    service_provider_name: string | null;
  } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  
  // Entity detail modal state
  const [selectedEntity, setSelectedEntity] = useState<ServicedEntity | null>(null);
  const [entityDetailLoading, setEntityDetailLoading] = useState(false);
  const [entityDetail, setEntityDetail] = useState<EntityDetailResponse | null>(null);
  const [showEntityModal, setShowEntityModal] = useState(false);
  
  // Search result detail modal state
  const [selectedSearchResult, setSelectedSearchResult] = useState<SearchResult | null>(null);
  const [searchResultDetailLoading, setSearchResultDetailLoading] = useState(false);
  const [showSearchResultModal, setShowSearchResultModal] = useState(false);
  
  // Form 471 Competitive Analysis state
  const [form471BenInput, setForm471BenInput] = useState("");
  const [form471Year, setForm471Year] = useState<number | undefined>(undefined);
  const [form471Loading, setForm471Loading] = useState(false);
  const [form471Data, setForm471Data] = useState<Form471ByEntityResponse | null>(null);
  const [form471Error, setForm471Error] = useState<string | null>(null);
  const [competitorData, setCompetitorData] = useState<CompetitorAnalysisResponse | null>(null);
  const [competitorLoading, setCompetitorLoading] = useState(false);
  
  // FRN Status Monitoring state (Sprint 2)
  const [frnStatusData, setFrnStatusData] = useState<FRNStatusResponse | null>(null);
  const [frnStatusLoading, setFrnStatusLoading] = useState(false);
  const [frnStatusYear, setFrnStatusYear] = useState<number | undefined>(undefined);
  const [frnStatusFilter, setFrnStatusFilter] = useState<string>("");
  const [frnPendingReason, setFrnPendingReason] = useState<string>("");
  const [selectedFRN, setSelectedFRN] = useState<FRNStatusRecord | null>(null);
  const [showFRNDetailModal, setShowFRNDetailModal] = useState(false);
  const [frnTableSort, setFrnTableSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);

  // Sorted and filtered FRN data for table display
  const sortedFrnData = useMemo(() => {
    if (!frnStatusData?.frns?.length) return [];
    
    // First filter by status if a filter is selected
    let filtered = frnStatusData.frns;
    if (frnStatusFilter) {
      filtered = frnStatusData.frns.filter(frn => {
        const status = (frn.status || '').toLowerCase();
        const filter = frnStatusFilter.toLowerCase();
        if (filter === 'funded') return status.includes('funded') || status.includes('committed');
        if (filter === 'denied') return status.includes('denied');
        if (filter === 'pending') return status.includes('pending') || status.includes('review') || status.includes('wave');
        return true;
      });
    }
    
    // Then sort if sorting is active
    if (!frnTableSort) return filtered;
    
    const sorted = [...filtered].sort((a, b) => {
      const aVal = ((a as any)[frnTableSort.field] || '').toString().toLowerCase();
      const bVal = ((b as any)[frnTableSort.field] || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return frnTableSort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [frnStatusData?.frns, frnTableSort, frnStatusFilter]);

  // Toggle FRN table sort
  const toggleFrnTableSort = (field: string) => {
    setFrnTableSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  // Toggle Form 470 leads sort
  const toggleForm470Sort = (field: string) => {
    setForm470Sort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  // Toggle school search sort
  const toggleSchoolSearchSort = (field: string) => {
    setSchoolSearchSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  // Toggle serviced entities sort
  const toggleServicedEntitiesSort = (field: string) => {
    setServicedEntitiesSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  const [frnWatches, setFrnWatches] = useState<FRNWatch[]>([]);
  const [showCreateWatch, setShowCreateWatch] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [reportHistory, setReportHistory] = useState<FRNReportHistory[]>([]);
  const [selectedReport, setSelectedReport] = useState<{html: string; name: string} | null>(null);
  
  // Table sort states for entity columns
  const [form470Sort, setForm470Sort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [schoolSearchSort, setSchoolSearchSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [servicedEntitiesSort, setServicedEntitiesSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);

  // Form 470 Lead Generation state (Sprint 3)
  const [form470Leads, setForm470Leads] = useState<Form470Lead[]>([]);
  const [form470Loading, setForm470Loading] = useState(false);
  const [form470Error, setForm470Error] = useState<string | null>(null);
  const [form470Filters, setForm470Filters] = useState<{
    year?: number;
    state?: string;
    category?: string;
    service_type?: string;
    manufacturer?: string;
    equipment_type?: string;
    service_function?: string;
    min_speed?: string;
    max_speed?: string;
    sort_by?: string;
  }>({});
  const [form470TotalLeads, setForm470TotalLeads] = useState(0);
  const [form470Detail, setForm470Detail] = useState<Form470DetailResponse | null>(null);
  const [form470DetailLoading, setForm470DetailLoading] = useState(false);
  const [showForm470Modal, setShowForm470Modal] = useState(false);
  
  // Saved Leads state
  const [savedLeads, setSavedLeads] = useState<SavedLead[]>([]);
  const [savedLeadsLoading, setSavedLeadsLoading] = useState(false);
  const [savedLeadsTotalCount, setSavedLeadsTotalCount] = useState(0);
  const [savedLeadsFilter, setSavedLeadsFilter] = useState<string>('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  
  // Lead saving/enrichment state for the modal
  const [isLeadSaved, setIsLeadSaved] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [enrichingLead, setEnrichingLead] = useState(false);
  const [currentSavedLead, setCurrentSavedLead] = useState<SavedLead | null>(null);
  const [enrichmentData, setEnrichmentData] = useState<EnrichedContactData | null>(null);

  // Saved Lead Detail Modal state (for predicted/non-470 leads)
  const [showSavedLeadDetailModal, setShowSavedLeadDetailModal] = useState(false);
  const [selectedSavedLeadDetail, setSelectedSavedLeadDetail] = useState<SavedLead | null>(null);
  
  // Form 470 Leads selection for export
  const [selectedForm470Leads, setSelectedForm470Leads] = useState<Set<string>>(new Set());
  
  // FRN Status selection for export
  const [selectedFrns, setSelectedFrns] = useState<Set<string>>(new Set());
  
  // Serviced Entities selection for export
  const [selectedServicedEntities, setSelectedServicedEntities] = useState<Set<string>>(new Set());
  
  // Form 471 Records selection for export
  const [selectedForm471Records, setSelectedForm471Records] = useState<Set<string>>(new Set());
  
  // Payment guard - check if user needs to complete payment setup
  const [checkingPayment, setCheckingPayment] = useState(true);

  // Sorted Form 470 leads for table display
  const sortedForm470Leads = useMemo(() => {
    if (!form470Leads.length || !form470Sort) return form470Leads;
    return [...form470Leads].sort((a, b) => {
      const aVal = (a.entity_name || '').toString().toLowerCase();
      const bVal = (b.entity_name || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return form470Sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [form470Leads, form470Sort]);

  // Sorted search results for table display
  const sortedSearchResults = useMemo(() => {
    if (!searchResults.length || !schoolSearchSort) return searchResults;
    return [...searchResults].sort((a, b) => {
      const aVal = (a.name || '').toString().toLowerCase();
      const bVal = (b.name || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return schoolSearchSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [searchResults, schoolSearchSort]);

  // Sorted serviced entities for table display
  const sortedServicedEntities = useMemo(() => {
    if (!servicedEntities.length || !servicedEntitiesSort) return servicedEntities;
    return [...servicedEntities].sort((a, b) => {
      const aVal = (a.organization_name || '').toString().toLowerCase();
      const bVal = (b.organization_name || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return servicedEntitiesSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [servicedEntities, servicedEntitiesSort]);

  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!_hasHydrated || checkingVerification) return;
      if (!isAuthenticated) {
        router.push("/sign-in");
        return;
      }
      // Verification guard handles redirect to /onboarding
      if (!emailVerified) return;
      if (user?.role !== "vendor" && user?.role !== "admin" && user?.role !== "super") {
        // Redirect to appropriate dashboard based on role
        const dashboard = user?.role === 'applicant' ? '/applicant' : '/consultant';
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
      loadProfile();
    };
    
    checkPaymentStatus();
  }, [_hasHydrated, isAuthenticated, user, router, checkingVerification, emailVerified]);

  // Load saved leads when the "leads" tab is activated
  useEffect(() => {
    if (activeTab === "leads" && savedLeads.length === 0 && !savedLeadsLoading) {
      loadSavedLeads();
    }
    if (activeTab === 'frn-status') {
      loadFRNWatches();
      loadReportHistory();
    }
  }, [activeTab]);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const response = await api.getVendorProfile();
      if (response.success && response.data) {
        setProfile(response.data.profile);
        // Initialize SPIN input with profile SPIN if exists
        if (response.data.profile.spin) {
          setSpinInput(response.data.profile.spin);
          // Auto-load serviced entities if SPIN is configured
          loadServicedEntities();
        }
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const validateSpin = async () => {
    if (!spinInput.trim()) {
      setSpinError("Please enter a SPIN");
      return;
    }
    
    setSpinValidating(true);
    setSpinError(null);
    setSpinValidation(null);
    
    try {
      const response = await api.validateSpin(spinInput.trim());
      if (response.success && response.data?.valid) {
        setSpinValidation(response.data.provider!);
        setSpinError(null);
      } else {
        setSpinError(response.data?.error || response.error || "Invalid SPIN");
        setSpinValidation(null);
      }
    } catch (error) {
      console.error("SPIN validation failed:", error);
      setSpinError("Failed to validate SPIN. Please try again.");
    } finally {
      setSpinValidating(false);
    }
  };

  const saveSpin = async () => {
    if (!spinValidation) {
      setSpinError("Please validate your SPIN first");
      return;
    }
    
    setSavingProfile(true);
    try {
      const response = await api.updateVendorProfile({
        spin: spinInput.trim(),
        company_name: spinValidation.service_provider_name || profile?.company_name,
      });
      
      if (response.success && response.data) {
        setProfile(response.data.profile);
        // Fetch serviced entities after saving SPIN
        loadServicedEntities();
      }
    } catch (error) {
      console.error("Failed to save SPIN:", error);
      setSpinError("Failed to save SPIN. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const loadServicedEntities = async () => {
    setServicedEntitiesLoading(true);
    try {
      const response = await api.getServicedEntities();
      if (response.success && response.data) {
        setServicedEntities(response.data.entities || []);
        setServicedEntitiesStats({
          total_entities: response.data.total_entities,
          total_authorized: response.data.total_authorized,
          funding_years: response.data.funding_years,
          service_provider_name: response.data.service_provider_name,
        });
      }
    } catch (error) {
      console.error("Failed to load serviced entities:", error);
    } finally {
      setServicedEntitiesLoading(false);
    }
  };

  const loadEntityDetail = async (entity: ServicedEntity) => {
    setSelectedEntity(entity);
    setShowEntityModal(true);
    setEntityDetailLoading(true);
    setEntityDetail(null);
    
    try {
      const response = await api.getEntityDetail(entity.ben);
      if (response.success && response.data) {
        setEntityDetail(response.data);
      }
    } catch (error) {
      console.error("Failed to load entity detail:", error);
    } finally {
      setEntityDetailLoading(false);
    }
  };

  const closeEntityModal = () => {
    setShowEntityModal(false);
    setSelectedEntity(null);
    setEntityDetail(null);
  };

  // Form 471 Competitive Analysis functions
  const search471ByBen = async () => {
    if (!form471BenInput.trim()) {
      setForm471Error("Please enter a BEN (Billed Entity Number)");
      return;
    }
    
    setForm471Loading(true);
    setForm471Error(null);
    setForm471Data(null);
    
    try {
      const response = await api.get471ByEntity(form471BenInput.trim(), form471Year);
      if (response.success && response.data) {
        if (response.data.success) {
          setForm471Data(response.data);
        } else {
          setForm471Error(response.data.error || "Failed to fetch 471 data");
        }
      } else {
        setForm471Error(response.error || "Failed to fetch 471 data");
      }
    } catch (error) {
      console.error("471 lookup failed:", error);
      setForm471Error("Failed to look up Form 471 data. Please try again.");
    } finally {
      setForm471Loading(false);
    }
  };

  const loadCompetitorAnalysis = async () => {
    if (!profile?.spin) {
      return;
    }
    
    setCompetitorLoading(true);
    try {
      const response = await api.get471Competitors();
      if (response.success && response.data) {
        setCompetitorData(response.data);
      }
    } catch (error) {
      console.error("Failed to load competitor analysis:", error);
    } finally {
      setCompetitorLoading(false);
    }
  };

  // FRN Status Monitoring functions (Sprint 2)
  const loadFRNStatus = async (year?: number, status?: string, pendingReason?: string) => {
    if (!profile?.spin) {
      return;
    }
    
    setFrnStatusLoading(true);
    try {
      const response = await api.getFRNStatus(year, status || undefined, pendingReason || undefined);
      if (response.success && response.data) {
        setFrnStatusData(response.data);
      }
    } catch (error) {
      console.error("Failed to load FRN status:", error);
    } finally {
      setFrnStatusLoading(false);
    }
  };

  const loadFRNWatches = async () => {
    try {
      const response = await api.getFRNWatches();
      if (response?.data?.watches) {
        setFrnWatches(response.data.watches);
      }
    } catch (error) {
      console.error('Failed to load FRN watches:', error);
    }
  };

  const loadReportHistory = async () => {
    try {
      const response = await api.getFRNReportHistory(10);
      if (response?.data?.reports) {
        setReportHistory(response.data.reports);
      }
    } catch (error) {
      console.error('Failed to load report history:', error);
    }
  };

  // Form 470 Lead Generation functions (Sprint 3)
  const load470Leads = async (filters?: {
    year?: number;
    state?: string;
    category?: string;
    service_type?: string;
    manufacturer?: string;
    equipment_type?: string;
    service_function?: string;
    min_speed?: string;
    max_speed?: string;
    sort_by?: string;
  }) => {
    setForm470Loading(true);
    setForm470Error(null);
    
    try {
      const searchFilters = filters || form470Filters;
      const response = await api.get470Leads({
        ...searchFilters,
        limit: 2000
      });
      
      if (response.success && response.data) {
        setForm470Leads(response.data.leads || []);
        setForm470TotalLeads(response.data.total_leads || 0);
        // Clean null values from filters_applied to avoid null contamination in state
        const cleanFilters = Object.fromEntries(
          Object.entries(response.data.filters_applied || {}).filter(([_, v]) => v != null)
        );
        setForm470Filters(cleanFilters);
      } else {
        setForm470Error(response.error || "Failed to fetch 470 leads");
        setForm470Leads([]);
        setForm470TotalLeads(0);
      }
    } catch (error) {
      console.error("Failed to load 470 leads:", error);
      setForm470Error("Failed to fetch Form 470 leads");
    } finally {
      setForm470Loading(false);
    }
  };

  const load470Detail = async (applicationNumber: string) => {
    setForm470DetailLoading(true);
    setShowForm470Modal(true);
    setForm470Detail(null);
    setIsLeadSaved(false);
    setCurrentSavedLead(null);
    setEnrichmentData(null);
    
    try {
      const response = await api.get470Detail(applicationNumber);
      if (response.success && response.data) {
        setForm470Detail(response.data);
        
        // Check if lead is already saved
        const savedCheck = await api.checkLeadSaved('470', applicationNumber);
        if (savedCheck.success && savedCheck.data?.is_saved) {
          setIsLeadSaved(true);
          setCurrentSavedLead(savedCheck.data.lead);
          if (savedCheck.data.lead?.enriched_data) {
            setEnrichmentData(savedCheck.data.lead.enriched_data);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load 470 detail:", error);
    } finally {
      setForm470DetailLoading(false);
    }
  };

  const closeForm470Modal = () => {
    setShowForm470Modal(false);
    setForm470Detail(null);
    setIsLeadSaved(false);
    setCurrentSavedLead(null);
    setEnrichmentData(null);
  };

  // Saved Leads functions
  const loadSavedLeads = async (status?: string) => {
    setSavedLeadsLoading(true);
    try {
      const response = await api.getSavedLeads({
        lead_status: status || undefined,
        limit: 100,
      });
      if (response.success && response.data) {
        setSavedLeads(response.data.leads || []);
        setSavedLeadsTotalCount(response.data.total || 0);
      }
    } catch (error) {
      console.error("Failed to load saved leads:", error);
    } finally {
      setSavedLeadsLoading(false);
    }
  };

  const saveCurrentLead = async () => {
    if (!form470Detail) return;
    
    setSavingLead(true);
    try {
      const response = await api.saveLead({
        form_type: '470',
        application_number: form470Detail.application_number,
        ben: form470Detail.entity?.ben || '',
        entity_name: form470Detail.entity?.name,
        entity_type: form470Detail.entity?.type,
        entity_state: form470Detail.entity?.state,
        entity_city: form470Detail.entity?.city,
        contact_name: form470Detail.contact?.name,
        contact_email: form470Detail.contact?.email,
        contact_phone: form470Detail.contact?.phone,
        funding_year: parseInt(form470Detail.funding_year) || undefined,
        categories: form470Detail.categories,
        services: form470Detail.service_types,
        manufacturers: form470Detail.manufacturers,
      });
      
      if (response.success && response.data?.lead) {
        setIsLeadSaved(true);
        setCurrentSavedLead(response.data.lead);
      } else {
        // May already be saved
        if (response.data?.error === 'Lead already saved') {
          setIsLeadSaved(true);
          setCurrentSavedLead(response.data.lead || null);
        }
      }
    } catch (error) {
      console.error("Failed to save lead:", error);
    } finally {
      setSavingLead(false);
    }
  };

  const unsaveLead = async () => {
    if (!currentSavedLead) return;
    
    try {
      await api.deleteSavedLead(currentSavedLead.id);
      setIsLeadSaved(false);
      setCurrentSavedLead(null);
      setEnrichmentData(null);
    } catch (error) {
      console.error("Failed to unsave lead:", error);
    }
  };

  const enrichCurrentLead = async () => {
    if (!currentSavedLead) {
      console.log("enrichCurrentLead: No currentSavedLead");
      return;
    }
    
    console.log("Starting enrichment for lead:", currentSavedLead.id);
    console.log("Contact info:", {
      email: form470Detail?.contact?.email,
      name: form470Detail?.contact?.name,
    });
    
    setEnrichingLead(true);
    try {
      const response = await api.enrichSavedLead(currentSavedLead.id, {
        contact_email: form470Detail?.contact?.email,
        contact_name: form470Detail?.contact?.name,
      });
      
      console.log("Enrichment response:", response);
      
      if (response.success && response.data?.enrichment) {
        setEnrichmentData(response.data.enrichment);
        console.log("Enrichment data set:", response.data.enrichment);
        if (response.data.lead) {
          setCurrentSavedLead(response.data.lead);
        }
      } else if (response.data?.error) {
        console.error("Enrichment error:", response.data.error);
        alert(`Enrichment error: ${response.data.error}`);
      }
    } catch (error) {
      console.error("Failed to enrich lead:", error);
      alert(`Failed to enrich lead: ${error}`);
    } finally {
      setEnrichingLead(false);
    }
  };

  const updateLeadStatus = async (leadId: number, status: string) => {
    try {
      await api.updateSavedLead(leadId, { lead_status: status });
      // Refresh saved leads list
      loadSavedLeads(savedLeadsFilter || undefined);
    } catch (error) {
      console.error("Failed to update lead status:", error);
    }
  };

  const deleteSavedLead = async (leadId: number) => {
    if (!confirm("Are you sure you want to remove this lead?")) return;
    
    try {
      await api.deleteSavedLead(leadId);
      setSavedLeads(prev => prev.filter(l => l.id !== leadId));
      setSavedLeadsTotalCount(prev => prev - 1);
    } catch (error) {
      console.error("Failed to delete lead:", error);
    }
  };

  const toggleForm470LeadSelection = (applicationNumber: string) => {
    setSelectedForm470Leads(prev => {
      const newSet = new Set(prev);
      if (newSet.has(applicationNumber)) {
        newSet.delete(applicationNumber);
      } else {
        newSet.add(applicationNumber);
      }
      return newSet;
    });
  };

  const selectAllForm470Leads = () => {
    setSelectedForm470Leads(new Set(form470Leads.map(l => l.application_number)));
  };

  const clearForm470Selection = () => {
    setSelectedForm470Leads(new Set());
  };

  const exportSelectedForm470Leads = () => {
    const leadsToExport = selectedForm470Leads.size > 0
      ? form470Leads.filter(l => selectedForm470Leads.has(l.application_number))
      : form470Leads;
    
    const columns = ['application_number', 'funding_year', 'ben', 'entity_name', 'state', 'city', 'applicant_type', 'status', 'contact_name', 'contact_email', 'contact_phone', 'posting_date', 'allowable_contract_date', 'categories', 'service_types', 'manufacturers'];
    const rows = leadsToExport.map(l => ({
      application_number: l.application_number,
      funding_year: l.funding_year,
      ben: l.ben,
      entity_name: l.entity_name || '',
      state: l.state,
      city: l.city,
      applicant_type: l.applicant_type,
      status: l.status,
      contact_name: l.contact_name || '',
      contact_email: l.contact_email || '',
      contact_phone: l.contact_phone || '',
      posting_date: l.posting_date || '',
      allowable_contract_date: l.allowable_contract_date || '',
      categories: l.categories?.join('; ') || '',
      service_types: l.service_types?.join('; ') || '',
      manufacturers: l.manufacturers?.join('; ') || '',
    }));
    
    downloadCsv(csvFilename('form470_leads'), columns, rows);
  };

  const exportSavedLeads = async () => {
    const leadIdsToExport = selectedLeadIds.size > 0 ? Array.from(selectedLeadIds) : undefined;
    
    try {
      const response = await api.exportSavedLeads({
        lead_ids: leadIdsToExport,
        lead_status: !leadIdsToExport ? (savedLeadsFilter || undefined) : undefined,
      });
      
      if (response.success && response.data?.data) {
        const data = response.data.data;
        const columns = response.data.columns;
        
        const csv = [
          columns.join(","),
          ...data.map(row => 
            columns.map(col => `"${String(row[col] || '').replace(/"/g, '""')}"`).join(",")
          )
        ].join("\n");
        
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `saved_leads_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to export saved leads:", error);
    }
  };

  const generateLinkedInSearchUrl = (name?: string, company?: string, location?: string) => {
    const keywords = [name, company].filter(Boolean).join(' ');
    const encodedKeywords = encodeURIComponent(keywords);
    return `https://www.linkedin.com/search/results/people/?keywords=${encodedKeywords}`;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const response = await api.searchSchools({
        state: searchState || undefined,
        status: searchStatus || undefined,
        service_type: searchServiceType || undefined,
        year: searchYear,
        min_amount: searchMinAmount ? parseInt(searchMinAmount) : undefined,
        max_amount: searchMaxAmount ? parseInt(searchMaxAmount) : undefined,
        limit: 100,
      });
      
      if (response.success && response.data) {
        setSearchResults(response.data.results || []);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSchoolSelection = (ben: string) => {
    const newSelection = new Set(selectedSchools);
    if (newSelection.has(ben)) {
      newSelection.delete(ben);
    } else {
      newSelection.add(ben);
    }
    setSelectedSchools(newSelection);
  };

  // Handle clicking on BEN to view school details
  // Entity enrichment state for the search result modal
  const [entityEnrichment, setEntityEnrichment] = useState<any>(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);

  const handleViewSchoolDetail = async (school: SearchResult) => {
    setSelectedSearchResult(school);
    setShowSearchResultModal(true);
    setEnrichmentLoading(true);
    setEntityEnrichment(null);
    setIsLeadSaved(false);
    setCurrentSavedLead(null);
    
    try {
      // Fetch enriched entity data from multiple USAC sources
      const response = await api.enrichEntity(school.ben, {
        year: school.funding_year,
        application_number: school.application_number,
        frn: school.frn
      });
      
      if (response.success && response.data) {
        setEntityEnrichment(response.data);
        
        // Check if this lead is already saved
        try {
          const leadsResponse = await api.getSavedLeads({ state: school.state });
          if (leadsResponse.success && leadsResponse.data?.leads) {
            const existingLead = leadsResponse.data.leads.find(
              l => l.ben === school.ben && l.application_number === school.application_number
            );
            if (existingLead) {
              setIsLeadSaved(true);
              setCurrentSavedLead(existingLead);
            }
          }
        } catch (e) {
          // Ignore errors checking for existing lead
        }
      }
    } catch (error) {
      console.error("Failed to fetch enriched school detail:", error);
    } finally {
      setEnrichmentLoading(false);
    }
  };
  
  const handleSaveAsLead = async () => {
    if (!selectedSearchResult) return;
    
    setSavingLead(true);
    try {
      const enriched = entityEnrichment;
      const primaryContact = enriched?.contacts?.[0] || {};
      
      const leadData = {
        ben: selectedSearchResult.ben,
        entity_name: enriched?.entity?.name || selectedSearchResult.name,
        entity_state: enriched?.entity?.state || selectedSearchResult.state,
        entity_city: enriched?.entity?.city || selectedSearchResult.city,
        entity_address: enriched?.entity?.address,
        entity_zip: enriched?.entity?.zip,
        entity_phone: enriched?.entity?.phone,
        entity_website: enriched?.entity?.website,
        entity_type: enriched?.entity?.entity_type,
        form_type: '471' as const,
        application_number: selectedSearchResult.application_number || '',
        frn: selectedSearchResult.frn,
        funding_year: selectedSearchResult.funding_year,
        application_status: enriched?.applications?.[0]?.application_status,
        frn_status: enriched?.frns?.find((f: any) => f.frn === selectedSearchResult.frn)?.frn_status || selectedSearchResult.status,
        funding_amount: selectedSearchResult.funding_amount,
        committed_amount: enriched?.frn_status?.summary?.total_committed,
        funded_amount: enriched?.frn_status?.summary?.total_funded,
        service_type: selectedSearchResult.service_type,
        services: enriched?.applications?.map((a: any) => a.category) || [],
        categories: [],
        contact_name: primaryContact.name || null,
        contact_email: primaryContact.email || null,
        contact_phone: primaryContact.phone || null,
        contact_title: primaryContact.title || null,
        all_contacts: enriched?.contacts || [],
        lead_status: 'new' as const,
        source_data: enriched || {}
      };
      
      const response = await api.saveLead(leadData);
      if (response.success && response.data?.lead) {
        setIsLeadSaved(true);
        setCurrentSavedLead(response.data.lead);
        // Refresh saved leads if on that tab
        if (activeTab === 'leads') {
          loadSavedLeads();
        }
      }
    } catch (error) {
      console.error("Failed to save lead:", error);
      alert("Failed to save lead. Please try again.");
    } finally {
      setSavingLead(false);
    }
  };

  const handleExport = async () => {
    const selected = selectedSchools.size > 0
      ? searchResults.filter(s => selectedSchools.has(s.ben))
      : searchResults;
    
    if (selected.length === 0) return;
    
    const columns = ['ben', 'name', 'state', 'city', 'status', 'funding_amount', 'service_type'];
    const rows = selected.map(s => ({
      ben: s.ben,
      name: s.name,
      state: s.state,
      city: s.city || '',
      status: s.status,
      funding_amount: s.funding_amount,
      service_type: s.service_type,
    }));
    
    downloadCsv(csvFilename('leads_export'), columns, rows);
  };

  // FRN Status export
  const exportFrnData = () => {
    const data = selectedFrns.size > 0
      ? sortedFrnData.filter(f => selectedFrns.has(f.frn))
      : sortedFrnData;
    
    const columns = ['frn', 'entity_name', 'ben', 'state', 'funding_year', 'service_type', 'status', 'commitment_amount', 'disbursed_amount', 'invoicing_mode'];
    const rows = data.map(f => ({
      frn: f.frn,
      entity_name: f.entity_name,
      ben: f.ben,
      state: f.state,
      funding_year: f.funding_year,
      service_type: f.service_type,
      status: f.status || '',
      commitment_amount: f.commitment_amount,
      disbursed_amount: f.disbursed_amount,
      invoicing_mode: f.invoicing_mode || '',
    }));
    
    downloadCsv(csvFilename('frn_status'), columns, rows);
  };

  // Serviced Entities export
  const exportServicedEntities = () => {
    const data = selectedServicedEntities.size > 0
      ? sortedServicedEntities.filter(e => selectedServicedEntities.has(e.ben))
      : sortedServicedEntities;
    
    const columns = ['ben', 'organization_name', 'state', 'current_cat1', 'current_cat2', 'total_amount', 'frn_count'];
    const rows = data.map(e => ({
      ben: e.ben,
      organization_name: e.organization_name,
      state: e.state,
      current_cat1: e.current_cat1 || 0,
      current_cat2: e.current_cat2 || 0,
      total_amount: e.total_amount || 0,
      frn_count: e.frn_count,
    }));
    
    downloadCsv(csvFilename('serviced_entities'), columns, rows);
  };

  // Form 471 Records export
  const exportForm471Records = () => {
    if (!form471Data?.records) return;
    const data = selectedForm471Records.size > 0
      ? form471Data.records.filter(r => selectedForm471Records.has(r.frn))
      : form471Data.records;
    
    const columns = ['funding_year', 'frn', 'service_provider_name', 'service_provider_spin', 'service_type', 'category', 'committed_amount', 'frn_status'];
    const rows = data.map(r => ({
      funding_year: r.funding_year,
      frn: r.frn,
      service_provider_name: r.service_provider_name,
      service_provider_spin: r.service_provider_spin,
      service_type: r.service_type,
      category: r.category,
      committed_amount: r.committed_amount,
      frn_status: r.frn_status || '',
    }));
    
    downloadCsv(csvFilename('form471_records'), columns, rows);
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // Show loading state while checking payment status
  if (!_hasHydrated || checkingPayment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Verifying your subscription...</p>
        </div>
      </div>
    );
  }

  if (isLoading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // US States for dropdown
  const US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
  ];

  const SERVICE_TYPES = [
    "Internal Connections",
    "Basic Maintenance",
    "Internet Access",
    "Data Transmission",
    "Voice",
    "Managed Internal Broadband Services"
  ];

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "my-entities", label: "My Entities", icon: "🏫" },
    { id: "frn-status", label: "FRN Status", icon: "📈" },
    { id: "470-leads", label: "Form 470 Leads", icon: "🎯" },
    { id: "predicted-leads", label: "Predicted Leads", icon: "🔮" },
    { id: "competitive", label: "471 Lookup", icon: "🔎" },
    { id: "search", label: "School Search", icon: "🔍" },
    { id: "leads", label: "Saved Leads", icon: "📋" },
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
              <span className="block text-xs text-slate-500">
                Vendor Portal{(user?.role === 'super' || user?.role === 'admin') ? ` (${user.role})` : ''}
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as VendorTab)}
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

        {/* Portal Switcher (super/admin only) */}
        {(user?.role === 'super' || user?.role === 'admin') && (
          <div className="px-4 pb-3">
            <div className="border-t border-slate-200 pt-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold px-4 mb-2">Switch Portal</p>
              <Link
                href="/consultant"
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-all text-sm"
              >
                <span className="text-lg">📊</span>
                <span>Consultant Portal</span>
                <svg className="w-4 h-4 ml-auto text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Link>
              <Link
                href="/super"
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-600 hover:bg-yellow-50 hover:text-yellow-700 transition-all text-sm"
              >
                <span className="text-lg">⭐</span>
                <span>Super Dashboard</span>
                <svg className="w-4 h-4 ml-auto text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Link>
            </div>
          </div>
        )}

        {/* Subscription Card */}
        <div className="absolute bottom-20 left-4 right-4">
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-4 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">
                {user?.role === 'super' || user?.role === 'admin' ? 'Full Access' : 'Pro Plan'}
              </span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {user?.role === 'super' ? '⭐ Super' : user?.role === 'admin' ? '🔑 Admin' : 'Active'}
              </span>
            </div>
            <div className="text-2xl font-bold">{profile?.search_count || 0} Searches</div>
            <div className="text-sm opacity-75 mt-1">
              {user?.role === 'super' || user?.role === 'admin' ? 'Full platform access' : 'Unlimited access'}
            </div>
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
              onClick={loadProfile}
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
              {/* Company Info Banner */}
              {profile?.spin && servicedEntitiesStats ? (
                <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-pink-600 rounded-2xl p-6 text-white shadow-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                        <span className="text-3xl">🏢</span>
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold">{servicedEntitiesStats.service_provider_name || profile.company_name || 'Your Company'}</h1>
                        <div className="flex items-center gap-3 mt-1 text-purple-100">
                          <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-sm">SPIN: {profile.spin}</span>
                          <span className="flex items-center gap-1 text-sm">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                            Active Service Provider
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab("my-entities")}
                      className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors"
                    >
                      View All Entities →
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/20">
                    <div>
                      <div className="text-3xl font-bold">{servicedEntitiesStats.total_entities}</div>
                      <div className="text-sm text-purple-200 mt-1">Entities Serviced</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">${(servicedEntitiesStats.total_authorized / 1000000).toFixed(2)}M</div>
                      <div className="text-sm text-purple-200 mt-1">Total E-Rate Authorized</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">{servicedEntitiesStats.funding_years.length}</div>
                      <div className="text-sm text-purple-200 mt-1">Years Active</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">{servicedEntitiesStats.funding_years[0] || 'N/A'}</div>
                      <div className="text-sm text-purple-200 mt-1">Most Recent Year</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                      <span className="text-2xl">⚠️</span>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-slate-900">Complete Your Profile</h2>
                      <p className="text-sm text-slate-600 mt-1">
                        Add your SPIN number to see your serviced entities and E-Rate history
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab("settings")}
                      className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors text-sm font-medium"
                    >
                      Setup SPIN →
                    </button>
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                      <span className="text-2xl">🔍</span>
                    </div>
                    <span className="text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-full">+24%</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">{profile?.search_count || 0}</div>
                  <div className="text-sm text-slate-500 mt-1">Searches This Month</div>
                </div>
                
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                      <span className="text-2xl">📋</span>
                    </div>
                    <span className="text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-full">+12</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">0</div>
                  <div className="text-sm text-slate-500 mt-1">Saved Leads</div>
                </div>
                
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                      <span className="text-2xl">📤</span>
                    </div>
                    <span className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded-full">5 today</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">0</div>
                  <div className="text-sm text-slate-500 mt-1">Exports</div>
                </div>
                
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center">
                      <span className="text-2xl">✅</span>
                    </div>
                    <span className="text-xs text-pink-600 font-medium px-2 py-1 bg-pink-50 rounded-full">
                      {user?.role === 'super' || user?.role === 'admin' ? '⭐ Full' : 'Active'}
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {user?.role === 'super' ? 'Super' : user?.role === 'admin' ? 'Admin' : user?.subscription?.status === 'trialing' ? 'Trial' : 'Pro'}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    {user?.role === 'super' || user?.role === 'admin' ? 'Full Access' : 'Subscription'}
                  </div>
                </div>
              </div>

              {/* Top Entities Preview */}
              {servicedEntities.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Top Entities by E-Rate Funding</h2>
                      <p className="text-sm text-slate-500">Your highest-value customer relationships</p>
                    </div>
                    <button
                      onClick={() => setActiveTab("my-entities")}
                      className="text-sm text-purple-600 hover:underline font-medium"
                    >
                      View All →
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {servicedEntities.slice(0, 5).map((entity, idx) => (
                      <div key={entity.ben} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center font-bold text-purple-600">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">{entity.organization_name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500">{entity.state}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-xs text-slate-500">{entity.frn_count} FRNs</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-xs text-slate-500">{entity.funding_years?.length || 0} years</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-green-600">${entity.total_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                          <div className="text-xs text-slate-500">authorized</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <button
                    onClick={() => setActiveTab("search")}
                    className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-all text-center group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">🔍</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Search Schools</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("leads")}
                    className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all text-center group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-green-100 group-hover:bg-green-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">📋</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">View Leads</span>
                  </button>
                  <button className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-amber-300 hover:bg-amber-50 transition-all text-center group">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">📤</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Export Data</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("settings")}
                    className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-pink-300 hover:bg-pink-50 transition-all text-center group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-pink-100 group-hover:bg-pink-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">⚙️</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Settings</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* FRN Status Monitoring Tab (Sprint 2) */}
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
                    <h1 className="text-2xl font-bold">FRN Status Monitoring</h1>
                    <p className="text-teal-100 mt-1">Track the status of your E-Rate contracts</p>
                  </div>
                </div>
                <button
                  onClick={() => loadFRNStatus(frnStatusYear, frnStatusFilter, frnPendingReason)}
                  disabled={frnStatusLoading || !profile?.spin}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {frnStatusLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Loading...
                    </>
                  ) : (
                    <>Refresh Data</>
                  )}
                </button>
              </div>
            </div>

            {!profile?.spin ? (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-slate-900">SPIN Required</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Configure your SPIN number in settings to view FRN status
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("settings")}
                    className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors text-sm font-medium"
                  >
                    Setup SPIN →
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <label className="text-sm text-slate-600 mb-1 block">Funding Year</label>
                      <select
                        value={frnStatusYear || ""}
                        onChange={(e) => {
                          const year = e.target.value ? parseInt(e.target.value) : undefined;
                          setFrnStatusYear(year);
                          loadFRNStatus(year, frnStatusFilter, frnPendingReason);
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
                        value={frnStatusFilter}
                        onChange={(e) => {
                          setFrnStatusFilter(e.target.value);
                          loadFRNStatus(frnStatusYear, e.target.value, frnPendingReason);
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
                        value={frnPendingReason}
                        onChange={(e) => setFrnPendingReason(e.target.value)}
                        placeholder="e.g., PIA Review, Selective Review"
                        className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm w-56"
                      />
                    </div>
                    <button
                      onClick={() => loadFRNStatus(frnStatusYear, frnStatusFilter, frnPendingReason)}
                      disabled={frnStatusLoading}
                      className="mt-5 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      {frnStatusLoading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <span>🔍</span>
                      )}
                      Apply Filters
                    </button>
                  </div>
                </div>

                {/* Status Summary Cards */}
                {frnStatusData && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600">Total FRNs</span>
                        <span className="text-2xl">📋</span>
                      </div>
                      <div className="text-3xl font-bold text-slate-900">{frnStatusData.total_frns}</div>
                    </div>
                    <div className="bg-white rounded-2xl border border-green-200 p-6 shadow-sm bg-gradient-to-br from-green-50 to-emerald-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-green-700">Funded</span>
                        <span className="text-2xl">✅</span>
                      </div>
                      <div className="text-3xl font-bold text-green-700">{frnStatusData.summary?.funded?.count || 0}</div>
                      <div className="text-sm text-green-600 mt-1">
                        ${(frnStatusData.summary?.funded?.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-sm bg-gradient-to-br from-red-50 to-rose-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-red-700">Denied</span>
                        <span className="text-2xl">❌</span>
                      </div>
                      <div className="text-3xl font-bold text-red-700">{frnStatusData.summary?.denied?.count || 0}</div>
                      <div className="text-sm text-red-600 mt-1">
                        ${(frnStatusData.summary?.denied?.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm bg-gradient-to-br from-amber-50 to-yellow-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-amber-700">Pending</span>
                        <span className="text-2xl">⏳</span>
                      </div>
                      <div className="text-3xl font-bold text-amber-700">{frnStatusData.summary?.pending?.count || 0}</div>
                      <div className="text-sm text-amber-600 mt-1">
                        ${(frnStatusData.summary?.pending?.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                )}

                {/* FRN Table */}
                {frnStatusData && sortedFrnData.length > 0 && (
                  <div className="space-y-2">
                    <TableExportBar
                      selectedCount={selectedFrns.size}
                      totalCount={sortedFrnData.length}
                      onExportCsv={exportFrnData}
                      onClearSelection={() => setSelectedFrns(new Set())}
                    />
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                      <h3 className="font-semibold text-slate-900">FRN Details</h3>
                      <p className="text-sm text-slate-600">Detailed status for each funding request</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={selectedFrns.size === sortedFrnData.length && sortedFrnData.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedFrns(new Set(sortedFrnData.map(f => f.frn)));
                                  } else {
                                    setSelectedFrns(new Set());
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                            </th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">FRN</th>
                            <th 
                              className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer hover:bg-slate-100 select-none"
                              onClick={() => toggleFrnTableSort('entity_name')}
                            >
                              <span className="inline-flex items-center gap-1">
                                Entity
                                {frnTableSort?.field === 'entity_name' && (
                                  <span className="text-blue-600">{frnTableSort.dir === 'asc' ? '↑' : '↓'}</span>
                                )}
                                {frnTableSort?.field !== 'entity_name' && (
                                  <span className="text-slate-300">↕</span>
                                )}
                              </span>
                            </th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Year</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Service Type</th>
                            <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Commitment</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Disbursed</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Invoicing</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedFrnData.slice(0, 100).map((frn, idx) => (
                            <tr 
                              key={`${frn.frn}-${idx}`} 
                              className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedFrns.has(frn.frn) ? 'bg-teal-50' : ''}`}
                              onClick={() => { setSelectedFRN(frn); setShowFRNDetailModal(true); }}
                            >
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedFrns.has(frn.frn)}
                                  onChange={() => {
                                    setSelectedFrns(prev => {
                                      const next = new Set(prev);
                                      if (next.has(frn.frn)) next.delete(frn.frn);
                                      else next.add(frn.frn);
                                      return next;
                                    });
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-mono text-xs text-slate-900">{frn.frn}</div>
                                <div className="text-xs text-slate-500">{frn.application_number}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900 truncate max-w-[200px]">{frn.entity_name}</div>
                                <div className="text-xs text-slate-500">{frn.state} • BEN: {frn.ben}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{frn.funding_year}</td>
                              <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]">{frn.service_type}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  frn.status?.toLowerCase().includes('funded') || frn.status?.toLowerCase().includes('committed')
                                    ? 'bg-green-100 text-green-700'
                                    : frn.status?.toLowerCase().includes('denied')
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {frn.status || 'Unknown'}
                                </span>
                                {frn.pending_reason && (
                                  <div className="text-xs text-slate-500 mt-1">{frn.pending_reason}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-900">
                                ${frn.commitment_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={frn.disbursed_amount > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>
                                  ${frn.disbursed_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <span className={`w-2 h-2 rounded-full ${
                                    frn.invoicing_ready === 'Yes' ? 'bg-green-500' : 'bg-slate-300'
                                  }`}></span>
                                  <span className="text-xs text-slate-600">{frn.invoicing_mode || 'N/A'}</span>
                                </div>
                                {frn.f486_status && (
                                  <div className="text-xs text-slate-500">486: {frn.f486_status}</div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {sortedFrnData.length > 100 && (
                        <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 border-t border-slate-200">
                          Showing first 100 of {sortedFrnData.length} FRNs{frnStatusFilter && ` (filtered from ${frnStatusData?.frns?.length || 0} total)`}
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                )}

                {/* Empty State */}
                {frnStatusData && sortedFrnData.length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">📭</span>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">No FRNs Found</h3>
                    <p className="text-sm text-slate-600 mt-2">
                      No funding requests match your current filters. Try adjusting the year or status filter.
                    </p>
                  </div>
                )}

                {/* Initial Load State */}
                {!frnStatusData && !frnStatusLoading && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">📈</span>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">Load FRN Status</h3>
                    <p className="text-sm text-slate-600 mt-2 mb-4">
                      Click the button below to load your FRN status data
                    </p>
                    <button
                      onClick={() => loadFRNStatus()}
                      className="px-6 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium"
                    >
                      Load FRN Status
                    </button>
                  </div>
                )}
              </>
            )}

              {/* FRN Report Monitors Section */}
              <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Report Monitors</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Set up automated email reports for your FRN portfolio</p>
                  </div>
                  <button
                    onClick={() => setShowCreateWatch(!showCreateWatch)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {showCreateWatch ? 'Cancel' : '+ Create Monitor'}
                  </button>
                </div>

                {/* Create Watch Form */}
                {showCreateWatch && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setWatchLoading(true);
                      const formData = new FormData(e.currentTarget);
                      try {
                        const response = await api.createFRNWatch({
                          name: formData.get('name') as string,
                          watch_type: (formData.get('watch_type') as any) || 'portfolio',
                          target_id: (formData.get('target_id') as string) || undefined,
                          frequency: (formData.get('frequency') as any) || 'weekly',
                          recipient_email: formData.get('recipient_email') as string,
                          delivery_mode: (formData.get('delivery_mode') as any) || 'full_email',
                          notify_sms: formData.get('notify_sms') === 'on',
                          sms_phone: (formData.get('sms_phone') as string) || undefined,
                          include_funded: formData.get('include_funded') === 'on',
                          include_pending: formData.get('include_pending') === 'on',
                          include_denied: formData.get('include_denied') === 'on',
                          include_changes: formData.get('include_changes') === 'on',
                        });
                        if (response?.data?.success) {
                          setShowCreateWatch(false);
                          loadFRNWatches();
                        }
                      } catch (error) {
                        console.error('Failed to create watch:', error);
                      } finally {
                        setWatchLoading(false);
                      }
                    }}
                    className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monitor Name</label>
                        <input name="name" required placeholder="e.g., Weekly SPIN Report" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recipient Email</label>
                        <input name="recipient_email" type="email" required placeholder="you@example.com" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Watch Type</label>
                        <select name="watch_type" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                          <option value="portfolio">Entire Portfolio</option>
                          <option value="ben">Specific BEN</option>
                          <option value="frn">Specific FRN</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Frequency</label>
                        <select name="frequency" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                          <option value="weekly">Weekly</option>
                          <option value="daily">Daily</option>
                          <option value="biweekly">Bi-Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">BEN or FRN (if applicable)</label>
                        <input name="target_id" placeholder="e.g., 123456" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery Mode</label>
                        <select name="delivery_mode" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                          <option value="full_email">Full Email Report</option>
                          <option value="notification_only">Notification Only (link to dashboard)</option>
                          <option value="in_app_only">In-App Only (no email)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="notify_sms" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="font-medium">SMS Notification</span>
                        <span className="text-xs text-gray-500">(get a text when report is ready)</span>
                      </label>
                      <input name="sms_phone" type="tel" placeholder="Phone (optional, uses profile)" className="flex-1 max-w-[220px] px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="include_funded" defaultChecked className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" /> Include Funded
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="include_pending" defaultChecked className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" /> Include Pending
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="include_denied" defaultChecked className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" /> Include Denied
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="include_changes" defaultChecked className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" /> Highlight Changes
                      </label>
                    </div>

                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => setShowCreateWatch(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
                      <button type="submit" disabled={watchLoading} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                        {watchLoading ? 'Creating...' : 'Create Monitor'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Watch List */}
                {frnWatches.length > 0 ? (
                  <div className="space-y-3">
                    {frnWatches.map((watch) => (
                      <div key={watch.id} className={`flex items-center justify-between p-4 rounded-lg border ${watch.is_active ? 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-60'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{watch.name}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${watch.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                              {watch.is_active ? 'Active' : 'Paused'}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">{watch.frequency}</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">{watch.watch_type}</span>
                            {watch.delivery_mode && watch.delivery_mode !== 'full_email' && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${watch.delivery_mode === 'notification_only' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                                {watch.delivery_mode === 'notification_only' ? 'notify only' : 'in-app only'}
                              </span>
                            )}
                            {watch.notify_sms && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">SMS</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>To: {watch.recipient_email}</span>
                            {watch.send_count > 0 && <span>Sent: {watch.send_count}x</span>}
                            {watch.next_send_at && <span>Next: {new Date(watch.next_send_at).toLocaleDateString()}</span>}
                            {watch.last_error && <span className="text-red-500">Error: {watch.last_error}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button onClick={async () => { try { await api.sendFRNWatchNow(watch.id); loadFRNWatches(); } catch (e) { console.error(e); } }} className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors" title="Send report now">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
                          </button>
                          <button onClick={async () => { try { await api.toggleFRNWatch(watch.id); loadFRNWatches(); } catch (e) { console.error(e); } }} className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title={watch.is_active ? 'Pause' : 'Resume'}>
                            {watch.is_active ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/></svg>
                            )}
                          </button>
                          <button onClick={async () => { if (confirm('Delete this monitor?')) { try { await api.deleteFRNWatch(watch.id); loadFRNWatches(); } catch (e) { console.error(e); } } }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !showCreateWatch ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    <p className="text-sm font-medium">No report monitors yet</p>
                    <p className="text-xs mt-1">Create a monitor to receive periodic FRN status reports via email</p>
                  </div>
                ) : null}
              </div>

              {/* Report History */}
              {reportHistory.length > 0 && (
                <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Reports</h3>
                  <div className="space-y-2">
                    {reportHistory.map((report) => (
                      <div key={report.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{report.report_name}</span>
                            {report.changes_detected > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300">{report.changes_detected} changes</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>{report.total_frns} FRNs</span>
                            <span className="text-green-600">{report.funded_count} funded</span>
                            <span className="text-amber-600">{report.pending_count} pending</span>
                            <span className="text-red-600">{report.denied_count} denied</span>
                            {report.email_sent && <span className="text-blue-500">emailed</span>}
                            {report.sms_sent && <span className="text-blue-500">SMS sent</span>}
                            <span>{new Date(report.generated_at).toLocaleString()}</span>
                          </div>
                        </div>
                        {report.has_html && (
                          <button onClick={async () => { try { const res = await api.getFRNReport(report.id); if (res?.data?.html) { setSelectedReport({ html: res.data.html, name: report.report_name }); } } catch (e) { console.error(e); } }} className="ml-3 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 dark:text-teal-300 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 rounded-lg transition-colors">
                            View Report
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Report Viewer Modal */}
              {selectedReport && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setSelectedReport(null)}>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedReport.name}</h3>
                      <button onClick={() => setSelectedReport(null)} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto p-1">
                      <iframe srcDoc={selectedReport.html} className="w-full h-full min-h-[600px] border-0 rounded-lg" title="FRN Report" sandbox="allow-same-origin" />
                    </div>
                  </div>
                </div>
              )}

          </div>
        )}

        {/* Form 470 Lead Generation Tab (Sprint 3) */}
        {activeTab === "470-leads" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <span className="text-3xl">🎯</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">Form 470 Lead Generation</h1>
                    <p className="text-orange-100 mt-1">Find schools seeking vendors for E-Rate services</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-orange-100">Key Differentiator</div>
                  <div className="text-xl font-bold">Manufacturer Filtering</div>
                  <div className="text-sm text-orange-100">Exclusive to SkyRate!</div>
                </div>
              </div>
            </div>

            {/* Search Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Search Filters</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Year Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Funding Year</label>
                  <select
                    value={form470Filters.year || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, year: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">Current/Next Year</option>
                    {[2026, 2025, 2024, 2023, 2022].map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>

                {/* State Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">State</label>
                  <select
                    value={form470Filters.state || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, state: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">All States</option>
                    {US_STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
                  <select
                    value={form470Filters.category || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, category: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">All Categories</option>
                    <option value="1">Category 1 (Internet/WAN)</option>
                    <option value="2">Category 2 (Equipment)</option>
                  </select>
                </div>

                {/* Manufacturer Filter - KEY DIFFERENTIATOR */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Manufacturer <span className="text-orange-500 text-xs">(Exclusive!)</span>
                  </label>
                  <input
                    type="text"
                    value={form470Filters.manufacturer || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, manufacturer: e.target.value || undefined })}
                    onKeyDown={(e) => { if (e.key === 'Enter') load470Leads(form470Filters); }}
                    placeholder="e.g., Cisco, Meraki, Aruba"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                {/* Equipment Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Equipment Type</label>
                  <input
                    type="text"
                    value={form470Filters.equipment_type || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, equipment_type: e.target.value || undefined })}
                    onKeyDown={(e) => { if (e.key === 'Enter') load470Leads(form470Filters); }}
                    placeholder="e.g., Switches, Routers, Cabling"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                {/* Service Function Filter (MIBS/BMIC) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Service Function</label>
                  <select
                    value={form470Filters.service_function || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, service_function: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">All Functions</option>
                    <option value="Managed Internal Broadband Services">MIBS (Managed Internal Broadband)</option>
                    <option value="Basic Maintenance of Internal Connections">BMIC (Basic Maintenance)</option>
                    <option value="Internal Connections">Internal Connections</option>
                    <option value="Internet Access">Internet Access</option>
                    <option value="Data Transmission and/or Internet Access">Data Transmission / Internet</option>
                    <option value="Voice">Voice Services</option>
                  </select>
                </div>

                {/* Speed Range Filters */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Min Speed (Mbps)</label>
                  <input
                    type="number"
                    value={form470Filters.min_speed || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, min_speed: e.target.value || undefined })}
                    placeholder="e.g., 100"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Max Speed (Mbps)</label>
                  <input
                    type="number"
                    value={form470Filters.max_speed || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, max_speed: e.target.value || undefined })}
                    placeholder="e.g., 10000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Sort + Search Row */}
              <div className="flex flex-wrap items-end gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sort By</label>
                  <select
                    value={form470Filters.sort_by || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, sort_by: e.target.value || undefined })}
                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">Newest First</option>
                    <option value="entity_name">Applicant Name (A→Z)</option>
                  </select>
                </div>
                <button
                  onClick={() => load470Leads(form470Filters)}
                  disabled={form470Loading}
                  className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-medium hover:from-orange-600 hover:to-amber-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {form470Loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Searching...
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      Search 470s
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setForm470Filters({}); load470Leads({}); }}
                  className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                >
                  Clear Filters
                </button>
              </div>

              {/* Quick Manufacturer Buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-sm text-slate-500">Quick search:</span>
                {['Cisco', 'Meraki', 'Aruba', 'Fortinet', 'SonicWall', 'HP', 'Ubiquiti', 'Ruckus'].map((mfr) => (
                  <button
                    key={mfr}
                    onClick={() => {
                      setForm470Filters({ ...form470Filters, manufacturer: mfr });
                      load470Leads({ ...form470Filters, manufacturer: mfr });
                    }}
                    className="px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-sm hover:bg-orange-100 transition-colors"
                  >
                    {mfr}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Display */}
            {form470Error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
                {form470Error}
              </div>
            )}

            {/* Results Summary */}
            {form470TotalLeads > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <div>
                  <div className="font-medium text-green-800">Found {form470TotalLeads} Form 470 Leads</div>
                  <div className="text-sm text-green-600">
                    {form470Filters.manufacturer && `Manufacturer: ${form470Filters.manufacturer} • `}
                    {form470Filters.state && `State: ${form470Filters.state} • `}
                    {form470Filters.category && `Category ${form470Filters.category}`}
                  </div>
                </div>
              </div>
            )}

            {/* Results Table */}
            {form470Leads.length > 0 && (
              <div className="space-y-2">
              <TableExportBar
                selectedCount={selectedForm470Leads.size}
                totalCount={form470Leads.length}
                onExportCsv={exportSelectedForm470Leads}
                onClearSelection={clearForm470Selection}
              />
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedForm470Leads.size === form470Leads.length && form470Leads.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                selectAllForm470Leads();
                              } else {
                                clearForm470Selection();
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                          />
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-sm font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                          onClick={() => toggleForm470Sort('entity_name')}
                        >
                          <span className="flex items-center gap-1">
                            Entity
                            {form470Sort?.field === 'entity_name' && (
                              <span className="text-blue-600">{form470Sort.dir === 'asc' ? '↑' : '↓'}</span>
                            )}
                            {form470Sort?.field !== 'entity_name' && (
                              <span className="text-slate-300">↕</span>
                            )}
                          </span>
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Location</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Year</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Manufacturers</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Services</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Contact</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedForm470Leads.map((lead) => (
                        <tr key={lead.application_number} className={`hover:bg-slate-50 transition-colors ${selectedForm470Leads.has(lead.application_number) ? 'bg-orange-50' : ''}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedForm470Leads.has(lead.application_number)}
                              onChange={() => toggleForm470LeadSelection(lead.application_number)}
                              className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{lead.entity_name || 'Unknown'}</div>
                            <div className="text-sm text-slate-500">
                              470 #{lead.application_number} • {lead.applicant_type}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-700">{lead.city}, {lead.state}</div>
                            <div className="text-xs text-slate-500">BEN: {lead.ben}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                              {lead.funding_year}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {lead.manufacturers?.slice(0, 3).map((mfr, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                                  {mfr}
                                </span>
                              ))}
                              {(lead.manufacturers?.length || 0) > 3 && (
                                <span className="text-xs text-slate-500">+{lead.manufacturers!.length - 3} more</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {lead.categories?.map((cat, idx) => (
                                <span key={idx} className={`px-2 py-0.5 rounded text-xs ${
                                  cat.includes('1') ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                }`}>
                                  {cat}
                                </span>
                              ))}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {lead.service_types?.slice(0, 2).join(', ')}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-slate-700">{lead.contact_name || '-'}</div>
                            {lead.contact_email && (
                              <a href={`mailto:${lead.contact_email}`} className="text-xs text-blue-600 hover:underline">
                                {lead.contact_email}
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => load470Detail(lead.application_number)}
                              className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm hover:bg-orange-200 transition-colors"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              </div>
            )}

            {/* Empty State */}
            {!form470Loading && form470Leads.length === 0 && !form470Error && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🎯</span>
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">Search for Form 470 Leads</h3>
                <p className="text-slate-600 mb-4">
                  Use the filters above to find schools seeking vendors.<br/>
                  Try searching by <strong>manufacturer</strong> to find leads for specific product lines!
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => load470Leads({})}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    Show All Recent 470s
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Predicted Leads Tab */}
        {activeTab === "predicted-leads" && (
          <PredictedLeadsTab />
        )}

        {/* Form 471 Competitive Analysis Tab */}
        {activeTab === "competitive" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <span className="text-3xl">🎯</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">Form 471 Competitive Analysis</h1>
                    <p className="text-blue-100 mt-1">See which vendors have won contracts at any school</p>
                  </div>
                </div>
              </div>
            </div>

            {/* BEN Lookup */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Look Up Entity by BEN</h2>
              <p className="text-sm text-slate-600 mb-4">
                Enter a Billed Entity Number (BEN) to see all Form 471 applications and which vendors won contracts.
              </p>
              
              <div className="flex flex-wrap gap-3 mb-4">
                <input
                  type="text"
                  value={form471BenInput}
                  onChange={(e) => setForm471BenInput(e.target.value)}
                  placeholder="Enter BEN (e.g., 232950)"
                  className="flex-1 min-w-[200px] px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  onKeyDown={(e) => e.key === 'Enter' && search471ByBen()}
                />
                <select
                  value={form471Year || ""}
                  onChange={(e) => setForm471Year(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">All Years</option>
                  {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  onClick={search471ByBen}
                  disabled={form471Loading}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
                >
                  {form471Loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Searching...
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      Search
                    </>
                  )}
                </button>
              </div>
              
              {form471Error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {form471Error}
                </div>
              )}
            </div>

            {/* 471 Results */}
            {form471Data && (
              <div className="space-y-6">
                {/* Entity Summary */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{form471Data.entity_name}</h2>
                      <div className="flex items-center gap-3 mt-1 text-slate-600">
                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-sm">BEN: {form471Data.ben}</span>
                        <span className="text-sm">{form471Data.entity_state}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">
                        ${form471Data.total_committed?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-sm text-slate-500">Total Committed</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-2xl font-bold text-slate-900">{form471Data.total_records}</div>
                      <div className="text-sm text-slate-500">Total FRNs</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-2xl font-bold text-slate-900">{form471Data.vendors?.length || 0}</div>
                      <div className="text-sm text-slate-500">Unique Vendors</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-2xl font-bold text-slate-900">{form471Data.funding_years?.length || 0}</div>
                      <div className="text-sm text-slate-500">Funding Years</div>
                    </div>
                  </div>
                </div>

                {/* Vendors at this Entity */}
                {form471Data.vendors && form471Data.vendors.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-purple-50">
                      <h3 className="font-semibold text-slate-900">Vendors at this Entity</h3>
                      <p className="text-sm text-slate-600">Service providers who have won contracts here</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {form471Data.vendors.map((vendor, idx) => (
                        <div key={vendor.spin} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white ${
                            idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-amber-700' : 'bg-slate-300'
                          }`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900">{vendor.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded">SPIN: {vendor.spin}</span>
                              <span className="text-xs text-slate-500">{vendor.frn_count} FRNs</span>
                              {vendor.spin === profile?.spin && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">Your Company</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-green-600">
                              ${vendor.total_committed?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-xs text-slate-500">committed</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* FRN Details */}
                {form471Data.records && form471Data.records.length > 0 && (
                  <div className="space-y-2">
                  <TableExportBar
                    selectedCount={selectedForm471Records.size}
                    totalCount={form471Data.records.length}
                    onExportCsv={exportForm471Records}
                    onClearSelection={() => setSelectedForm471Records(new Set())}
                  />
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                      <h3 className="font-semibold text-slate-900">FRN Details</h3>
                      <p className="text-sm text-slate-600">All Form 471 funding requests for this entity</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={selectedForm471Records.size === form471Data.records.length && form471Data.records.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedForm471Records(new Set(form471Data!.records.map(r => r.frn)));
                                  } else {
                                    setSelectedForm471Records(new Set());
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                              />
                            </th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Year</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">FRN</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Vendor</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Service Type</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Committed</th>
                            <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {form471Data.records.slice(0, 50).map((record, idx) => (
                            <tr key={idx} className={`hover:bg-slate-50 ${selectedForm471Records.has(record.frn) ? 'bg-purple-50' : ''}`}>
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedForm471Records.has(record.frn)}
                                  onChange={() => {
                                    setSelectedForm471Records(prev => {
                                      const next = new Set(prev);
                                      if (next.has(record.frn)) next.delete(record.frn);
                                      else next.add(record.frn);
                                      return next;
                                    });
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-slate-900">{record.funding_year}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-600">{record.frn}</td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900">{record.service_provider_name}</div>
                                <div className="text-xs text-slate-500">{record.service_provider_spin}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{record.service_type}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  record.category?.includes('1') ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                }`}>
                                  {record.category}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-green-600">
                                ${record.committed_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  record.frn_status?.toLowerCase().includes('funded') || record.frn_status?.toLowerCase().includes('committed') 
                                    ? 'bg-green-100 text-green-700' 
                                    : record.frn_status?.toLowerCase().includes('denied')
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {record.frn_status || 'Unknown'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {form471Data.records.length > 50 && (
                        <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 border-t border-slate-200">
                          Showing first 50 of {form471Data.records.length} records
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                )}
              </div>
            )}

            {/* Competitor Analysis Card - only show if SPIN configured */}
            {profile?.spin && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Your Competitor Analysis</h3>
                    <p className="text-sm text-slate-600">See which vendors compete at your serviced entities</p>
                  </div>
                  <button
                    onClick={loadCompetitorAnalysis}
                    disabled={competitorLoading}
                    className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    {competitorLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Analyzing...
                      </>
                    ) : (
                      <>Analyze Competitors</>
                    )}
                  </button>
                </div>
                
                {competitorData && competitorData.success && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-slate-50 rounded-xl p-4">
                        <div className="text-2xl font-bold text-slate-900">{competitorData.entities_analyzed}</div>
                        <div className="text-sm text-slate-500">Entities Analyzed</div>
                      </div>
                      <div className="bg-green-50 rounded-xl p-4">
                        <div className="text-2xl font-bold text-green-600">{competitorData.my_frn_count}</div>
                        <div className="text-sm text-slate-500">Your FRNs</div>
                      </div>
                      <div className="bg-amber-50 rounded-xl p-4">
                        <div className="text-2xl font-bold text-amber-600">{competitorData.competitor_frn_count}</div>
                        <div className="text-sm text-slate-500">Competitor FRNs</div>
                      </div>
                    </div>
                    
                    {competitorData.competitors && competitorData.competitors.length > 0 && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="p-3 bg-slate-50 border-b border-slate-200">
                          <span className="font-medium text-slate-700">Top Competitors at Your Entities</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {competitorData.competitors.slice(0, 10).map((comp, idx) => (
                            <div key={comp.spin} className="p-3 flex items-center gap-3 hover:bg-slate-50">
                              <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-slate-900 truncate">{comp.name}</div>
                                <div className="text-xs text-slate-500">
                                  {comp.frn_count} FRNs • {comp.entity_count || 0} entities
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-medium text-amber-600">
                                  ${comp.total_committed?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "search" && (
          <div className="space-y-6">
            {/* Search Filters */}
            <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Search Filters</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">State</label>
                  <select
                    value={searchState}
                    onChange={(e) => setSearchState(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  >
                    <option value="">All States</option>
                    {US_STATES.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                  <select
                    value={searchStatus}
                    onChange={(e) => setSearchStatus(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  >
                    <option value="">All Statuses</option>
                    <option value="Funded">Funded</option>
                    <option value="Pending">Pending</option>
                    <option value="Denied">Denied</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Service Type</label>
                  <select
                    value={searchServiceType}
                    onChange={(e) => setSearchServiceType(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  >
                    <option value="">All Types</option>
                    {SERVICE_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Year</label>
                  <select
                    value={searchYear}
                    onChange={(e) => setSearchYear(parseInt(e.target.value))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  >
                    <option value={2025}>2025</option>
                    <option value={2024}>2024</option>
                    <option value={2023}>2023</option>
                    <option value={2022}>2022</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Min Amount ($)</label>
                  <input
                    type="number"
                    value={searchMinAmount}
                    onChange={(e) => setSearchMinAmount(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Max Amount ($)</label>
                  <input
                    type="number"
                    value={searchMaxAmount}
                    onChange={(e) => setSearchMaxAmount(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                    placeholder="No limit"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-200 transition-all disabled:opacity-50 font-medium"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Searching...
                  </span>
                ) : "Search Schools"}
              </button>
            </form>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
              <TableExportBar
                selectedCount={selectedSchools.size}
                totalCount={searchResults.length}
                onExportCsv={handleExport}
                onClearSelection={() => setSelectedSchools(new Set())}
              />
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Results ({searchResults.length})
                  </h2>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSchools(new Set(searchResults.map(s => s.ben)));
                              } else {
                                setSelectedSchools(new Set());
                              }
                            }}
                            checked={selectedSchools.size === searchResults.length}
                            className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">BEN</th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                          onClick={() => toggleSchoolSearchSort('name')}
                        >
                          <span className="flex items-center gap-1">
                            School Name
                            {schoolSearchSort?.field === 'name' && (
                              <span className="text-blue-600">{schoolSearchSort.dir === 'asc' ? '↑' : '↓'}</span>
                            )}
                            {schoolSearchSort?.field !== 'name' && (
                              <span className="text-slate-300">↕</span>
                            )}
                          </span>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">State</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Funding</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Service</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sortedSearchResults.map((school) => (
                        <tr key={school.ben} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedSchools.has(school.ben)}
                              onChange={() => toggleSchoolSelection(school.ben)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleViewSchoolDetail(school)}
                              className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none"
                              title="Click to view school details"
                            >
                              {school.ben}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">{school.name || '-'}</td>
                          <td className="px-4 py-3">{school.state}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              school.status === 'Funded' || school.status === 'FUNDED'
                                ? 'bg-green-100 text-green-700'
                                : school.status === 'Denied' || school.status === 'DENIED'
                                ? 'bg-red-100 text-red-700'
                                : school.status === 'Pending' || school.status === 'PENDING'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {school.status || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium">{school.funding_amount ? `$${school.funding_amount.toLocaleString()}` : '-'}</td>
                          <td className="px-4 py-3 text-sm">{school.service_type || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              </div>
            )}

            {searchResults.length === 0 && !isLoading && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🔍</span>
                </div>
                <h2 className="text-lg font-semibold text-slate-900">No Results Yet</h2>
                <p className="text-slate-500 mt-2 max-w-md mx-auto">
                  Use the filters above to search for schools with E-Rate funding and find your next customers.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "leads" && (
          <div className="space-y-6">
            {/* Header with filters and export */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Saved Leads</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {savedLeadsTotalCount} leads saved • Manage and enrich your leads
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Status Filter */}
                  <select
                    value={savedLeadsFilter}
                    onChange={(e) => {
                      setSavedLeadsFilter(e.target.value);
                      loadSavedLeads(e.target.value || undefined);
                    }}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">All Status</option>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                  
                  {/* Export Button */}
                  <button
                    onClick={exportSavedLeads}
                    disabled={savedLeads.length === 0}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <span>📥</span>
                    Export {selectedLeadIds.size > 0 ? `(${selectedLeadIds.size})` : 'All'}
                  </button>
                  
                  {/* Refresh */}
                  <button
                    onClick={() => loadSavedLeads(savedLeadsFilter || undefined)}
                    disabled={savedLeadsLoading}
                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    {savedLeadsLoading ? (
                      <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Selection controls */}
              {savedLeads.length > 0 && (
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.size === savedLeads.length && savedLeads.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedLeadIds(new Set(savedLeads.map(l => l.id)));
                        } else {
                          setSelectedLeadIds(new Set());
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    Select All
                  </label>
                  {selectedLeadIds.size > 0 && (
                    <span className="text-sm text-slate-500">
                      {selectedLeadIds.size} selected
                    </span>
                  )}
                </div>
              )}
            </div>
            
            {/* Saved Leads List */}
            {savedLeadsLoading ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-500">Loading saved leads...</p>
              </div>
            ) : savedLeads.length > 0 ? (
              <div className="space-y-3">
                {savedLeads.map((lead) => (
                  <div key={lead.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedLeadIds);
                            if (e.target.checked) {
                              newSet.add(lead.id);
                            } else {
                              newSet.delete(lead.id);
                            }
                            setSelectedLeadIds(newSet);
                          }}
                          className="w-4 h-4 mt-1 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                        />
                        
                        {/* Lead Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="font-semibold text-slate-900 truncate">
                                {lead.entity_name || `BEN: ${lead.ben}`}
                              </h3>
                              <p className="text-sm text-slate-500 mt-0.5">
                                Form {lead.form_type} #{lead.application_number} • {lead.entity_city}, {lead.entity_state}
                              </p>
                            </div>
                            
                            {/* Status Badge */}
                            <select
                              value={lead.lead_status}
                              onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                              className={`px-3 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-purple-500 ${
                                lead.lead_status === 'new' ? 'bg-blue-100 text-blue-700' :
                                lead.lead_status === 'contacted' ? 'bg-yellow-100 text-yellow-700' :
                                lead.lead_status === 'qualified' ? 'bg-purple-100 text-purple-700' :
                                lead.lead_status === 'won' ? 'bg-green-100 text-green-700' :
                                lead.lead_status === 'lost' ? 'bg-red-100 text-red-700' :
                                'bg-slate-100 text-slate-700'
                              }`}
                            >
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="qualified">Qualified</option>
                              <option value="won">Won</option>
                              <option value="lost">Lost</option>
                            </select>
                          </div>
                          
                          {/* Contact Info */}
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            {lead.contact_name && (
                              <span className="text-slate-600">
                                <span className="text-slate-400">Contact:</span> {lead.contact_name}
                              </span>
                            )}
                            {lead.contact_email && (
                              <a href={`mailto:${lead.contact_email}`} className="text-blue-600 hover:underline">
                                {lead.contact_email}
                              </a>
                            )}
                            {lead.contact_phone && (
                              <a href={`tel:${lead.contact_phone}`} className="text-blue-600 hover:underline">
                                {lead.contact_phone}
                              </a>
                            )}
                            {lead.enriched_data?.linkedin_url && (
                              <a 
                                href={lead.enriched_data.linkedin_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                </svg>
                                LinkedIn
                              </a>
                            )}
                          </div>
                          
                          {/* Tags */}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {lead.categories?.map((cat, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                {cat}
                              </span>
                            ))}
                            {lead.manufacturers?.slice(0, 3).map((mfr, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                                {mfr}
                              </span>
                            ))}
                            {lead.enrichment_date && (
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                                ✨ Enriched
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (lead.form_type === '470') {
                                // Real Form 470 lead — fetch full USAC detail
                                load470Detail(lead.application_number);
                              } else {
                                // Predicted or 471 lead — show saved lead's own data in detail modal
                                setSelectedSavedLeadDetail(lead);
                                setShowSavedLeadDetailModal(true);
                              }
                            }}
                            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteSavedLead(lead.id)}
                            className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove Lead"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      {/* Additional Contacts Preview */}
                      {lead.enriched_data?.additional_contacts && lead.enriched_data.additional_contacts.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-xs text-slate-500 mb-2">
                            Additional Contacts ({lead.enriched_data.additional_contacts.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {lead.enriched_data.additional_contacts.slice(0, 3).map((contact, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-slate-50 rounded text-xs">
                                <span className="font-medium">{contact.name}</span>
                                {contact.email && (
                                  <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">
                                    {contact.email}
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">📋</span>
                </div>
                <h2 className="text-lg font-semibold text-slate-900">No Saved Leads</h2>
                <p className="text-slate-500 mt-2 max-w-md mx-auto">
                  Browse Form 470 leads and save them to build your lead list for targeted outreach.
                </p>
                <button
                  onClick={() => setActiveTab("470-leads")}
                  className="mt-6 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-200 transition-all font-medium"
                >
                  Browse Form 470 Leads
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "my-entities" && (
          <div className="space-y-6">
            {/* SPIN Status Card */}
            {profile?.spin ? (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                      <span className="text-2xl">✅</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">SPIN Verified</h2>
                      <p className="text-sm text-slate-600">
                        {servicedEntitiesStats?.service_provider_name || profile.company_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold text-green-700">{profile.spin}</div>
                    <button
                      onClick={loadServicedEntities}
                      disabled={servicedEntitiesLoading}
                      className="text-sm text-green-600 hover:underline mt-1"
                    >
                      {servicedEntitiesLoading ? "Refreshing..." : "Refresh Data"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">SPIN Not Configured</h2>
                    <p className="text-sm text-slate-600">
                      Add your SPIN in Settings to see your serviced entities
                    </p>
                    <button
                      onClick={() => setActiveTab("settings")}
                      className="mt-2 text-sm text-amber-700 hover:underline font-medium"
                    >
                      Go to Settings →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Stats */}
            {profile?.spin && servicedEntitiesStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                      <span className="text-2xl">🏫</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">{servicedEntitiesStats.total_entities}</div>
                  <div className="text-sm text-slate-500 mt-1">Entities Serviced</div>
                </div>
                
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                      <span className="text-2xl">💰</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    ${(servicedEntitiesStats.total_authorized / 1000000).toFixed(1)}M
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Total Authorized</div>
                </div>
                
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                      <span className="text-2xl">📅</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">{servicedEntitiesStats.funding_years.length}</div>
                  <div className="text-sm text-slate-500 mt-1">Funding Years</div>
                </div>
              </div>
            )}

            {/* Serviced Entities Table */}
            {profile?.spin && (
              <div className="space-y-2">
              <TableExportBar
                selectedCount={selectedServicedEntities.size}
                totalCount={servicedEntities.length}
                onExportCsv={exportServicedEntities}
                onClearSelection={() => setSelectedServicedEntities(new Set())}
              />
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Schools & Libraries You Service
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Based on invoice disbursement data from USAC
                  </p>
                </div>
                
                {servicedEntitiesLoading ? (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600">Loading your serviced entities...</p>
                  </div>
                ) : servicedEntities.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left w-10">
                            <input
                              type="checkbox"
                              checked={selectedServicedEntities.size === sortedServicedEntities.length && sortedServicedEntities.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedServicedEntities(new Set(sortedServicedEntities.map(e => e.ben)));
                                } else {
                                  setSelectedServicedEntities(new Set());
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                            />
                          </th>
                          <th 
                            className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                            onClick={() => toggleServicedEntitiesSort('organization_name')}
                          >
                            <span className="flex items-center gap-1">
                              Entity Name
                              {servicedEntitiesSort?.field === 'organization_name' && (
                                <span className="text-blue-600">{servicedEntitiesSort.dir === 'asc' ? '↑' : '↓'}</span>
                              )}
                              {servicedEntitiesSort?.field !== 'organization_name' && (
                                <span className="text-slate-300">↕</span>
                              )}
                            </span>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">State</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            <div className="flex flex-col">
                              <span>Current Year</span>
                              <span className="text-[10px] font-normal normal-case text-slate-400">Cat 1 Budget</span>
                            </div>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            <div className="flex flex-col">
                              <span>Current Year</span>
                              <span className="text-[10px] font-normal normal-case text-slate-400">Cat 2 Budget</span>
                            </div>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Total Lifetime</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">FRNs</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Years Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sortedServicedEntities.slice(0, 50).map((entity) => (
                          <tr 
                            key={entity.ben} 
                            className={`hover:bg-purple-50 transition-colors cursor-pointer group ${selectedServicedEntities.has(entity.ben) ? 'bg-teal-50' : ''}`}
                            onClick={() => loadEntityDetail(entity)}
                          >
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedServicedEntities.has(entity.ben)}
                                onChange={() => {
                                  setSelectedServicedEntities(prev => {
                                    const next = new Set(prev);
                                    if (next.has(entity.ben)) next.delete(entity.ben);
                                    else next.add(entity.ben);
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div>
                                  <div className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors">
                                    {entity.organization_name}
                                  </div>
                                  <div className="text-xs text-slate-500 font-mono">BEN: {entity.ben}</div>
                                </div>
                                <svg className="w-4 h-4 text-slate-400 group-hover:text-purple-600 ml-auto opacity-0 group-hover:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                                {entity.state}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {entity.current_cat1 && entity.current_cat1 > 0 ? (
                                <div className="text-right">
                                  <div className="font-semibold text-blue-600">
                                    ${entity.current_cat1.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </div>
                                  <div className="text-xs text-slate-400">{entity.current_year}</div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {entity.current_cat2 && entity.current_cat2 > 0 ? (
                                <div className="text-right">
                                  <div className="font-semibold text-emerald-600">
                                    ${entity.current_cat2.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </div>
                                  <div className="text-xs text-slate-400">{entity.current_year}</div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-semibold text-green-600 text-right">
                              ${entity.total_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-600">{entity.frn_count}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {entity.funding_years?.slice(0, 3).map(year => (
                                  <span key={year} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                    {year}
                                  </span>
                                ))}
                                {entity.funding_years?.length > 3 && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                    +{entity.funding_years.length - 3}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {servicedEntities.length > 50 && (
                      <div className="p-4 text-center border-t border-slate-200">
                        <p className="text-sm text-slate-500">
                          Showing 50 of {servicedEntities.length} entities. Click an entity to see full details.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">🏫</span>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900">No Invoice Data Found</h2>
                    <p className="text-slate-500 mt-2 max-w-md mx-auto">
                      We couldn&apos;t find any invoice disbursement records for your SPIN. This may be because you&apos;re new to E-Rate or invoices haven&apos;t been processed yet.
                    </p>
                  </div>
                )}
              </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-6">
            {/* SPIN Configuration - NEW */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <span className="text-xl">🔑</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">SPIN Configuration</h2>
                  <p className="text-sm text-slate-500">Your Service Provider Identification Number from USAC</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    SPIN (Service Provider Identification Number)
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={spinInput}
                      onChange={(e) => {
                        setSpinInput(e.target.value);
                        setSpinValidation(null);
                        setSpinError(null);
                      }}
                      placeholder="e.g., 143032945"
                      className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition font-mono"
                    />
                    <button
                      onClick={validateSpin}
                      disabled={spinValidating || !spinInput.trim()}
                      className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition disabled:opacity-50 flex items-center gap-2"
                    >
                      {spinValidating ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Validating...
                        </>
                      ) : "Validate"}
                    </button>
                  </div>
                  
                  {spinError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm text-red-600">{spinError}</p>
                    </div>
                  )}
                  
                  {spinValidation && (
                    <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-green-600">✓</span>
                        <span className="font-semibold text-green-700">Valid SPIN Found</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-slate-500">Provider Name:</span>
                          <span className="ml-2 font-medium">{spinValidation.service_provider_name}</span>
                        </div>
                        {spinValidation.doing_business_as && (
                          <div>
                            <span className="text-slate-500">DBA:</span>
                            <span className="ml-2 font-medium">{spinValidation.doing_business_as}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-500">Status:</span>
                          <span className={`ml-2 font-medium ${spinValidation.status === 'Active' ? 'text-green-600' : 'text-amber-600'}`}>
                            {spinValidation.status}
                          </span>
                        </div>
                        {spinValidation.general_contact_name && (
                          <div>
                            <span className="text-slate-500">Contact:</span>
                            <span className="ml-2 font-medium">{spinValidation.general_contact_name}</span>
                          </div>
                        )}
                      </div>
                      
                      {profile?.spin !== spinInput && (
                        <button
                          onClick={saveSpin}
                          disabled={savingProfile}
                          className="mt-4 px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:shadow-lg hover:shadow-green-200 transition-all font-medium disabled:opacity-50"
                        >
                          {savingProfile ? "Saving..." : "Save This SPIN to Profile"}
                        </button>
                      )}
                      
                      {profile?.spin === spinInput && (
                        <div className="mt-3 text-sm text-green-600">
                          ✓ This SPIN is saved to your profile
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {profile?.spin && !spinValidation && (
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-slate-500">Current SPIN:</span>
                        <span className="ml-2 font-mono font-semibold">{profile.spin}</span>
                      </div>
                      <button
                        onClick={() => setActiveTab("my-entities")}
                        className="text-sm text-purple-600 hover:underline"
                      >
                        View Serviced Entities →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Company Profile */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                  <span className="text-xl">🏢</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Company Profile</h2>
                  <p className="text-sm text-slate-500">Your business information</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
                  <input
                    type="text"
                    defaultValue={profile?.company_name || ""}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Contact Name</label>
                  <input
                    type="text"
                    defaultValue={profile?.contact_name || ""}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
                  <input
                    type="text"
                    defaultValue={profile?.phone || ""}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Website</label>
                  <input
                    type="text"
                    defaultValue={profile?.website || ""}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                </div>
              </div>
            </div>

            {/* Service Configuration */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <span className="text-xl">🛠️</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Services Offered</h2>
                  <p className="text-sm text-slate-500">Select the E-Rate service categories you provide</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {SERVICE_TYPES.map(service => (
                  <label key={service} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition">
                    <input
                      type="checkbox"
                      defaultChecked={profile?.services_offered?.includes(service)}
                      className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-slate-700">{service}</span>
                  </label>
                ))}
              </div>
              <button className="mt-6 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-200 transition-all font-medium">
                Save Changes
              </button>
            </div>

            {/* Notification Preferences */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <span className="text-xl">🔔</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
                  <p className="text-sm text-slate-500">Configure alerts for status changes, Form 470 matches, and more</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Get alerted when FRNs are pending more than 15 days, when new Form 470s match your services, and more.
              </p>
              <a
                href="/settings/notifications"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 font-medium text-sm transition"
              >
                🔔 Manage Notification Settings →
              </a>
            </div>

            {/* Subscription */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <span className="text-xl">{user?.role === 'super' || user?.role === 'admin' ? '⭐' : '💳'}</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {user?.role === 'super' || user?.role === 'admin' ? 'Account Access' : 'Subscription'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {user?.role === 'super' || user?.role === 'admin' ? 'You have full platform access' : 'Manage your billing and plan'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100">
                <div>
                  <div className="font-semibold text-slate-900">
                    {user?.role === 'super' ? '⭐ Super Account — Full Access' : user?.role === 'admin' ? '🔑 Admin Account — Full Access' : user?.subscription?.plan === 'yearly' ? 'Yearly Plan' : 'Monthly Plan'}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    Status: <span className="text-green-600 font-medium">
                      {user?.role === 'super' || user?.role === 'admin' ? 'Active — No billing required' : user?.subscription?.status || 'Unknown'}
                    </span>
                  </div>
                </div>
                {user?.role !== 'super' && user?.role !== 'admin' && (
                  <button className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 font-medium transition">
                    Manage Subscription
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Entity Detail Modal */}
      {showEntityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeEntityModal}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-purple-600 to-pink-600 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedEntity?.organization_name}</h2>
                  <div className="flex items-center gap-3 mt-1 text-purple-100">
                    <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-sm">
                      BEN: {selectedEntity?.ben}
                    </span>
                    <span className="px-2 py-0.5 bg-white/20 rounded text-sm">
                      {selectedEntity?.state}
                    </span>
                  </div>
                </div>
                <button
                  onClick={closeEntityModal}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {entityDetailLoading ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-600">Loading entity details...</p>
                </div>
              ) : entityDetail ? (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4">
                      <div className="text-sm text-blue-600 font-medium">Total Cat 1</div>
                      <div className="text-2xl font-bold text-blue-700">
                        ${(entityDetail.total_cat1 / 1000).toFixed(1)}K
                      </div>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-4">
                      <div className="text-sm text-emerald-600 font-medium">Total Cat 2</div>
                      <div className="text-2xl font-bold text-emerald-700">
                        ${(entityDetail.total_cat2 / 1000).toFixed(1)}K
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4">
                      <div className="text-sm text-purple-600 font-medium">Lifetime Total</div>
                      <div className="text-2xl font-bold text-purple-700">
                        ${(entityDetail.total_all / 1000).toFixed(1)}K
                      </div>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4">
                      <div className="text-sm text-amber-600 font-medium">Total FRNs</div>
                      <div className="text-2xl font-bold text-amber-700">
                        {entityDetail.total_frns}
                      </div>
                    </div>
                  </div>

                  {/* Current Year Budget Highlight */}
                  {entityDetail.current_year_budget && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-green-800">
                            {entityDetail.current_year_budget.year} Current Year Budget
                          </h3>
                          <p className="text-sm text-green-600 mt-1">Most recent authorized funding</p>
                        </div>
                        <div className="text-right">
                          <div className="flex gap-4">
                            <div>
                              <div className="text-xs text-slate-500">Cat 1</div>
                              <div className="font-bold text-blue-600">
                                ${entityDetail.current_year_budget.cat1.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500">Cat 2</div>
                              <div className="font-bold text-emerald-600">
                                ${entityDetail.current_year_budget.cat2.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500">Total</div>
                              <div className="font-bold text-purple-600">
                                ${entityDetail.current_year_budget.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Service Types */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Services Provided</h3>
                    <div className="flex flex-wrap gap-2">
                      {entityDetail.all_service_types.map((svc, idx) => (
                        <span key={idx} className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-lg">
                          {svc}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Year-by-Year Breakdown */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Funding History by Year</h3>
                    <div className="space-y-3">
                      {entityDetail.years.map((yearData) => (
                        <div key={yearData.year} className="border border-slate-200 rounded-xl overflow-hidden">
                          <div 
                            className="flex items-center justify-between p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                            onClick={(e) => {
                              const content = e.currentTarget.nextElementSibling;
                              if (content) {
                                content.classList.toggle('hidden');
                              }
                            }}
                          >
                            <div className="flex items-center gap-4">
                              <span className="text-lg font-bold text-slate-900">{yearData.year}</span>
                              <span className="text-sm text-slate-500">{yearData.frn_count} FRNs</span>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <span className="text-xs text-slate-400 block">Cat 1</span>
                                <span className="font-semibold text-blue-600">
                                  ${yearData.cat1_total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs text-slate-400 block">Cat 2</span>
                                <span className="font-semibold text-emerald-600">
                                  ${yearData.cat2_total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs text-slate-400 block">Total</span>
                                <span className="font-bold text-purple-600">
                                  ${yearData.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                          
                          {/* Line Items (collapsed by default) */}
                          <div className="hidden border-t border-slate-200">
                            <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
                              {yearData.line_items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-slate-100 text-sm">
                                  <div>
                                    <div className="font-mono text-slate-600">{item.frn}</div>
                                    <div className="text-xs text-slate-500">{item.service_type}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold">
                                      ${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </div>
                                    <div className={`text-xs px-2 py-0.5 rounded inline-block ${
                                      item.status?.toLowerCase().includes('paid') || item.status?.toLowerCase().includes('disbursed')
                                        ? 'bg-green-100 text-green-700'
                                        : item.status?.toLowerCase().includes('denied')
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {item.category} • {item.status}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-slate-500">Failed to load entity details</p>
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={closeEntityModal}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FRN Detail Modal */}
      {showFRNDetailModal && selectedFRN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowFRNDetailModal(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className={`p-6 border-b border-slate-200 text-white ${
              selectedFRN.status?.toLowerCase().includes('funded') || selectedFRN.status?.toLowerCase().includes('committed')
                ? 'bg-gradient-to-r from-green-600 to-emerald-600'
                : selectedFRN.status?.toLowerCase().includes('denied')
                ? 'bg-gradient-to-r from-red-600 to-rose-600'
                : 'bg-gradient-to-r from-amber-500 to-orange-500'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">
                      {selectedFRN.status?.toLowerCase().includes('funded') || selectedFRN.status?.toLowerCase().includes('committed')
                        ? '✅'
                        : selectedFRN.status?.toLowerCase().includes('denied')
                        ? '❌'
                        : '⏳'}
                    </span>
                    <div>
                      <h2 className="text-xl font-bold">FRN: {selectedFRN.frn}</h2>
                      <div className="text-white/80 text-sm mt-0.5">Application #{selectedFRN.application_number}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
                      {selectedFRN.status || 'Unknown Status'}
                    </span>
                    <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                      FY {selectedFRN.funding_year}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setShowFRNDetailModal(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Entity Information */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏫</span> Entity Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Entity Name</div>
                      <div className="font-medium text-slate-900">{selectedFRN.entity_name || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">BEN</div>
                      <div className="font-mono text-slate-900">{selectedFRN.ben || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">State</div>
                      <div className="text-slate-900">{selectedFRN.state || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Service Type</div>
                      <div className="text-slate-900">{selectedFRN.service_type || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Funding Information */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
                  <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                    <span className="text-lg">💰</span> Funding Information
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-green-600">Commitment Amount</div>
                      <div className="text-2xl font-bold text-green-700">
                        ${selectedFRN.commitment_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-green-600">Disbursed Amount</div>
                      <div className="text-2xl font-bold text-green-700">
                        ${selectedFRN.disbursed_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-green-600">Discount Rate</div>
                      <div className="text-2xl font-bold text-green-700">
                        {selectedFRN.discount_rate ? `${selectedFRN.discount_rate}%` : 'N/A'}
                      </div>
                    </div>
                  </div>
                  {selectedFRN.commitment_amount && selectedFRN.disbursed_amount !== undefined && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-green-600 mb-1">
                        <span>Disbursement Progress</span>
                        <span>{((selectedFRN.disbursed_amount / selectedFRN.commitment_amount) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-green-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min((selectedFRN.disbursed_amount / selectedFRN.commitment_amount) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status & Pending Reason */}
                {selectedFRN.pending_reason && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                    <h3 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
                      <span className="text-lg">⚠️</span> Pending Reason
                    </h3>
                    <p className="text-amber-800">{selectedFRN.pending_reason}</p>
                  </div>
                )}

                {/* FCDL Comment */}
                {selectedFRN.fcdl_comment && (
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                    <h3 className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-2">
                      <span className="text-lg">📝</span> FCDL Comment
                    </h3>
                    <p className="text-blue-800">{selectedFRN.fcdl_comment}</p>
                  </div>
                )}

                {/* Key Dates */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <span className="text-lg">📅</span> Key Dates
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Award Date</div>
                      <div className="text-slate-900">{selectedFRN.award_date || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">FCDL Date</div>
                      <div className="text-slate-900">{selectedFRN.fcdl_date || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Last Invoice Date</div>
                      <div className="text-slate-900">{selectedFRN.last_invoice_date || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Service Start</div>
                      <div className="text-slate-900">{selectedFRN.service_start || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Service End</div>
                      <div className="text-slate-900">{selectedFRN.service_end || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Funding Year</div>
                      <div className="text-slate-900">{selectedFRN.funding_year || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Invoicing Information */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <span className="text-lg">📋</span> Invoicing Information
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Invoicing Mode</div>
                      <div className="text-slate-900">{selectedFRN.invoicing_mode || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Invoicing Ready</div>
                      <div className={`font-medium ${selectedFRN.invoicing_ready === 'Yes' ? 'text-green-600' : 'text-slate-600'}`}>
                        {selectedFRN.invoicing_ready || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">F486 Status</div>
                      <div className="text-slate-900">{selectedFRN.f486_status || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Wave Number</div>
                      <div className="text-slate-900">{selectedFRN.wave_number || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Vendor Information */}
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                  <h3 className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏢</span> Vendor Information
                  </h3>
                  <div>
                    <div className="text-xs text-purple-600">Service Provider</div>
                    <div className="font-medium text-purple-900">{selectedFRN.spin_name || 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <div className="text-sm text-slate-500">
                FRN: {selectedFRN.frn} • Application: {selectedFRN.application_number}
              </div>
              <button
                onClick={() => setShowFRNDetailModal(false)}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form 470 Detail Modal (Sprint 3) */}
      {showForm470Modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeForm470Modal}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{form470Detail?.entity?.name || 'Loading...'}</h2>
                  <p className="text-orange-100 mt-1">
                    Form 470 #{form470Detail?.application_number} • {form470Detail?.funding_year}
                  </p>
                </div>
                <button
                  onClick={closeForm470Modal}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {form470DetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : form470Detail ? (
                <div className="space-y-6">
                  {/* Entity Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <span>🏫</span> Entity Information
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">BEN:</span>
                          <span className="font-medium">{form470Detail.entity?.ben}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Type:</span>
                          <span className="font-medium">{form470Detail.entity?.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Location:</span>
                          <span className="font-medium">{form470Detail.entity?.city}, {form470Detail.entity?.state}</span>
                        </div>
                        {form470Detail.entity?.website && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Website:</span>
                            <a 
                              href={form470Detail.entity.website.startsWith('http') ? form470Detail.entity.website : `https://${form470Detail.entity.website}`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-600 hover:underline"
                            >
                              Visit →
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <span>👤</span> Contact Information
                        {/* LinkedIn Search Button */}
                        {form470Detail.contact?.name && (
                          <a
                            href={generateLinkedInSearchUrl(form470Detail.contact.name, form470Detail.entity?.name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs hover:bg-blue-200 transition-colors flex items-center gap-1"
                            title="Search LinkedIn for this contact"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                            </svg>
                            LinkedIn
                          </a>
                        )}
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Contact:</span>
                          <span className="font-medium">{form470Detail.contact?.name}</span>
                        </div>
                        {form470Detail.contact?.email && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Email:</span>
                            <a href={`mailto:${form470Detail.contact.email}`} className="text-blue-600 hover:underline">
                              {form470Detail.contact.email}
                            </a>
                          </div>
                        )}
                        {form470Detail.contact?.phone && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Phone:</span>
                            <a href={`tel:${form470Detail.contact.phone}`} className="text-blue-600 hover:underline">
                              {form470Detail.contact.phone}
                            </a>
                          </div>
                        )}
                        
                        {/* Enriched LinkedIn if available */}
                        {enrichmentData?.linkedin_url && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">LinkedIn:</span>
                            <a 
                              href={enrichmentData.linkedin_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                              </svg>
                              View Profile
                            </a>
                          </div>
                        )}
                        
                        {/* Enriched Position if available */}
                        {enrichmentData?.person?.position && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Position:</span>
                            <span className="font-medium">{enrichmentData.person.position}</span>
                          </div>
                        )}
                        
                        {form470Detail.technical_contact?.name && (
                          <>
                            <div className="border-t border-slate-200 my-2"></div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500">Tech Contact:</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{form470Detail.technical_contact.name}</span>
                                <a
                                  href={generateLinkedInSearchUrl(form470Detail.technical_contact.name, form470Detail.entity?.name)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 hover:text-blue-700"
                                  title="Search LinkedIn"
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                  </svg>
                                </a>
                              </div>
                            </div>
                            {form470Detail.technical_contact?.email && (
                              <div className="flex justify-between items-center">
                                <span className="text-slate-500">Tech Email:</span>
                                <a href={`mailto:${form470Detail.technical_contact.email}`} className="text-blue-600 hover:underline">
                                  {form470Detail.technical_contact.email}
                                </a>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Additional Contacts from Enrichment */}
                  {enrichmentData?.additional_contacts && enrichmentData.additional_contacts.length > 0 && (
                    <div className="bg-indigo-50 rounded-xl p-4">
                      <h3 className="font-semibold text-indigo-800 mb-3 flex items-center gap-2">
                        <span>👥</span> Additional Contacts at Organization
                      </h3>
                      <div className="space-y-3">
                        {enrichmentData.additional_contacts.slice(0, 5).map((contact, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-indigo-100">
                            <div>
                              <div className="font-medium text-slate-900">{contact.name}</div>
                              {contact.position && (
                                <div className="text-xs text-slate-500">{contact.position}</div>
                              )}
                              {contact.email && (
                                <a href={`mailto:${contact.email}`} className="text-xs text-blue-600 hover:underline">
                                  {contact.email}
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {contact.linkedin && (
                                <a
                                  href={contact.linkedin}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-blue-600 hover:text-blue-800"
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                  </svg>
                                </a>
                              )}
                              {contact.confidence && (
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  contact.confidence > 80 ? 'bg-green-100 text-green-700' :
                                  contact.confidence > 50 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {contact.confidence}% confident
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manufacturers & Service Types */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-orange-50 rounded-xl p-4">
                      <h3 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
                        <span>🏭</span> Manufacturers Requested
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {form470Detail.manufacturers?.length > 0 ? (
                          form470Detail.manufacturers.map((mfr, idx) => (
                            <span key={idx} className="px-3 py-1 bg-orange-200 text-orange-800 rounded-full text-sm">
                              {mfr}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500">No specific manufacturers requested</span>
                        )}
                      </div>
                    </div>

                    <div className="bg-blue-50 rounded-xl p-4">
                      <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                        <span>📋</span> Categories & Services
                      </h3>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {form470Detail.categories?.map((cat, idx) => (
                          <span key={idx} className={`px-3 py-1 rounded-full text-sm ${
                            cat.includes('1') ? 'bg-blue-200 text-blue-800' : 'bg-purple-200 text-purple-800'
                          }`}>
                            {cat}
                          </span>
                        ))}
                      </div>
                      <div className="text-sm text-slate-600">
                        {form470Detail.service_types?.join(', ')}
                      </div>
                    </div>
                  </div>

                  {/* Services Details */}
                  {form470Detail.services && form470Detail.services.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-slate-200 bg-slate-50">
                        <h3 className="font-semibold text-slate-900">Services Requested ({form470Detail.total_services})</h3>
                      </div>
                      <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                        {form470Detail.services.map((service, idx) => (
                          <div key={idx} className="p-4 flex items-start justify-between">
                            <div>
                              <div className="font-medium text-slate-900">{service.service_type}</div>
                              <div className="text-sm text-slate-500">{service.function}</div>
                              {service.manufacturer && (
                                <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                                  {service.manufacturer}
                                </span>
                              )}
                            </div>
                            <div className="text-right text-sm">
                              <div className="text-slate-700">{service.quantity} {service.unit}</div>
                              {service.min_capacity && (
                                <div className="text-slate-500">{service.min_capacity} - {service.max_capacity}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Descriptions */}
                  {/* RFP Documents */}
                  {form470Detail.services?.some(s => s.rfp_documents || s.rfp_identifier) && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-slate-200 bg-amber-50">
                        <h3 className="font-semibold text-amber-900 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          RFP Documents
                        </h3>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {form470Detail.services
                          .filter(s => s.rfp_documents || s.rfp_identifier)
                          .map((service, idx) => (
                          <div key={idx} className="p-4">
                            {service.rfp_identifier && (
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-slate-500">RFP ID:</span>
                                <span className="text-sm font-mono text-slate-900">{service.rfp_identifier}</span>
                              </div>
                            )}
                            {service.rfp_documents && typeof service.rfp_documents === 'string' && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-medium text-slate-500 mt-0.5">Document:</span>
                                {service.rfp_documents.startsWith('http') ? (
                                  <a
                                    href={service.rfp_documents}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:text-blue-800 underline break-all"
                                  >
                                    {service.rfp_documents}
                                  </a>
                                ) : (
                                  <span className="text-sm text-slate-700 break-all">{service.rfp_documents}</span>
                                )}
                              </div>
                            )}
                            <div className="text-xs text-slate-400 mt-1">{service.service_type} - {service.function}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(form470Detail.category_one_description || form470Detail.category_two_description) && (
                    <div className="space-y-4">
                      {form470Detail.category_one_description && (
                        <div className="bg-blue-50 rounded-xl p-4">
                          <h3 className="font-semibold text-blue-800 mb-2">Category 1 Description</h3>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{form470Detail.category_one_description}</p>
                        </div>
                      )}
                      {form470Detail.category_two_description && (
                        <div className="bg-purple-50 rounded-xl p-4">
                          <h3 className="font-semibold text-purple-800 mb-2">Category 2 Description</h3>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{form470Detail.category_two_description}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dates */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3">Important Dates</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-slate-500">Posted</div>
                        <div className="font-medium">{form470Detail.posting_date ? new Date(form470Detail.posting_date).toLocaleDateString() : '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Allowable Contract Date</div>
                        <div className="font-medium">{form470Detail.allowable_contract_date ? new Date(form470Detail.allowable_contract_date).toLocaleDateString() : '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Status</div>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          form470Detail.status === 'Certified' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {form470Detail.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-500 py-12">
                  Failed to load details
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
              {/* Save/Unsave Lead Button */}
              {!isLeadSaved ? (
                <button
                  onClick={saveCurrentLead}
                  disabled={savingLead || !form470Detail}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingLead ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      Save Lead
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-sm flex items-center gap-2">
                    <span>✓</span>
                    Saved
                  </span>
                  <button
                    onClick={unsaveLead}
                    className="px-3 py-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl text-sm transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
              
              {/* Enrich Button - only shown when lead is saved */}
              {isLeadSaved && currentSavedLead && (
                <button
                  onClick={enrichCurrentLead}
                  disabled={enrichingLead}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Find additional contacts and LinkedIn profiles"
                >
                  {enrichingLead ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Enriching...
                    </>
                  ) : enrichmentData ? (
                    <>
                      <span>🔄</span>
                      Re-enrich
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      Find More Contacts
                    </>
                  )}
                </button>
              )}
              
              {/* Contact Email Button */}
              {form470Detail?.contact?.email && (
                <a
                  href={`mailto:${form470Detail.contact.email}?subject=Regarding Form 470 ${form470Detail.application_number}`}
                  className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
                >
                  <span>📧</span>
                  Contact Entity
                </a>
              )}
              
              {/* LinkedIn Search for Organization */}
              {form470Detail?.entity?.name && (
                <a
                  href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(form470Detail.entity.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
                  title="Find more contacts at this organization on LinkedIn (FREE - no API credits)"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                  Find Staff
                </a>
              )}
              
              <button
                onClick={closeForm470Modal}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors ml-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Result Detail Modal */}
      {showSearchResultModal && selectedSearchResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowSearchResultModal(false);
              setSelectedSearchResult(null);
              setEntityEnrichment(null);
            }}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    {entityEnrichment?.entity?.name || selectedSearchResult.name || 'School Details'}
                  </h2>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-sm">
                      BEN: {selectedSearchResult.ben}
                    </span>
                    <span className="px-2 py-0.5 bg-white/20 rounded text-sm">
                      {entityEnrichment?.entity?.city || selectedSearchResult.city}{entityEnrichment?.entity?.city || selectedSearchResult.city ? ', ' : ''}{entityEnrichment?.entity?.state || selectedSearchResult.state}
                    </span>
                    {selectedSearchResult.funding_year && (
                      <span className="px-2 py-0.5 bg-white/20 rounded text-sm">
                        FY {selectedSearchResult.funding_year}
                      </span>
                    )}
                    {isLeadSaved && (
                      <span className="px-2 py-0.5 bg-green-400/30 rounded text-sm flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Saved as Lead
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowSearchResultModal(false);
                    setSelectedSearchResult(null);
                    setEntityEnrichment(null);
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {enrichmentLoading ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-600">Loading enriched school data...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Current Application Info with Actual Status */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3">Application Details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      <div>
                        <span className="text-sm text-slate-500">FRN Status</span>
                        <div className={`mt-1 inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          selectedSearchResult.status === 'Funded'
                            ? 'bg-green-100 text-green-700'
                            : selectedSearchResult.status === 'Denied'
                            ? 'bg-red-100 text-red-700'
                            : selectedSearchResult.status === 'Pending' || selectedSearchResult.status === 'In Review'
                            ? 'bg-yellow-100 text-yellow-700'
                            : selectedSearchResult.status === 'Cancelled'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {selectedSearchResult.status || 'Processing'}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-slate-500">Commitment Amount</span>
                        <div className="mt-1 text-lg font-bold text-slate-900">
                          {selectedSearchResult.funding_amount 
                            ? `$${selectedSearchResult.funding_amount.toLocaleString()}`
                            : '-'}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-slate-500">Service Type</span>
                        <div className="mt-1 font-medium text-slate-900 text-sm">
                          {selectedSearchResult.service_type || '-'}
                        </div>
                      </div>
                      {selectedSearchResult.application_number && (
                        <div>
                          <span className="text-sm text-slate-500">Application #</span>
                          <div className="mt-1 font-mono text-slate-900">
                            {selectedSearchResult.application_number}
                          </div>
                        </div>
                      )}
                      {selectedSearchResult.frn && (
                        <div>
                          <span className="text-sm text-slate-500">FRN</span>
                          <div className="mt-1 font-mono text-slate-900">
                            {selectedSearchResult.frn}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Entity Information */}
                  {entityEnrichment?.entity && (
                    <div className="bg-blue-50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-900 mb-3">Entity Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {entityEnrichment.entity.address && (
                          <div>
                            <span className="text-sm text-slate-500">Address</span>
                            <div className="mt-1 text-slate-900">
                              {entityEnrichment.entity.address}<br />
                              {entityEnrichment.entity.city}, {entityEnrichment.entity.state} {entityEnrichment.entity.zip}
                            </div>
                          </div>
                        )}
                        {entityEnrichment.entity.phone && (
                          <div>
                            <span className="text-sm text-slate-500">Phone</span>
                            <div className="mt-1 text-slate-900">
                              <a href={`tel:${entityEnrichment.entity.phone}`} className="text-blue-600 hover:underline">
                                {entityEnrichment.entity.phone}
                              </a>
                            </div>
                          </div>
                        )}
                        {entityEnrichment.entity.website && (
                          <div>
                            <span className="text-sm text-slate-500">Website</span>
                            <div className="mt-1">
                              <a 
                                href={entityEnrichment.entity.website.startsWith('http') ? entityEnrichment.entity.website : `https://${entityEnrichment.entity.website}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {entityEnrichment.entity.website}
                              </a>
                            </div>
                          </div>
                        )}
                        {entityEnrichment.entity.entity_type && (
                          <div>
                            <span className="text-sm text-slate-500">Entity Type</span>
                            <div className="mt-1 text-slate-900">{entityEnrichment.entity.entity_type}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Contacts from USAC */}
                  {entityEnrichment?.contacts && entityEnrichment.contacts.length > 0 && (
                    <div className="bg-emerald-50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Contacts ({entityEnrichment.contacts.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {entityEnrichment.contacts.map((contact: any, idx: number) => (
                          <div key={idx} className="bg-white rounded-lg p-3 border border-emerald-200">
                            <div className="font-medium text-slate-900">{contact.name}</div>
                            {contact.title && (
                              <div className="text-sm text-slate-600">{contact.title}</div>
                            )}
                            <div className="text-xs text-emerald-600 mb-2">{contact.role}</div>
                            <div className="flex flex-wrap gap-2">
                              {contact.email && (
                                <a 
                                  href={`mailto:${contact.email}`}
                                  className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  {contact.email}
                                </a>
                              )}
                              {contact.phone && (
                                <a 
                                  href={`tel:${contact.phone}`}
                                  className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                  </svg>
                                  {contact.phone}
                                </a>
                              )}
                            </div>
                            {contact.year && (
                              <div className="text-xs text-slate-400 mt-1">From FY {contact.year}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Funding Summary */}
                  {entityEnrichment?.funding_summary && (
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-3">Funding Summary</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-purple-50 rounded-xl p-4">
                          <div className="text-sm text-purple-600 font-medium">Total Committed</div>
                          <div className="text-2xl font-bold text-purple-700">
                            ${((entityEnrichment.funding_summary.total_committed || 0) / 1000).toFixed(1)}K
                          </div>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4">
                          <div className="text-sm text-green-600 font-medium">Total Funded</div>
                          <div className="text-2xl font-bold text-green-700">
                            ${((entityEnrichment.funding_summary.total_funded || 0) / 1000).toFixed(1)}K
                          </div>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4">
                          <div className="text-sm text-amber-600 font-medium">Total FRNs</div>
                          <div className="text-2xl font-bold text-amber-700">
                            {entityEnrichment.funding_summary.total_frns || 0}
                          </div>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-4">
                          <div className="text-sm text-blue-600 font-medium">Years with Funding</div>
                          <div className="text-2xl font-bold text-blue-700">
                            {entityEnrichment.funding_summary.years_with_funding || 0}
                          </div>
                        </div>
                      </div>
                      
                      {entityEnrichment.funding_summary.status_breakdown && (
                        <div className="mt-3 flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            Funded: {entityEnrichment.funding_summary.status_breakdown.funded}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            Denied: {entityEnrichment.funding_summary.status_breakdown.denied}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                            Pending: {entityEnrichment.funding_summary.status_breakdown.pending}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recent FRNs */}
                  {entityEnrichment?.frns && entityEnrichment.frns.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-3">Recent FRNs ({entityEnrichment.frns.length})</h3>
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">FRN</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Year</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Status</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Service</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Committed</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Funded</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {entityEnrichment.frns.slice(0, 10).map((frn: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono text-xs">{frn.frn}</td>
                                <td className="px-3 py-2">{frn.funding_year}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    frn.frn_status === 'Funded' ? 'bg-green-100 text-green-700'
                                    : frn.frn_status === 'Denied' ? 'bg-red-100 text-red-700'
                                    : 'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {frn.frn_status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs truncate max-w-[150px]">{frn.service_type || '-'}</td>
                                <td className="px-3 py-2 text-right">${(frn.commitment_amount / 1000).toFixed(1)}K</td>
                                <td className="px-3 py-2 text-right">${(frn.funded_amount / 1000).toFixed(1)}K</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {entityEnrichment.frns.length > 10 && (
                          <div className="px-3 py-2 bg-slate-50 text-center text-sm text-slate-500">
                            Showing 10 of {entityEnrichment.frns.length} FRNs
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No enrichment data available */}
                  {!entityEnrichment && !enrichmentLoading && (
                    <div className="bg-slate-50 rounded-xl p-6 text-center">
                      <p className="text-slate-600">
                        Unable to load enriched data. The basic application information is shown above.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
              {!isLeadSaved ? (
                <button
                  onClick={handleSaveAsLead}
                  disabled={savingLead}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {savingLead ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      Save as Lead
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setActiveTab('leads');
                    setShowSearchResultModal(false);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  View in Leads
                </button>
              )}
              <button
                onClick={() => {
                  // Add to selection if not already selected
                  if (!selectedSchools.has(selectedSearchResult.ben)) {
                    const newSelection = new Set(selectedSchools);
                    newSelection.add(selectedSearchResult.ben);
                    setSelectedSchools(newSelection);
                  }
                  setShowSearchResultModal(false);
                }}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add to Export
              </button>
              <button
                onClick={() => {
                  setShowSearchResultModal(false);
                  setSelectedSearchResult(null);
                  setEntityEnrichment(null);
                }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors ml-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Lead Detail Modal (for predicted/non-470 leads) */}
      {showSavedLeadDetailModal && selectedSavedLeadDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowSavedLeadDetailModal(false); setSelectedSavedLeadDetail(null); }}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-purple-600 to-pink-600 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedSavedLeadDetail.entity_name || `BEN: ${selectedSavedLeadDetail.ben}`}</h2>
                  <p className="text-purple-100 mt-1">
                    {selectedSavedLeadDetail.form_type === 'predicted' ? '🔮 Predicted Lead' : `Form ${selectedSavedLeadDetail.form_type}`} #{selectedSavedLeadDetail.application_number}
                    {selectedSavedLeadDetail.funding_year && ` • FY ${selectedSavedLeadDetail.funding_year}`}
                  </p>
                </div>
                <button
                  onClick={() => { setShowSavedLeadDetailModal(false); setSelectedSavedLeadDetail(null); }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Entity & Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>🏫</span> Entity Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">BEN:</span>
                        <span className="font-medium">{selectedSavedLeadDetail.ben}</span>
                      </div>
                      {selectedSavedLeadDetail.entity_type && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Type:</span>
                          <span className="font-medium">{selectedSavedLeadDetail.entity_type}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">Location:</span>
                        <span className="font-medium">
                          {[selectedSavedLeadDetail.entity_city, selectedSavedLeadDetail.entity_state].filter(Boolean).join(', ') || 'N/A'}
                        </span>
                      </div>
                      {selectedSavedLeadDetail.entity_address && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Address:</span>
                          <span className="font-medium">{selectedSavedLeadDetail.entity_address}</span>
                        </div>
                      )}
                      {selectedSavedLeadDetail.entity_phone && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Phone:</span>
                          <a href={`tel:${selectedSavedLeadDetail.entity_phone}`} className="text-blue-600 hover:underline">{selectedSavedLeadDetail.entity_phone}</a>
                        </div>
                      )}
                      {selectedSavedLeadDetail.entity_website && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Website:</span>
                          <a href={selectedSavedLeadDetail.entity_website.startsWith('http') ? selectedSavedLeadDetail.entity_website : `https://${selectedSavedLeadDetail.entity_website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Visit →</a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>👤</span> Contact Information
                      {selectedSavedLeadDetail.contact_name && selectedSavedLeadDetail.entity_name && (
                        <a
                          href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(selectedSavedLeadDetail.contact_name + ' ' + selectedSavedLeadDetail.entity_name)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs hover:bg-blue-200 transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                          </svg>
                          LinkedIn
                        </a>
                      )}
                    </h3>
                    <div className="space-y-2 text-sm">
                      {selectedSavedLeadDetail.contact_name && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Contact:</span>
                          <span className="font-medium">{selectedSavedLeadDetail.contact_name}</span>
                        </div>
                      )}
                      {selectedSavedLeadDetail.contact_title && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Title:</span>
                          <span className="font-medium">{selectedSavedLeadDetail.contact_title}</span>
                        </div>
                      )}
                      {selectedSavedLeadDetail.contact_email && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Email:</span>
                          <a href={`mailto:${selectedSavedLeadDetail.contact_email}`} className="text-blue-600 hover:underline">{selectedSavedLeadDetail.contact_email}</a>
                        </div>
                      )}
                      {selectedSavedLeadDetail.contact_phone && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Phone:</span>
                          <a href={`tel:${selectedSavedLeadDetail.contact_phone}`} className="text-blue-600 hover:underline">{selectedSavedLeadDetail.contact_phone}</a>
                        </div>
                      )}
                      {selectedSavedLeadDetail.enriched_data?.linkedin_url && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">LinkedIn:</span>
                          <a href={selectedSavedLeadDetail.enriched_data.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Profile →</a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Services & Categories */}
                {(selectedSavedLeadDetail.categories?.length > 0 || selectedSavedLeadDetail.services?.length > 0 || selectedSavedLeadDetail.manufacturers?.length > 0) && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>📦</span> Services & Categories
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedSavedLeadDetail.categories?.map((cat: string, idx: number) => (
                        <span key={`cat-${idx}`} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">{cat}</span>
                      ))}
                      {selectedSavedLeadDetail.services?.map((svc: string, idx: number) => (
                        <span key={`svc-${idx}`} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">{svc}</span>
                      ))}
                      {selectedSavedLeadDetail.manufacturers?.map((mfr: string, idx: number) => (
                        <span key={`mfr-${idx}`} className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">{mfr}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Funding Info */}
                {(selectedSavedLeadDetail.funding_amount || selectedSavedLeadDetail.committed_amount || selectedSavedLeadDetail.funded_amount) && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>💰</span> Funding Information
                    </h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {selectedSavedLeadDetail.funding_amount != null && (
                        <div>
                          <span className="text-slate-500 block">Requested</span>
                          <span className="font-semibold text-lg">${selectedSavedLeadDetail.funding_amount.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedSavedLeadDetail.committed_amount != null && (
                        <div>
                          <span className="text-slate-500 block">Committed</span>
                          <span className="font-semibold text-lg">${selectedSavedLeadDetail.committed_amount.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedSavedLeadDetail.funded_amount != null && (
                        <div>
                          <span className="text-slate-500 block">Funded</span>
                          <span className="font-semibold text-lg">${selectedSavedLeadDetail.funded_amount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Additional Contacts (from enrichment) */}
                {selectedSavedLeadDetail.enriched_data?.additional_contacts && selectedSavedLeadDetail.enriched_data.additional_contacts.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>👥</span> Additional Contacts ({selectedSavedLeadDetail.enriched_data.additional_contacts.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedSavedLeadDetail.enriched_data.additional_contacts.map((contact: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{contact.name}</span>
                            {contact.position && <span className="text-slate-400">({contact.position})</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            {contact.email && <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a>}
                            {contact.phone && <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">{contact.phone}</a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All USAC Contacts */}
                {selectedSavedLeadDetail.all_contacts && selectedSavedLeadDetail.all_contacts.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>📋</span> USAC Contacts ({selectedSavedLeadDetail.all_contacts.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedSavedLeadDetail.all_contacts.map((contact, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                          <span className="font-medium">{contact.name}</span>
                          <div className="flex items-center gap-3">
                            {contact.email && <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a>}
                            {contact.phone && <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">{contact.phone}</a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedSavedLeadDetail.notes && (
                  <div className="bg-yellow-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-2">📝 Notes</h3>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedSavedLeadDetail.notes}</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
              {selectedSavedLeadDetail.contact_email && (
                <a
                  href={`mailto:${selectedSavedLeadDetail.contact_email}?subject=Regarding E-Rate Services for ${selectedSavedLeadDetail.entity_name || selectedSavedLeadDetail.ben}`}
                  className="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors flex items-center gap-2"
                >
                  📧 Contact Entity
                </a>
              )}
              {selectedSavedLeadDetail.entity_name && (
                <a
                  href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(selectedSavedLeadDetail.entity_name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-700 text-white rounded-xl hover:bg-blue-800 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                  Find Staff
                </a>
              )}
              <button
                onClick={() => { setShowSavedLeadDetailModal(false); setSelectedSavedLeadDetail(null); }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors ml-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
