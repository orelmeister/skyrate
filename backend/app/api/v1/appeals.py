"""
Appeals API Endpoints
Handles appeal generation, chat refinement, saving, and downloads
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import io
import json

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.user import User
from ...models.application import Application, AppealRecord, SchoolSnapshot
from ...services import get_appeals_service, get_ai_service
from ...services.usac_service import get_usac_service
from ..v1.consultant import fetch_usac_data

router = APIRouter(prefix="/appeals", tags=["Appeals"])

# USAC Open Data Dataset IDs  
USAC_DATASETS = {
    'form_471': 'srbr-2d59',      # Form 471 Applications - FRN level data
    'form_470': 'avi8-svp9',      # Form 470 - Competitive bidding postings
    'c2_budget': '6brt-5pbv',     # C2 Budget Tool
}

import requests

def fetch_usac_direct(dataset: str, where_clause: str, limit: int = 100) -> List[Dict]:
    """
    Direct USAC Open Data API query for comprehensive data retrieval.
    """
    dataset_id = USAC_DATASETS.get(dataset, dataset)
    url = f"https://opendata.usac.org/resource/{dataset_id}.json"
    
    params = {
        "$limit": limit,
        "$where": where_clause,
    }
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"USAC API error for {dataset}: {e}")
        return []


# ==================== SCHEMAS ====================

class GenerateAppealRequest(BaseModel):
    """Request to generate a new appeal"""
    frn: str  # Funding Request Number
    additional_context: Optional[str] = None


# Statuses that indicate an adverse action worth appealing
APPEALABLE_STATUS_KEYWORDS = [
    "denied", "cancel", "rescind", "adjustment", "modified",
    "reduced", "recovered", "revoked", "rejected"
]


def _is_appealable_status(status_name: str, frn_data: Dict = None, additional_context: str = None) -> tuple:
    """
    Determine if an FRN status is appealable and what type of appeal it is.
    
    Returns:
        (is_appealable: bool, appeal_type: str, reason: str)
        appeal_type: 'denial', 'commitment_adjustment', 'rescission', 'user_specified', 'other'
    """
    status_lower = status_name.lower().strip()
    
    # Direct denial
    if "denied" in status_lower:
        return True, "denial", "FRN denied"
    
    # Check for commitment adjustment / rescission keywords in status
    for keyword in APPEALABLE_STATUS_KEYWORDS:
        if keyword in status_lower:
            return True, "commitment_adjustment", f"Status indicates adverse action: {status_name}"
    
    # Check if commitment was reduced to $0 (rescission)
    if frn_data:
        committed = float(frn_data.get("total_authorized_disbursement") or frn_data.get("committed_amount") or frn_data.get("funding_commitment_request") or -1)
        original = float(frn_data.get("original_request") or frn_data.get("funding_commitment_request") or 0)
        
        # Check COMAD (Commitment Adjustment) fields
        comad_amount = frn_data.get("commitment_adjustment_amount")
        if comad_amount is not None:
            try:
                comad_val = float(comad_amount)
                if comad_val < 0:  # Negative adjustment = reduction
                    return True, "commitment_adjustment", f"Commitment adjustment of ${comad_val:,.2f}"
            except (ValueError, TypeError):
                pass
        
        # If FCDL comment mentions rescission/adjustment
        fcdl = str(frn_data.get("fcdl_comment_frn") or frn_data.get("fcdl_comment_app") or frn_data.get("fcdl_comment") or "").lower()
        if any(kw in fcdl for kw in ["rescind", "adjustment", "recover", "reduce", "ineligible"]):
            return True, "rescission", "FCDL indicates adverse action"
    
    # If user provided additional context, trust them — they know the situation
    if additional_context and len(additional_context.strip()) > 10:
        return True, "user_specified", "User provided appeal context"
    
    return False, "none", f"FRN status is {status_name}; not recognized as an adverse action"


class ChatMessage(BaseModel):
    """A single chat message"""
    role: str  # "user" or "assistant"
    content: str
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    """Request to send a chat message for appeal refinement"""
    appeal_id: int
    message: str


class SaveAppealRequest(BaseModel):
    """Request to save an appeal"""
    appeal_id: int
    appeal_text: str
    chat_history: Optional[List[Dict[str, Any]]] = None


class UpdateStatusRequest(BaseModel):
    """Request to update appeal status"""
    status: str  # draft, submitted, won, lost
    outcome_notes: Optional[str] = None


class AppealResponse(BaseModel):
    """Standard appeal response"""
    success: bool
    appeal: Optional[Dict[str, Any]] = None
    message: Optional[str] = None


class GenerateResponse(BaseModel):
    """Response from appeal generation"""
    success: bool
    appeal_id: int
    appeal_text: str
    strategy: Dict[str, Any]
    message: Optional[str] = None


class ChatResponse(BaseModel):
    """Response from chat refinement"""
    success: bool
    appeal_id: int
    response: str
    updated_letter: str
    chat_history: Optional[List[Dict[str, Any]]] = None


# ==================== HELPER FUNCTIONS ====================

def _build_denial_details(application: Application, frn_data: Dict[str, Any] = None, appeal_type: str = "denial", additional_context: str = None) -> Dict[str, Any]:
    """Build comprehensive details for appeal generation (supports denials, commitment adjustments, rescissions)"""
    denial_reasons = application.denial_reasons or []
    fcdl_comment = application.fcdl_comment or ""
    
    # Incorporate additional_context for ALL appeal types (including denials)
    # This ensures user-provided context is always available to the AI
    if additional_context:
        if appeal_type in ("commitment_adjustment", "rescission", "user_specified"):
            # For non-standard types, make user context the primary reason
            if not fcdl_comment:
                fcdl_comment = additional_context
            elif additional_context not in fcdl_comment:
                fcdl_comment = f"{fcdl_comment}\n\nAdditional context: {additional_context}"
            if additional_context not in denial_reasons:
                denial_reasons = [additional_context] + denial_reasons
        elif appeal_type == "denial":
            # For denials, supplement any sparse USAC data with user context
            if not fcdl_comment:
                # No USAC denial reason — use user context as primary
                fcdl_comment = f"Applicant notes: {additional_context}"
            elif additional_context not in fcdl_comment:
                # Add user context alongside USAC reason
                fcdl_comment = f"{fcdl_comment}\n\nApplicant notes: {additional_context}"
            if additional_context not in str(denial_reasons):
                denial_reasons.append(f"Applicant context: {additional_context}")
    
    # If we have raw USAC data, extract additional fields
    if frn_data:
        # Extract all relevant denial-related fields from USAC
        fcdl_comment = (fcdl_comment or 
            frn_data.get("fcdl_comment_frn", "") or 
            frn_data.get("fcdl_comment_app", "") or
            frn_data.get("fcdl_comment", "") or 
            frn_data.get("denial_reason", "") or 
            frn_data.get("frn_denial_reason_desc", ""))
        
        # Extract additional USAC fields for context
        usac_additional_context = {
            "form_471_status": frn_data.get("form_471_frn_status_name", ""),
            "form_471_line_item_number": frn_data.get("form_471_line_item_number", ""),
            "line_item_narrative": frn_data.get("line_item_narrative", ""),
            "service_provider_name": frn_data.get("service_provider_name", ""),
            "service_provider_number": frn_data.get("service_provider_number", ""),
            "spin": frn_data.get("spin", ""),
            "establishing_fcc_form470_number": frn_data.get("establishing_fcc_form470_number", ""),
            "contract_number": frn_data.get("contract_number", ""),
            "total_monthly_cost": frn_data.get("total_monthly_cost", 0),
            "months_of_service": frn_data.get("months_of_service", 0),
            "one_time_unit_cost": frn_data.get("one_time_unit_cost", 0),
            "one_time_unit_quantity": frn_data.get("one_time_unit_quantity", 0),
            "discount_pct": frn_data.get("discount_pct", 0),
            "category_of_service": frn_data.get("category_of_service", ""),
            "function": frn_data.get("function", ""),
            "product_type": frn_data.get("product_type", ""),
        }
    else:
        usac_additional_context = {}
    
    # Build reasons list from denial_reasons and fcdl_comment
    reasons = []
    if fcdl_comment:
        reasons.append({"reason": fcdl_comment, "category": "general"})
    for reason in denial_reasons:
        if isinstance(reason, str):
            reasons.append({"reason": reason, "category": "general"})
        elif isinstance(reason, dict):
            reasons.append(reason)
    
    # Determine violation types from reasons
    violation_types = []
    for reason in reasons:
        reason_text = reason.get("reason", "") if isinstance(reason, dict) else str(reason)
        reason_lower = reason_text.lower()
        if "bid" in reason_lower or "competitive" in reason_lower or "470" in reason_lower:
            violation_types.append("competitive_bidding")
        elif "document" in reason_lower or "missing" in reason_lower:
            violation_types.append("documentation")
        elif "eligible" in reason_lower or "eligibility" in reason_lower:
            violation_types.append("eligibility")
        elif "deadline" in reason_lower or "late" in reason_lower or "timing" in reason_lower:
            violation_types.append("timing")
        elif "cost" in reason_lower or "allocation" in reason_lower:
            violation_types.append("cost_allocation")
        else:
            violation_types.append("procedural")
    
    # Remove duplicates while preserving order
    violation_types = list(dict.fromkeys(violation_types))
    
    return {
        "frn": application.frn,
        "application_number": application.application_number,
        "funding_year": application.funding_year,
        "service_type": application.service_type,
        "service_description": application.service_description,
        "total_denied_amount": float(application.amount_requested or 0),
        "appeal_deadline": application.appeal_deadline.isoformat() if application.appeal_deadline else None,
        "fcdl_comment": fcdl_comment,
        "denial_reasons": denial_reasons,
        # Fields expected by AppealsStrategy
        "reasons": reasons,
        "violation_types": violation_types if violation_types else ["procedural"],
        "overall_appealability": "medium",  # Default, can be adjusted based on analysis
        # Additional USAC data for AI context
        "usac_context": usac_additional_context,
        # Appeal type for AI context
        "appeal_type": appeal_type,
    }


def _generate_appeal_letter(strategy: Dict[str, Any], denial_details: Dict[str, Any], organization_info: Dict[str, Any] = None) -> str:
    """
    Generate the appeal letter using AI for high-quality, context-aware content.
    Uses the deep_analysis method from AIModelManager for comprehensive appeal generation.
    Falls back to template if AI is unavailable.
    """
    from utils.ai_models import AIModelManager
    
    ai_manager = AIModelManager()
    
    # Build comprehensive prompt for appeal letter generation
    org_name = organization_info.get("name", "the applicant") if organization_info else denial_details.get("organization_name", "the applicant")
    app_number = denial_details.get("application_number", "")
    frn = denial_details.get("frn", "Unknown")
    funding_year = denial_details.get("funding_year", "Unknown")
    amount = denial_details.get("total_denied_amount", 0)
    fcdl_comment = denial_details.get("fcdl_comment", "")
    denial_reasons = denial_details.get("denial_reasons", [])
    violation_types = denial_details.get("violation_types", [])
    usac_context = denial_details.get("usac_context", {})
    
    # Build the data context for the AI - Following OpenData's successful approach
    # Pass denial_details as a clean string representation
    data_context = str(denial_details)
    
    # Determine appeal language based on appeal type
    appeal_type = denial_details.get("appeal_type", "denial")
    if appeal_type == "commitment_adjustment":
        action_desc = "commitment adjustment (COMAD)"
        amount_label = "Amount Affected"
        action_verb = "reversal of the commitment adjustment"
    elif appeal_type == "rescission":
        action_desc = "rescission of funding commitment"
        amount_label = "Amount Rescinded"
        action_verb = "reinstatement of the funding commitment"
    elif appeal_type == "user_specified":
        action_desc = "adverse action"
        amount_label = "Amount at Issue"
        action_verb = "reversal of the adverse action"
    else:
        action_desc = "denial"
        amount_label = "Amount Denied"
        action_verb = "reversal of the denial decision"

    # Expert-based appeal prompt — writes like a senior E-Rate program consultant, not a lawyer
    appeal_prompt = f"""You are a senior E-Rate program consultant with 15+ years of experience helping schools and libraries win appeals with USAC and the FCC. You are NOT a lawyer — you are a program expert who knows USAC rules, FCC orders for the E-Rate program, and the application/appeal process inside and out.

