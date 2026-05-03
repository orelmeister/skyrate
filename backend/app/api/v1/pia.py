"""
PIA Response API Endpoints
Handles PIA response generation, chat refinement, saving, and downloads.
Mirrors the appeals.py architecture for consistency.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import io
import json

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.user import User
from ...models.pia import PIAResponse
from ...services.pia_service import get_pia_service

router = APIRouter(prefix="/pia", tags=["PIA Responses"])

# USAC Open Data Dataset IDs (same as appeals)
USAC_DATASETS = {
    'form_471': 'srbr-2d59',
    'form_470': 'avi8-svp9',
    'c2_budget': '6brt-5pbv',
}

import requests


def fetch_usac_direct(dataset: str, where_clause: str, limit: int = 100) -> List[Dict]:
    """
    Direct USAC Open Data API query for comprehensive data retrieval.
    Same pattern as appeals.py.
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

class GeneratePIARequest(BaseModel):
    """Request to generate a new PIA response"""
    question: str
    ben: Optional[str] = None
    frn: Optional[str] = None
    funding_year: Optional[int] = 2026
    additional_context: Optional[str] = None


class PIAChatRequest(BaseModel):
    """Request to send a chat message for PIA response refinement"""
    pia_response_id: int
    message: str


class SavePIARequest(BaseModel):
    """Request to save a PIA response"""
    pia_response_id: int
    response_text: str
    chat_history: Optional[List[Dict[str, Any]]] = None


class UpdatePIAStatusRequest(BaseModel):
    """Request to update PIA response status"""
    status: str  # draft, finalized, submitted


class AnalyzeQuestionRequest(BaseModel):
    """Request to analyze/classify a PIA question without generating a full response"""
    question: str


class PIAChatResponse(BaseModel):
    """Response from chat refinement"""
    success: bool
    pia_response_id: int
    response: str
    updated_text: str
    chat_history: Optional[List[Dict[str, Any]]] = None


# ==================== HELPER FUNCTIONS ====================

def _build_usac_context(ben: Optional[str], frn: Optional[str], funding_year: int) -> Dict[str, Any]:
    """
    Fetch USAC data for the given BEN/FRN to provide context for PIA response generation.

    Args:
        ben: Billed Entity Number.
        frn: Funding Request Number.
        funding_year: E-Rate funding year.

    Returns:
        Dict of USAC data or empty dict.
    """
    usac_data: Dict[str, Any] = {}

    if frn:
        frn_data = fetch_usac_direct(
            'form_471',
            f"funding_request_number = '{frn}'",
            limit=10
        )
        if frn_data:
            usac_data["frn_data"] = frn_data[0]
            usac_data["all_frn_line_items"] = frn_data
            # Extract entity info from FRN data
            primary = frn_data[0]
            usac_data["organization_name"] = primary.get("organization_name", "")
            usac_data["state"] = primary.get("physical_state", "")
            usac_data["entity_type"] = primary.get("organization_type", "")
            usac_data["application_number"] = primary.get("application_number", "")
            usac_data["ben"] = primary.get("ben", ben or "")

            # Get Form 470 data if available
            form_470_number = primary.get("establishing_fcc_form470_number", "")
            if form_470_number:
                form_470_data = fetch_usac_direct(
                    'form_470',
                    f"form_470_number = '{form_470_number}'",
                    limit=5
                )
                if form_470_data:
                    usac_data["form_470_data"] = form_470_data[0]

    if ben and not usac_data.get("frn_data"):
        # If no FRN data, try to get entity data by BEN
        entity_data = fetch_usac_direct(
            'form_471',
            f"ben = '{ben}' AND funding_year = '{funding_year}'",
            limit=20
        )
        if entity_data:
            usac_data["entity_applications"] = entity_data
            primary = entity_data[0]
            usac_data["organization_name"] = primary.get("organization_name", "")
            usac_data["state"] = primary.get("physical_state", "")
            usac_data["entity_type"] = primary.get("organization_type", "")
            usac_data["ben"] = primary.get("ben", ben)

    return usac_data


