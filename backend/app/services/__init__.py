"""
SkyRate AI v2 Services Layer

This module provides FastAPI-friendly wrappers around the legacy
business logic from skyrate-ai/utils/.

Services:
- USACService: USAC Open Data API access (Form 470/471, FRN line items, etc.)
- AIService: Multi-model AI routing (Gemini, DeepSeek, Claude)
- DenialService: FCDL parsing, violation analysis, deadline tracking
- AppealsService: Strategy generation, timelines, document checklists

All services use the singleton pattern for efficient resource sharing.

Usage:
    from app.services import get_usac_service, get_ai_service
    
    usac = get_usac_service()
    results = usac.search_denied_applications(year=2025, state="CA")
    
    ai = get_ai_service()
    interpretation = ai.interpret_query("Show me denied applications in Texas")
"""

from .usac_service import USACService, get_usac_service
from .ai_service import AIService, get_ai_service
from .denial_service import DenialService, get_denial_service
from .appeals_service import AppealsService, get_appeals_service

__all__ = [
    # Service classes
    'USACService',
    'AIService', 
    'DenialService',
    'AppealsService',
    
    # Singleton accessors
    'get_usac_service',
    'get_ai_service',
    'get_denial_service',
    'get_appeals_service',
]