Write an appeal letter for the following {action_desc}:

CASE DETAILS:
- Organization: {org_name}
- Application Number: {app_number}
- Funding Request Number (FRN): {frn}
- Funding Year: {funding_year}
- {amount_label}: ${amount:,.2f}
- Service Type: {denial_details.get('service_type', 'E-Rate services')}

USAC'S STATED REASON FOR {action_desc.upper()} (from FCDL):
{fcdl_comment or 'No specific reason provided by USAC'}

Identified Issue Categories: {', '.join(violation_types) if violation_types else 'General procedural'}

Strategy Notes:
{json.dumps(strategy.get('recommendations', []), indent=2, default=str)}

INSTRUCTIONS FOR WRITING THE APPEAL:

1. IDENTIFY THE EXACT DENIAL REASON from the FCDL comment above and address it directly and specifically. Do not write a generic appeal.

2. ORGANIZE THE APPEAL AS FOLLOWS:
   a) WHAT USAC SAID — Quote or paraphrase the specific FCDL denial reason
   b) WHAT THE RULES ACTUALLY REQUIRE — Cite the specific FCC order or USAC program rule that governs this situation (e.g., "The FCC's Fifth Report and Order established the 28-day competitive bidding window" or "Per the FCC's Sixth Report and Order, applicants must...")
   c) EVIDENCE THE APPLICANT MET THE RULES — Present specific factual evidence showing compliance (use actual dates, form numbers, and amounts from the case details above)
   d) WHY USAC'S CONCLUSION IS INCORRECT — Explain the specific factual or procedural error USAC made