def _generate_pia_response_text(
    category: str,
    question: str,
    usac_data: Dict[str, Any],
    strategy: Dict[str, Any],
    category_knowledge: Dict[str, Any],
    additional_context: Optional[str] = None,
) -> str:
    """
    Generate the PIA response text using AI.
    Uses AIModelManager.deep_analysis() same as appeals.py.

    Args:
        category: PIA category key.
        question: The PIA reviewer's question.
        usac_data: Available USAC data for context.
        strategy: Response strategy from PIAService.
        category_knowledge: Expert knowledge for this category.
        additional_context: Any additional user-provided context.

    Returns:
        Generated PIA response text.
    """
    from utils.ai_models import AIModelManager

    ai_manager = AIModelManager()
    pia_service = get_pia_service()
    cat_info = pia_service.PIA_CATEGORIES.get(category, {})

    # Build USAC data summary for the prompt
    usac_summary = ""
    if usac_data:
        frn_record = usac_data.get("frn_data", {})
        if frn_record:
            usac_summary = f"""
Entity Information:
- Organization: {usac_data.get('organization_name', 'Unknown')}
- BEN: {usac_data.get('ben', 'N/A')}
- State: {usac_data.get('state', 'N/A')}
- Entity Type: {usac_data.get('entity_type', 'N/A')}

FRN Details:
- FRN: {frn_record.get('funding_request_number', 'N/A')}
- Application Number: {frn_record.get('application_number', 'N/A')}
- Funding Year: {frn_record.get('funding_year', 'N/A')}
- Status: {frn_record.get('form_471_frn_status_name', 'N/A')}
- Service Type: {frn_record.get('form_471_service_type_name', 'N/A')}
- Service Provider: {frn_record.get('service_provider_name', 'N/A')}
- SPIN: {frn_record.get('spin', 'N/A')}
- Form 470 Number: {frn_record.get('establishing_fcc_form470_number', 'N/A')}
- Contract Number: {frn_record.get('contract_number', 'N/A')}
- Amount Requested: ${float(frn_record.get('funding_commitment_request', 0)):,.2f}
- Discount Rate: {frn_record.get('discount_pct', 'N/A')}%
"""
        form_470 = usac_data.get("form_470_data", {})
        if form_470:
            usac_summary += f"""
Form 470 Details:
- Form 470 Number: {form_470.get('form_470_number', 'N/A')}
- Certified Date: {form_470.get('certified_date', 'N/A')}
- Allowable Contract Date: {form_470.get('allowable_contract_date', 'N/A')}
- Posting Date: {form_470.get('posting_date', 'N/A')}
"""
    else:
        usac_summary = "No USAC data available. Response uses general best practices."

    # Build knowledge section
    knowledge_text = category_knowledge.get("what_they_want", "")
    key_points = category_knowledge.get("key_points", [])
    relevant_rules = category_knowledge.get("relevant_rules", [])

    additional_note = ""
    if additional_context:
        additional_note = f"\n\nAdditional Context from Applicant:\n{additional_context}"

    prompt = f"""You are an expert E-Rate compliance consultant specializing in PIA (Program Integrity Assurance) responses.
You have 20+ years of experience successfully responding to USAC PIA review questions.

The PIA reviewer has asked the following question:
{question}

Category: {cat_info.get('name', category)}

WHAT PIA IS LOOKING FOR:
{knowledge_text}

KEY POINTS TO ADDRESS:
{chr(10).join(f'- {p}' for p in key_points)}

RELEVANT RULES:
{chr(10).join(f'- {r}' for r in relevant_rules)}

{usac_summary}
{additional_note}

Generate a professional, comprehensive PIA response that:
1. Directly addresses every point in the reviewer's question
2. Cites specific USAC rules and FCC Orders where applicable
3. References specific dates, numbers, and documentation from the entity's records
4. Maintains a professional, cooperative tone
5. Includes placeholders [ATTACH: document_name] for supporting documents that should be uploaded

Format the response as it would be submitted through the EPC portal.
Keep it focused and specific -- PIA reviewers use checklists, so a clear and organized response is best.
Do NOT use legal jargon. Write as a knowledgeable E-Rate program expert.
Use plain text (no markdown formatting like ** or ##).
Length: 500-1200 words depending on complexity."""

    data_context = f"PIA Question Category: {category}\nUSAC Data: {json.dumps(usac_data, default=str)[:2000]}"

    try:
        ai_response = ai_manager.deep_analysis(data_context, prompt)

        if (ai_response
                and len(ai_response) > 200
                and "unavailable" not in ai_response.lower()
                and "api not configured" not in ai_response.lower()):
            print(f"Successfully generated AI PIA response (length: {len(ai_response)} chars)")
            return ai_response
        print(f"AI returned insufficient PIA response (length: {len(ai_response) if ai_response else 0}), using template")
    except Exception as e:
        print(f"AI PIA response generation failed, falling back to template: {e}")

    # Fallback template
    return _generate_pia_response_template(category, question, usac_data, strategy)


