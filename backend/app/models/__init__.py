# SkyRate AI - Models Package
from .user import User, UserRole
from .subscription import Subscription, SubscriptionStatus, SubscriptionPlan
from .consultant import ConsultantProfile, ConsultantSchool, ConsultantCRN
from .account_seat import AccountSeat
from .vendor import VendorProfile, VendorSearch, SavedLead, OrganizationEnrichmentCache
from .vendor_alerts import (
    VendorAlertSubscription,
    VendorAlertMatch,
    VendorAlertScanRun,
    VendorPushSubscription,
    VendorInAppNotification,
    Form470Posting,
    DEFAULT_ALERT_CHANNELS,
)
from .application import SchoolSnapshot, Application, AppealRecord, QueryHistory
from .alert import Alert, AlertConfig, AlertType, AlertPriority
from .support_ticket import SupportTicket, TicketMessage, TicketStatus, TicketPriority, TicketCategory, TicketSource
from .applicant import (
    ApplicantProfile, 
    ApplicantBEN,
    ApplicantFRN, 
    ApplicantAutoAppeal, 
    ApplicantStatusHistory,
    DataSyncStatus,
    FRNStatusType,
    BENSubscriptionStatus
)
from .blog import BlogPost, BlogStatus
from .usac_cache import USACCache
from .user_usac_cache import UserUsacCache, UsacSyncJob
from .admin_frn_snapshot import AdminFRNSnapshot
from .pilot_frn_snapshot import PilotFRNSnapshot
from .promo_invite import PromoInvite, PromoInviteStatus
from .prediction import PredictedLead, PredictionRefreshLog, PredictionType, PredictionStatus
from .lead import Lead
from .email_verification_token import EmailVerificationToken
from .compliance_analysis import ComplianceAnalysis
from .frn_status_change import FrnStatusChangeQueue

__all__ = [
    "User",
    "UserRole",
    "Subscription",
    "SubscriptionStatus",
    "SubscriptionPlan",
    "ConsultantProfile",
    "ConsultantSchool",
    "ConsultantCRN",
    "AccountSeat",
    "VendorProfile",
    "VendorSearch",
    "SavedLead",
    "OrganizationEnrichmentCache",
    # Vendor alerts (P1 of Vendor Parity Plan v2)
    "VendorAlertSubscription",
    "VendorAlertMatch",
    "VendorAlertScanRun",
    "VendorPushSubscription",
    "VendorInAppNotification",
    "Form470Posting",
    "DEFAULT_ALERT_CHANNELS",
    "SchoolSnapshot",
    "Application",
    "AppealRecord",
    "QueryHistory",
    "Alert",
    "AlertConfig",
    "AlertType",
    "AlertPriority",
    "SupportTicket",
    "TicketMessage",
    "TicketStatus",
    "TicketPriority",
    "TicketCategory",
    "TicketSource",
    # Applicant models
    "ApplicantProfile",
    "ApplicantBEN",
    "ApplicantFRN",
    "ApplicantAutoAppeal",
    "ApplicantStatusHistory",
    "DataSyncStatus",
    "FRNStatusType",
    "BENSubscriptionStatus",
    # Blog models
    "BlogPost",
    "BlogStatus",
    # USAC Cache
    "USACCache",
    # perf_v2 per-user USAC cache + sync job log
    "UserUsacCache",
    "UsacSyncJob",
    # Admin FRN Snapshot
    "AdminFRNSnapshot",
    "PilotFRNSnapshot",
    # Promo Invites
    "PromoInvite",
    "PromoInviteStatus",
    # Predictive Leads
    "PredictedLead",
    "PredictionRefreshLog",
    "PredictionType",
    "PredictionStatus",
    # Inbound leads (public capture form)
    "Lead",
    # Magic-link / email verification tokens
    "EmailVerificationToken",
    # Compliance audit history
    "ComplianceAnalysis",
]