3. CITE SPECIFIC FCC ORDERS AND USAC PROGRAM RULES, such as:
   - FCC Fifth Report and Order (competitive bidding rules)
   - FCC Sixth Report and Order (program procedures)
   - FCC's Modernization Orders (2014)
   - Eligible Services List for the applicable funding year
   - USAC's Applicant Process guides
   Reference these as the SOURCE of the rule, not as legal arguments.

4. DO NOT USE:
   - Legal jargon (due process, administrative law, constitutional rights, burden of proof)
   - Broad legal arguments ("FCC has consistently held...", "Under principles of administrative law...")
   - Generic 47 C.F.R. citations without connecting to a specific rule the applicant followed
   - Placeholder brackets like [INSERT DATE] or [APPLICANT NAME] — use the actual data provided above

5. USE CLEAR, PLAIN LANGUAGE — professional but not legalese. Write as a knowledgeable program expert, not a lawyer.

6. KEEP IT FOCUSED AND CONCISE — 800 to 1500 words. USAC reviewers use checklists. A shorter, targeted appeal beats a long, generic one.

7. FORMAT:
   - Address to "USAC Appeals Committee" or "Schools and Libraries Division"
   - Include FRN, Funding Year, and amount in the header
   - End with a clear, specific request for {action_verb}
   - Include a signature block

Generate the complete appeal letter now:"""

    try:
        # Use deep_analysis for comprehensive appeal generation
        ai_appeal = ai_manager.deep_analysis(data_context, appeal_prompt)
        
        # Check for meaningful response (not stub/error responses)
        if (ai_appeal and 
            len(ai_appeal) > 500 and 
            "unavailable" not in ai_appeal.lower() and 
            "api not configured" not in ai_appeal.lower() and
            "please configure api key" not in ai_appeal.lower()):
            print(f"Successfully generated AI appeal (length: {len(ai_appeal)} chars)")
            return ai_appeal
        print(f"AI returned insufficient appeal (length: {len(ai_appeal) if ai_appeal else 0}), using template")
    except Exception as e:
        print(f"AI appeal generation failed, falling back to template: {e}")
    
    # Fallback to template-based generation
    return _generate_appeal_letter_template(strategy, denial_details)


def _generate_appeal_letter_template(strategy: Dict[str, Any], denial_details: Dict[str, Any]) -> str:
    """Template-based appeal letter generation (fallback) — rule-based expert style"""
    
    frn = denial_details.get("frn", "Unknown")
    funding_year = denial_details.get("funding_year", "Unknown")
    amount = denial_details.get("total_denied_amount", 0)
    service = denial_details.get("service_description", "E-Rate services")
    service_type = denial_details.get("service_type", "")
    fcdl_comment = denial_details.get("fcdl_comment", "")
    violation_types = denial_details.get("violation_types", [])
    usac_context = denial_details.get("usac_context", {})
    form_470_data = denial_details.get("form_470_data", {})
    appeal_type = denial_details.get("appeal_type", "denial")
    
    # Get strategy components
    violation_analysis = strategy.get("violation_analysis", [])
    success = strategy.get("success_assessment", {})
    recommendations = strategy.get("recommendations", [])
    
    # Determine action language based on appeal type
    if appeal_type == "commitment_adjustment":
        action_request = "reverse the commitment adjustment and reinstate the original funding commitment"
    elif appeal_type == "rescission":
        action_request = "reinstate the funding commitment"
    else:
        action_request = "reverse the denial and approve the funding request"
    
    from datetime import datetime
    today = datetime.now().strftime("%B %d, %Y")
    org_name = usac_context.get("organization_name", "the applicant")
    
    # Build appeal letter header
    letter = f"""APPEAL OF FUNDING COMMITMENT DECISION