def _generate_pia_response_template(
    category: str,
    question: str,
    usac_data: Dict[str, Any],
    strategy: Dict[str, Any],
) -> str:
    """Template-based PIA response generation (fallback when AI is unavailable)."""
    pia_service = get_pia_service()
    cat_info = pia_service.PIA_CATEGORIES.get(category, {})
    org_name = usac_data.get("organization_name", "[Organization Name]")
    frn_record = usac_data.get("frn_data", {})
    frn = frn_record.get("funding_request_number", "[FRN]")
    funding_year = frn_record.get("funding_year", "[Funding Year]")

    response = f"""PIA RESPONSE

Date: {datetime.utcnow().strftime('%B %d, %Y')}

Re: PIA Review Question for FRN {frn}
    Funding Year: {funding_year}
    Organization: {org_name}
    Category: {cat_info.get('name', category)}

PIA Reviewer's Question:
"{question}"

Response:

Thank you for your question regarding {cat_info.get('name', 'this matter').lower()}. We are pleased to provide the following information and documentation in response.

"""

    # Add category-specific template content
    key_points = strategy.get("key_response_points", [])
    if key_points:
        for i, point in enumerate(key_points, 1):
            response += f"{i}. {point}\n\n"

    response += """
Supporting Documentation:

The following documents are attached to support this response:

[ATTACH: See document checklist for required attachments]

Please do not hesitate to contact us if any additional information is needed.

Respectfully,

_______________________________
Authorized Representative
"""
    return response


