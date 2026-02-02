"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { api, VendorProfile, SpinValidationResult, ServicedEntity, EntityDetailResponse, EntityYearData, Form471ByEntityResponse, Form471Record, Form471Vendor, CompetitorAnalysisResponse, FRNStatusResponse, FRNStatusSummaryResponse, FRNStatusRecord } from "@/lib/api";

interface SearchResult {
  ben: string;
  name: string;
  state: string;
  city: string;
  status: string;
  funding_amount: number;
  service_type: string;
}

export default function VendorPortalPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  
  const [activeTab, setActiveTab] = useState("dashboard");
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
  
  // Form 471 Competitive Analysis state
  const [form471BenInput, setForm471BenInput] = useState("");
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
  
  // Payment guard - check if user needs to complete payment setup
  const [checkingPayment, setCheckingPayment] = useState(true);

  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!isAuthenticated) {
        router.push("/sign-in");
        return;
      }
      if (user?.role !== "vendor" && user?.role !== "admin") {
        router.push("/consultant");
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
  }, [isAuthenticated, user, router]);

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
      const response = await api.get471ByEntity(form471BenInput.trim());
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
  const loadFRNStatus = async (year?: number, status?: string) => {
    if (!profile?.spin) {
      return;
    }
    
    setFrnStatusLoading(true);
    try {
      const response = await api.getFRNStatus(year, status || undefined);
      if (response.success && response.data) {
        setFrnStatusData(response.data);
      }
    } catch (error) {
      console.error("Failed to load FRN status:", error);
    } finally {
      setFrnStatusLoading(false);
    }
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

  const handleExport = async () => {
    if (selectedSchools.size === 0) {
      alert("Please select at least one school to export");
      return;
    }
    
    // For now, just download as CSV
    const selected = searchResults.filter(s => selectedSchools.has(s.ben));
    const csv = [
      "BEN,Name,State,City,Status,Funding Amount,Service Type",
      ...selected.map(s => 
        `${s.ben},"${s.name}",${s.state},"${s.city || ''}",${s.status},${s.funding_amount},${s.service_type}`
      )
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // Show loading state while checking payment status
  if (checkingPayment) {
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
    { id: "competitive", label: "471 Lookup", icon: "🎯" },
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
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-200">
              <span className="text-white font-bold">S</span>
            </div>
            <div>
              <span className="font-bold text-slate-900">SkyRate AI</span>
              <span className="block text-xs text-slate-500">Vendor Portal</span>
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
            <div className="text-2xl font-bold">{profile?.search_count || 0} Searches</div>
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
                    <span className="text-xs text-pink-600 font-medium px-2 py-1 bg-pink-50 rounded-full">Active</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {user?.subscription?.status === 'trialing' ? 'Trial' : 'Pro'}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Subscription</div>
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
                  onClick={() => loadFRNStatus(frnStatusYear, frnStatusFilter)}
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
                          loadFRNStatus(year, frnStatusFilter);
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
                          loadFRNStatus(frnStatusYear, e.target.value);
                        }}
                        className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
                      >
                        <option value="">All Statuses</option>
                        <option value="Funded">Funded</option>
                        <option value="Denied">Denied</option>
                        <option value="Pending">Pending</option>
                      </select>
                    </div>
                    <button
                      onClick={() => loadFRNStatus(frnStatusYear, frnStatusFilter)}
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
                {frnStatusData && frnStatusData.frns && frnStatusData.frns.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                      <h3 className="font-semibold text-slate-900">FRN Details</h3>
                      <p className="text-sm text-slate-600">Detailed status for each funding request</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">FRN</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Entity</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Year</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Service Type</th>
                            <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Commitment</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Disbursed</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Invoicing</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {frnStatusData.frns.slice(0, 100).map((frn, idx) => (
                            <tr key={`${frn.frn}-${idx}`} className="hover:bg-slate-50">
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
                      {frnStatusData.frns.length > 100 && (
                        <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 border-t border-slate-200">
                          Showing first 100 of {frnStatusData.frns.length} FRNs
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {frnStatusData && frnStatusData.frns && frnStatusData.frns.length === 0 && (
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
          </div>
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
              
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={form471BenInput}
                  onChange={(e) => setForm471BenInput(e.target.value)}
                  placeholder="Enter BEN (e.g., 232950)"
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  onKeyDown={(e) => e.key === 'Enter' && search471ByBen()}
                />
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
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                      <h3 className="font-semibold text-slate-900">FRN Details</h3>
                      <p className="text-sm text-slate-600">All Form 471 funding requests for this entity</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
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
                            <tr key={idx} className="hover:bg-slate-50">
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
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Results ({searchResults.length})
                  </h2>
                  <button
                    onClick={handleExport}
                    disabled={selectedSchools.size === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-200 transition-all disabled:opacity-50 font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Export ({selectedSchools.size})
                  </button>
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">School Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">State</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Funding</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Service</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {searchResults.map((school) => (
                        <tr key={school.ben} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedSchools.has(school.ben)}
                              onChange={() => toggleSchoolSelection(school.ben)}
                            />
                          </td>
                          <td className="px-4 py-3 font-mono">{school.ben}</td>
                          <td className="px-4 py-3">{school.name}</td>
                          <td className="px-4 py-3">{school.state}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              school.status === 'Funded' 
                                ? 'bg-green-100 text-green-700'
                                : school.status === 'Denied'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {school.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">${school.funding_amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm">{school.service_type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📋</span>
              </div>
              <h2 className="text-lg font-semibold text-slate-900">No Saved Leads</h2>
              <p className="text-slate-500 mt-2 max-w-md mx-auto">
                Search for schools and save them to build your lead list for targeted outreach.
              </p>
              <button
                onClick={() => setActiveTab("search")}
                className="mt-6 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-200 transition-all font-medium"
              >
                Start Searching
              </button>
            </div>
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
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Entity Name</th>
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
                        {servicedEntities.slice(0, 50).map((entity) => (
                          <tr 
                            key={entity.ben} 
                            className="hover:bg-purple-50 transition-colors cursor-pointer group"
                            onClick={() => loadEntityDetail(entity)}
                          >
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

            {/* Subscription */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <span className="text-xl">💳</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Subscription</h2>
                  <p className="text-sm text-slate-500">Manage your billing and plan</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100">
                <div>
                  <div className="font-semibold text-slate-900">
                    {user?.subscription?.plan === 'yearly' ? 'Yearly Plan' : 'Monthly Plan'}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    Status: <span className="text-green-600 font-medium">{user?.subscription?.status || 'Unknown'}</span>
                  </div>
                </div>
                <button className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 font-medium transition">
                  Manage Subscription
                </button>
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
    </div>
  );
}