Date: {today}

Schools and Libraries Division
Universal Service Administrative Company
700 12th Street NW, Suite 900
Washington, DC 20005

Re: Appeal of FCDL for FRN {frn}
    Funding Year: {funding_year}
    Service Type: {service_type or service}
    Amount at Issue: ${amount:,.2f}

Dear USAC Appeals Committee:

I. WHAT USAC DECIDED

USAC issued a Funding Commitment Decision Letter (FCDL) regarding FRN {frn} for Funding Year {funding_year}, affecting ${amount:,.2f} in requested E-Rate support for {service or 'E-Rate eligible services'}.

USAC's stated reason:

"{fcdl_comment or 'No specific reason was provided in the FCDL.'}"

II. WHY THIS DECISION SHOULD BE REVERSED

The applicant followed the applicable E-Rate program rules, and USAC's decision is based on a factual or procedural error. The specific grounds are detailed below.

"""

    # Add rule-specific arguments based on violation types
    section_counter = 1
    
    if "competitive_bidding" in violation_types:
        form_470_num = form_470_data.get("form_470_number", usac_context.get("establishing_fcc_form470_number", "on file"))
        posting_date = form_470_data.get("posting_date", "on file")
        contract_date = form_470_data.get("allowable_contract_date", "on file")
        
        letter += f"""A. COMPETITIVE BIDDING COMPLIANCE

What the rules require: The FCC's Fifth Report and Order (FCC 04-190) established that applicants must post an FCC Form 470 and wait at least 28 days before signing a contract or selecting a service provider. During this window, the applicant must evaluate all bids received using price of the eligible goods and services as the primary factor, per USAC's competitive bidding guidelines.

What the applicant did:
- Filed FCC Form 470 (Number: {form_470_num}) on {posting_date}
- Waited the required 28-day period before making a vendor selection
- Evaluated all responses received with price as the primary factor
- Contract/selection date: {contract_date}
- Documented the bid evaluation process

Why USAC's conclusion is incorrect: The record shows the applicant satisfied each step of the competitive bidding process as defined in the FCC's Fifth Report and Order and USAC's Applicant Process guide. Any perceived deficiency is either a ministerial/clerical issue that did not affect the outcome or is based on a misreading of the applicant's documentation.

"""
        section_counter += 1

    if "documentation" in violation_types:
        letter += f"""{'B' if section_counter == 2 else 'A'}. DOCUMENTATION

What the rules require: USAC requires applicants to maintain documentation supporting their E-Rate applications, including technology plans, bid evaluation records, and contracts. Per the FCC's Sixth Report and Order and USAC program guidelines, applicants must retain records for 10 years from the last date of service.

What the applicant did: The applicant submitted and retained all required documentation for FRN {frn}. If USAC found any documents to be missing or unclear, the applicant is prepared to provide the specific documents identified and requests the opportunity to do so.

Why USAC's conclusion is incorrect: The FCC has recognized that denials based on document deficiencies should give applicants an opportunity to cure, particularly when the underlying documentation exists and the applicant made a good-faith effort to comply. A ministerial gap in paperwork does not indicate a program integrity violation.

"""
        section_counter += 1

    if "eligibility" in violation_types:
        letter += f"""{'C' if section_counter == 3 else 'B' if section_counter == 2 else 'A'}. SERVICE OR ENTITY ELIGIBILITY

What the rules require: The Eligible Services List (ESL) for Funding Year {funding_year} defines which services qualify for E-Rate support under Category 1 (telecommunications/internet access) and Category 2 (internal connections). Eligible entities include schools, libraries, and consortia as defined in the program rules.

What the applicant did: The services requested under FRN {frn} ({service_type or service}) fall within the eligible service categories for Funding Year {funding_year} as published in the ESL. The applicant is an eligible entity that has been participating in the E-Rate program.

Why USAC's conclusion is incorrect: The services and the entity both meet the eligibility requirements defined in the ESL and program rules. If there is a question about a specific line item or service classification, the applicant can provide additional detail to clarify eligibility.

"""
        section_counter += 1

    if "timing" in violation_types:
        letter += f"""{'ABCD'[min(section_counter-1, 3)]}. FILING DEADLINES AND TIMING

What the rules require: The FCC sets annual filing windows for Form 471, and applicants must file within the announced window. USAC publishes specific opening and closing dates each year. Form 486 must be filed within 120 days of the FCDL date or the service start date, whichever is later.

What the applicant did: The applicant filed all required forms within the applicable windows for Funding Year {funding_year}. If USAC identified a timing issue, the applicant notes that any delay was unintentional and did not reflect disregard of program rules.

Why USAC's conclusion is incorrect: The FCC's Modernization Orders (2014) emphasized that the E-Rate program should focus on getting connectivity to schools and libraries, and that inadvertent timing issues that do not indicate waste, fraud, or abuse should not be grounds for denial when the applicant acted in good faith.

"""
        section_counter += 1

    if "cost_allocation" in violation_types:
        letter += f"""{'ABCDE'[min(section_counter-1, 4)]}. COST ALLOCATION

What the rules require: When E-Rate-funded services also serve ineligible locations or purposes, applicants must allocate costs so that only the eligible portion is funded. USAC's program guidelines describe acceptable cost allocation methods.

What the applicant did: The applicant used a reasonable cost allocation methodology for FRN {frn} that accurately reflects the eligible portion of the services. The methodology and supporting calculations are documented and available for review.

