"""
Appeals Strategy Service for SkyRate AI v2
Wraps the legacy appeals_strategy module with FastAPI-friendly interface.

This service provides:
- Appeal strategy generation
- Timeline and milestone planning
- Document checklist creation
- Violation-specific remediation guidance
- Success probability assessment
"""

import sys
import os
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta

# Import the legacy strategy generator from skyrate-ai
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'skyrate-ai'))
from utils.appeals_strategy import AppealsStrategy


class AppealsService:
    """
    FastAPI service wrapper for appeals strategy generation.
    Premium feature for consultant subscribers.
    """
    
    _instance: Optional['AppealsService'] = None
    
    def __new__(cls):
        """Singleton pattern for service instance."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._strategy = AppealsStrategy()
        self._initialized = True
    
    @property
    def strategy(self) -> AppealsStrategy:
        """Access the underlying strategy generator."""
        return self._strategy
    
    # ==================== STRATEGY GENERATION ====================
    
    def generate_full_strategy(self, denial_details: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate comprehensive appeals strategy.
        
        Args:
            denial_details: Output from DenialService.get_denial_details()
            
        Returns:
            Complete strategy with timeline, checklist, recommendations
        """
        return self._strategy.generate_strategy(denial_details)
    
    def get_executive_summary(self, denial_details: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate executive summary only.
        
        Args:
            denial_details: Denial details
            
        Returns:
            Executive summary with key metrics
        """
        return self._strategy._generate_executive_summary(denial_details)
    
    # ==================== TIMELINE ====================
    
    def generate_timeline(
        self,
        appeal_deadline: str,
        start_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate appeal timeline with milestones.
        
        Args:
            appeal_deadline: Appeal deadline (ISO format)
            start_date: Optional start date (defaults to today)
            
        Returns:
            Timeline with milestones and due dates
        """
        try:
            deadline = datetime.fromisoformat(appeal_deadline.replace('T00:00:00.000', ''))
            start = datetime.fromisoformat(start_date) if start_date else datetime.now()
            
            days_remaining = (deadline - datetime.now()).days
            
            milestones = []
            
            # Final submission (3 days before deadline)
            submit_date = deadline - timedelta(days=3)
            if submit_date > start:
                milestones.append({
                    'phase': 'SUBMIT',
                    'task': 'Submit appeal via EPC',
                    'due_date': submit_date.strftime('%Y-%m-%d'),
                    'days_from_now': (submit_date - datetime.now()).days,
                    'description': 'Final submission of complete appeal package',
                    'status': 'pending'
                })
            
            # Review phase (5 days before submission)
            review_date = submit_date - timedelta(days=5)
            if review_date > start:
                milestones.append({
                    'phase': 'REVIEW',
                    'task': 'Internal review and approval',
                    'due_date': review_date.strftime('%Y-%m-%d'),
                    'days_from_now': (review_date - datetime.now()).days,
                    'description': 'Legal counsel and management review',
                    'status': 'pending'
                })
            
            # Draft completion (7 days before review)
            draft_date = review_date - timedelta(days=7)
            if draft_date > start:
                milestones.append({
                    'phase': 'DRAFT',
                    'task': 'Complete appeal letter draft',
                    'due_date': draft_date.strftime('%Y-%m-%d'),
                    'days_from_now': (draft_date - datetime.now()).days,
                    'description': 'Finish writing appeal addressing all violations',
                    'status': 'pending'
                })
            
            # Evidence gathering (10 days before draft)
            evidence_date = draft_date - timedelta(days=10)
            if evidence_date > start:
                milestones.append({
                    'phase': 'EVIDENCE',
                    'task': 'Complete evidence gathering',
                    'due_date': evidence_date.strftime('%Y-%m-%d'),
                    'days_from_now': (evidence_date - datetime.now()).days,
                    'description': 'Collect all supporting documents and emails',
                    'status': 'pending'
                })
            
            # Start immediately
            milestones.insert(0, {
                'phase': 'START',
                'task': 'Begin evidence collection',
                'due_date': start.strftime('%Y-%m-%d'),
                'days_from_now': 0,
                'description': 'Start gathering documents immediately',
                'status': 'active'
            })
            
            return {
                'appeal_deadline': deadline.strftime('%Y-%m-%d'),
                'days_remaining': days_remaining,
                'milestones': milestones,
                'is_feasible': days_remaining >= 20,
                'recommended_action': 'PROCEED' if days_remaining >= 20 else 'EXPEDITE' if days_remaining >= 10 else 'CRITICAL'
            }
            
        except Exception as e:
            return {'error': str(e)}
    
    # ==================== DOCUMENT CHECKLIST ====================
    
    def generate_document_checklist(
        self,
        denial_details: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Generate document checklist for appeal.
        
        Args:
            denial_details: Denial details with violation info
            
        Returns:
            Categorized checklist of required documents
        """
        return self._strategy._generate_document_checklist(denial_details)
    
    def get_base_documents(self) -> List[Dict[str, Any]]:
        """
        Get list of always-required base documents.
        
        Returns:
            List of base document requirements
        """
        return [
            {
                'document': 'Copy of FCDL (Funding Commitment Decision Letter)',
                'source': 'EPC Portal',
                'critical': True,
                'notes': 'Must be the official letter showing denial'
            },
            {
                'document': 'Entity profile information',
                'source': 'EPC account details',
                'critical': True,
                'notes': 'Verify BEN and contact information'
            },
            {
                'document': 'Original Form 471 application',
                'source': 'EPC submission records',
                'critical': True,
                'notes': 'Include all FRNs and line items'
            },
            {
                'document': 'Form 470 posting(s)',
                'source': 'EPC',
                'critical': True,
                'notes': 'Include posting timestamp'
            }
        ]
    
    # ==================== VIOLATION ANALYSIS ====================
    
    def get_rule_info(self, rule_type: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a specific rule.
        
        Args:
            rule_type: Rule type identifier (e.g., 'mini_bid_process')
            
        Returns:
            Rule details with remediation guidance
        """
        return self._strategy.RULE_DATABASE.get(rule_type)
    
    def get_all_rules(self) -> Dict[str, Any]:
        """
        Get all rules in the database.
        
        Returns:
            Complete rule database
        """
        return self._strategy.RULE_DATABASE
    
    def analyze_violations(
        self,
        denial_details: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Analyze violations with remediation guidance.
        
        Args:
            denial_details: Denial details with violations
            
        Returns:
            List of analyzed violations with guidance
        """
        return self._strategy._analyze_violations(denial_details)
    
    # ==================== SUCCESS ASSESSMENT ====================
    
    def assess_success_probability(
        self,
        denial_details: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Assess probability of successful appeal.
        
        Args:
            denial_details: Denial details
            
        Returns:
            Success probability assessment
        """
        if not denial_details or 'denial_reasons' not in denial_details:
            return {'error': 'Invalid denial details'}
        
        violations = denial_details['denial_reasons']
        total_violations = len(violations)
        
        if total_violations == 0:
            return {
                'overall': 'UNKNOWN',
                'score': 0,
                'factors': ['No violations found in denial details']
            }
        
        # Assess each violation
        high_success = 0
        medium_success = 0
        low_success = 0
        
        factors = []
        
        for v in violations:
            rule_type = v.get('rule_type', 'other')
            rule_info = self.get_rule_info(rule_type)
            
            if rule_info:
                # Check evidence availability
                has_key_evidence = bool(v.get('evidence', {}))
                
                if has_key_evidence:
                    high_success += 1
                    factors.append(f"{v.get('violation_id', 'V')}: Evidence available - favorable")
                else:
                    medium_success += 1
                    factors.append(f"{v.get('violation_id', 'V')}: May need additional evidence")
            else:
                # Unknown rule type
                medium_success += 1
                factors.append(f"{v.get('violation_id', 'V')}: Rule type '{rule_type}' - case-by-case")
        
        # Calculate overall score
        score = (high_success * 3 + medium_success * 2 + low_success * 1) / (total_violations * 3) * 100
        
        if score >= 70:
            overall = 'HIGH'
        elif score >= 50:
            overall = 'MEDIUM'
        else:
            overall = 'LOW'
        
        return {
            'overall': overall,
            'score': round(score, 1),
            'breakdown': {
                'high_probability': high_success,
                'medium_probability': medium_success,
                'low_probability': low_success,
                'total_violations': total_violations
            },
            'factors': factors,
            'recommendation': self._get_recommendation(overall, denial_details)
        }
    
    def _get_recommendation(self, probability: str, denial_details: Dict) -> str:
        """Get recommendation based on probability and amount."""
        amount = denial_details.get('total_denied_amount', 0)
        
        if probability == 'HIGH':
            return f"Strong appeal opportunity. ${amount:,.2f} at stake. Recommend proceeding immediately."
        elif probability == 'MEDIUM':
            if amount > 50000:
                return f"Moderate success chance but ${amount:,.2f} justifies appeal attempt. Gather additional evidence."
            else:
                return "Moderate success chance. Consider cost-benefit of appeal preparation time."
        else:
            if amount > 100000:
                return f"Lower success probability but ${amount:,.2f} warrants careful review. Consult E-Rate specialist."
            else:
                return "Lower success probability. Focus evidence gathering on strongest violation arguments."
    
    # ==================== APPEAL LETTER ====================
    
    def generate_appeal_outline(
        self,
        denial_details: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate appeal letter outline.
        
        Args:
            denial_details: Denial details
            
        Returns:
            Structured outline for appeal letter
        """
        return self._strategy._generate_appeal_outline(denial_details)


# Singleton accessor
def get_appeals_service() -> AppealsService:
    """Get the appeals service singleton instance."""
    return AppealsService()
