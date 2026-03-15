"""
AI Service for SkyRate AI v2
Wraps the legacy ai_models module with FastAPI-friendly interface.

This service provides:
- Multi-model AI routing (Gemini, DeepSeek, Claude)
- Natural language query interpretation
- Deep analysis and report generation
- Task-specific model selection
"""

import sys
import os
from typing import Dict, List, Optional, Any
from enum import Enum

# Add backend directory to path for utils imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from utils.ai_models import AIModelManager, AIModel, TaskType


class AIService:
    """
    FastAPI service wrapper for AI operations.
    Routes tasks to appropriate AI models.
    """
    
    _instance: Optional['AIService'] = None
    
    def __new__(cls):
        """Singleton pattern for service instance."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._manager = AIModelManager()
        self._initialized = True
    
    @property
    def manager(self) -> AIModelManager:
        """Access the underlying AI manager."""
        return self._manager
    
    def get_available_models(self) -> List[str]:
        """Get list of configured and available AI models."""
        return self._manager.get_available_models()
    
    def is_model_available(self, model: str) -> bool:
        """Check if a specific model is available."""
        model_enum = {
            'deepseek': AIModel.DEEPSEEK,
            'gemini': AIModel.GEMINI,
            'claude': AIModel.CLAUDE
        }.get(model.lower())
        
        if model_enum:
            return self._manager.is_model_available(model_enum)
        return False
    
    # ==================== QUERY INTERPRETATION ====================
    
    def interpret_query(self, query: str) -> Dict[str, Any]:
        """
        Interpret a natural language query into structured filters.
        
        Args:
            query: Natural language E-Rate query
            
        Returns:
            Dictionary with year, filters, and explanation
        """
        return self._manager.interpret_query(query)
    
    # ==================== ANALYSIS ====================
    
    def analyze_data(
        self,
        data: List[Dict[str, Any]],
        analysis_type: str = "standard",
        custom_prompt: Optional[str] = None
    ) -> str:
        """
        Analyze E-Rate data with AI.
        
        Args:
            data: List of records to analyze
            analysis_type: Type of analysis (standard, deep, report)
            custom_prompt: Optional custom analysis prompt
            
        Returns:
            AI-generated analysis text
        """
        if not data:
            return "No data provided for analysis."
        
        # Select appropriate model based on analysis type
        if analysis_type == "deep":
            task_type = TaskType.DEEP_ANALYSIS
        elif analysis_type == "report":
            task_type = TaskType.REPORT_GENERATION
        else:
            task_type = TaskType.QUICK_ANSWER
        
        model = self._manager.route_task(task_type)
        
        # Build prompt
        if custom_prompt:
            prompt = f"{custom_prompt}\n\nData:\n{self._format_data(data)}"
        else:
            prompt = self._build_analysis_prompt(data, analysis_type)
        
        # Call appropriate model
        if model == AIModel.GEMINI:
            return self._manager.call_gemini(prompt)
        elif model == AIModel.CLAUDE:
            return self._manager.call_claude([{"role": "user", "content": prompt}])
        else:
            return self._manager.call_deepseek([{"role": "user", "content": prompt}])
    
    def _format_data(self, data: List[Dict], max_records: int = 20) -> str:
        """Format data for AI prompt."""
        import json
        limited = data[:max_records]
        return json.dumps(limited, indent=2, default=str)
    
    def _build_analysis_prompt(self, data: List[Dict], analysis_type: str) -> str:
        """Build analysis prompt based on type."""
        data_str = self._format_data(data)
        
        if analysis_type == "deep":
            return f"""Perform a deep analysis of this E-Rate data. 
            Identify patterns, anomalies, and actionable insights.
            Focus on funding amounts, status distributions, and geographic patterns.
            
            Data:
            {data_str}
            
            Provide:
            1. Executive Summary
            2. Key Findings
            3. Recommendations
            """
        elif analysis_type == "report":
            return f"""Generate a professional report on this E-Rate data.
            Include statistics, trends, and visualizable insights.
            
            Data:
            {data_str}
            
            Format as a structured report with sections.
            """
        else:
            return f"""Summarize this E-Rate data.
            Highlight key metrics and notable records.
            
            Data:
            {data_str}
            """
    
    # ==================== SPECIALIZED ANALYSIS ====================
    
    def analyze_denial_reasons(self, fcdl_comments: str) -> Dict[str, Any]:
        """
        Analyze FCDL denial comments with AI.
        
        Args:
            fcdl_comments: Raw FCDL comment text
            
        Returns:
            Structured analysis of denial reasons
        """
        prompt = f"""You are a senior E-Rate program consultant. Analyze this FCDL (Funding Commitment Decision Letter) denial comment and identify exactly what went wrong.
        
        FCDL Comment:
        {fcdl_comments}
        
        Analyze the denial and return a structured JSON object with:
        
        1. "denial_category": One of these specific categories:
           - "competitive_bidding" (28-day rule, bid evaluation, Form 470 issues, vendor selection)
           - "documentation" (missing forms, incomplete records, unsigned documents)
           - "eligibility" (ineligible entity, ineligible service, wrong category)
           - "late_filing" (missed filing window, late Form 471, late Form 486)
           - "cost_allocation" (ineligible cost included, incorrect allocation method)
           - "spin_change" (unauthorized SPIN change, contract issues)
           - "ministerial_error" (clerical mistake, typo, data entry error)
           - "duplicate_request" (overlapping FRNs, duplicate services)
           - "contract_issues" (contract expired, unsigned, not matching Form 470)
           - "other" (if none of the above fit)
        
        2. "specific_rule_cited": The specific USAC program rule or FCC order that was allegedly violated (e.g., "28-day competitive bidding window per Fifth Report and Order", "Form 486 120-day filing deadline")
        
        3. "usac_error_type": What type of error USAC may have made:
           - "factual_error" (USAC misread the facts or missed documentation)
           - "procedural_error" (USAC didn't follow proper review procedures)
           - "interpretation_error" (USAC applied the rule incorrectly)
           - "unclear" (need more information to determine)
        
        4. "required_evidence": List of specific documents or evidence that would rebut this denial (e.g., ["Signed Form 470 with posting date", "Bid evaluation matrix showing price as primary factor", "28-day timeline documentation"])
        
        5. "appealability": "High", "Medium", or "Low" with brief reasoning
        
        6. "violation_types": List of violation category strings for internal use (e.g., ["competitive_bidding", "documentation"])
        
        7. "key_dates": Any dates mentioned in the denial
        
        8. "recommended_next_steps": List of 2-4 specific actions the applicant should take
        
        Return ONLY valid JSON, no markdown formatting.
        """
        
        response = self._manager.call_gemini(prompt)
        
        # Try to parse as JSON, otherwise return as text analysis
        try:
            import json
            # Strip markdown code blocks if present
            cleaned = response.strip()
            if cleaned.startswith('```'):
                cleaned = cleaned.split('\n', 1)[1] if '\n' in cleaned else cleaned[3:]
            if cleaned.endswith('```'):
                cleaned = cleaned.rsplit('```', 1)[0]
            return json.loads(cleaned.strip())
        except:
            return {"raw_analysis": response}
    
    def generate_appeal_strategy(
        self,
        denial_details: Dict[str, Any],
        organization_info: Optional[Dict] = None
    ) -> str:
        """
        Generate a comprehensive E-Rate appeal letter using AI.
        
        Args:
            denial_details: Structured denial information including USAC data
            organization_info: Optional applicant details
            
        Returns:
            AI-generated appeal letter
        """
        import json
        
        # Extract key information for the prompt
        frn = denial_details.get("frn", "Unknown")
        funding_year = denial_details.get("funding_year", "Unknown")
        amount = denial_details.get("total_denied_amount", 0)
        fcdl_comment = denial_details.get("fcdl_comment", "")
        violation_types = denial_details.get("violation_types", [])
        usac_context = denial_details.get("usac_context", {})
        form_470_data = denial_details.get("form_470_data", {})
        
        # Enhanced system prompt for consistency
        system_prompt = """You are a senior E-Rate program consultant with 15+ years of experience winning appeals for schools and libraries. You are NOT a lawyer. You win appeals because you:

1. Know USAC program rules, FCC orders, and the Eligible Services List inside and out
2. Identify the exact denial reason and address it head-on with evidence
3. Cite specific FCC orders (Fifth Report and Order, Sixth Report and Order, Modernization Orders) as the source of rules
4. Show with factual evidence that USAC made a factual or procedural error
5. Write in clear, professional language that USAC reviewers can follow against their checklists
6. Never use legal jargon, administrative law arguments, or due process claims
7. Keep appeals focused, concise, and organized around the specific denial reason

Your appeals are known for being targeted, evidence-based, and effective because they speak USAC's language — program rules, not courtroom arguments."""

        # Enhanced prompt with better structure and examples
        prompt = f"""Generate a focused, evidence-based E-Rate appeal letter for this denied funding application. This must be a complete, submission-ready appeal written from the perspective of an E-Rate program expert (not a lawyer).

## CASE INFORMATION
- **FRN:** {frn}
- **Funding Year:** {funding_year} 
- **Amount Denied:** ${amount:,.2f}
- **Service Type:** {denial_details.get('service_type', 'Not specified')}
- **Service Description:** {denial_details.get('service_description', 'Not specified')}
- **Organization:** {organization_info.get('organization_name', 'Not specified') if organization_info else 'Not specified'}

## DENIAL REASON FROM USAC
**FCDL Comment:** "{fcdl_comment}"

**Issue Categories:** {', '.join(violation_types) if violation_types else 'General procedural'}

## USAC DATA CONTEXT
Service Provider: {usac_context.get('service_provider_name', 'Not specified')}
Discount Rate: {usac_context.get('discount_pct', 'Not specified')}%
Form 470 Number: {usac_context.get('establishing_fcc_form470_number', 'Not specified')}
{f"Form 470 Posted: {form_470_data.get('posting_date', 'Not specified')}" if form_470_data else ""}
{f"Contract Date: {form_470_data.get('allowable_contract_date', 'Not specified')}" if form_470_data else ""}

## REQUIRED APPEAL STRUCTURE

**HEADER:**
- Formal letter format addressed to Schools and Libraries Division / USAC
- Clear subject line with FRN, funding year, amount

**BODY SECTIONS (organize around the denial reason):**
1. **WHAT USAC DECIDED** — Briefly state what the FCDL says and the specific reason for denial
2. **WHAT THE PROGRAM RULES REQUIRE** — Cite the specific FCC order or USAC program rule that governs this situation:
   - For competitive bidding: FCC Fifth Report and Order (28-day rule, bid evaluation requirements)
   - For documentation: USAC document retention guidelines, Sixth Report and Order
   - For eligibility: Eligible Services List for the funding year, program rules
   - For timing: Filing window rules, Form 486 120-day deadline
   - For cost allocation: USAC cost allocation guidelines
3. **EVIDENCE THE APPLICANT COMPLIED** — Present specific facts (dates, form numbers, amounts) showing the applicant followed the rules
4. **WHY USAC'S DECISION CONTAINS AN ERROR** — Identify the specific factual or procedural error in USAC's analysis
5. **REQUESTED RELIEF** — Specific request to reverse the denial and approve funding
6. **SUPPORTING DOCUMENTATION** — List of attachments
7. **SIGNATURE BLOCK**

**CRITICAL REQUIREMENTS:**
- Write as a program expert, NOT a lawyer. No legal jargon, no due process arguments, no administrative law language.
- Cite FCC orders by name (e.g., "Fifth Report and Order") as the source of rules, not as legal precedent.
- Do NOT use generic 47 C.F.R. citations unless directly tied to a specific rule the applicant followed.
- Use clear, plain language. USAC reviewers use checklists, not legal analysis.
- Be concise and focused (800-1500 words). Shorter and targeted beats long and generic.
- Use actual data from the case — no placeholder brackets like [INSERT DATE].
- Address the specific denial reason, not generic boilerplate.

Generate the complete appeal letter now:"""

        # Try Claude first (best for formal legal writing)
        try:
            result = self._manager.call_claude(
                [{"role": "user", "content": prompt}],
                system=system_prompt,
                max_tokens=8000
            )
            # Enhanced quality check
            if (result and len(result) > 800 and 
                "dear" in result.lower() and 
                "respectfully" in result.lower() and
                ("fcc" in result.lower() or "usac" in result.lower()) and
                str(frn) in result and
                "unavailable" not in result.lower()):
                return result
            else:
                print(f"Claude response failed quality check (length: {len(result) if result else 0})")
                raise ValueError("Claude response failed quality requirements")
        except Exception as e:
            print(f"Claude failed: {e}")
            
        # Fallback to Gemini with similar enhanced prompt
        try:
            gemini_prompt = f"""Write an E-Rate appeal letter for FRN {frn} denied for ${amount:,.2f} in funding year {funding_year}.

DENIAL REASON: {fcdl_comment}

Write as a senior E-Rate program consultant (not a lawyer). The appeal should:
- Start with "Dear USAC Appeals Committee:"
- Identify the specific denial reason and address it directly
- Cite the relevant FCC order or USAC program rule the applicant complied with
- Present factual evidence of compliance
- Explain why USAC's conclusion is incorrect
- End with "Respectfully,"
- Use clear, plain language — no legal jargon or administrative law arguments
- Be concise and focused (800-1500 words)."""
            
            result = self._manager.call_gemini(gemini_prompt)
            if (result and len(result) > 1000 and 
                "dear" in result.lower() and 
                str(frn) in result):
                return result
            print(f"Gemini response also insufficient (length: {len(result) if result else 0})")
        except Exception as e2:
            print(f"Gemini also failed: {e2}")
            
        # Last resort - try DeepSeek
        try:
            deepseek_result = self._manager.call_deepseek([
                {"role": "system", "content": "You are a senior E-Rate program consultant who writes rule-based, evidence-focused appeals. Never use legal jargon."},
                {"role": "user", "content": f"""Write an appeal letter for denied E-Rate FRN {frn} (${amount:,.2f}). 
                
Denial reason: {fcdl_comment}

Write as a program expert: identify the denial reason, cite the specific FCC order or USAC rule the applicant followed, present evidence of compliance, and explain USAC's error. Be concise (800-1500 words)."""}
            ])
            if deepseek_result and len(deepseek_result) > 500:
                return deepseek_result
        except Exception as e3:
            print(f"DeepSeek also failed: {e3}")
            
        return ""  # Return empty to trigger template fallback
    
    def generate_vendor_outreach(
        self,
        school_data: Dict[str, Any],
        vendor_type: str = "general"
    ) -> str:
        """
        Generate personalized vendor outreach content.
        
        Args:
            school_data: School/applicant information
            vendor_type: Type of vendor (ISP, equipment, managed services)
            
        Returns:
            AI-generated outreach content
        """
        import json
        
        prompt = f"""Generate a professional vendor outreach email for E-Rate services.
        
        School Data:
        {json.dumps(school_data, indent=2, default=str)}
        
        Vendor Type: {vendor_type}
        
        Create a compelling, personalized outreach that:
        1. References their specific E-Rate funding history
        2. Highlights relevant opportunities
        3. Provides clear call-to-action
        4. Maintains professional E-Rate compliance tone
        
        Keep it concise and action-oriented.
        """
        
        return self._manager.call_gemini(prompt)
    
    # ==================== APPLICANT APPEAL METHODS ====================
    
    def analyze_denial_for_appeal(self, denial_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze a denial and generate appeal strategy for applicants.
        Used for auto-generating appeals when denials are detected.
        
        Args:
            denial_info: Dictionary with frn, funding_year, denial_reason, service_type, amount_requested
            
        Returns:
            Dictionary with denial_category, success_probability, evidence_needed, analysis
        """
        import json
        
        prompt = f"""Analyze this E-Rate denial and provide an appeal strategy.

DENIAL INFORMATION:
- FRN: {denial_info.get('frn', 'Unknown')}
- Funding Year: {denial_info.get('funding_year', 'Unknown')}
- Amount Requested: ${denial_info.get('amount_requested', 0):,.2f}
- Service Type: {denial_info.get('service_type', 'Not specified')}

DENIAL REASON:
{denial_info.get('denial_reason', 'No denial reason provided')}

Analyze and return a JSON object with:
1. "denial_category": Categorize the denial (e.g., "Competitive Bidding", "Documentation", "Eligibility", "Procedural", "Timing", "Other")
2. "success_probability": Estimated appeal success rate (0-100)
3. "evidence_needed": List of specific documents/evidence needed for appeal
4. "key_arguments": List of main arguments to use in appeal
5. "fcc_citations": Relevant FCC rules that could support the appeal
6. "analysis": Brief text analysis of the denial and appeal strategy

Return ONLY valid JSON, no markdown formatting."""

        try:
            response = self._manager.call_gemini(prompt)
            # Clean up response and parse JSON
            response = response.strip()
            if response.startswith("```"):
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]
            result = json.loads(response)
            return result
        except Exception as e:
            print(f"Error analyzing denial: {e}")
            # Return default structure
            return {
                "denial_category": "Unknown",
                "success_probability": 50,
                "evidence_needed": ["Form 470", "Bid evaluation documentation", "Signed contracts"],
                "key_arguments": ["Good faith compliance", "Procedural technicality"],
                "fcc_citations": ["47 C.F.R. §54.503"],
                "analysis": "Unable to automatically analyze denial. Manual review recommended."
            }
    
    def generate_appeal_letter(self, denial_info: Dict[str, Any], strategy: Dict[str, Any]) -> str:
        """
        Generate a complete appeal letter for applicants.
        
        Args:
            denial_info: Dictionary with frn, funding_year, denial_reason, etc.
            strategy: Strategy from analyze_denial_for_appeal
            
        Returns:
            Complete appeal letter text ready for submission
        """
        frn = denial_info.get('frn', 'Unknown')
        funding_year = denial_info.get('funding_year', 'Unknown')
        amount = denial_info.get('amount_requested', 0)
        denial_reason = denial_info.get('denial_reason', 'Not specified')
        service_type = denial_info.get('service_type', 'Not specified')
        
        key_arguments = strategy.get('key_arguments', [])
        fcc_citations = strategy.get('fcc_citations', [])
        denial_category = strategy.get('denial_category', 'Procedural')
        
        prompt = f"""Generate an E-Rate appeal letter ready for submission to USAC. Write as a senior E-Rate program consultant, not a lawyer.

CASE DETAILS:
- FRN: {frn}
- Funding Year: {funding_year}
- Amount Denied: ${amount:,.2f}
- Service Type: {service_type}
- Denial Category: {denial_category}

DENIAL REASON FROM USAC:
"{denial_reason}"

APPEAL STRATEGY:
Key Arguments: {', '.join(key_arguments) if key_arguments else 'Address procedural compliance with evidence'}
Relevant FCC Orders/Rules: {', '.join(fcc_citations) if fcc_citations else 'Identify applicable FCC order for denial category'}

REQUIREMENTS:
1. Start with "Dear USAC Appeals Committee:"
2. Include header with FRN and funding year reference
3. Structure as: What USAC said -> What the rules require -> Evidence of compliance -> Why USAC is incorrect
4. Cite specific FCC orders (Fifth Report and Order, Sixth Report and Order, Modernization Orders) as rule sources
5. Present factual evidence showing the applicant followed program rules
6. Identify the specific error in USAC's decision
7. List supporting documentation to be attached
8. End with "Respectfully," and signature block
9. Use clear, plain language — no legal jargon, no due process arguments, no administrative law
10. Be concise and focused (800-1500 words)

Generate the complete appeal letter now:"""

        try:
            # Try Claude first for best formal writing
            result = self._manager.call_claude(
                [{"role": "user", "content": prompt}],
                system="You are a senior E-Rate program consultant who writes concise, rule-based appeals focused on evidence and program rules. Never use legal jargon.",
                max_tokens=6000
            )
            if result and len(result) > 500:
                return result
        except Exception as e:
            print(f"Claude failed for appeal letter: {e}")
        
        # Fallback to Gemini
        try:
            result = self._manager.call_gemini(prompt)
            if result and len(result) > 500:
                return result
        except Exception as e:
            print(f"Gemini failed for appeal letter: {e}")
        
        # Return template if AI fails
        return self._generate_template_appeal(denial_info, strategy)
    
    def _generate_template_appeal(self, denial_info: Dict[str, Any], strategy: Dict[str, Any]) -> str:
        """Generate a template appeal letter when AI is unavailable."""
        from datetime import datetime
        
        frn = denial_info.get('frn', 'Unknown')
        funding_year = denial_info.get('funding_year', 'Unknown')
        amount = denial_info.get('amount_requested', 0)
        denial_reason = denial_info.get('denial_reason', 'Not specified')
        
        return f"""Dear USAC Appeals Committee:

RE: Appeal of Funding Decision - FRN {frn}, Funding Year {funding_year}
    Amount: ${amount:,.2f}

I. WHAT USAC DECIDED

USAC denied funding for FRN {frn} for Funding Year {funding_year}, affecting ${amount:,.2f} in requested E-Rate support.

USAC's stated reason:
"{denial_reason}"

II. WHAT THE PROGRAM RULES REQUIRE

The E-Rate program rules, as established by FCC orders and USAC program guidelines, set specific requirements that applicants must follow. For the issue identified in the denial above, the applicable rule is defined in the relevant FCC order (Fifth Report and Order for competitive bidding, Sixth Report and Order for procedural requirements, or the Eligible Services List for service eligibility).

III. EVIDENCE THE APPLICANT FOLLOWED THE RULES

The applicant followed the applicable E-Rate program rules for FRN {frn}:

1. All required forms (Form 470, Form 471) were filed within the applicable windows
2. The competitive bidding process was conducted in accordance with the 28-day rule
3. Required documentation was maintained and is available for review
4. The requested services are eligible under the Eligible Services List for Funding Year {funding_year}

IV. WHY USAC'S DECISION SHOULD BE REVERSED

The denial is based on a factual or procedural error. The applicant can demonstrate compliance with the specific rule at issue, and any perceived deficiency is either a ministerial error or a misunderstanding of the applicant's documentation.

V. REQUESTED RELIEF

The applicant respectfully requests that USAC reverse the denial and approve funding for FRN {frn} in the amount of ${amount:,.2f}.

VI. SUPPORTING DOCUMENTATION

The following documents are attached:
- Copy of the FCDL being appealed
- Form 470 and bid evaluation documentation
- Relevant contracts and service agreements
- Additional evidence addressing the specific denial reason

Respectfully,

[Applicant Name]
[Title]
[Organization]
[Date: {datetime.now().strftime('%B %d, %Y')}]
[Contact Information]
"""
    
    def chat_about_appeal(
        self, 
        message: str, 
        chat_history: List[Dict[str, str]], 
        context: Dict[str, Any]
    ) -> str:
        """
        Chat with AI about refining an appeal.
        
        Args:
            message: User's message
            chat_history: Previous chat messages
            context: Appeal context (frn, denial_reason, current_letter, strategy)
            
        Returns:
            AI response
        """
        import json
        
        # Build conversation context
        history_text = ""
        for msg in chat_history[-10:]:  # Last 10 messages
            role = "User" if msg.get("role") == "user" else "Assistant"
            history_text += f"{role}: {msg.get('content', '')}\n\n"
        
        prompt = f"""You are an E-Rate appeals expert helping to refine an appeal letter.

APPEAL CONTEXT:
- FRN: {context.get('frn', 'Unknown')}
- Denial Reason: {context.get('denial_reason', 'Not specified')}

CURRENT APPEAL LETTER:
{context.get('current_letter', 'No letter yet')[:2000]}...

CONVERSATION HISTORY:
{history_text}

USER'S NEW MESSAGE:
{message}

Provide helpful, specific guidance about the appeal. If they ask to modify the letter, suggest specific changes. Be concise but thorough."""

        try:
            result = self._manager.call_gemini(prompt)
            return result if result else "I apologize, I couldn't generate a response. Please try again."
        except Exception as e:
            print(f"Chat error: {e}")
            return "I apologize, I'm having trouble responding. Please try again in a moment."


# Singleton accessor
def get_ai_service() -> AIService:
    """Get the AI service singleton instance."""
    return AIService()