Why USAC's conclusion is incorrect: The cost allocation approach used is consistent with methods accepted by USAC in similar situations. If USAC identified a specific concern with the methodology, the applicant requests the opportunity to provide additional detail or adjust the allocation.

"""
        section_counter += 1

    # If no specific violations identified, add general argument
    if section_counter == 1:
        letter += f"""A. THE APPLICANT FOLLOWED PROGRAM RULES

The applicant followed all applicable E-Rate program procedures in submitting FRN {frn} for Funding Year {funding_year}. This includes filing the required forms within the applicable windows, conducting a proper competitive bidding process, and maintaining required documentation.

If USAC identified a specific procedural deficiency, the applicant requests clarification so that it can provide evidence of compliance or cure any ministerial error. The applicant acted in good faith throughout the process.

"""

    # Add conclusion
    probability = success.get("overall", "MEDIUM") if success else "MEDIUM"
    
    letter += f"""III. REQUESTED RELIEF

Based on the above, the applicant respectfully requests that USAC {action_request} for FRN {frn} in the amount of ${amount:,.2f}.

IV. SUPPORTING DOCUMENTATION

The following documents are provided in support of this appeal:
- Copy of the FCDL being appealed
- FCC Form 470 and bid evaluation documentation
- Relevant contracts and service agreements
- Any additional evidence demonstrating compliance with the specific rule at issue

Please contact the undersigned if any additional information is needed.

Respectfully,


_______________________________
Authorized Representative
Organization
Phone / Email

