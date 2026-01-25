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
        Generate an appeal strategy document.
        
        Args:
            denial_details: Structured denial information
            organization_info: Optional applicant details
            
        Returns:
            AI-generated appeal strategy
        """
        import json
        
        prompt = f"""Generate a comprehensive E-Rate appeal strategy.

        Denial Details:
        {json.dumps(denial_details, indent=2, default=str)}
        
        {"Organization Info:" + json.dumps(organization_info, indent=2) if organization_info else ""}
        
        Create a detailed appeal strategy including:
        1. Executive Summary
        2. Violation-by-Violation Analysis
        3. Evidence Required
        4. Recommended Timeline
        5. Appeal Letter Outline
        6. Success Probability Assessment
        
        Use professional language suitable for E-Rate compliance.
        """
        
        # Use Claude for report generation
        return self._manager.call_claude(
            [{"role": "user", "content": prompt}],
            system="You are an expert E-Rate compliance consultant helping schools and libraries appeal denied funding applications.",
            max_tokens=8000
        )
    
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


# Singleton accessor
def get_ai_service() -> AIService:
    """Get the AI service singleton instance."""
    return AIService()
