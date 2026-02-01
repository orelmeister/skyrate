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
    message: ChatMessage
    updated_appeal_text: Optional[str] = None


# ==================== HELPER FUNCTIONS ====================

def _build_denial_details(application: Application, frn_data: Dict[str, Any] = None) -> Dict[str, Any]:
    """Build comprehensive denial details from application and USAC data"""
    denial_reasons = application.denial_reasons or []
    fcdl_comment = application.fcdl_comment or ""
    
    # If we have raw USAC data, extract additional fields
    if frn_data:
        # Extract all relevant denial-related fields from USAC
        fcdl_comment = fcdl_comment or frn_data.get("fcdl_comment", "") or frn_data.get("denial_reason", "") or frn_data.get("frn_denial_reason_desc", "")
        
        # Extract additional USAC fields for context
        additional_context = {
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
        additional_context = {}
    
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
        "usac_context": additional_context,
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

    # Simplified prompt following OpenData's successful approach
    appeal_prompt = f"""Generate a formal E-Rate appeal letter for the following denied application:

Organization: {org_name}
Application Number: {app_number}
Funding Request Number: {frn}
Funding Year: {funding_year}
Amount Denied: ${amount:,.2f}
Service Type: {denial_details.get('service_type', 'E-Rate services')}

Denial Reason (FCDL Comment):
{fcdl_comment or 'No specific denial reason provided'}

Violation Types: {', '.join(violation_types) if violation_types else 'General procedural'}

Appeal Strategy Recommendations:
{json.dumps(strategy.get('recommendations', []), indent=2, default=str)}

Write a professional, comprehensive appeal letter that:
1. Addresses the USAC Appeals Committee formally
2. Includes Introduction, Background, Grounds for Appeal, Supporting Documentation, and Conclusion sections
3. Cites relevant FCC regulations (47 C.F.R. § 54.xxx) and precedents
4. Directly addresses each denial reason with specific counter-arguments
5. Argues for reversal of the denial decision
6. Is ready to submit (at least 1500 words)"""

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
    """Template-based appeal letter generation (fallback)"""
    
    frn = denial_details.get("frn", "Unknown")
    funding_year = denial_details.get("funding_year", "Unknown")
    amount = denial_details.get("total_denied_amount", 0)
    service = denial_details.get("service_description", "E-Rate services")
    service_type = denial_details.get("service_type", "")
    fcdl_comment = denial_details.get("fcdl_comment", "")
    violation_types = denial_details.get("violation_types", [])
    usac_context = denial_details.get("usac_context", {})
    form_470_data = denial_details.get("form_470_data", {})
    
    # Get strategy components
    violation_analysis = strategy.get("violation_analysis", [])
    success = strategy.get("success_assessment", {})
    executive_summary = strategy.get("executive_summary", {})
    recommendations = strategy.get("recommendations", [])
    
    # Build appeal letter header
    letter = f"""APPEAL OF FUNDING COMMITMENT DECISION LETTER (FCDL)

Date: [INSERT DATE]

E-Rate Program
Schools and Libraries Division
Universal Service Administrative Company
700 12th Street NW, Suite 900
Washington, DC 20005

Re: Appeal of Funding Commitment Decision
    Funding Request Number (FRN): {frn}
    Funding Year: {funding_year}
    Service Type: {service_type or service}
    Amount Requested: ${amount:,.2f}

Dear USAC Appeals Committee:

INTRODUCTION

We hereby submit this formal appeal of the Funding Commitment Decision Letter (FCDL) issued for the above-referenced Funding Request Number (FRN). We respectfully request that the Universal Service Administrative Company (USAC) reverse the denial decision and approve funding for this request.

BACKGROUND

This funding request was submitted for {service or 'E-Rate eligible services'} for Funding Year {funding_year}. The total amount requested was ${amount:,.2f}.

SUMMARY OF DENIAL

The FCDL stated the following reason(s) for denial:

"{fcdl_comment or 'No specific denial reason provided in the FCDL.'}"

GROUNDS FOR APPEAL

We respectfully disagree with this denial decision for the following reasons:

"""

    # Add violation-specific arguments based on violation types
    violation_counter = 1
    
    if "competitive_bidding" in violation_types:
        form_470_num = form_470_data.get("form_470_number", usac_context.get("establishing_fcc_form470_number", "[Form 470 Number]"))
        posting_date = form_470_data.get("posting_date", "[Posting Date]")
        contract_date = form_470_data.get("allowable_contract_date", "[Contract Date]")
        
        letter += f"""
{violation_counter}. COMPETITIVE BIDDING COMPLIANCE

The applicant fully complied with the competitive bidding requirements under 47 C.F.R. § 54.503. 

Specifically:
- FCC Form 470 Number: {form_470_num}
- Form 470 Posting Date: {posting_date}
- The required 28-day waiting period was observed before selecting a service provider
- All bids received were evaluated based on price of the eligible goods and services as the primary factor
- The selection process was documented and conducted in accordance with applicable state and local procurement rules

We respectfully submit that any perceived deficiency in the competitive bidding process was either:
(a) A technical or clerical error that did not affect the substance of the competitive bidding process, or
(b) Based on a misunderstanding of the facts that can be clarified with the attached documentation.

"""
        violation_counter += 1

    if "documentation" in violation_types:
        letter += f"""
{violation_counter}. DOCUMENTATION

The applicant submitted all required documentation in accordance with program requirements. If any documentation appeared to be missing or incomplete, we respectfully request the opportunity to provide clarification or supplemental documentation.

The FCC has consistently held that technical or ministerial errors that do not affect program integrity should not result in denial of otherwise valid funding requests. See, e.g., Schools and Libraries Universal Service Support Mechanism, CC Docket No. 02-6, Order, 18 FCC Rcd 9202 (2003).

"""
        violation_counter += 1

    if "eligibility" in violation_types:
        letter += f"""
{violation_counter}. ELIGIBILITY

The applicant is an eligible entity under 47 U.S.C. § 254(h)(7) and 47 C.F.R. § 54.501. The services requested are eligible for E-Rate support as they fall within the categories of supported services under 47 C.F.R. § 54.502.

We have attached documentation confirming the eligibility of both the applicant entity and the requested services.

"""
        violation_counter += 1

    if "timing" in violation_types:
        letter += f"""
{violation_counter}. TIMING AND DEADLINES

Regarding any timing concerns, we respectfully submit that:
- All forms were submitted within the applicable filing windows
- Any perceived delay was due to circumstances beyond the applicant's control
- The applicant acted with due diligence throughout the application process

The FCC has established that inadvertent timing issues that do not evidence a willful disregard of program rules should be treated with leniency, particularly when the applicant has demonstrated good faith compliance. See Schools and Libraries Universal Service Support Mechanism, CC Docket No. 02-6, Fifth Report and Order and Order, 19 FCC Rcd 15808 (2004).

"""
        violation_counter += 1

    if "cost_allocation" in violation_types:
        letter += f"""
{violation_counter}. COST ALLOCATION

The cost allocation methodology used for this funding request complies with FCC rules and accurately reflects the eligible portion of the services requested. 

We have documented our cost allocation approach and are prepared to provide any additional detail required to demonstrate compliance with 47 C.F.R. § 54.504(e).

"""
        violation_counter += 1

    # If no specific violations identified, add general argument
    if violation_counter == 1:
        letter += """
1. PROCEDURAL COMPLIANCE

The applicant followed all required procedures in submitting this funding request. We have acted in good faith throughout the application process and believe this denial was issued in error.

We respectfully request that USAC review the facts of this case and reverse the denial decision.

"""

    # Add conclusion
    probability = success.get("overall", "MEDIUM") if success else "MEDIUM"
    
    letter += f"""
SUPPORTING DOCUMENTATION

The following documents are attached in support of this appeal:
- Copy of the original funding request and supporting documentation
- Copy of the FCDL being appealed
- FCC Form 470 and bid evaluation documentation
- Evidence of compliance with applicable program rules
- [Additional supporting documentation as applicable]

CONCLUSION

For the reasons stated above, we respectfully request that USAC reverse the denial decision and approve funding for FRN {frn} in the amount of ${amount:,.2f}.

We have made a good faith effort to comply with all E-Rate program requirements and believe that any issues identified in the FCDL can be adequately addressed through this appeal. The applicant remains committed to providing high-quality educational and library services to its community, and E-Rate funding is essential to achieving this mission.

If you require any additional information or documentation, please do not hesitate to contact the undersigned.

Respectfully submitted,


_______________________________
[Authorized Representative Name]
[Title]
[Organization Name]
[Address]
[Phone Number]
[Email Address]
[Date]

---
INTERNAL NOTES (Remove before submission):
- Appeal Success Assessment: {probability}
- Key Areas to Strengthen: {', '.join(violation_types) if violation_types else 'General procedural review'}
- Recommended actions: Gather all supporting documentation before submitting
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
        
        # Check if it's denied
        status_name = str(frn_data.get("form_471_frn_status_name", "")).lower()
        if "denied" not in status_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"FRN {frn} is not denied (status: {frn_data.get('form_471_frn_status_name', 'Unknown')})"
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
        
        # Check if existing application is denied
        if application.status and "denied" not in application.status.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Application is not denied (status: {application.status})"
            )
    
    # Build comprehensive denial details with USAC data
    denial_details = _build_denial_details(application, frn_data)
    
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
    
    # Apply additional context if provided
    if request.additional_context:
        appeal_text += f"\n\n[Additional Context: {request.additional_context}]"
    
    # Create draft appeal record
    appeal_record = AppealRecord(
        application_id=application.id,
        appeal_text=appeal_text,
        strategy=strategy,
        status="draft",
        chat_history=[{
            "role": "assistant",
            "content": f"I've generated an initial appeal for FRN {application.frn}. The appeal addresses the denial reasons and includes a strategy based on the violation types identified. Would you like me to modify any section?",
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
    The AI will respond with suggestions and optionally update the appeal text.
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
    
    # Generate AI response based on context
    # For now, use a simple response generator - can be enhanced with AI service
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
    
    # Update appeal with new chat history
    appeal.chat_history = chat_history
    
    # If AI suggests text updates, apply them
    updated_appeal_text = None
    if ai_response.get("updated_text"):
        appeal.appeal_text = ai_response["updated_text"]
        updated_appeal_text = ai_response["updated_text"]
    
    appeal.updated_at = datetime.utcnow()
    db.commit()
    
    return ChatResponse(
        success=True,
        appeal_id=appeal.id,
        message=ChatMessage(
            role="assistant",
            content=ai_response["response"],
            timestamp=assistant_message["timestamp"]
        ),
        updated_appeal_text=updated_appeal_text
    )


def _generate_chat_response(
    user_message: str,
    appeal_text: str,
    strategy: Dict[str, Any],
    chat_history: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Generate a contextual response for appeal refinement chat.
    This is a simplified implementation - can be enhanced with full AI integration.
    """
    message_lower = user_message.lower()
    
    # Detect intent and generate appropriate response
    if any(word in message_lower for word in ["stronger", "improve", "better", "enhance"]):
        return {
            "response": "I can help strengthen the appeal. Here are some suggestions:\n\n"
                       "1. **Add specific dates and documentation references** - Concrete evidence is more persuasive\n"
                       "2. **Cite relevant FCC orders** - Reference precedents where similar appeals succeeded\n"
                       "3. **Emphasize good faith effort** - USAC often considers applicant intent\n\n"
                       "Would you like me to apply any of these improvements to a specific section?",
            "updated_text": None
        }
    
    elif any(word in message_lower for word in ["shorten", "shorter", "concise", "brief"]):
        return {
            "response": "I can help make the appeal more concise. The current version includes detailed explanations for each violation. "
                       "Would you like me to:\n\n"
                       "1. Remove the internal strategy notes section?\n"
                       "2. Condense the grounds for appeal to key points only?\n"
                       "3. Simplify the conclusion?\n\n"
                       "Let me know which sections to trim.",
            "updated_text": None
        }
    
    elif any(word in message_lower for word in ["formal", "tone", "professional"]):
        return {
            "response": "The current appeal uses a formal, professional tone appropriate for USAC submissions. "
                       "If you'd like, I can:\n\n"
                       "1. Make it more formal by removing contractions and using passive voice\n"
                       "2. Add more legal terminology and citations\n"
                       "3. Restructure to follow a more traditional legal brief format\n\n"
                       "What adjustment would you prefer?",
            "updated_text": None
        }
    
    elif any(word in message_lower for word in ["evidence", "document", "proof", "attach"]):
        # Get evidence from strategy
        evidence = strategy.get("evidence_checklist", [])
        evidence_text = "\n".join([f"- {e.get('item', e)}" for e in evidence[:5]]) if evidence else "No specific evidence listed"
        
        return {
            "response": f"Based on the denial reasons, here's the recommended evidence to include:\n\n{evidence_text}\n\n"
                       "Would you like me to add specific references to this evidence in the appeal letter?",
            "updated_text": None
        }
    
    elif any(word in message_lower for word in ["deadline", "timeline", "when", "date"]):
        timeline = strategy.get("timeline", {})
        deadline = timeline.get("appeal_deadline", "Not specified")
        days_remaining = timeline.get("days_remaining", "Unknown")
        
        return {
            "response": f"**Appeal Timeline:**\n\n"
                       f"- Appeal Deadline: {deadline}\n"
                       f"- Days Remaining: {days_remaining}\n\n"
                       "Remember to submit the appeal via the EPC portal before the deadline. "
                       "Would you like me to add a timeline section to the appeal?",
            "updated_text": None
        }
    
    else:
        # General response
        return {
            "response": "I'm here to help refine this appeal. You can ask me to:\n\n"
                       "- **Strengthen** specific arguments\n"
                       "- **Add evidence** references\n"
                       "- **Adjust the tone** (more/less formal)\n"
                       "- **Explain** the strategy or timeline\n"
                       "- **Modify** specific sections\n\n"
                       "What would you like to change?",
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