---
INTERNAL NOTES (Remove before submission):
- Estimated appeal strength: {probability}
- Key areas to document: {', '.join(violation_types) if violation_types else 'General procedural review'}
- Action items: Gather specific evidence addressing the FCDL denial reason before submitting
"""
    
    return letter


# ==================== ENDPOINTS ====================

@router.post("/generate")
async def generate_appeal(
    request: GenerateAppealRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate a new appeal for a denied application.
    Fetches comprehensive data from USAC APIs and uses AI to generate high-quality appeals.
    """
    frn = request.frn.strip()
    if not frn:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="FRN is required"
        )
    
    # Store raw USAC data for AI context
    frn_data = None
    form_470_data = None
    appeal_type = "denial"  # Default appeal type, updated based on status analysis
    
    # First, try to find existing application by FRN
    application = db.query(Application).filter(
        Application.frn == frn
    ).first()
    
    # If no local application, fetch comprehensive data from USAC
    if not application:
        # Fetch FRN data from USAC Form 471 dataset
        usac_data = fetch_usac_direct(
            'form_471',
            f"funding_request_number = '{frn}'",
            limit=10  # Get all line items for this FRN
        )
        
        if not usac_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"FRN {frn} not found in USAC database"
            )
        
        frn_data = usac_data[0]  # Primary FRN record
        ben = frn_data.get("ben", "")
        funding_year = frn_data.get("funding_year")
        
        # Check if the FRN has an appealable adverse action
        status_name = str(frn_data.get("form_471_frn_status_name", ""))
        is_appealable, appeal_type, appeal_reason = _is_appealable_status(
            status_name, frn_data, request.additional_context
        )
        if not is_appealable:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"FRN {frn} does not appear to have an adverse action (status: {status_name}). "
                       f"If this FRN had a commitment adjustment or rescission, please provide details in the Additional Context field."
            )
        
        # Fetch Form 470 data if available (for competitive bidding context)
        form_470_number = frn_data.get("establishing_fcc_form470_number", "")
        if form_470_number:
            form_470_data = fetch_usac_direct(
                'form_470',
                f"form_470_number = '{form_470_number}'",
                limit=5
            )
            if form_470_data:
                form_470_data = form_470_data[0]
        
        # Find or create school snapshot
        school_snapshot = db.query(SchoolSnapshot).filter(
            SchoolSnapshot.ben == ben,
            SchoolSnapshot.funding_year == funding_year
        ).first()
        
        if not school_snapshot:
            # Create school snapshot with all USAC data
            school_snapshot = SchoolSnapshot(
                ben=ben,
                funding_year=funding_year,
                organization_name=frn_data.get("organization_name", "Unknown"),
                state=frn_data.get("physical_state", ""),
                city=frn_data.get("physical_city", ""),
                entity_type=frn_data.get("organization_type", ""),
                snapshot_data=frn_data,  # Store complete USAC data
            )
            db.add(school_snapshot)
            db.flush()
        
        # Extract comprehensive denial information
        fcdl_comment = (
            frn_data.get("fcdl_comment_frn") or 
            frn_data.get("fcdl_comment_app") or 
            frn_data.get("fcdl_comment") or 
            frn_data.get("denial_reason") or 
            frn_data.get("frn_denial_reason_desc") or 
            frn_data.get("frn_reason_code_description") or
            ""
        )
        
        denial_reasons = []
        if fcdl_comment:
            denial_reasons.append(fcdl_comment)
        # Also check for reason codes
        if frn_data.get("frn_reason_code_description"):
            denial_reasons.append(frn_data.get("frn_reason_code_description"))
        
        # Create the application record with comprehensive data
        application = Application(
            school_snapshot_id=school_snapshot.id,
            application_number=frn_data.get("application_number", ""),
            frn=frn,
            funding_year=funding_year,
            status=frn_data.get("form_471_frn_status_name", "Denied"),
            amount_requested=float(frn_data.get("funding_commitment_request") or frn_data.get("original_request") or 0),
            amount_funded=0,
            discount_rate=float(frn_data.get("discount_pct") or 0),
            service_type=frn_data.get("form_471_service_type_name", ""),
            service_description=frn_data.get("service_type_other_description") or frn_data.get("function") or "",
            fcdl_comment=fcdl_comment,
            denial_reasons=denial_reasons,
        )
        db.add(application)
        db.flush()
    else:
        # Use existing application - but also fetch fresh USAC data for AI context
        frn_data_list = fetch_usac_direct(
            'form_471',
            f"funding_request_number = '{frn}'",
            limit=10
        )
        if frn_data_list:
            frn_data = frn_data_list[0]
            
            # Update FCDL comment if we got better data from USAC
            new_fcdl = (
                frn_data.get("fcdl_comment_frn") or 
                frn_data.get("fcdl_comment_app") or 
                frn_data.get("fcdl_comment") or 
                frn_data.get("denial_reason") or 
                frn_data.get("frn_denial_reason_desc") or 
                ""
            )
            if new_fcdl and (not application.fcdl_comment or len(new_fcdl) > len(application.fcdl_comment)):
                application.fcdl_comment = new_fcdl
                application.denial_reasons = [new_fcdl]
                db.flush()
            
            # Try to get Form 470 data
            form_470_number = frn_data.get("establishing_fcc_form470_number", "")
            if form_470_number:
                form_470_data_list = fetch_usac_direct(
                    'form_470',
                    f"form_470_number = '{form_470_number}'",
                    limit=5
                )
                if form_470_data_list:
                    form_470_data = form_470_data_list[0]
        
        # Check if existing application has an appealable adverse action
        if application.status:
            is_appealable, appeal_type, appeal_reason = _is_appealable_status(
                application.status, frn_data, request.additional_context
            )
            if not is_appealable:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"FRN {frn} does not appear to have an adverse action (status: {application.status}). "
                           f"If this FRN had a commitment adjustment or rescission, please provide details in the Additional Context field."
                )
        else:
            appeal_type = "denial"  # Default for existing applications without status
    
    # Build comprehensive denial details with USAC data
    denial_details = _build_denial_details(application, frn_data, appeal_type, request.additional_context)
    
    # Add Form 470 context if available
    if form_470_data:
        denial_details["form_470_data"] = {
            "form_470_number": form_470_data.get("form_470_number"),
            "allowable_contract_date": form_470_data.get("allowable_contract_date"),
            "certified_date": form_470_data.get("certified_date"),
            "posting_date": form_470_data.get("posting_date"),
            "service_request_description": form_470_data.get("service_request_description"),
            "category_of_service": form_470_data.get("category_of_service"),
        }
    
    # Build organization info for AI context
    organization_info = None
    if application.school_snapshot:
        organization_info = {
            "organization_name": application.school_snapshot.organization_name,
            "ben": application.school_snapshot.ben,
            "state": application.school_snapshot.state,
            "city": application.school_snapshot.city,
            "entity_type": application.school_snapshot.entity_type,
        }
    
    # Use AI to analyze the denial reasons for better strategy
    ai_service = get_ai_service()
    if denial_details.get("fcdl_comment"):
        try:
            ai_analysis = ai_service.analyze_denial_reasons(denial_details["fcdl_comment"])
            if ai_analysis and not ai_analysis.get("raw_analysis"):
                # Got structured analysis, enhance denial details
                if ai_analysis.get("violation_types"):
                    denial_details["violation_types"] = ai_analysis["violation_types"]
                if ai_analysis.get("overall_appealability"):
                    denial_details["overall_appealability"] = ai_analysis["overall_appealability"]
                denial_details["ai_analysis"] = ai_analysis
        except Exception as e:
            print(f"AI denial analysis failed: {e}")
    
    # Generate strategy using appeals service
    appeals_service = get_appeals_service()
    strategy = appeals_service.generate_full_strategy(denial_details)
    
    if "error" in strategy:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate strategy: {strategy['error']}"
        )
    
    # Generate appeal letter using AI with comprehensive context
    appeal_text = _generate_appeal_letter(strategy, denial_details, organization_info)
    
    # Note: additional_context is now incorporated into denial_details via _build_denial_details
    # so it flows into the AI prompt naturally. No need to append it as a raw note.
    
    # Build informative initial chat message
    denial_note = ""
    if not denial_details.get("fcdl_comment"):
        denial_note = " Note: USAC did not provide a specific denial reason in their data. The appeal uses available context. You can ask me to add specific denial details if you know them."
    
    # Create draft appeal record
    appeal_record = AppealRecord(
        application_id=application.id,
        appeal_text=appeal_text,
        strategy=strategy,
        status="draft",
        chat_history=[{
            "role": "assistant",
            "content": f"I've generated an initial appeal for FRN {application.frn}. The appeal addresses the denial reasons and includes a strategy based on the violation types identified.{denial_note} Would you like me to modify any section?",
            "timestamp": datetime.utcnow().isoformat()
        }]
    )
    
    db.add(appeal_record)
    db.commit()
    db.refresh(appeal_record)
    
    # Re-query with joinedload to ensure relationships are available for to_dict()
    appeal_record = db.query(AppealRecord).options(
        joinedload(AppealRecord.application).joinedload(Application.school_snapshot)
    ).filter(AppealRecord.id == appeal_record.id).first()
    
    # Return the appeal record data directly - frontend wraps it in { success: true, data: ... }
    return appeal_record.to_dict()


