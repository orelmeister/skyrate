"""
Appeals Strategy Module for SkyRate AI
Generates comprehensive appeal strategies for denied E-Rate applications.

This module provides:
- Appeal strategy generation
- Timeline planning with milestones
- Document checklists
- Success probability assessment
- Violation-specific remediation guidance
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class AppealMilestone:
    """Represents a milestone in the appeal timeline."""
    name: str
    description: str
    due_date: datetime
    priority: str = "medium"
    completed: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "due_date": self.due_date.isoformat(),
            "days_until_due": (self.due_date - datetime.now()).days,
            "priority": self.priority,
            "completed": self.completed
        }


class AppealsStrategy:
    """
    Generates comprehensive appeal strategies for E-Rate denials.
    
    Features:
    - Multi-violation strategy generation
    - Timeline and milestone planning
    - Document checklist creation
    - Success probability assessment
    """
    
    # Standard appeal window is 60 days from FCDL date
    DEFAULT_APPEAL_WINDOW_DAYS = 60
    
    # Evidence requirements by violation type
    EVIDENCE_REQUIREMENTS = {
        "competitive_bidding": [
            {"item": "Form 470 Posting Confirmation", "required": True, "description": "Proof of 28-day posting"},
            {"item": "Bid Evaluation Matrix", "required": True, "description": "Documentation of price/service comparison"},
            {"item": "Vendor Response Records", "required": True, "description": "All bids received"},
            {"item": "Selection Rationale", "required": True, "description": "Written explanation of vendor selection"},
            {"item": "Board Meeting Minutes", "required": False, "description": "If board approval was required"}
        ],
        "documentation": [
            {"item": "Original Signed Documents", "required": True, "description": "All required certifications"},
            {"item": "Date-Stamped Records", "required": True, "description": "Proof of timely filing"},
            {"item": "Email Correspondence", "required": False, "description": "Communication trail with USAC/vendors"},
            {"item": "System Screenshots", "required": False, "description": "If relevant to documentation timing"}
        ],
        "eligibility": [
            {"item": "Entity Eligibility Documentation", "required": True, "description": "Proof of eligible entity status"},
            {"item": "NSLP Data", "required": True, "description": "National School Lunch Program participation"},
            {"item": "Alternative Discount Documentation", "required": False, "description": "If using alternative mechanism"},
            {"item": "Service Eligibility Confirmation", "required": True, "description": "Proof services are E-Rate eligible"}
        ],
        "timing": [
            {"item": "Submission Timestamps", "required": True, "description": "System-generated proof of filing time"},
            {"item": "System Outage Documentation", "required": False, "description": "If USAC systems were down"},
            {"item": "Prior Communication", "required": False, "description": "Evidence of intent to file on time"},
            {"item": "Extension Request Records", "required": False, "description": "If extension was requested"}
        ],
        "cost_allocation": [
            {"item": "Cost Allocation Methodology", "required": True, "description": "Detailed calculation explanation"},
            {"item": "Service Inventory", "required": True, "description": "List of all services and eligible portions"},
            {"item": "Supporting Calculations", "required": True, "description": "Spreadsheets showing allocation"},
            {"item": "Usage Data", "required": False, "description": "If allocation based on usage"}
        ]
    }
    
    def __init__(self):
        """Initialize the appeals strategy generator."""
        pass
    
    def generate_strategy(self, denial_details: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate comprehensive appeals strategy.
        
        Args:
            denial_details: Denial analysis from DenialAnalyzer
            
        Returns:
            Complete strategy with timeline, checklist, recommendations
        """
        if not denial_details:
            return {"success": False, "error": "No denial details provided"}
        
        # Extract key information
        reasons = denial_details.get("reasons", [])
        violation_types = denial_details.get("violation_types", [])
        overall_appealability = denial_details.get("overall_appealability", "medium")
        
        # Generate strategy components
        executive_summary = self._generate_executive_summary(denial_details)
        timeline = self._generate_timeline(denial_details)
        checklist = self._generate_checklist(violation_types)
        violation_analysis = self._analyze_violations(reasons)
        success_assessment = self._assess_success_probability(denial_details)
        appeal_letter_outline = self._generate_letter_outline(denial_details)
        
        return {
            "success": True,
            "generated_at": datetime.now().isoformat(),
            "executive_summary": executive_summary,
            "timeline": timeline,
            "document_checklist": checklist,
            "violation_analysis": violation_analysis,
            "success_assessment": success_assessment,
            "appeal_letter_outline": appeal_letter_outline,
            "recommendations": self._generate_recommendations(denial_details)
        }
    
    def _generate_executive_summary(self, denial_details: Dict[str, Any]) -> Dict[str, Any]:
        """Generate executive summary of the appeal strategy."""
        reasons = denial_details.get("reasons", [])
        violation_types = denial_details.get("violation_types", [])
        appealability = denial_details.get("overall_appealability", "medium")
        
        return {
            "total_violations": len(reasons),
            "violation_categories": violation_types,
            "overall_appealability": appealability,
            "recommended_action": self._get_recommended_action(appealability),
            "estimated_preparation_time": f"{len(reasons) * 5 + 10} hours",
            "key_focus_areas": violation_types[:3] if violation_types else ["documentation review"]
        }
    
    def _get_recommended_action(self, appealability: str) -> str:
        """Get recommended action based on appealability."""
        actions = {
            "high": "Strongly recommend proceeding with appeal - gather evidence immediately",
            "medium": "Appeal may be viable - conduct thorough evidence review before deciding",
            "low": "Appeal success is unlikely - consider cost-benefit before proceeding"
        }
        return actions.get(appealability, "Review denial details before deciding")
    
    def _generate_timeline(self, denial_details: Dict[str, Any], fcdl_date: Optional[str] = None) -> Dict[str, Any]:
        """Generate appeal timeline with milestones."""
        # Default to 60 days from now if no FCDL date
        if fcdl_date:
            try:
                start_date = datetime.fromisoformat(fcdl_date.replace('T00:00:00.000', ''))
            except:
                start_date = datetime.now()
        else:
            start_date = datetime.now()
        
        deadline = start_date + timedelta(days=self.DEFAULT_APPEAL_WINDOW_DAYS)
        days_remaining = (deadline - datetime.now()).days
        
        milestones = []
        
        # Phase 1: Evidence Gathering (first 2 weeks)
        milestones.append(AppealMilestone(
            name="Evidence Gathering",
            description="Collect all documents listed in the checklist",
            due_date=datetime.now() + timedelta(days=14),
            priority="high"
        ))
        
        # Phase 2: Violation Analysis (week 2-3)
        milestones.append(AppealMilestone(
            name="Violation Analysis",
            description="Review each violation and prepare counter-arguments",
            due_date=datetime.now() + timedelta(days=21),
            priority="high"
        ))
        
        # Phase 3: Draft Appeal Letter (week 3-4)
        milestones.append(AppealMilestone(
            name="Draft Appeal Letter",
            description="Write initial appeal letter draft",
            due_date=datetime.now() + timedelta(days=28),
            priority="high"
        ))
        
        # Phase 4: Internal Review (week 4-5)
        milestones.append(AppealMilestone(
            name="Internal Review",
            description="Review appeal with stakeholders and legal counsel if needed",
            due_date=datetime.now() + timedelta(days=35),
            priority="medium"
        ))
        
        # Phase 5: Final Preparation (1 week before deadline)
        milestones.append(AppealMilestone(
            name="Final Preparation",
            description="Finalize all documents and prepare submission package",
            due_date=deadline - timedelta(days=7),
            priority="high"
        ))
        
        # Phase 6: Submission (3 days before deadline)
        milestones.append(AppealMilestone(
            name="Submit Appeal",
            description="Submit appeal to USAC with all supporting documentation",
            due_date=deadline - timedelta(days=3),
            priority="critical"
        ))
        
        return {
            "start_date": start_date.isoformat(),
            "deadline": deadline.isoformat(),
            "days_remaining": max(0, days_remaining),
            "milestones": [m.to_dict() for m in milestones],
            "urgency": "critical" if days_remaining < 14 else "high" if days_remaining < 30 else "normal"
        }
    
    def _generate_checklist(self, violation_types: List[str]) -> List[Dict[str, Any]]:
        """Generate document checklist based on violation types."""
        checklist = []
        seen_items = set()
        
        for vtype in violation_types:
            requirements = self.EVIDENCE_REQUIREMENTS.get(vtype, [])
            for req in requirements:
                if req["item"] not in seen_items:
                    checklist.append({
                        **req,
                        "violation_type": vtype,
                        "collected": False
                    })
                    seen_items.add(req["item"])
        
        # Add general requirements
        general_items = [
            {"item": "FCDL Letter Copy", "required": True, "description": "Copy of the denial letter"},
            {"item": "Application Summary", "required": True, "description": "Form 471 application details"},
            {"item": "Appeal Letter", "required": True, "description": "Formal appeal letter"}
        ]
        
        for item in general_items:
            if item["item"] not in seen_items:
                checklist.append({
                    **item,
                    "violation_type": "general",
                    "collected": False
                })
        
        # Sort by required first, then alphabetically
        checklist.sort(key=lambda x: (not x["required"], x["item"]))
        
        return checklist
    
    def _analyze_violations(self, reasons: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Analyze each violation and provide specific guidance."""
        analysis = []
        
        for reason in reasons:
            violation_analysis = {
                "code": reason.get("code", "UNKNOWN"),
                "description": reason.get("description", ""),
                "violation_type": reason.get("violation_type", "unknown"),
                "appealability": reason.get("appealability", "medium"),
                "counter_argument_approach": self._get_counter_argument(reason),
                "key_evidence": reason.get("evidence_needed", []),
                "common_pitfalls": self._get_common_pitfalls(reason.get("violation_type", "unknown"))
            }
            analysis.append(violation_analysis)
        
        return analysis
    
    def _get_counter_argument(self, reason: Dict[str, Any]) -> str:
        """Get recommended counter-argument approach for a violation."""
        vtype = reason.get("violation_type", "unknown")
        
        approaches = {
            "competitive_bidding": "Demonstrate compliance with competitive bidding requirements through Form 470 documentation and bid evaluation records. Focus on showing the selection process was fair and properly documented.",
            "documentation": "Provide the missing or disputed documentation with timestamps and signatures. Explain any discrepancies and provide context for the documentation.",
            "eligibility": "Submit evidence of entity eligibility and service eligibility. If there's a factual error in USAC's determination, provide clear evidence to the contrary.",
            "timing": "If filing was timely, provide system timestamps. If late, explain circumstances and request waiver if extenuating circumstances existed.",
            "cost_allocation": "Provide detailed cost allocation methodology with supporting calculations. Demonstrate how eligible and ineligible costs were properly separated.",
            "gift_rule": "Demonstrate that no improper gifts or incentives were offered. Document all vendor interactions and their proper business context."
        }
        
        return approaches.get(vtype, "Review the specific violation and gather all relevant supporting documentation. Consult E-Rate compliance resources for guidance on this violation type.")
    
    def _get_common_pitfalls(self, violation_type: str) -> List[str]:
        """Get common pitfalls to avoid for each violation type."""
        pitfalls = {
            "competitive_bidding": [
                "Failing to post Form 470 for full 28 days",
                "Not documenting price as the primary factor",
                "Incomplete bid evaluation documentation"
            ],
            "documentation": [
                "Missing signatures or dates",
                "Submitting copies instead of originals when required",
                "Inconsistent dates across documents"
            ],
            "eligibility": [
                "Incorrect NSLP calculation",
                "Including ineligible services in request",
                "Entity status changes not reported"
            ],
            "timing": [
                "Missing filing deadlines",
                "Late service delivery notifications",
                "Expired contracts"
            ],
            "cost_allocation": [
                "Incorrect allocation percentages",
                "Missing supporting calculations",
                "Including ineligible components"
            ]
        }
        
        return pitfalls.get(violation_type, ["Review E-Rate rules for this specific violation type"])
    
    def _assess_success_probability(self, denial_details: Dict[str, Any]) -> Dict[str, Any]:
        """Assess the probability of a successful appeal."""
        appealability = denial_details.get("overall_appealability", "medium")
        reasons = denial_details.get("reasons", [])
        
        # Base probability
        base_probability = {"high": 70, "medium": 45, "low": 20}.get(appealability, 45)
        
        # Adjust based on number of violations
        violation_penalty = min(20, len(reasons) * 5)
        
        # Calculate final probability
        final_probability = max(10, base_probability - violation_penalty)
        
        return {
            "success_probability": f"{final_probability}%",
            "confidence_level": appealability,
            "factors_increasing_success": [
                "Strong documentation of compliance",
                "Clear evidence of factual errors in denial",
                "First-time violation"
            ],
            "factors_decreasing_success": [
                f"Multiple violations ({len(reasons)})" if len(reasons) > 1 else None,
                "Repeat violations" if any("repeat" in str(r).lower() for r in reasons) else None,
                "Missing key documentation"
            ],
            "recommendation": self._get_probability_recommendation(final_probability)
        }
    
    def _get_probability_recommendation(self, probability: int) -> str:
        """Get recommendation based on success probability."""
        if probability >= 60:
            return "Proceed with appeal - good chance of success with proper documentation"
        elif probability >= 40:
            return "Appeal is viable but gather strong evidence before proceeding"
        elif probability >= 25:
            return "Consider carefully - appeal may not be worth the effort"
        else:
            return "Appeal unlikely to succeed - consult compliance specialist before proceeding"
    
    def _generate_letter_outline(self, denial_details: Dict[str, Any]) -> Dict[str, Any]:
        """Generate outline for the appeal letter."""
        reasons = denial_details.get("reasons", [])
        
        return {
            "sections": [
                {
                    "title": "Introduction",
                    "content": "Identify the application, FRN, and FCDL date. State intent to appeal."
                },
                {
                    "title": "Background",
                    "content": "Provide context about the applicant and the funding request."
                },
                {
                    "title": "Violation Response",
                    "content": f"Address each of the {len(reasons)} violations individually with evidence."
                },
                {
                    "title": "Supporting Evidence",
                    "content": "Reference all attached documentation that supports the appeal."
                },
                {
                    "title": "Conclusion",
                    "content": "Summarize key points and request specific relief (full/partial funding)."
                }
            ],
            "estimated_length": f"{max(3, len(reasons) + 2)} pages",
            "tone_guidance": "Professional, factual, and non-confrontational. Focus on compliance demonstration."
        }
    
    def _generate_recommendations(self, denial_details: Dict[str, Any]) -> List[str]:
        """Generate specific recommendations for the appeal."""
        recommendations = [
            "Start gathering documentation immediately",
            "Create a timeline working backwards from the appeal deadline",
            "Document all evidence with clear labels and references"
        ]
        
        appealability = denial_details.get("overall_appealability", "medium")
        
        if appealability == "high":
            recommendations.insert(0, "This denial appears highly appealable - prioritize this appeal")
        elif appealability == "low":
            recommendations.append("Consider consulting with E-Rate compliance specialist before investing significant time")
        
        return recommendations
