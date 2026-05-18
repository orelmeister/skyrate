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
        "student_count": {
            "name": "Student Count & NSLP Documentation",
            "description": "Questions about enrollment counts, NSLP percentages, CEP, direct certification, and how PIA verifies student data for discount-rate purposes",
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
        "general": {
            "name": "General PIA Question",
            "description": "PIA questions that do not clearly match a specific category",
        },
    }

    # ==================== CLASSIFICATION ====================

    def classify_question(self, question_text: str) -> Dict[str, Any]:
        """
        Classify a PIA question into one of the defined categories using keyword analysis.

        Args:
            question_text: The PIA reviewer's question text.

        Returns:
            Dict with category, confidence, and matched keywords.
        """
        question_lower = question_text.lower()

        keyword_map: Dict[str, List[str]] = {
            "competitive_bidding": [
                "form 470", "470", "competitive bidding", "28-day", "28 day",
                "waiting period", "solicitation", "rfp", "posting",
                "how did you solicit", "bids",
                "posted your form 470", "signed a contract",
            ],
            "cost_effectiveness": [
                "cost effective", "cost-effective", "bid evaluation",
                "evaluation criteria", "price as primary", "lowest bid",
                "why did you select", "selection criteria", "bid matrix",
                "sole bid", "only bid", "most cost-effective",
                "bid evaluation matrix", "how you determined",
                "primary factor", "one bid", "solicit additional",
            ],
            "entity_eligibility": [
                "entity eligib", "eligible entity", "nces", "school type",
                "non-profit", "nonprofit", "private school",
                "library eligible", "imls", "consortium",
                "your entity", "eligibility requirements", "meets the eligibility",
                "school or library", "confirm that your entity",
                "eligible for e-rate", "eligible school", "school id",
            ],
            "service_eligibility": [
                "service eligib", "eligible service", "esl", "eligible services list",
                "category 1", "category 2", "c1", "c2", "educational purpose",
                "product type", "function", "requested services are eligible",
                "services are eligible", "eligible under", "services requested",
                "explain how the requested", "falls under category",
            ],
            "student_count": [
                "student count", "enrollment count", "students enrolled",
                "student enrollment", "nslp roster",
                "direct certification", "cep", "community eligibility",
                "source documentation", "state report", "lunch roster",
                "how many students", "number of students",
            ],
            "discount_rate": [
                "discount", "nslp", "free lunch", "reduced lunch",
                "urban", "rural", "percentage",
                "discount rate", "e-rate percentage", "school lunch",
                "free and reduced", "f&rl", "lunch data",
                "discount band", "verify the school lunch",
            ],
            "contracts": [
                "contract", "execution date", "term", "extension",
                "cabio", "amendment", "pricing", "contract date",
                "voluntary extension", "evergreen", "signed contract",
                "amounts match", "contract and explain",
                "contract was executed", "executed on", "allowable contract date",
            ],
            "cipa": [
                "cipa", "internet safety", "filtering", "technology protection",
                "public hearing", "internet safety policy", "minors",
                "children's internet", "content filter",
                "adopted an internet safety", "required public hearing",
            ],
            "ineligible_services": [
                "ineligible", "30%", "thirty percent", "30 percent",
                "ineligible component", "two-in-five", "2-in-5",
                "budget", "non-eligible", "ancillary",
                "eligible and ineligible components", "cost allocation",
                "eligible and ineligible portions", "breakdown showing",
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
            best_score = max(scores.values())
            if best_score > 0:
                # Handle ties: prefer more specific category
                tied_categories = [c for c, s in scores.items() if s == best_score]
                if len(tied_categories) == 1:
                    best_category = tied_categories[0]
                else:
                    # Specificity priority for tie-breaking
                    specificity_order = [
                        "student_count", "cipa", "ineligible_services",
                        "cost_effectiveness", "contracts", "service_eligibility",
                        "entity_eligibility", "discount_rate", "competitive_bidding",
                    ]
                    best_category = tied_categories[0]
                    for preferred in specificity_order:
                        if preferred in tied_categories:
                            best_category = preferred
                            break

                return {
                    "category": best_category,
                    "category_name": self.PIA_CATEGORIES[best_category]["name"],
                    "confidence": min(best_score / 3.0, 1.0),
                    "matched_keywords": matched.get(best_category, []),
                    "all_matches": {k: v for k, v in matched.items() if v},
                }

        # Default fallback — general, NOT competitive_bidding
        return {
            "category": "general",
            "category_name": self.PIA_CATEGORIES["general"]["name"],
            "confidence": 0.0,
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
            "student_count": [
                {"name": "Student enrollment report", "description": "Official state enrollment report or October BEDS count for the applicable year", "priority": "critical"},
                {"name": "NSLP source documentation", "description": "CEP notification letter, direct certification letter, or income survey results", "priority": "critical"},
                {"name": "School-by-school student counts", "description": "Per-building enrollment and NSLP breakdown if multi-school application", "priority": "critical"},
                {"name": "Form 471 Block 4 worksheet", "description": "Showing student counts entered on the application match source docs", "priority": "high"},
                {"name": "State NSLP verification letter", "description": "Letter from state DOE confirming CEP or NSLP percentages", "priority": "high"},
                {"name": "Direct certification data export", "description": "If using direct cert, the data extract showing matched students", "priority": "medium"},
            ],
            "general": [
                {"name": "Relevant USAC correspondence", "description": "All communications with USAC about this FRN", "priority": "high"},
                {"name": "Form 471 filing documentation", "description": "Complete Form 471 with all attachments", "priority": "high"},
                {"name": "Supporting evidence", "description": "Any documentation relevant to the question asked", "priority": "high"},
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
            "student_count": [
                {"question": "Please provide your current student enrollment count and the source documentation supporting the student counts used on Form 471.", "category": "student_count"},
                {"question": "Provide verification that the NSLP student counts on your application match your state enrollment report or direct certification data.", "category": "student_count"},
            ],
            "general": [
                {"question": "Please provide additional documentation to support your E-Rate application for this FRN.", "category": "general"},
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
            "student_count": self._get_student_count_knowledge(),
            "contracts": self._get_contracts_knowledge(),
            "cipa": self._get_cipa_knowledge(),
            "ineligible_services": self._get_ineligible_services_knowledge(),
            "general": self._get_general_knowledge(),
        }
        return knowledge_map.get(category, self._get_general_knowledge())

    def _get_competitive_bidding_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for competitive bidding PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify that the applicant followed the competitive bidding process: "
                "posted Form 470, waited 28 days, solicited bids fairly, and selected a vendor based "
                "on price as the primary factor. The reviewer uses USAC's Competitive Bidding Checklist "
                "to verify the Form 470 number, certification date, allowable contract date, number of "
                "bids received, how bids were solicited, evidence of equal treatment, and confirmation "
                "the RFP was uploaded to EPC if one was used."
            ),
            "key_points": [
                "Provide Form 470 number and certification date in MM/DD/YYYY format",
                "Show 28-day waiting period was observed (cert date to contract/selection date)",
                "State the exact number of bids received and list each bidder name",
                "Describe how you solicited bids (Form 470 posting, direct outreach, newspaper, etc.)",
                "Confirm all bidders received equal information and treatment",
                "If RFP was used, confirm it was uploaded to EPC before the 470 was certified",
                "Provide a screenshot of the EPC Form 470 details page showing certified status",
                "State the allowable contract date and confirm contract was signed on or after that date",
            ],
            "common_mistakes": [
                "Not providing the actual Form 470 certification date",
                "Confusing Form 470 posting date with certification date",
                "Signing contract before the allowable contract date",
                "Not documenting outreach to potential vendors",
                "Failing to upload RFP to EPC when one was used",
                "Not keeping records of all bids received (even rejected ones)",
                "Evaluating bids before the 28-day window closed",
            ],
            "relevant_rules": [
                "47 CFR 54.503 - Competitive bidding requirement",
                "FCC Fifth Report and Order (FCC 04-190) - competitive bidding requirements",
                "FCC Order 19-117 para. 40-48 - competitive bidding process clarifications",
                "USAC Competitive Bidding Process guide (Schools and Libraries Division)",
            ],
            "winning_phrases": [
                "We respectfully provide the following competitive bidding documentation demonstrating full compliance with 47 CFR 54.503.",
                "Our Form 470 (number [X]) was certified on [date], establishing an allowable contract date of [date], and we executed our contract on [date] -- fully observing the required 28-day waiting period.",
                "We received [X] bids in response to our Form 470 posting and evaluated all bids using price of eligible goods and services as the primary factor.",
            ],
            "attachments_note": "Upload the Form 470 certification screenshot, all bids/proposals received, RFP document (if used), and bid evaluation matrix to the EPC document section.",
        }

    def _get_cost_effectiveness_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for cost-effectiveness PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to see that the applicant evaluated all bids using price of the eligible "
                "goods and services as the primary factor, documented a bid evaluation matrix with "
                "criteria and weights, and can justify why the selected vendor was chosen. If only "
                "one bid was received, they want a sole bid memo explaining outreach efforts. The "
                "reviewer uses USAC's Cost-Effectiveness Checklist to verify price weighting, documented "
                "criteria, and that the evaluation was completed before vendor selection."
            ),
            "key_points": [
                "Show bid evaluation matrix with criteria, weights, and scores for each bidder",
                "Demonstrate price was weighted as the primary (highest-weighted) factor -- typically 40%+ weight",
                "Explain the rationale for each non-price evaluation criterion used",
                "Document why the winning vendor was selected with specific scores",
                "If sole bid: provide memo explaining additional outreach efforts made beyond Form 470",
                "Include the date the evaluation was completed and who participated",
                "Show that evaluation criteria were established before bids were received",
                "If not selecting lowest price, provide detailed justification for each non-price factor that outweighed cost",
            ],
            "common_mistakes": [
                "Not making price the primary (most heavily weighted) factor",
                "Using vague criteria without defined weights",
                "Not documenting the evaluation process at all",
                "Selecting a higher-cost vendor without strong documented justification",
                "Not explaining sole bid situations proactively",
                "Creating the evaluation matrix after vendor selection (must exist beforehand)",
                "Price weight below 30% without compelling justification",
            ],
            "relevant_rules": [
                "47 CFR 54.503(c)(2)(ii) - Price must be primary factor",
                "FCC Sixth Report and Order (FCC 10-175) - bid evaluation requirements",
                "FCC Order 19-117 para. 49-55 - cost-effectiveness review standards",
                "USAC Applicant Process guide - Cost-effectiveness review",
            ],
            "winning_phrases": [
                "We respectfully provide our bid evaluation documentation demonstrating that price of eligible goods and services was the primary factor per 47 CFR 54.503(c)(2)(ii).",
                "The attached bid evaluation matrix shows that price was weighted at [X]% -- the highest-weighted criterion -- and all [X] bids were scored consistently against pre-established criteria.",
                "As documented in the attached evaluation, [Vendor] received the highest overall score of [X] points, with price accounting for [X] of those points.",
            ],
            "attachments_note": "Upload the bid evaluation matrix, selection justification memo, all bid proposals, and sole-bid memo (if applicable) to the EPC document section.",
        }

    def _get_entity_eligibility_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for entity eligibility PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to confirm the applicant is an eligible E-Rate entity: a school (public or "
                "private non-profit) with an NCES ID and state accreditation, a public library with IMLS "
                "listing, or an eligible consortium. For private schools, they need non-profit documentation "
                "and student enrollment counts. The reviewer uses USAC's Entity Eligibility Checklist to "
                "verify entity type, NCES/IMLS ID, accreditation status, and non-profit status where required."
            ),
            "key_points": [
                "Provide entity type (public school, private non-profit school, library, consortium)",
                "Include NCES ID for schools or IMLS FSCS ID for libraries -- provide screenshot from NCES/IMLS database",
                "Show eligible entity status in state records or state accreditation documentation",
                "For private schools: provide IRS determination letter (501(c)(3)) or state equivalent",
                "Include current student enrollment count from official state reporting with date",
                "If entity recently opened or changed status, provide documentation of the change",
                "For consortia: provide consortium membership documentation and lead entity identification",
                "Confirm entity information in EPC profile matches source documentation",
            ],
            "common_mistakes": [
                "Not having an NCES ID on file or providing the wrong one",
                "For private schools: lacking current non-profit documentation",
                "Enrollment figures not matching what was reported on the application",
                "Not updating entity information in EPC when changes occur",
                "For new schools: not providing state accreditation documentation",
                "Pre-K-only programs that are not eligible for E-Rate",
            ],
            "relevant_rules": [
                "47 CFR 54.501 - Eligible schools and libraries",
                "47 CFR 54.501(a)(3) - Non-profit requirement for private schools",
                "FCC Order 19-117 para. 20-28 - entity eligibility verification",
                "USAC Entity Eligibility guide (Schools and Libraries Division)",
                "NCES school identification requirements",
            ],
            "winning_phrases": [
                "We respectfully confirm that [Entity Name] is an eligible entity for E-Rate purposes under 47 CFR 54.501.",
                "Our NCES ID is [X], as verified in the attached NCES database screenshot, confirming our status as a [public/private non-profit] school.",
                "The attached documentation confirms our entity meets all eligibility requirements, including [state accreditation/non-profit status/IMLS listing].",
            ],
            "attachments_note": "Upload the NCES/IMLS database screenshot, state accreditation letter, IRS determination letter (if private), and current enrollment report to the EPC document section.",
        }

    def _get_service_eligibility_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for service eligibility PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify that the requested services/products appear on the Eligible Services "
                "List (ESL) for the applicable funding year. They check Category 1 vs Category 2 "
                "classification, whether the product type and function match ESL entries, and whether "
                "services serve an educational purpose. The reviewer uses USAC's Service Eligibility "
                "Checklist to match each line item to a specific ESL entry."
            ),
            "key_points": [
                "Reference the specific ESL entry (page number, section) that covers the requested service/product",
                "Clarify Category 1 (internet/telecom) vs Category 2 (internal connections) classification",
                "Provide product specifications or data sheets showing the item matches the ESL category",
                "Explain the educational purpose if it is not obvious from the product name",
                "If mixed-use, show which components are eligible vs ineligible with cost allocation",
                "Identify the product by manufacturer, model number, and function",
                "For managed services, explain what is included and confirm all components are eligible",
                "Reference the correct funding year ESL (ESL changes annually)",
            ],
            "common_mistakes": [
                "Requesting items not on the current year's ESL",
                "Misclassifying C1 vs C2 services",
                "Not providing product specs to prove ESL match",
                "Bundling ineligible items without cost allocation",
                "Using a prior year's ESL as reference instead of the current year",
            ],
            "relevant_rules": [
                "47 CFR 54.502 - Eligible services",
                "Eligible Services List for the applicable funding year (published annually by USAC)",
                "FCC Modernization Orders (2014, FCC 14-99) - C2 eligible services",
                "FCC Order 19-117 para. 56-62 - service eligibility determinations",
            ],
            "winning_phrases": [
                "We respectfully provide the following documentation demonstrating that the requested services are eligible under 47 CFR 54.502 and the FY[X] Eligible Services List.",
                "The attached product specifications confirm that [product/service] matches the ESL entry for [category/function], classified as Category [1/2].",
                "Each line item on this FRN corresponds to a specific ESL entry as detailed in the table below.",
            ],
            "attachments_note": "Upload product specification sheets, ESL reference highlighting the applicable entry, and network diagram (if applicable) to the EPC document section.",
        }

    def _get_discount_rate_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for discount rate PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify the discount rate claimed on the application by checking NSLP "
                "percentage data and its source, urban/rural classification, and student counts. They "
                "need to see the actual data source (CEP letter, direct cert, income survey) and verify "
                "the numbers match what was reported. The reviewer uses USAC's Discount Rate Checklist "
                "to cross-reference the claimed discount band against the NSLP percentage and locale code."
            ),
            "key_points": [
                "Provide NSLP percentage and identify the data source (CEP, direct cert, survey, etc.)",
                "Include the urban/rural classification and its basis (Census block or NCES locale code)",
                "Show student count verification matching Form 471 figures exactly",
                "For multi-school applications, provide school-by-school NSLP breakdown",
                "If using CEP, provide the CEP notification letter from the state",
                "Show the discount band calculation: NSLP% + urban/rural = discount rate",
                "Confirm data is from an allowable year (within 3 years per USAC rules)",
                "If using a different NSLP source than prior year, explain the change",
            ],
            "common_mistakes": [
                "Using outdated NSLP data (must be from within 3 years)",
                "Not documenting the source of NSLP figures",
                "Urban/rural classification not matching NCES or Census data",
                "Student counts not matching state enrollment reports",
                "Applying wrong discount band for the NSLP percentage",
                "Confusing school-level vs district-level NSLP calculation",
                "Not providing the actual source document (just stating the percentage)",
            ],
            "relevant_rules": [
                "47 CFR 54.505 - Discount matrix",
                "47 CFR 54.507 - Discount rate determination",
                "FCC Order 14-99 (Modernization Order) para. 154-160 - CEP for E-Rate",
                "FCC Order 19-117 para. 88-92 - discount rate verification",
                "USAC Discount Rate guide - acceptable data sources and timeframes",
            ],
            "winning_phrases": [
                "We respectfully provide the following NSLP and discount rate documentation per 47 CFR 54.505 and 54.507.",
                "Our discount rate of [X]% is based on an NSLP percentage of [X]% (urban/rural classification: [X]), as supported by the attached [CEP letter/direct certification data/state report].",
                "The attached documentation verifies that our student counts and NSLP data match the figures entered on Form 471, placing us in the [X]% discount band per the FCC discount matrix.",
            ],
            "attachments_note": "Upload the NSLP source documentation (CEP letter, direct cert data, or survey), urban/rural classification source, and student count verification to the EPC document section.",
        }

    def _get_contracts_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for contract documentation PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to see the executed contract and verify: the execution date is on or after "
                "the allowable contract date from Form 470, the contract term and any extensions are "
                "documented, amounts match what was requested on Form 471, and any amendments (CABIO) "
                "are properly documented. The reviewer uses USAC's Contract Checklist to verify all "
                "required contract elements are present and dates are in proper sequence."
            ),
            "key_points": [
                "Provide the full executed contract with signature dates clearly visible",
                "Show contract execution date is on or after the Form 470 allowable contract date",
                "Document the contract term, start/end dates, and any extension options",
                "Confirm contract amounts match Form 471 FRN amounts exactly",
                "If contract was amended, provide all CABIO documentation with dates",
                "Identify all parties to the contract and confirm SPIN matches",
                "Show contract covers the specific services/products on the FRN",
                "For voluntary extensions, provide documentation that extension was exercised before expiration",
            ],
            "common_mistakes": [
                "Contract signed before the allowable contract date",
                "Contract amounts not matching Form 471 figures",
                "Missing CABIO documentation for contract changes",
                "Evergreen contracts without proper documentation",
                "Contract terms extending beyond what was filed on the application",
                "Contract signed by unauthorized person",
                "SPIN on contract not matching Form 471 SPIN",
            ],
            "relevant_rules": [
                "47 CFR 54.503(c)(4) - Contract requirements",
                "FCC Order 19-117 para. 63-72 - contract documentation standards",
                "USAC Contract guidance (Schools and Libraries Division)",
                "CABIO rules per FCC Orders (FCC 04-190, FCC 10-175)",
            ],
            "winning_phrases": [
                "We respectfully provide the executed contract documentation per 47 CFR 54.503(c)(4).",
                "The attached contract was executed on [date], which is on or after the allowable contract date of [date] established by our Form 470 (number [X]).",
                "Contract amounts of $[X] match the funding commitment request on FRN [X] as filed on Form 471, application number [X].",
            ],
            "attachments_note": "Upload the fully executed contract (all pages with signatures), any CABIO amendments, and board approval documentation (if required) to the EPC document section.",
        }

    def _get_cipa_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for CIPA compliance PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify CIPA (Children's Internet Protection Act) compliance: the entity "
                "adopted an Internet Safety Policy (ISP), held a public hearing (for schools/districts) "
                "or public meeting (for libraries), deployed technology protection measures (filtering), "
                "and certified CIPA compliance on Form 486. The reviewer uses USAC's CIPA Checklist to "
                "verify all four components: policy adoption, public hearing, filtering deployment, and "
                "Form 486 certification."
            ),
            "key_points": [
                "Provide the ISP adoption date and board resolution/minutes showing the vote",
                "Document the public hearing date, meeting notice (published in advance), and minutes",
                "Describe the technology protection measures (filtering solution) deployed by name and vendor",
                "Confirm policies address all required elements: minors' online activity, visual depictions, unauthorized access",
                "Show CIPA certification was completed on Form 486 with the certification date",
                "For libraries: confirm public meeting notice was posted in advance per state requirements",
                "Distinguish between the public hearing (required) and a regular board meeting",
                "Confirm filtering is active on all devices with internet access funded by E-Rate",
            ],
            "common_mistakes": [
                "Not having documented board adoption of the ISP (just having a policy is not enough)",
                "No evidence of a public hearing (or confusing a board meeting with a public hearing)",
                "ISP adopted after the Form 471 filing window",
                "Not describing the specific filtering technology deployed",
                "CIPA policy not addressing all required elements per 47 USC 254(h)(5)",
                "Public hearing notice not published sufficiently in advance",
                "Filtering not covering all E-Rate funded internet access points",
            ],
            "relevant_rules": [
                "Children's Internet Protection Act (CIPA) - 47 USC 254(h)(5)",
                "47 CFR 54.520 - CIPA requirements for E-Rate",
                "FCC Order 19-117 para. 95-102 - CIPA compliance verification",
                "FCC CIPA compliance guide for E-Rate (Schools and Libraries Division)",
                "Neighborhood Children's Internet Protection Act (NCIPA) requirements",
            ],
            "winning_phrases": [
                "We respectfully confirm full CIPA compliance per 47 CFR 54.520 and 47 USC 254(h)(5).",
                "Our Internet Safety Policy was adopted by the Board of [Education/Trustees] on [date], following a public hearing held on [date] that was noticed to the community on [date].",
                "Technology protection measures ([filtering solution name]) are deployed on all internet access points funded by E-Rate, and CIPA compliance was certified on Form 486 on [date].",
            ],
            "attachments_note": "Upload the Internet Safety Policy document, board minutes showing adoption vote, public hearing notice and minutes, and Form 486 certification screenshot to the EPC document section.",
        }

    def _get_ineligible_services_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for ineligible services / 30% rule PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify that any ineligible components bundled with eligible services are "
                "properly cost-allocated and do not exceed program rules. For Category 2 equipment, they "
                "check budget compliance and the two-in-five rule. They need a clear breakdown of "
                "eligible vs ineligible costs and the calculation methodology. The PIA reviewer uses "
                "USAC's cost allocation checklist to verify the applicant identified all ineligible "
                "components and applied a reasonable allocation method."
            ),
            "key_points": [
                "Provide a clear eligible vs ineligible cost breakdown with line-item detail",
                "Show the calculation methodology for cost allocation (per-unit, percentage, or function-based)",
                "If ineligible components are present, confirm they are under applicable limits",
                "For mixed-use equipment, provide specs showing primary eligible function",
                "Suggest FRN splitting if needed to separate eligible from ineligible",
                "Reference the specific ESL entry that establishes eligibility for the primary function",
                "Include vendor quote showing line-item pricing to support the allocation",
                "For C2 budget questions, show remaining budget using the USAC C2 Budget Tool",
            ],
            "common_mistakes": [
                "Not breaking out ineligible components at all",
                "Cost allocation methodology not documented or not reasonable",
                "Including clearly ineligible items (furniture, electrical work) without noting it",
                "Exceeding C2 budget caps without awareness",
                "Not splitting FRNs when items have different eligibility",
                "Using a flat percentage allocation without justification",
                "Failing to account for installation of ineligible components",
            ],
            "relevant_rules": [
                "47 CFR 54.504 - Eligible services cost allocation",
                "FCC Modernization Orders (2014, FCC 14-99) - C2 budgets and rules",
                "Eligible Services List - ineligible components section",
                "USAC C2 Budget Tool guidance",
                "FCC Order 19-117 (para. 60-65) - cost allocation requirements",
            ],
            "winning_phrases": [
                "We respectfully provide the following cost allocation demonstrating compliance with 47 CFR 54.504.",
                "The attached cost allocation worksheet identifies all ineligible components and applies a per-unit pricing methodology based on vendor line-item detail.",
                "As documented below, the ineligible portion has been properly excluded from the E-Rate funding request on this FRN.",
            ],
            "attachments_note": "Upload the cost allocation worksheet, vendor quote with line-item pricing, and product specifications to the EPC document section for this FRN.",
        }

    def _get_student_count_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for student count and NSLP documentation PIA questions."""
        return {
            "what_they_want": (
                "PIA wants to verify the student enrollment counts and NSLP (National School Lunch Program) "
                "data used to calculate the applicant's discount rate. The reviewer checks that the student "
                "counts on Form 471 match an official source document (state enrollment report, October BEDS "
                "count, or state DOE verification), and that the NSLP percentage is supported by CEP notification, "
                "direct certification data, or an approved income survey. This is one of the most common PIA "
                "questions because incorrect student counts directly affect the discount rate and funding amount."
            ),
            "key_points": [
                "Provide the official student enrollment count and identify its source (state report, BEDS, district records)",
                "Show that student counts on Form 471 exactly match the source documentation",
                "Identify the NSLP data methodology: CEP, direct certification, Provision 2/3, or household income survey",
                "If using CEP, provide the CEP notification letter from the state Department of Education",
                "If using direct certification, provide the data extract or state letter showing matched student count",
                "For multi-school districts, provide a per-building breakdown of enrollment and NSLP counts",
                "Confirm the data is from the correct school year (within allowable timeframe per USAC rules)",
                "If student counts changed from prior year, explain the reason (new building, boundary change, etc.)",
                "Reference the specific date the enrollment snapshot was taken",
                "Show calculation: NSLP-eligible students / total enrolled students = NSLP percentage",
            ],
            "common_mistakes": [
                "Student counts on Form 471 not matching the source documentation",
                "Using NSLP data from the wrong school year (must be within allowable period)",
                "Not providing the actual source document (just stating the number without evidence)",
                "Confusing free lunch count with free-and-reduced combined count",
                "For CEP schools, not providing the identified student percentage (ISP) documentation",
                "Enrollment figures including pre-K students who are not eligible for E-Rate",
                "Not breaking out individual school data for consortium or multi-building applications",
            ],
            "relevant_rules": [
                "47 CFR 54.505 - Discount matrix and NSLP data requirements",
                "47 CFR 54.507(e) - Student count and NSLP percentage determination",
                "FCC Order 14-99 (Modernization Order) para. 154-160 - CEP applicability to E-Rate",
                "USAC Discount Rate guide - acceptable NSLP data sources",
                "USDA CEP guidance - Community Eligibility Provision documentation",
                "FCC Order 19-117 para. 88-92 - discount rate verification procedures",
            ],
            "winning_phrases": [
                "We respectfully provide the following student enrollment and NSLP documentation to verify the discount rate claimed on Form 471 per 47 CFR 54.505.",
                "The attached state enrollment report confirms [X] total students enrolled as of [date], which matches the student count entered on our Form 471 application.",
                "Our NSLP percentage of [X]% is based on [CEP/direct certification/income survey] as documented in the attached [state letter/data export], consistent with 47 CFR 54.507(e).",
                "We provide the per-building breakdown below demonstrating that each school's student count and NSLP data matches our official state reporting.",
            ],
            "attachments_note": "Upload the state enrollment report, NSLP source documentation (CEP letter, direct cert data, or survey results), and Form 471 Block 4 worksheet to the EPC document section.",
        }

    def _get_general_knowledge(self) -> Dict[str, Any]:
        """Knowledge base for general/unclassified PIA questions."""
        return {
            "what_they_want": (
                "The PIA reviewer is requesting additional information or documentation to verify "
                "compliance with E-Rate program rules. While this question does not fall into a standard "
                "category, the reviewer needs clear, specific, and well-documented responses that directly "
                "address each point raised. PIA reviews follow USAC's standard review checklist and are "
                "focused on verifying facts, not challenging the applicant."
            ),
            "key_points": [
                "Read the question carefully and address every specific point raised",
                "Provide concrete evidence and documentation for each claim",
                "Reference specific dates, numbers, form numbers, and USAC records",
                "Attach all supporting documents mentioned in your response",
                "Maintain a cooperative, professional tone throughout",
                "If the question references a specific rule, cite that rule in your response",
            ],
            "common_mistakes": [
                "Providing vague answers without supporting documentation",
                "Not addressing all parts of a multi-part question",
                "Missing the 15-day response deadline",
                "Uploading documents without referencing them in the response text",
                "Being defensive or adversarial in tone (PIA is not adversarial)",
            ],
            "relevant_rules": [
                "47 CFR 54.500-54.523 - Universal Service E-Rate program rules",
                "USAC PIA Process Overview",
                "FCC Order 19-117 - E-Rate program modernization",
            ],
            "winning_phrases": [
                "We respectfully provide the following information in response to your review question.",
                "The attached documentation substantiates our compliance with the applicable program requirements.",
                "We are pleased to provide the requested evidence and remain available for any follow-up questions.",
            ],
            "attachments_note": "Upload all referenced supporting documents to the EPC document section for this FRN.",
        }


def get_pia_service() -> PIAService:
    """Singleton accessor for PIAService."""
    return PIAService()