@router.post("/chat", response_model=ChatResponse)
async def chat_about_appeal(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Send a chat message to refine an appeal.
    Uses AI to understand the user's request and modify the appeal letter accordingly.
    Returns response, updated letter, and full chat history matching frontend expectations.
    """
    # Get the appeal
    appeal = db.query(AppealRecord).filter(
        AppealRecord.id == request.appeal_id
    ).first()
    
    if not appeal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appeal not found"
        )
    
    # Add user message to chat history
    user_message = {
        "role": "user",
        "content": request.message,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    chat_history = appeal.chat_history or []
    chat_history.append(user_message)
    
    # Generate AI-powered response that actually modifies the appeal
    ai_response = _generate_chat_response(
        user_message=request.message,
        appeal_text=appeal.appeal_text,
        strategy=appeal.strategy,
        chat_history=chat_history
    )
    
    assistant_message = {
        "role": "assistant",
        "content": ai_response["response"],
        "timestamp": datetime.utcnow().isoformat()
    }
    chat_history.append(assistant_message)
    
    # Update appeal with new chat history and potentially updated text
    appeal.chat_history = chat_history
    
    updated_letter = appeal.appeal_text  # Default to current text
    if ai_response.get("updated_text"):
        appeal.appeal_text = ai_response["updated_text"]
        updated_letter = ai_response["updated_text"]
    
    appeal.updated_at = datetime.utcnow()
    db.commit()
    
    return ChatResponse(
        success=True,
        appeal_id=appeal.id,
        response=ai_response["response"],
        updated_letter=updated_letter,
        chat_history=chat_history
    )


def _generate_chat_response(
    user_message: str,
    appeal_text: str,
    strategy: Dict[str, Any],
    chat_history: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Generate an AI-powered response for appeal refinement chat.
    Uses AIModelManager to actually understand and apply the user's requested changes
    to the appeal letter, returning both a conversational response and the updated text.
    """
    try:
        from utils.ai_models import AIModelManager
        
        ai_manager = AIModelManager()
        
        # Build conversation context from recent chat history (last 6 messages)
        recent_history = chat_history[-6:] if len(chat_history) > 6 else chat_history
        conversation_context = "\n".join([
            f"{'User' if msg['role'] == 'user' else 'Assistant'}: {msg['content']}"
            for msg in recent_history if msg.get('content')
        ])
        
        # Build strategy summary for context
        strategy_summary = ""
        if strategy:
            denial_types = strategy.get("violation_types", [])
            evidence = strategy.get("evidence_checklist", [])
            timeline = strategy.get("timeline", {})
            if denial_types:
                strategy_summary += f"Violation Types: {', '.join(denial_types)}\n"
            if evidence:
                evidence_items = [e.get('item', str(e)) if isinstance(e, dict) else str(e) for e in evidence[:5]]
                strategy_summary += f"Key Evidence: {', '.join(evidence_items)}\n"
            if timeline:
                strategy_summary += f"Deadline: {timeline.get('appeal_deadline', 'Not specified')}\n"
        
        # Craft the AI prompt to modify the appeal
        prompt = f"""You are a senior E-Rate program consultant helping refine an appeal letter. You write appeals based on USAC program rules and FCC orders — not legal arguments. Your tone is professional and clear, but never uses legalese.

The user has asked you to make changes to their appeal. You must:

1. UNDERSTAND what the user wants changed
2. ACTUALLY MODIFY the appeal letter based on their request
3. Provide a brief explanation of what you changed

USER'S REQUEST: {user_message}

RECENT CONVERSATION:
{conversation_context}

APPEAL STRATEGY CONTEXT:
{strategy_summary}

CURRENT APPEAL LETTER:
{appeal_text}

INSTRUCTIONS:
- Apply the user's requested changes directly to the appeal letter
- Return your response in this EXACT format (use these exact delimiters):
  
===RESPONSE===
[Your brief conversational explanation of what you changed, 2-4 sentences max]
===UPDATED_LETTER===
[The complete updated appeal letter with the user's changes applied]
===END===

- The UPDATED_LETTER must be the COMPLETE letter, not just the changed section
- If the user asks a question rather than requesting a change, still provide the current letter unchanged
- Keep the appeal focused on program rules and evidence, not legal arguments
- Cite specific FCC orders and USAC program guidelines where relevant
- Do NOT add legal jargon, due process arguments, or administrative law language
- Keep all factual details (dates, FRN numbers, amounts) accurate"""

        data_context = f"Appeal Letter Length: {len(appeal_text)} chars\nStrategy: {json.dumps(strategy, default=str)[:500]}"
        
        ai_result = ai_manager.deep_analysis(data_context, prompt)
        
        # Detect stub responses (AI unavailable) — fall through to keyword-based fallback
        stub_markers = ["api not configured", "unavailable:", "please configure api key"]
        is_stub = ai_result and any(m in ai_result.lower() for m in stub_markers)

        if ai_result and len(ai_result) > 50 and not is_stub:
            # Parse the AI response
            response_text = ""
            updated_text = None
            
            if "===RESPONSE===" in ai_result and "===UPDATED_LETTER===" in ai_result:
                parts = ai_result.split("===RESPONSE===")
                if len(parts) > 1:
                    remainder = parts[1]
                    letter_parts = remainder.split("===UPDATED_LETTER===")
                    response_text = letter_parts[0].strip()
                    if len(letter_parts) > 1:
                        updated_raw = letter_parts[1]
                        # Remove the ===END=== delimiter if present
                        if "===END===" in updated_raw:
                            updated_raw = updated_raw.split("===END===")[0]
                        updated_text = updated_raw.strip()
                        # Validate the updated text is substantial (not empty/garbage)
                        if len(updated_text) < 100:
                            updated_text = None  # Too short, likely parsing error
            else:
                # AI didn't follow the format - use the whole response as the reply
                response_text = ai_result.strip()
                # Try to extract if the AI included a full letter anyway
                if len(ai_result) > len(appeal_text) * 0.8:
                    # The AI might have returned a modified version
                    updated_text = ai_result.strip()
            
            if response_text:
                return {
                    "response": response_text,
                    "updated_text": updated_text
                }
    
    except Exception as e:
        print(f"AI chat response generation failed: {e}")
    
    # Fallback: Quick keyword-based responses (only if AI fails)
    message_lower = user_message.lower()
    
    if any(word in message_lower for word in ["stronger", "improve", "better", "enhance"]):
        fallback_msg = ("I'll strengthen the appeal by adding more specific arguments and evidence references. "
                       "Note: AI refinement is temporarily unavailable, but you can edit the letter directly "
                       "using the Edit button on the Letter tab.")
    elif any(word in message_lower for word in ["shorten", "shorter", "concise", "brief"]):
        fallback_msg = ("I'll work on making the appeal more concise. "
                       "Note: AI refinement is temporarily unavailable, but you can edit the letter directly "
                       "using the Edit button on the Letter tab.")
    elif any(word in message_lower for word in ["formal", "tone", "professional"]):
        fallback_msg = ("I'll adjust the tone to be more formal and professional. "
                       "Note: AI refinement is temporarily unavailable, but you can edit the letter directly "
                       "using the Edit button on the Letter tab.")
    else:
        fallback_msg = (f"I understand your request: \"{user_message}\"\n\n"
                       "AI refinement is temporarily unavailable. You can:\n"
                       "- **Edit directly**: Use the Edit button on the Letter tab to make manual changes\n"
                       "- **Try again**: Send your request again in a moment\n"
                       "- **Be specific**: Describe exactly what section to change and how")
    
    return {
        "response": fallback_msg,
        "updated_text": None
    }


@router.put("/{appeal_id}/save")
async def save_appeal(
    appeal_id: int,
    request: SaveAppealRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Save appeal text and chat history.
    """
    appeal = db.query(AppealRecord).filter(
        AppealRecord.id == appeal_id
    ).first()
    
    if not appeal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appeal not found"
        )
    
    # Update appeal
    appeal.appeal_text = request.appeal_text
    if request.chat_history is not None:
        appeal.chat_history = request.chat_history
    appeal.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(appeal)
    
    return {
        "success": True,
        "appeal": appeal.to_dict(),
        "message": "Appeal saved successfully"
    }


@router.put("/{appeal_id}/status")
async def update_appeal_status(
    appeal_id: int,
    request: UpdateStatusRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update appeal status (draft, submitted, won, lost).
    """
    appeal = db.query(AppealRecord).filter(
        AppealRecord.id == appeal_id
    ).first()
    
    if not appeal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appeal not found"
        )
    
    valid_statuses = ["draft", "submitted", "won", "lost"]
    if request.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )
    
    appeal.status = request.status
    if request.status == "submitted":
        appeal.submitted_at = datetime.utcnow()
    if request.outcome_notes:
        appeal.outcome_notes = request.outcome_notes
    if request.status in ["won", "lost"]:
        appeal.outcome = request.status
    
    appeal.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(appeal)
    
    return {
        "success": True,
        "appeal": appeal.to_dict(),
        "message": f"Appeal status updated to {request.status}"
    }


