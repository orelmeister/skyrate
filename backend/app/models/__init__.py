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
]
