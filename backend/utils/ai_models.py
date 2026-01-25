"""
AI Models Module for SkyRate AI
Provides AI model management and routing for various AI providers.

This module supports:
- Google Gemini
- DeepSeek
- Anthropic Claude
"""

import os
import logging
from enum import Enum
from typing import List, Dict, Any, Optional
import json

logger = logging.getLogger(__name__)


class AIModel(Enum):
    """Supported AI models."""
    GEMINI = "gemini"
    DEEPSEEK = "deepseek"
    CLAUDE = "claude"


class TaskType(Enum):
    """Types of AI tasks for routing."""
    QUICK_ANSWER = "quick_answer"
    DEEP_ANALYSIS = "deep_analysis"
    REPORT_GENERATION = "report_generation"
    QUERY_INTERPRETATION = "query_interpretation"


class AIModelManager:
    """
    Manages multiple AI models and routes tasks appropriately.
    
    Features:
    - Multi-model support (Gemini, DeepSeek, Claude)
    - Automatic fallback between models
    - Task-based routing
    - Rate limiting awareness
    """
    
    def __init__(self):
        """Initialize the AI Model Manager."""
        self._models: Dict[AIModel, bool] = {}
        self._check_available_models()
        
        # Default routing preferences
        self._task_routing = {
            TaskType.QUICK_ANSWER: AIModel.GEMINI,
            TaskType.DEEP_ANALYSIS: AIModel.CLAUDE,
            TaskType.REPORT_GENERATION: AIModel.CLAUDE,
            TaskType.QUERY_INTERPRETATION: AIModel.GEMINI,
        }
    
    def _check_available_models(self):
        """Check which AI models have valid API keys configured."""
        # Check Gemini
        gemini_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
        self._models[AIModel.GEMINI] = bool(gemini_key)
        
        # Check DeepSeek
        deepseek_key = os.environ.get('DEEPSEEK_API_KEY')
        self._models[AIModel.DEEPSEEK] = bool(deepseek_key)
        
        # Check Claude
        claude_key = os.environ.get('ANTHROPIC_API_KEY')
        self._models[AIModel.CLAUDE] = bool(claude_key)
        
        available = [m.value for m, v in self._models.items() if v]
        logger.info(f"Available AI models: {available if available else 'None (running in stub mode)'}")
    
    def get_available_models(self) -> List[str]:
        """Get list of models with valid API keys."""
        return [model.value for model, available in self._models.items() if available]
    
    def is_model_available(self, model: AIModel) -> bool:
        """Check if a specific model is available."""
        return self._models.get(model, False)
    
    def route_task(self, task_type: TaskType) -> AIModel:
        """
        Route a task to the most appropriate available model.
        
        Args:
            task_type: Type of task to perform
            
        Returns:
            Best available model for the task
        """
        preferred = self._task_routing.get(task_type, AIModel.GEMINI)
        
        if self.is_model_available(preferred):
            return preferred
        
        # Fallback chain
        fallback_order = [AIModel.GEMINI, AIModel.DEEPSEEK, AIModel.CLAUDE]
        for model in fallback_order:
            if self.is_model_available(model):
                return model
        
        # Return preferred even if not available (will fail gracefully)
        return preferred
    
    def call_gemini(self, prompt: str, **kwargs) -> str:
        """
        Call Google Gemini API.
        
        Args:
            prompt: The prompt to send
            **kwargs: Additional parameters
            
        Returns:
            Generated text response
        """
        api_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
        
        if not api_key:
            logger.warning("Gemini API key not configured, returning placeholder")
            return self._stub_response(prompt, "Gemini")
        
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            
            model_name = os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash')
            model = genai.GenerativeModel(model_name)
            
            response = model.generate_content(prompt)
            return response.text
            
        except ImportError:
            logger.warning("google-generativeai not installed")
            return self._stub_response(prompt, "Gemini")
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            return self._stub_response(prompt, "Gemini", str(e))
    
    def call_deepseek(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """
        Call DeepSeek API.
        
        Args:
            messages: Chat messages in OpenAI format
            **kwargs: Additional parameters
            
        Returns:
            Generated text response
        """
        api_key = os.environ.get('DEEPSEEK_API_KEY')
        
        if not api_key:
            logger.warning("DeepSeek API key not configured, returning placeholder")
            prompt = messages[-1].get('content', '') if messages else ''
            return self._stub_response(prompt, "DeepSeek")
        
        try:
            import httpx
            
            model_name = os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')
            
            response = httpx.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model_name,
                    "messages": messages,
                    **kwargs
                },
                timeout=60.0
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
            
        except Exception as e:
            logger.error(f"DeepSeek API error: {e}")
            prompt = messages[-1].get('content', '') if messages else ''
            return self._stub_response(prompt, "DeepSeek", str(e))
    
    def call_claude(
        self,
        messages: List[Dict[str, str]],
        system: Optional[str] = None,
        max_tokens: int = 4096,
        **kwargs
    ) -> str:
        """
        Call Anthropic Claude API.
        
        Args:
            messages: Chat messages
            system: Optional system prompt
            max_tokens: Maximum tokens to generate
            **kwargs: Additional parameters
            
        Returns:
            Generated text response
        """
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        
        if not api_key:
            logger.warning("Claude API key not configured, returning placeholder")
            prompt = messages[-1].get('content', '') if messages else ''
            return self._stub_response(prompt, "Claude")
        
        try:
            import anthropic
            
            client = anthropic.Anthropic(api_key=api_key)
            model_name = os.environ.get('CLAUDE_MODEL', 'claude-3-5-sonnet-latest')
            
            response = client.messages.create(
                model=model_name,
                max_tokens=max_tokens,
                system=system or "You are a helpful AI assistant specializing in E-Rate funding analysis.",
                messages=messages
            )
            return response.content[0].text
            
        except ImportError:
            logger.warning("anthropic package not installed")
            prompt = messages[-1].get('content', '') if messages else ''
            return self._stub_response(prompt, "Claude")
        except Exception as e:
            logger.error(f"Claude API error: {e}")
            prompt = messages[-1].get('content', '') if messages else ''
            return self._stub_response(prompt, "Claude", str(e))
    
    def interpret_query(self, query: str) -> Dict[str, Any]:
        """
        Interpret a natural language query into structured filters.
        
        Args:
            query: Natural language E-Rate query
            
        Returns:
            Dictionary with year, filters, and explanation
        """
        prompt = f"""You are an E-Rate data assistant. Parse this natural language query into structured filters.

Query: {query}

Return a JSON object with:
- year: funding year (integer, default to current year if not specified)
- filters: object with applicable filters (state, city, ben, applicant_name, funding_status)
- explanation: brief explanation of what you understood

Return only valid JSON, no markdown."""

        response = self.call_gemini(prompt)
        
        try:
            # Try to parse JSON from response
            response = response.strip()
            if response.startswith('```'):
                response = response.split('\n', 1)[1].rsplit('\n', 1)[0]
            return json.loads(response)
        except json.JSONDecodeError:
            # Return a default interpretation
            return {
                "year": 2025,
                "filters": {},
                "explanation": f"Could not parse query: {query}. Please use structured filters."
            }
    
    def _stub_response(self, prompt: str, model_name: str, error: str = None) -> str:
        """Generate a stub response when API is unavailable."""
        if error:
            return f"[{model_name} unavailable: {error}] Please configure API key to enable AI features."
        return f"[{model_name} API not configured] AI analysis requires API key configuration. Query received: {prompt[:100]}..."
