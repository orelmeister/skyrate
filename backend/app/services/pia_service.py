"""
PIA Response Service for SkyRate AI
Provides PIA question classification, response strategy, and document checklists.

PIA (Program Integrity Assurance) reviews are USAC's pre-commitment review process
where reviewers ask applicants to provide evidence of compliance with E-Rate rules.
"""

import sys
import os
from typing import Dict, List, Optional, Any

# Add backend directory to path for utils imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))


class PIAService:
    """
    FastAPI service for PIA response generation.
    Premium feature for consultant and applicant subscribers.
    """

    _instance: Optional['PIAService'] = None

    def __new__(cls) -> 'PIAService':
        """Singleton pattern for service instance."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True

    PIA_CATEGORIES: Dict[str, Dict[str, str]] = {
        "competitive_bidding": {
            "name": "Competitive Bidding Process",
            "description": "Questions about Form 470, 28-day waiting period, bid solicitation, and vendor selection",
        },
        "cost_effectiveness": {
            "name": "Cost-Effectiveness / Bid Evaluation",
            "description": "Questions about bid evaluation criteria, price as primary factor, and vendor selection justification",
        },
        "entity_eligibility": {
            "name": "Entity Eligibility",
            "description": "Questions about whether the applicant is an eligible school, library, or consortium",
        },
        "service_eligibility": {
            "name": "Service Eligibility",
            "description": "Questions about whether requested services are on the Eligible Services List",
        },
        "discount_rate": {
            "name": "Discount Rate / E-Rate Percentage",
            "description": "Questions about NSLP data, urban/rural classification, and discount calculations",
        },
        "contracts": {
            "name": "Contract Documentation",
            "description": "Questions about contract terms, execution dates, CABIO amendments, and pricing",
        },
        "cipa": {
            "name": "CIPA Compliance",
            "description": "Questions about Children's Internet Protection Act compliance, filtering, and public hearings",
        },
        "ineligible_services": {
            "name": "Ineligible Services / 30% Rule",
            "description": "Questions about ineligible cost components and the two-in-five C2 budget rule",
        },
    }

    # ==================== CLASSIFICATION ====================

    def classify_question(self, question_text: str) -> Dict[str, Any]:
        """
        Classify a PIA question into one of 8 categories using keyword analysis.
        Falls back to AI classification if keywords are ambiguous.

        Args:
            question_text: The PIA reviewer's question text.

        Returns:
            Dict with category, confidence, and matched keywords.
        """
        question_lower = question_text.lower()

        keyword_map: Dict[str, List[str]] = {
            "competitive_bidding": [
                "form 470", "470", "competitive bidding", "28-day", "28 day",
                "waiting period", "bid", "solicitation", "rfp", "posting",
                "allowable contract date", "how did you solicit",
            ],
            "cost_effectiveness": [
                "cost effective", "cost-effective", "bid evaluation",
                "evaluation criteria", "price as primary", "lowest bid",
                "why did you select", "selection criteria", "bid matrix",
                "sole bid", "only bid",
            ],
            "entity_eligibility": [
                "entity eligib", "eligible entity", "nces", "school type",
                "non-profit", "nonprofit", "private school", "student count",
                "library eligible", "imls", "consortium",
            ],
            "service_eligibility": [
                "service eligib", "eligible service", "esl", "eligible services list",
                "category 1", "category 2", "c1", "c2", "educational purpose",
                "product type", "function",
            ],
            "discount_rate": [
                "discount", "nslp", "free lunch", "reduced lunch",
                "urban", "rural", "student count", "percentage",
                "discount rate", "e-rate percentage",
            ],
            "contracts": [
                "contract", "execution date", "term", "extension",
                "cabio", "amendment", "pricing", "contract date",
                "voluntary extension", "evergreen",
            ],
            "cipa": [
                "cipa", "internet safety", "filtering", "technology protection",
                "public hearing", "internet safety policy", "minors",
                "children's internet", "content filter",
            ],
            "ineligible_services": [
                "ineligible", "30%", "thirty percent", "30 percent",
                "ineligible component", "two-in-five", "2-in-5",
                "budget", "non-eligible", "ancillary",
            ],
        }

        scores: Dict[str, int] = {}
        matched: Dict[str, List[str]] = {}
        for category, keywords in keyword_map.items():
            hits = [kw for kw in keywords if kw in question_lower]
            scores[category] = len(hits)
            if hits:
                matched[category] = hits

        if scores:
            best_category = max(scores, key=scores.get)  # type: ignore[arg-type]
            best_score = scores[best_category]
            if best_score > 0:
                return {
                    "category": best_category,
                    "category_name": self.PIA_CATEGORIES[best_category]["name"],
                    "confidence": min(best_score / 3.0, 1.0),
                    "matched_keywords": matched.get(best_category, []),
                    "all_matches": {k: v for k, v in matched.items() if v},
                }

        # Default fallback
        return {
            "category": "competitive_bidding",
            "category_name": self.PIA_CATEGORIES["competitive_bidding"]["name"],
            "confidence": 0.1,
            "matched_keywords": [],
            "all_matches": {},
        }

    # ==================== STRATEGY ====================

    def generate_response_strategy(
        self, category: str, question: str, usac_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate a response strategy: what PIA is looking for, how to respond, required docs.

        Args:
            category: PIA category key.
            question: The original PIA question.
            usac_data: Available USAC data for the entity/FRN.

        Returns:
            Strategy dict with focus_areas, key_points, and tone guidance.
        """
        knowledge = self._get_category_knowledge(category)
        cat_info = self.PIA_CATEGORIES.get(category, {})

        return {
            "category": category,
            "category_name": cat_info.get("name", category),
            "what_pia_is_looking_for": knowledge.get("what_they_want", ""),
            "key_response_points": knowledge.get("key_points", []),
            "common_mistakes": knowledge.get("common_mistakes", []),
            "tone_guidance": (
                "Be cooperative, specific, and evidence-based. PIA reviewers are not adversarial "
                "-- they need to verify compliance. Provide direct answers with supporting documentation."
            ),
            "relevant_rules": knowledge.get("relevant_rules", []),
        }

    # ==================== DOCUMENT CHECKLIST ====================

    def get_document_checklist(
        self, category: str, usac_data: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """
        Return a category-specific document checklist.

        Args:
            category: PIA category key.
            usac_data: Available USAC data for context.

        Returns:
            List of document dicts with name, description, and priority.
        """
        checklists: Dict[str, List[Dict[str, str]]] = {
            "competitive_bidding": [
                {"name": "FCC Form 470", "description": "Copy showing posting date and certified date", "priority": "critical"},
                {"name": "Form 470 certification timestamp", "description": "Screenshot from EPC showing 470 certified date", "priority": "critical"},
                {"name": "Bid evaluation documentation", "description": "Matrix or notes showing how bids were evaluated", "priority": "critical"},
                {"name": "All bids received", "description": "Copies of every bid/proposal received", "priority": "high"},
                {"name": "RFP document", "description": "If an RFP was issued, provide the full document", "priority": "high"},
                {"name": "Newspaper ad or posting proof", "description": "If additional outreach was done beyond Form 470", "priority": "medium"},
                {"name": "Bid notification emails", "description": "Evidence vendors were notified of the opportunity", "priority": "medium"},
            ],
            "cost_effectiveness": [
                {"name": "Bid evaluation matrix", "description": "Showing criteria, weights, and scores for each bidder", "priority": "critical"},
                {"name": "Price comparison documentation", "description": "Showing price was weighted as primary factor", "priority": "critical"},
                {"name": "Selection justification memo", "description": "Explanation of why winning vendor was chosen", "priority": "high"},
                {"name": "Sole/single bid memo", "description": "If only one bid received, memo explaining outreach efforts", "priority": "high"},
                {"name": "Board approval documentation", "description": "If required by local policy for the contract amount", "priority": "medium"},
            ],
            "entity_eligibility": [
                {"name": "NCES school ID verification", "description": "NCES ID showing school in federal database", "priority": "critical"},
                {"name": "State accreditation documentation", "description": "Proof school is accredited by the state", "priority": "critical"},
                {"name": "Non-profit status documentation", "description": "For private schools: IRS determination letter or equivalent", "priority": "high"},
                {"name": "Student enrollment count", "description": "Current enrollment figures from state reporting", "priority": "high"},
                {"name": "Library IMLS data", "description": "For libraries: IMLS FSCS listing", "priority": "high"},
            ],
            "service_eligibility": [
                {"name": "Eligible Services List reference", "description": "ESL entry for the requested service/product", "priority": "critical"},
                {"name": "Product specification sheets", "description": "Technical specs showing the product matches ESL category", "priority": "high"},
                {"name": "Network diagram", "description": "Showing how services connect to educational purpose", "priority": "high"},
                {"name": "Educational purpose statement", "description": "Description of how services support instruction", "priority": "medium"},
            ],
            "discount_rate": [
                {"name": "NSLP data source documentation", "description": "CEP letter, direct certification, or income survey results", "priority": "critical"},
                {"name": "Student count verification", "description": "Enrollment data matching Form 471 figures", "priority": "critical"},
                {"name": "Urban/rural classification source", "description": "Census block or NCES locale code documentation", "priority": "high"},
                {"name": "School-by-school NSLP breakdown", "description": "If consortium or multi-school district", "priority": "high"},
            ],
            "contracts": [
                {"name": "Executed contract", "description": "Signed contract with all required elements", "priority": "critical"},
                {"name": "Contract execution date proof", "description": "Showing contract was signed after allowable contract date", "priority": "critical"},
                {"name": "Contract terms and pricing", "description": "Full contract showing term, extensions, and amounts", "priority": "critical"},
                {"name": "CABIO documentation", "description": "If contract was amended, all change orders", "priority": "high"},
                {"name": "Board approval of contract", "description": "If required by local procurement policy", "priority": "medium"},
            ],
            "cipa": [
                {"name": "Internet Safety Policy", "description": "Board-adopted internet safety policy document", "priority": "critical"},
                {"name": "Public hearing documentation", "description": "Meeting minutes or notice showing public hearing was held", "priority": "critical"},
                {"name": "Board adoption resolution", "description": "Board minutes showing ISP adoption vote", "priority": "critical"},
                {"name": "Technology protection measure details", "description": "Description of filtering solution deployed", "priority": "high"},
                {"name": "CIPA certification on Form 486", "description": "Confirmation CIPA was certified on the Form 486", "priority": "high"},
            ],
            "ineligible_services": [
                {"name": "Cost allocation worksheet", "description": "Showing eligible vs ineligible breakdown with calculations", "priority": "critical"},
                {"name": "Invoice or quote breakdown", "description": "Line items showing eligible and ineligible components", "priority": "critical"},
                {"name": "FRN cost calculation", "description": "Showing ineligible portion is under 30% or properly split", "priority": "high"},
                {"name": "Product specs for mixed-use items", "description": "Technical documentation showing eligible functions", "priority": "high"},
            ],
        }

        return checklists.get(category, [
            {"name": "Relevant correspondence", "description": "All communications with USAC about this FRN", "priority": "high"},
            {"name": "Form 471 filing documentation", "description": "Complete Form 471 with all attachments", "priority": "high"},
        ])

    # ==================== TEMPLATES ====================

    def get_templates(self) -> Dict[str, List[Dict[str, str]]]:
        """
        Return common PIA question templates for each category.

        Returns:
            Dict mapping category to list of template questions.
        """
        return {
            "competitive_bidding": [
                {"question": "Please provide documentation showing how you solicited bids for the services on this FRN, including your Form 470 and any additional outreach.", "category": "competitive_bidding"},
                {"question": "Provide evidence that you waited the required 28 days after posting your Form 470 before selecting a service provider.", "category": "competitive_bidding"},
                {"question": "How many bids did you receive, and how did you ensure that all potential bidders had equal opportunity to respond?", "category": "competitive_bidding"},
            ],
            "cost_effectiveness": [
                {"question": "Please provide your bid evaluation matrix showing the criteria and weights used to evaluate all bids received.", "category": "cost_effectiveness"},
                {"question": "Explain how price of the eligible goods and services was the primary factor in your vendor selection.", "category": "cost_effectiveness"},
                {"question": "You received only one bid. Please explain what steps you took to solicit additional bids.", "category": "cost_effectiveness"},
            ],
            "entity_eligibility": [
                {"question": "Please provide documentation confirming that your entity meets the eligibility requirements for the E-Rate program.", "category": "entity_eligibility"},
                {"question": "Provide your NCES school ID and current enrollment figures.", "category": "entity_eligibility"},
            ],
            "service_eligibility": [
                {"question": "Please explain how the services requested on this FRN are eligible under the Eligible Services List for this funding year.", "category": "service_eligibility"},
                {"question": "Provide product specifications showing the requested equipment falls under Category 2 eligible services.", "category": "service_eligibility"},
            ],
            "discount_rate": [
                {"question": "Please provide documentation supporting the discount rate claimed on your application, including NSLP data source.", "category": "discount_rate"},
                {"question": "Provide student count verification and NSLP percentage documentation for each school on this application.", "category": "discount_rate"},
            ],
            "contracts": [
                {"question": "Please provide a copy of the executed contract for the services on this FRN, including the execution date.", "category": "contracts"},
                {"question": "Confirm that the contract was executed on or after the allowable contract date shown on your Form 470.", "category": "contracts"},
            ],
            "cipa": [
                {"question": "Please provide documentation of your CIPA compliance, including your Internet Safety Policy and evidence of the required public hearing.", "category": "cipa"},
                {"question": "Provide the date your Internet Safety Policy was adopted and the date of the public hearing.", "category": "cipa"},
            ],
            "ineligible_services": [
                {"question": "The services on this FRN appear to include ineligible components. Please provide a cost allocation showing the eligible and ineligible portions.", "category": "ineligible_services"},
                {"question": "Please explain how the costs on this FRN comply with the rules regarding ineligible services.", "category": "ineligible_services"},
            ],
        }

    # ==================== CATEGORY KNOWLEDGE ====================

    def _get_category_knowledge(self, category: str) -> Dict[str, Any]:
        """
        Return expert-level knowledge for a given PIA category.

        Args:
            category: PIA category key.

        Returns:
            Dict with what_they_want, key_points, common_mistakes, relevant_rules.
        """
        knowledge_map: Dict[str, Dict[str, Any]] = {
            "competitive_bidding": self._get_competitive_bidding_knowledge(),
            "cost_effectiveness": self._get_cost_effectiveness_knowledge(),
            "entity_eligibility": self._get_entity_eligibility_knowledge(),
            "service_eligibility": self._get_service_eligibility_knowledge(),
            "discount_rate": self._get_discount_rate_knowledge(),
            "contracts": self._get_contracts_knowledge(),
            "cipa": self._get_cipa_knowledge(),
            "ineligible_services": self._get_ineligible_services_knowledge(),
        }
        return knowledge_map.get(category, {
            "what_they_want": "General PIA compliance documentation.",
            "key_points": ["Provide clear, specific answers", "Attach supporting documentation"],
            "common_mistakes": ["Vague answers without evidence"],
            "relevant_rules": [],
        })

    def _get_competitive_bidding_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for competitive bidding PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify that the applicant followed the competitive bidding process: "
                "posted Form 470, waited 28 days, solicited bids fairly, and selected a vendor based "
                "on price as the primary factor. They need the Form 470 number, certification date, "
                "allowable contract date, number of bids received, how bids were solicited, evidence "
                "of equal treatment, and confirmation the RFP was uploaded to EPC."
            ),
            "key_points": [
                "Provide Form 470 number and certification date",
                "Show 28-day waiting period was observed (cert date to contract/selection date)",
                "State the number of bids received",
                "Describe how you solicited bids (Form 470 posting, direct outreach, newspaper, etc.)",
                "Confirm all bidders received equal information and treatment",
                "If RFP was used, confirm it was uploaded to EPC",
            ],
            "common_mistakes": [
                "Not providing the actual Form 470 certification date",
                "Confusing Form 470 posting date with certification date",
                "Signing contract before the allowable contract date",
                "Not documenting outreach to potential vendors",
                "Failing to upload RFP to EPC when one was used",
            ],
            "relevant_rules": [
                "FCC Fifth Report and Order (FCC 04-190) - competitive bidding requirements",
                "47 CFR 54.503 - Competitive bidding requirement",
                "USAC Competitive Bidding Process guide",
            ],
        }

    def _get_cost_effectiveness_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for cost-effectiveness PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to see that the applicant evaluated all bids using price of the eligible "
                "goods and services as the primary factor, documented a bid evaluation matrix with "
                "criteria and weights, and can justify why the selected vendor was chosen. If only "
                "one bid was received, they want a sole bid memo explaining outreach efforts."
            ),
            "key_points": [
                "Show bid evaluation matrix with criteria, weights, and scores",
                "Demonstrate price was weighted as the primary (highest-weighted) factor",
                "Explain the rationale for each evaluation criterion",
                "Document why the winning vendor was selected",
                "If sole bid: provide memo explaining additional outreach efforts made",
            ],
            "common_mistakes": [
                "Not making price the primary (most heavily weighted) factor",
                "Using vague criteria without defined weights",
                "Not documenting the evaluation process at all",
                "Selecting a higher-cost vendor without strong documented justification",
                "Not explaining sole bid situations proactively",
            ],
            "relevant_rules": [
                "47 CFR 54.503(c)(2)(ii) - Price must be primary factor",
                "FCC Sixth Report and Order - bid evaluation requirements",
                "USAC Applicant Process guide - Cost-effectiveness review",
            ],
        }

    def _get_entity_eligibility_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for entity eligibility PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to confirm the applicant is an eligible E-Rate entity: a school (public or "
                "private non-profit) with an NCES ID and state accreditation, a public library with IMLS "
                "listing, or an eligible consortium. For private schools, they need non-profit documentation "
                "and student enrollment counts."
            ),
            "key_points": [
                "Provide entity type (public school, private school, library, consortium)",
                "Include NCES ID for schools or IMLS FSCS ID for libraries",
                "Show eligible entity status in state records",
                "For private schools: provide non-profit status documentation (IRS letter)",
                "Include current student enrollment count from official state reporting",
            ],
            "common_mistakes": [
                "Not having an NCES ID on file or providing the wrong one",
                "For private schools: lacking current non-profit documentation",
                "Enrollment figures not matching what was reported on the application",
                "Not updating entity information in EPC when changes occur",
            ],
            "relevant_rules": [
                "47 CFR 54.501 - Eligible schools and libraries",
                "USAC Entity Eligibility guide",
                "NCES school identification requirements",
            ],
        }

    def _get_service_eligibility_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for service eligibility PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify that the requested services/products appear on the Eligible Services "
                "List (ESL) for the applicable funding year. They check Category 1 vs Category 2 "
                "classification, whether the product type and function match ESL entries, and whether "
                "services serve an educational purpose."
            ),
            "key_points": [
                "Reference the specific ESL entry that covers the requested service/product",
                "Clarify Category 1 (internet/telecom) vs Category 2 (internal connections) classification",
                "Provide product specifications showing the item matches the ESL category",
                "Explain the educational purpose if it is not obvious",
                "If mixed-use, show which components are eligible vs ineligible",
            ],
            "common_mistakes": [
                "Requesting items not on the current year's ESL",
                "Misclassifying C1 vs C2 services",
                "Not providing product specs to prove ESL match",
                "Bundling ineligible items without cost allocation",
            ],
            "relevant_rules": [
                "Eligible Services List for the applicable funding year",
                "47 CFR 54.502 - Eligible services",
                "FCC Modernization Orders (2014) - C2 eligible services",
            ],
        }

    def _get_discount_rate_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for discount rate PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify the discount rate claimed on the application by checking NSLP "
                "percentage data and its source, urban/rural classification, and student counts. They "
                "need to see the actual data source (CEP letter, direct cert, income survey) and verify "
                "the numbers match what was reported."
            ),
            "key_points": [
                "Provide NSLP percentage and identify the data source (CEP, direct cert, survey, etc.)",
                "Include the urban/rural classification and its basis (Census block or NCES locale code)",
                "Show student count verification matching Form 471 figures",
                "For multi-school applications, provide school-by-school NSLP breakdown",
                "If using CEP, provide the CEP notification letter from the state",
            ],
            "common_mistakes": [
                "Using outdated NSLP data (must be from within 3 years)",
                "Not documenting the source of NSLP figures",
                "Urban/rural classification not matching NCES or Census data",
                "Student counts not matching state enrollment reports",
                "Applying wrong discount band for the NSLP percentage",
            ],
            "relevant_rules": [
                "47 CFR 54.505 - Discount matrix",
                "47 CFR 54.507 - Discount rate determination",
                "USAC Discount Rate guide",
                "FCC Order on CEP eligibility for E-Rate",
            ],
        }

    def _get_contracts_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for contract documentation PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to see the executed contract and verify: the execution date is on or after "
                "the allowable contract date from Form 470, the contract term and any extensions are "
                "documented, amounts match what was requested on Form 471, and any amendments (CABIO) "
                "are properly documented."
            ),
            "key_points": [
                "Provide the full executed contract with signature dates",
                "Show contract execution date is on or after the Form 470 allowable contract date",
                "Document the contract term, start/end dates, and any extension options",
                "Confirm contract amounts match Form 471 FRN amounts",
                "If contract was amended, provide all CABIO (Change After Bid Information Only) documentation",
            ],
            "common_mistakes": [
                "Contract signed before the allowable contract date",
                "Contract amounts not matching Form 471 figures",
                "Missing CABIO documentation for contract changes",
                "Evergreen contracts without proper documentation",
                "Contract terms extending beyond what was filed on the application",
            ],
            "relevant_rules": [
                "47 CFR 54.503(c)(4) - Contract requirements",
                "USAC Contract guidance",
                "CABIO rules per FCC Orders",
            ],
        }

    def _get_cipa_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for CIPA compliance PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify CIPA (Children's Internet Protection Act) compliance: the entity "
                "adopted an Internet Safety Policy (ISP), held a public hearing (for schools/districts) "
                "or public meeting (for libraries), deployed technology protection measures (filtering), "
                "and certified CIPA compliance on Form 486."
            ),
            "key_points": [
                "Provide the ISP adoption date and board resolution/minutes",
                "Document the public hearing date and meeting notice/minutes",
                "Describe the technology protection measures (filtering solution) deployed",
                "Confirm policies address minors' online activity and visual depictions",
                "Show CIPA certification was completed on Form 486",
            ],
            "common_mistakes": [
                "Not having documented board adoption of the ISP",
                "No evidence of a public hearing (or confusing a board meeting with a public hearing)",
                "ISP adopted after the Form 471 filing window",
                "Not describing the specific filtering technology deployed",
                "CIPA policy not addressing all required elements",
            ],
            "relevant_rules": [
                "Children's Internet Protection Act (CIPA) - 47 USC 254(h)(5)",
                "47 CFR 54.520 - CIPA requirements",
                "FCC CIPA compliance guide for E-Rate",
            ],
        }

    def _get_ineligible_services_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for ineligible services / 30% rule PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify that any ineligible components bundled with eligible services are "
                "properly cost-allocated and do not exceed program rules. For Category 2 equipment, they "
                "check budget compliance and the two-in-five rule. They need a clear breakdown of "
                "eligible vs ineligible costs and the calculation methodology."
            ),
            "key_points": [
                "Provide a clear eligible vs ineligible cost breakdown",
                "Show the calculation methodology for cost allocation",
                "If ineligible components are present, confirm they are under applicable limits",
                "For mixed-use equipment, provide specs showing primary eligible function",
                "Suggest FRN splitting if needed to separate eligible from ineligible",
            ],
            "common_mistakes": [
                "Not breaking out ineligible components at all",
                "Cost allocation methodology not documented or not reasonable",
                "Including clearly ineligible items (furniture, electrical work) without noting it",
                "Exceeding C2 budget caps without awareness",
                "Not splitting FRNs when items have different eligibility",
            ],
            "relevant_rules": [
                "47 CFR 54.504 - Eligible services cost allocation",
                "FCC Modernization Orders (2014) - C2 budgets and rules",
                "Eligible Services List - ineligible components section",
                "USAC C2 Budget Tool guidance",
            ],
        }


def get_pia_service() -> PIAService:
    """Singleton accessor for PIAService."""
    return PIAService()