def _generate_chat_response(
    user_message: str,
    response_text: str,
    strategy: Dict[str, Any],
    chat_history: List[Dict[str, Any]],
    pia_category: str,
) -> Dict[str, Any]:
    """
    Generate an AI-powered response for PIA response refinement chat.
    Uses the same ===RESPONSE=== / ===UPDATED_LETTER=== / ===END=== delimiter pattern as appeals.py.

    Args:
        user_message: The user's chat message.
        response_text: Current PIA response text.
        strategy: Response strategy.
        chat_history: Previous chat messages.
        pia_category: PIA category for context.

    Returns:
        Dict with 'response' (conversational) and 'updated_text' (modified PIA response or None).
    """
    try:
        from utils.ai_models import AIModelManager

        ai_manager = AIModelManager()
        pia_service = get_pia_service()
        cat_info = pia_service.PIA_CATEGORIES.get(pia_category, {})

        # Build conversation context from recent history
        recent_history = chat_history[-6:] if len(chat_history) > 6 else chat_history
        conversation_context = "\n".join([
            f"{'User' if msg['role'] == 'user' else 'Assistant'}: {msg['content']}"
            for msg in recent_history if msg.get('content')
        ])

        strategy_summary = ""
        if strategy:
            strategy_summary = f"Category: {cat_info.get('name', pia_category)}\n"
            for key in ("what_pia_is_looking_for", "tone_guidance"):
                if strategy.get(key):
                    strategy_summary += f"{key}: {strategy[key]}\n"

        prompt = f"""You are a senior E-Rate program consultant helping refine a PIA (Program Integrity Assurance) response. You write PIA responses based on USAC program rules and FCC orders. Your tone is professional, cooperative, and clear.

The user has asked you to make changes to their PIA response. You must:

1. UNDERSTAND what the user wants changed
2. ACTUALLY MODIFY the PIA response based on their request
3. Provide a brief explanation of what you changed

USER'S REQUEST: {user_message}

RECENT CONVERSATION:
{conversation_context}

PIA RESPONSE STRATEGY CONTEXT:
{strategy_summary}

CURRENT PIA RESPONSE:
{response_text}

INSTRUCTIONS:
- Apply the user's requested changes directly to the PIA response
- Return your response in this EXACT format (use these exact delimiters):

===RESPONSE===
[Your brief conversational explanation of what you changed, 2-4 sentences max]
===UPDATED_LETTER===
[The complete updated PIA response with the user's changes applied]
===END===

- The UPDATED_LETTER must be the COMPLETE response, not just the changed section
- If the user asks a question rather than requesting a change, still provide the current response unchanged
- Keep the response focused on program rules and evidence
- Maintain a cooperative, helpful tone (PIA is not adversarial)
- Do NOT add legal jargon"""

        data_context = f"PIA Response Length: {len(response_text)} chars\nCategory: {pia_category}"

        ai_result = ai_manager.deep_analysis(data_context, prompt)

        if ai_result and len(ai_result) > 50:
            response_out = ""
            updated_text = None

            if "===RESPONSE===" in ai_result and "===UPDATED_LETTER===" in ai_result:
                parts = ai_result.split("===RESPONSE===")
                if len(parts) > 1:
                    remainder = parts[1]
                    letter_parts = remainder.split("===UPDATED_LETTER===")
                    response_out = letter_parts[0].strip()
                    if len(letter_parts) > 1:
                        updated_raw = letter_parts[1]
                        if "===END===" in updated_raw:
                            updated_raw = updated_raw.split("===END===")[0]
                        updated_text = updated_raw.strip()
                        if len(updated_text) < 100:
                            updated_text = None
            else:
                response_out = ai_result.strip()

            if response_out:
                return {
                    "response": response_out,
                    "updated_text": updated_text,
                }

    except Exception as e:
        print(f"AI PIA chat response generation failed: {e}")

    # Fallback
    message_lower = user_message.lower()

    if any(word in message_lower for word in ["stronger", "improve", "better", "more detail"]):
        fallback_msg = (
            "I'll strengthen the response with more specific evidence and rule references. "
            "Note: AI refinement is temporarily unavailable, but you can edit the response directly."
        )
    elif any(word in message_lower for word in ["shorten", "shorter", "concise"]):
        fallback_msg = (
            "I'll make the response more concise while keeping the key points. "
            "Note: AI refinement is temporarily unavailable, but you can edit the response directly."
        )
    else:
        fallback_msg = (
            f'I understand your request: "{user_message}"\n\n'
            "AI refinement is temporarily unavailable. You can edit the response directly using the Edit button."
        )

    return {
        "response": fallback_msg,
        "updated_text": None,
    }


# ==================== ENDPOINTS ====================

