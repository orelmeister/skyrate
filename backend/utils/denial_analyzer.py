"""
Denial Analyzer Module for SkyRate AI
Analyzes E-Rate denial reasons from FCDL comments.

Supports parsing FCDL (Funding Commitment Decision Letter) comments
and classifying denial reasons by type.
"""

import re
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class ViolationType(Enum):
    """Types of E-Rate violations."""
    COMPETITIVE_BIDDING = "competitive_bidding"
    DOCUMENTATION = "documentation"
    ELIGIBILITY = "eligibility"
    TECHNICAL = "technical"
    TIMING = "timing"
    COST_ALLOCATION = "cost_allocation"
    GIFT_RULE = "gift_rule"
    SERVICE_SUBSTITUTION = "service_substitution"
    UNKNOWN = "unknown"


@dataclass
class DenialReason:
    """
    Represents a single denial reason from an FCDL.
    
    Attributes:
        code: Denial reason code (e.g., DR1, DR2, MR1)
        description: Full description of the denial
        violation_type: Classification of the violation
        evidence_needed: List of evidence that could help appeal
        appealability: Assessment of appeal likelihood (high/medium/low)
    """
    code: str
    description: str
    violation_type: ViolationType = ViolationType.UNKNOWN
    evidence_needed: List[str] = field(default_factory=list)
    appealability: str = "medium"
    key_dates: List[str] = field(default_factory=list)
    vendors_referenced: List[str] = field(default_factory=list)
    forms_referenced: List[str] = field(default_factory=list)
    
    def __post_init__(self):
        """Classify the violation after initialization."""
        self._classify()
        self._extract_evidence_needs()
    
    def _classify(self):
        """Classify the violation type based on description."""
        desc_lower = self.description.lower()
        
        # Competitive bidding violations
        if any(term in desc_lower for term in ['bid', 'competitive', '470', 'procurement', 'vendor selection']):
            self.violation_type = ViolationType.COMPETITIVE_BIDDING
            self.appealability = "medium"
        
        # Documentation violations
        elif any(term in desc_lower for term in ['document', 'evidence', 'record', 'certification', 'signature']):
            self.violation_type = ViolationType.DOCUMENTATION
            self.appealability = "high"
        
        # Eligibility violations
        elif any(term in desc_lower for term in ['eligible', 'eligibility', 'category', 'discount rate']):
            self.violation_type = ViolationType.ELIGIBILITY
            self.appealability = "low"
        
        # Technical violations
        elif any(term in desc_lower for term in ['technical', 'specification', 'service delivery']):
            self.violation_type = ViolationType.TECHNICAL
            self.appealability = "medium"
        
        # Timing violations
        elif any(term in desc_lower for term in ['deadline', 'late', 'date', 'timing', 'expir']):
            self.violation_type = ViolationType.TIMING
            self.appealability = "low"
        
        # Cost allocation
        elif any(term in desc_lower for term in ['cost', 'allocation', 'ineligible', 'budget']):
            self.violation_type = ViolationType.COST_ALLOCATION
            self.appealability = "medium"
        
        # Gift rule
        elif any(term in desc_lower for term in ['gift', 'gratuity', 'incentive']):
            self.violation_type = ViolationType.GIFT_RULE
            self.appealability = "low"
    
    def _extract_evidence_needs(self):
        """Determine what evidence could help an appeal."""
        evidence_map = {
            ViolationType.COMPETITIVE_BIDDING: [
                "Form 470 posting confirmation",
                "Bid evaluation matrix",
                "All vendor responses",
                "Price comparison documentation"
            ],
            ViolationType.DOCUMENTATION: [
                "Original signed documents",
                "Date-stamped records",
                "Email correspondence",
                "Meeting minutes"
            ],
            ViolationType.ELIGIBILITY: [
                "Entity eligibility documentation",
                "NSLP data or alternative discount documentation",
                "Service provider eligibility confirmation"
            ],
            ViolationType.TIMING: [
                "Timestamped submission records",
                "System outage documentation (if applicable)",
                "Correspondence showing intent to file on time"
            ],
            ViolationType.COST_ALLOCATION: [
                "Detailed cost allocation methodology",
                "Supporting calculations",
                "Service inventory documentation"
            ]
        }
        self.evidence_needed = evidence_map.get(self.violation_type, ["General supporting documentation"])
        
        # Extract dates from description
        date_pattern = r'\b(\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2})\b'
        self.key_dates = re.findall(date_pattern, self.description)
        
        # Extract vendor names (basic pattern)
        vendor_pattern = r'\b([A-Z][a-zA-Z]+\s+(?:Inc|LLC|Corp|Company|Services|Technologies)\.?)\b'
        self.vendors_referenced = re.findall(vendor_pattern, self.description)
        
        # Extract form references
        form_pattern = r'\b(Form\s+\d{3}|FCC\s+Form\s+\d{3})\b'
        self.forms_referenced = re.findall(form_pattern, self.description, re.IGNORECASE)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "code": self.code,
            "description": self.description,
            "violation_type": self.violation_type.value,
            "evidence_needed": self.evidence_needed,
            "appealability": self.appealability,
            "key_dates": self.key_dates,
            "vendors_referenced": self.vendors_referenced,
            "forms_referenced": self.forms_referenced
        }


