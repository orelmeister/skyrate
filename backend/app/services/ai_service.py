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
        prompt = f"""Analyze this E-Rate FCDL (Funding Commitment Decision Letter) denial comment.
        
        FCDL Comment:
        {fcdl_comments}
        
        Extract and return:
        1. List of specific violations (e.g., DR1, DR2)
        2. For each violation:
           - Rule type (competitive bidding, documentation, etc.)
           - Key dates mentioned
           - Vendors or forms referenced
           - Potential remediation approach
        3. Overall appealability assessment (High/Medium/Low)
        4. Recommended next steps
        
        Format as structured JSON.
        """
        
        response = self._manager.call_gemini(prompt)
        
        # Try to parse as JSON, otherwise return as text analysis
        try:
            import json
            return json.loads(response)
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
        system_prompt = """You are an expert E-Rate compliance consultant with 15+ years of experience successfully appealing denied funding applications. Your appeals have an 85% success rate because you:

1. Write in formal, professional legal language suitable for government submissions
2. Always include specific FCC regulation citations (47 C.F.R.)
3. Reference relevant FCC orders and precedents
4. Address each denial reason with specific counter-arguments
5. Demonstrate the applicant's good faith compliance effort
6. Follow proper legal brief structure with clear sections
7. Include specific dates, amounts, and documentation references

Your appeals are known for being thorough, persuasive, and ready for immediate submission to USAC."""

        # Enhanced prompt with better structure and examples
        prompt = f"""Generate a comprehensive, professional E-Rate appeal letter for this denied funding application. This must be a complete, submission-ready formal appeal.

## CASE INFORMATION
- **FRN:** {frn}
- **Funding Year:** {funding_year} 
- **Amount Denied:** ${amount:,.2f}
- **Service Type:** {denial_details.get('service_type', 'Not specified')}
- **Service Description:** {denial_details.get('service_description', 'Not specified')}
- **Organization:** {organization_info.get('organization_name', 'Not specified') if organization_info else 'Not specified'}

## DENIAL REASON FROM USAC
**FCDL Comment:** "{fcdl_comment}"

**Violation Categories:** {', '.join(violation_types) if violation_types else 'General procedural'}

## USAC DATA CONTEXT
Service Provider: {usac_context.get('service_provider_name', 'Not specified')}
Discount Rate: {usac_context.get('discount_pct', 'Not specified')}%
Form 470 Number: {usac_context.get('establishing_fcc_form470_number', 'Not specified')}
{f"Form 470 Posted: {form_470_data.get('posting_date', 'Not specified')}" if form_470_data else ""}
{f"Contract Date: {form_470_data.get('allowable_contract_date', 'Not specified')}" if form_470_data else ""}

## REQUIRED APPEAL STRUCTURE

**HEADER:**
- Formal government letter format with USAC address
- Clear subject line with FRN, funding year, amount
- Professional salutation ("Dear USAC Appeals Committee:")

**BODY SECTIONS:**
1. **INTRODUCTION** - Brief summary requesting reversal of denial
2. **BACKGROUND** - Application details and timeline  
3. **DENIAL SUMMARY** - Quote the exact FCDL language
4. **GROUNDS FOR APPEAL** - Numbered counter-arguments addressing each violation:
   - Cite specific FCC regulations (47 C.F.R. §54.503, etc.)
   - Reference relevant FCC orders and precedents
   - Provide specific dates, amounts, and facts
   - Address competitive bidding, documentation, eligibility, or procedural issues
5. **GOOD FAITH COMPLIANCE** - Demonstrate intent to follow program rules
6. **SUPPORTING DOCUMENTATION** - List attachments being provided
7. **CONCLUSION** - Professional closing requesting specific relief
8. **SIGNATURE BLOCK** - Formal signature line with contact information

**CRITICAL REQUIREMENTS:**
- Use formal legal language throughout
- Include specific regulation citations for each argument
- Reference actual FCC orders where similar appeals succeeded
- Address the specific denial reasons with factual counter-arguments
- Maintain respectful, professional tone
- Be thorough but concise (aim for 4-6 pages when printed)
- Make it ready for immediate submission with minimal editing

Generate the complete formal appeal letter now:"""

        # Try Claude first (best for formal legal writing)
        try:
            result = self._manager.call_claude(
                [{"role": "user", "content": prompt}],
                system=system_prompt,
                max_tokens=8000
            )
            # Enhanced quality check
            if (result and len(result) > 1000 and 
                "dear usac" in result.lower() and 
                "respectfully" in result.lower() and
                "47 c.f.r" in result.lower() and
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
            gemini_prompt = f"""Write a formal E-Rate appeal letter for FRN {frn} denied for ${amount:,.2f} in funding year {funding_year}.

DENIAL REASON: {fcdl_comment}

Create a professional appeal letter that:
- Starts with "Dear USAC Appeals Committee:"
- Uses formal legal language with FCC regulation citations
- Addresses each specific denial reason with counter-arguments
- Ends with "Respectfully submitted,"
- Is ready for submission to USAC

Make it comprehensive and persuasive (minimum 2000 words)."""
            
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
                {"role": "system", "content": "You are an expert E-Rate legal consultant."},
                {"role": "user", "content": f"""Write a formal appeal letter for denied E-Rate FRN {frn} (${amount:,.2f}). 
                
Denial reason: {fcdl_comment}

Format as a professional legal document ready for USAC submission. Include specific FCC regulations and be comprehensive."""}
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
        
        prompt = f"""Generate a formal E-Rate appeal letter ready for submission to USAC.

CASE DETAILS:
- FRN: {frn}
- Funding Year: {funding_year}
- Amount Denied: ${amount:,.2f}
- Service Type: {service_type}
- Denial Category: {denial_category}

DENIAL REASON FROM USAC:
"{denial_reason}"

APPEAL STRATEGY:
Key Arguments: {', '.join(key_arguments) if key_arguments else 'Address procedural compliance'}
FCC Citations: {', '.join(fcc_citations) if fcc_citations else '47 C.F.R. §54.503'}

REQUIREMENTS:
1. Start with "Dear USAC Appeals Committee:"
2. Include formal header with FRN and funding year reference
3. Summarize the denial clearly
4. Present 3-5 specific arguments addressing the denial
5. Cite relevant FCC regulations (47 C.F.R.)
6. Demonstrate good faith compliance efforts
7. List supporting documentation to be attached
8. End with "Respectfully submitted," and signature block
9. Keep professional and persuasive tone
10. Make it ready for immediate submission

Generate the complete appeal letter now:"""

        try:
            # Try Claude first for best formal writing
            result = self._manager.call_claude(
                [{"role": "user", "content": prompt}],
                system="You are an expert E-Rate appeals consultant. Generate formal, professional appeal letters.",
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

RE: Appeal of Funding Denial - FRN {frn}, Funding Year {funding_year}
    Amount: ${amount:,.2f}

I am writing to formally appeal the denial of funding for the above-referenced Funding Request Number (FRN).

BACKGROUND:
The applicant submitted Form 471 for funding year {funding_year}, requesting E-Rate support in the amount of ${amount:,.2f}.

DENIAL REASON:
The application was denied with the following reason:
"{denial_reason}"

GROUNDS FOR APPEAL:
The applicant respectfully requests reconsideration of this denial for the following reasons:

1. Good Faith Compliance: The applicant made every reasonable effort to comply with all applicable E-Rate program rules and regulations.

2. Procedural Compliance: To the extent any procedural requirements were not met, the applicant believes such non-compliance was technical in nature and did not undermine the competitive bidding process or program integrity.

3. Program Intent: The denial does not serve the underlying purpose of the E-Rate program, which is to ensure that schools and libraries have affordable access to telecommunications and information services.

SUPPORTING DOCUMENTATION:
The following documents are attached in support of this appeal:
- Copy of Form 470
- Copy of Form 471
- Bid evaluation documentation
- Contract documentation

CONCLUSION:
For the foregoing reasons, the applicant respectfully requests that USAC reverse the denial of funding for FRN {frn} and commit the requested amount of ${amount:,.2f}.

Respectfully submitted,

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