@router.post("/generate")
async def generate_pia_response(
    request: GeneratePIARequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Generate a new PIA response.
    Accepts question text + optional BEN/FRN, fetches USAC data, classifies the question,
    generates strategy and document checklist, and creates an AI-powered response.
    """
    question = request.question.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PIA question text is required",
        )

    pia_service = get_pia_service()

    # Classify the question
    classification = pia_service.classify_question(question)
    category = classification["category"]

    # Fetch USAC data if BEN or FRN provided
    usac_data = _build_usac_context(request.ben, request.frn, request.funding_year or 2026)

    # Generate strategy and document checklist
    strategy = pia_service.generate_response_strategy(category, question, usac_data)
    doc_checklist = pia_service.get_document_checklist(category, usac_data)

    # Get category knowledge for the AI prompt
    category_knowledge = pia_service._get_category_knowledge(category)

    # Generate the PIA response text using AI
    response_text = _generate_pia_response_text(
        category=category,
        question=question,
        usac_data=usac_data,
        strategy=strategy,
        category_knowledge=category_knowledge,
        additional_context=request.additional_context,
    )

    # Calculate 15-day deadline from today
    deadline_date = datetime.utcnow() + timedelta(days=15)

    # Create PIAResponse record
    try:
        pia_record = PIAResponse(
            user_id=current_user.id,
            ben=request.ben or usac_data.get("ben"),
            frn=request.frn,
            funding_year=request.funding_year or 2026,
            application_number=usac_data.get("application_number"),
            organization_name=usac_data.get("organization_name"),
            state=usac_data.get("state"),
            entity_type=usac_data.get("entity_type"),
            pia_category=category,
            original_question=question,
            response_text=response_text,
            supporting_docs=doc_checklist,
            strategy=strategy,
            status="draft",
            deadline_date=deadline_date,
            chat_history=[{
                "role": "assistant",
                "content": (
                    f"I've generated a PIA response for the {classification['category_name']} category. "
                    f"The response addresses the reviewer's question and includes document attachment placeholders. "
                    f"Would you like me to modify any section?"
                ),
                "timestamp": datetime.utcnow().isoformat(),
            }],
        )

        db.add(pia_record)
        db.commit()
        db.refresh(pia_record)
    except Exception as db_err:
        db.rollback()
        print(f"[ERROR] pia/generate: DB write failed: {db_err}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save PIA response: {str(db_err)}. The pia_responses table may not exist — check server logs."
        )

    record_dict = pia_record.to_dict()
    record_dict["classification"] = classification
    record_dict["document_checklist"] = doc_checklist
    return record_dict


@router.post("/chat", response_model=PIAChatResponse)
async def chat_about_pia_response(
    request: PIAChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PIAChatResponse:
    """
    Send a chat message to refine a PIA response.
    Uses AI to understand the user's request and modify the response accordingly.
    """
    pia_record = db.query(PIAResponse).filter(
        PIAResponse.id == request.pia_response_id,
        PIAResponse.user_id == current_user.id,
    ).first()

    if not pia_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PIA response not found",
        )

    # Add user message to chat history
    user_message = {
        "role": "user",
        "content": request.message,
        "timestamp": datetime.utcnow().isoformat(),
    }

    chat_history = pia_record.chat_history or []
    chat_history.append(user_message)

    # Generate AI-powered response
    ai_response = _generate_chat_response(
        user_message=request.message,
        response_text=pia_record.response_text or "",
        strategy=pia_record.strategy or {},
        chat_history=chat_history,
        pia_category=pia_record.pia_category,
    )

    assistant_message = {
        "role": "assistant",
        "content": ai_response["response"],
        "timestamp": datetime.utcnow().isoformat(),
    }
    chat_history.append(assistant_message)

    # Update record
    pia_record.chat_history = chat_history

    updated_text = pia_record.response_text or ""
    if ai_response.get("updated_text"):
        pia_record.response_text = ai_response["updated_text"]
        updated_text = ai_response["updated_text"]

    pia_record.updated_at = datetime.utcnow()
    db.commit()

    return PIAChatResponse(
        success=True,
        pia_response_id=pia_record.id,
        response=ai_response["response"],
        updated_text=updated_text,
        chat_history=chat_history,
    )


@router.put("/{pia_id}/save")
async def save_pia_response(
    pia_id: int,
    request: SavePIARequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Save PIA response text and chat history."""
    pia_record = db.query(PIAResponse).filter(
        PIAResponse.id == pia_id,
        PIAResponse.user_id == current_user.id,
    ).first()

    if not pia_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PIA response not found",
        )

    pia_record.response_text = request.response_text
    if request.chat_history is not None:
        pia_record.chat_history = request.chat_history
    pia_record.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(pia_record)

    return pia_record.to_dict()