@router.get("/{appeal_id}")
async def get_appeal(
    appeal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a single appeal with full details including chat history.
    """
    appeal = db.query(AppealRecord).options(
        joinedload(AppealRecord.application).joinedload(Application.school_snapshot)
    ).filter(
        AppealRecord.id == appeal_id
    ).first()
    
    if not appeal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appeal not found"
        )
    
    return {
        "success": True,
        "data": appeal.to_dict()
    }


@router.get("/application/{application_id}")
async def list_appeals_for_application(
    application_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List all appeals for a specific application.
    """
    appeals = db.query(AppealRecord).filter(
        AppealRecord.application_id == application_id
    ).order_by(AppealRecord.generated_at.desc()).all()
    
    return {
        "success": True,
        "appeals": [a.to_dict() for a in appeals],
        "count": len(appeals)
    }


@router.get("/")
async def list_all_appeals(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List all appeals, optionally filtered by status.
    """
    query = db.query(AppealRecord).options(
        joinedload(AppealRecord.application).joinedload(Application.school_snapshot)
    )
    
    if status:
        query = query.filter(AppealRecord.status == status)
    
    total = db.query(AppealRecord).count() if not status else db.query(AppealRecord).filter(AppealRecord.status == status).count()
    appeals = query.order_by(
        AppealRecord.updated_at.desc()
    ).offset(offset).limit(limit).all()
    
    return {
        "success": True,
        "appeals": [a.to_dict() for a in appeals],
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.delete("/{appeal_id}")
async def delete_appeal(
    appeal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete an appeal.
    """
    appeal = db.query(AppealRecord).filter(
        AppealRecord.id == appeal_id
    ).first()
    
    if not appeal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appeal not found"
        )
    
    db.delete(appeal)
    db.commit()
    
    return {
        "success": True,
        "message": "Appeal deleted successfully"
    }


# ==================== DOWNLOAD ENDPOINTS ====================

@router.get("/{appeal_id}/download/txt")
async def download_appeal_txt(
    appeal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download appeal as plain text file.
    """
    appeal = db.query(AppealRecord).filter(
        AppealRecord.id == appeal_id
    ).first()
    
    if not appeal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appeal not found"
        )
    
    content = appeal.appeal_text or ""
    filename = f"appeal_{appeal_id}_{datetime.utcnow().strftime('%Y%m%d')}.txt"
    
    return StreamingResponse(
        io.BytesIO(content.encode('utf-8')),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/{appeal_id}/download/json")
async def download_appeal_json(
    appeal_id: int,
    include_chat: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download appeal as JSON file with full data.
    """
    appeal = db.query(AppealRecord).filter(
        AppealRecord.id == appeal_id
    ).first()
    
    if not appeal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appeal not found"
        )
    
    data = appeal.to_dict()
    if not include_chat:
        data.pop("chat_history", None)
    
    # Add application info
    if appeal.application:
        data["application"] = appeal.application.to_dict()
    
    content = json.dumps(data, indent=2)
    filename = f"appeal_{appeal_id}_{datetime.utcnow().strftime('%Y%m%d')}.json"
    
    return StreamingResponse(
        io.BytesIO(content.encode('utf-8')),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
