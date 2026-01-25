"""
Denial Analyzer Service for SkyRate AI v2
Wraps the legacy denial_analyzer module with FastAPI-friendly interface.

This service provides:
- FCDL comment parsing
- Denial reason classification
- Evidence extraction
- Appeal deadline calculation
- Form 470/472 correlation
"""

import sys
import os
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta

# Add backend directory to path for utils imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from utils.denial_analyzer import DenialAnalyzer, DenialReason
from utils.usac_client import USACDataClient


class DenialService:
    """
    FastAPI service wrapper for denial analysis operations.
    Helps consultants identify and analyze denied applications.
    """
    
    _instance: Optional['DenialService'] = None
    
    def __new__(cls):
        """Singleton pattern for service instance."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._client = USACDataClient()
        self._analyzer = DenialAnalyzer(self._client)
        self._initialized = True
    
    @property
    def analyzer(self) -> DenialAnalyzer:
        """Access the underlying denial analyzer."""
        return self._analyzer
    
    # ==================== FCDL PARSING ====================
    
    def parse_fcdl_comments(self, fcdl_comment: str) -> List[Dict[str, Any]]:
        """
        Parse FCDL comments into structured denial reasons.
        
        FCDL comments format: "DR1: reason||DR2: reason||MR1: modification"
        
        Args:
            fcdl_comment: Raw FCDL comment string
            
        Returns:
            List of parsed denial reasons with classification
        """
        reasons = self._analyzer.parse_fcdl_comments(fcdl_comment)
        return [reason.to_dict() for reason in reasons]
    
    def classify_violation(self, violation_text: str) -> Dict[str, Any]:
        """
        Classify a single violation text.
        
        Args:
            violation_text: The violation description
            
        Returns:
            Classification with rule type and evidence
        """
        reason = DenialReason("UNKNOWN", violation_text)
        return reason.to_dict()
    
    # ==================== DENIAL DETAILS ====================
    
    def get_denial_details(
        self,
        application_number: Optional[str] = None,
        frn: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch comprehensive details for a denied application.
        
        Args:
            application_number: Application number
            frn: Funding Request Number
            
        Returns:
            Complete denial details including related forms
        """
        identifier = application_number or frn
        if not identifier:
            return None
        
        return self._analyzer.fetch_denial_details(identifier)
    
    def get_denial_summary(self, denial_details: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate summary of denial reasons grouped by type.
        
        Args:
            denial_details: Output from get_denial_details()
            
        Returns:
            Summary with counts, critical dates, key evidence
        """
        return self._analyzer.get_denial_summary(denial_details)
    
    # ==================== APPEAL DEADLINES ====================
    
    def calculate_appeal_deadline(self, fcdl_date: str) -> Dict[str, Any]:
        """
        Calculate appeal deadline from FCDL date.
        
        E-Rate appeals must be filed within 60 days of FCDL.
        
        Args:
            fcdl_date: FCDL date (ISO format or MM/DD/YYYY)
            
        Returns:
            Dictionary with deadline info and days remaining
        """
        try:
            # Parse various date formats
            parsed_date = None
            for fmt in ['%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%m/%d/%Y']:
                try:
                    parsed_date = datetime.strptime(fcdl_date.split('T')[0], fmt.split('T')[0])
                    break
                except:
                    continue
            
            if not parsed_date:
                return {"error": f"Unable to parse date: {fcdl_date}"}
            
            appeal_deadline = parsed_date + timedelta(days=60)
            days_remaining = (appeal_deadline - datetime.now()).days
            
            return {
                "fcdl_date": parsed_date.strftime('%Y-%m-%d'),
                "appeal_deadline": appeal_deadline.strftime('%Y-%m-%d'),
                "days_remaining": days_remaining,
                "is_expired": days_remaining < 0,
                "urgency": self._get_urgency_level(days_remaining)
            }
            
        except Exception as e:
            return {"error": str(e)}
    
    def _get_urgency_level(self, days_remaining: int) -> str:
        """Determine urgency level based on days remaining."""
        if days_remaining < 0:
            return "EXPIRED"
        elif days_remaining < 7:
            return "CRITICAL"
        elif days_remaining < 14:
            return "URGENT"
        elif days_remaining < 30:
            return "HIGH"
        elif days_remaining < 45:
            return "MEDIUM"
        else:
            return "LOW"
    
    # ==================== BATCH ANALYSIS ====================
    
    def analyze_denials_batch(
        self,
        applications: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Analyze multiple denied applications.
        
        Args:
            applications: List of application records
            
        Returns:
            Batch analysis with statistics and patterns
        """
        results = {
            "total_analyzed": len(applications),
            "total_denied_amount": 0.0,
            "by_violation_type": {},
            "by_urgency": {},
            "applications": []
        }
        
        for app in applications:
            # Get FCDL comment
            fcdl = app.get('fcdl_comment_frn', '')
            if not fcdl:
                continue
            
            # Parse violations
            violations = self.parse_fcdl_comments(fcdl)
            
            # Calculate deadline if FCDL date available
            deadline_info = None
            if app.get('fcdl_letter_date'):
                deadline_info = self.calculate_appeal_deadline(app['fcdl_letter_date'])
            
            # Track statistics
            amount = float(app.get('original_total_pre_discount_costs', 0) or 0)
            results["total_denied_amount"] += amount
            
            for v in violations:
                rule_type = v.get('rule_type', 'other')
                results["by_violation_type"][rule_type] = results["by_violation_type"].get(rule_type, 0) + 1
            
            if deadline_info and 'urgency' in deadline_info:
                urgency = deadline_info['urgency']
                results["by_urgency"][urgency] = results["by_urgency"].get(urgency, 0) + 1
            
            # Add to results
            results["applications"].append({
                "application_number": app.get('application_number'),
                "organization_name": app.get('organization_name'),
                "state": app.get('state'),
                "denied_amount": amount,
                "violations": violations,
                "deadline_info": deadline_info
            })
        
        return results
    
    # ==================== VIOLATION PATTERNS ====================
    
    def get_common_violations(self, year: Optional[int] = None, state: Optional[str] = None) -> Dict[str, Any]:
        """
        Get statistics on common violation types.
        
        Args:
            year: Optional funding year filter
            state: Optional state filter
            
        Returns:
            Statistics on violation frequency and patterns
        """
        # Fetch denied applications
        filters = {'application_status': 'Denied'}
        if state:
            filters['state'] = state.upper()
        
        df = self._client.fetch_data(year=year, filters=filters, limit=1000, dataset='form_471')
        
        if df.empty:
            return {"total": 0, "violations": {}}
        
        # Analyze violations
        violation_counts = {}
        
        for _, row in df.iterrows():
            fcdl = row.get('fcdl_comment_frn', '')
            if fcdl:
                violations = self.parse_fcdl_comments(fcdl)
                for v in violations:
                    rule_type = v.get('rule_type', 'other')
                    violation_counts[rule_type] = violation_counts.get(rule_type, 0) + 1
        
        return {
            "total_applications": len(df),
            "violations": violation_counts,
            "filters_applied": {"year": year, "state": state}
        }


# Singleton accessor
def get_denial_service() -> DenialService:
    """Get the denial service singleton instance."""
    return DenialService()