@router.put("/{pia_id}/status")
async def update_pia_status(
    pia_id: int,
    request: UpdatePIAStatusRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update PIA response status (draft -> finalized -> submitted)."""
    pia_record = db.query(PIAResponse).filter(
        PIAResponse.id == pia_id,
        PIAResponse.user_id == current_user.id,
    ).first()

    if not pia_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PIA response not found",
        )

    valid_statuses = ["draft", "finalized", "submitted"]
    if request.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}",
        )

    pia_record.status = request.status
    pia_record.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(pia_record)

    return pia_record.to_dict()


@router.get("/{pia_id}")
async def get_pia_response(
    pia_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get a single PIA response with full details."""
    pia_record = db.query(PIAResponse).filter(
        PIAResponse.id == pia_id,
        PIAResponse.user_id == current_user.id,
    ).first()

    if not pia_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PIA response not found",
        )

    return pia_record.to_dict()


@router.get("/")
async def list_pia_responses(
    status_filter: Optional[str] = None,
    category: Optional[str] = None,
    ben: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """List all PIA responses for the current user, with optional filters."""
    query = db.query(PIAResponse).filter(PIAResponse.user_id == current_user.id)

    if status_filter:
        query = query.filter(PIAResponse.status == status_filter)
    if category:
        query = query.filter(PIAResponse.pia_category == category)
    if ben:
        query = query.filter(PIAResponse.ben == ben)

    pia_records = query.order_by(PIAResponse.generated_at.desc()).all()

    return {
        "pia_responses": [r.to_dict() for r in pia_records],
        "total": len(pia_records),
    }


@router.delete("/{pia_id}")
async def delete_pia_response(
    pia_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Delete a PIA response."""
    pia_record = db.query(PIAResponse).filter(
        PIAResponse.id == pia_id,
        PIAResponse.user_id == current_user.id,
    ).first()

    if not pia_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PIA response not found",
        )

    db.delete(pia_record)
    db.commit()

    return {
        "success": True,
        "message": "PIA response deleted successfully",
    }


@router.get("/{pia_id}/download/txt")
async def download_pia_response_txt(
    pia_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Download PIA response as a .txt file."""
    pia_record = db.query(PIAResponse).filter(
        PIAResponse.id == pia_id,
        PIAResponse.user_id == current_user.id,
    ).first()

    if not pia_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PIA response not found",
        )

    content = pia_record.response_text or "No response text available."
    filename = f"pia_response_{pia_record.pia_category}_{pia_record.id}.txt"

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/templates/all")
async def get_pia_templates(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return PIA question templates by category."""
    pia_service = get_pia_service()
    templates = pia_service.get_templates()
    categories = pia_service.PIA_CATEGORIES

    return {
        "success": True,
        "templates": templates,
        "categories": categories,
    }


@router.post("/analyze-question")
async def analyze_pia_question(
    request: AnalyzeQuestionRequest,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Classify a PIA question and suggest strategy without generating a full response.
    Useful for quick triage of PIA review questions.
    """
    question = request.question.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question text is required",
        )

    pia_service = get_pia_service()

    classification = pia_service.classify_question(question)
    category = classification["category"]
    strategy = pia_service.generate_response_strategy(category, question, {})
    doc_checklist = pia_service.get_document_checklist(category, {})

    return {
        "success": True,
        "classification": classification,
        "strategy": strategy,
        "document_checklist": doc_checklist,
    }
