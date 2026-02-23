# SkyRate AI - Models Package
from .user import User, UserRole
from .subscription import Subscription, SubscriptionStatus, SubscriptionPlan
from .consultant import ConsultantProfile, ConsultantSchool
from .vendor import VendorProfile, VendorSearch, SavedLead, OrganizationEnrichmentCache
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
from .admin_frn_snapshot import AdminFRNSnapshot
from .promo_invite import PromoInvite, PromoInviteStatus
from .prediction import PredictedLead, PredictionRefreshLog, PredictionType, PredictionStatus

__all__ = [
    "User",
    "UserRole",
    "Subscription",
    "SubscriptionStatus",
    "SubscriptionPlan",
    "ConsultantProfile",
    "ConsultantSchool",
    "VendorProfile",
    "VendorSearch",
    "SavedLead",
    "OrganizationEnrichmentCache",
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
    # Admin FRN Snapshot
    "AdminFRNSnapshot",
    # Promo Invites
    "PromoInvite",
    "PromoInviteStatus",
    # Predictive Leads
    "PredictedLead",
    "PredictionRefreshLog",
    "PredictionType",
    "PredictionStatus",
]