class DenialAnalyzer:
    """
    Analyzes FCDL denial comments and extracts structured information.
    
    FCDL comments typically use format: "DR1: reason||DR2: reason||MR1: modification"
    """
    
    def __init__(self, usac_client=None):
        """
        Initialize the denial analyzer.
        
        Args:
            usac_client: Optional USAC data client for fetching related data
        """
        self.usac_client = usac_client
    
    def parse_fcdl_comments(self, fcdl_comment: str) -> List[DenialReason]:
        """
        Parse FCDL comments into structured denial reasons.
        
        Args:
            fcdl_comment: Raw FCDL comment string
            
        Returns:
            List of DenialReason objects
        """
        if not fcdl_comment:
            return []
        
        reasons = []
        
        # Common FCDL delimiters
        delimiters = ['||', '|', ';', '\n']
        
        # Try to split by delimiters
        parts = [fcdl_comment]
        for delimiter in delimiters:
            new_parts = []
            for part in parts:
                new_parts.extend(part.split(delimiter))
            parts = new_parts
        
        # Parse each part
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            # Try to extract denial code (DR1, DR2, MR1, etc.)
            code_match = re.match(r'^([A-Z]{1,2}\d+)\s*[:\-]\s*(.+)$', part, re.IGNORECASE)
            
            if code_match:
                code = code_match.group(1).upper()
                description = code_match.group(2).strip()
            else:
                # No code found, use generic code
                code = f"DR{len(reasons) + 1}"
                description = part
            
            if description:
                reasons.append(DenialReason(code=code, description=description))
        
        return reasons
    
    def analyze_denial(self, application_number: str = None, frn: str = None, fcdl_comment: str = None) -> Dict[str, Any]:
        """
        Perform comprehensive denial analysis.
        
        Args:
            application_number: Optional application number
            frn: Optional FRN
            fcdl_comment: FCDL comment to analyze
            
        Returns:
            Complete analysis with reasons, recommendations, and next steps
        """
        if not fcdl_comment:
            return {
                "success": False,
                "error": "No FCDL comment provided for analysis"
            }
        
        reasons = self.parse_fcdl_comments(fcdl_comment)
        
        # Calculate overall appealability
        appealability_scores = {"high": 3, "medium": 2, "low": 1}
        if reasons:
            avg_score = sum(appealability_scores.get(r.appealability, 2) for r in reasons) / len(reasons)
            if avg_score >= 2.5:
                overall_appealability = "high"
            elif avg_score >= 1.5:
                overall_appealability = "medium"
            else:
                overall_appealability = "low"
        else:
            overall_appealability = "unknown"
        
        # Aggregate evidence needs
        all_evidence = set()
        for reason in reasons:
            all_evidence.update(reason.evidence_needed)
        
        # Aggregate violation types
        violation_types = list(set(r.violation_type.value for r in reasons))
        
        return {
            "success": True,
            "application_number": application_number,
            "frn": frn,
            "reasons": [r.to_dict() for r in reasons],
            "reason_count": len(reasons),
            "violation_types": violation_types,
            "overall_appealability": overall_appealability,
            "recommended_evidence": list(all_evidence),
            "next_steps": self._generate_next_steps(reasons, overall_appealability)
        }
    
    def _generate_next_steps(self, reasons: List[DenialReason], appealability: str) -> List[str]:
        """Generate recommended next steps based on analysis."""
        steps = []
        
        if appealability == "high":
            steps.append("This denial appears highly appealable - gather evidence immediately")
            steps.append("Contact USAC for clarification on specific violation points")
        elif appealability == "medium":
            steps.append("Review denial reasons carefully to assess appeal viability")
            steps.append("Gather all available documentation before deciding on appeal")
        else:
            steps.append("This denial may be difficult to appeal successfully")
            steps.append("Consider consulting with E-Rate compliance specialist")
        
        # Add specific steps based on violation types
        violation_types = set(r.violation_type for r in reasons)
        
        if ViolationType.COMPETITIVE_BIDDING in violation_types:
            steps.append("Review Form 470 posting and all vendor communications")
        
        if ViolationType.DOCUMENTATION in violation_types:
            steps.append("Locate all original signed documents and timestamps")
        
        if ViolationType.TIMING in violation_types:
            steps.append("Check for any system issues or deadline extension notices")
        
        return steps
