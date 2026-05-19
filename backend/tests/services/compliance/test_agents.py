"""
Tests for the multi-agent compliance pipeline (Phase 2A).
All LLM calls are mocked — tests validate orchestration logic.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.compliance.agents import run_pipeline, PipelineResult
from app.services.compliance.agents.extractor_agent import ExtractedData, extract_document_data
from app.services.compliance.agents.bid_reviewer_agent import BidReviewNotes, review_bid
from app.services.compliance.agents.compliance_officer_agent import (
    ComplianceAssessment,
    produce_final_assessment,
    _fallback_assessment,
)
from app.services.compliance.agents.verifier_agent import VerificationResult, verify_assessment


# --- Fixtures ---

SAMPLE_DOC = """Form 470 Application for E-Rate Services
Applicant: Test School District (BEN: 123456)
Services Requested: Internet Access, WAN
Category: Category 1
Posting Date: 01/15/2026
Closing Date: 02/12/2026
Evaluation Criteria: Price (60%), Technical Approach (30%), Experience (10%)
"""

SAMPLE_METADATA = {"filename": "test_form470.pdf"}

SAMPLE_RULE_FINDINGS = [
    {
        "rule_id": "RULE-001",
        "severity": "high",
        "area": "28-Day Window",
        "description": "Posting window is only 28 days",
        "suggestion": "Verify dates",
        "rule_reference": "47 CFR 54.503",
        "source": "rule_engine",
    }
]


# --- Test Agent 1: Extractor ---

class TestExtractorAgent:
    @pytest.mark.asyncio
    async def test_extractor_success(self):
        """Extractor returns structured data from mocked Gemini response."""
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "form_type": "Form 470",
            "posting_date": "2026-01-15",
            "closing_date": "2026-02-12",
            "service_categories": ["Category 1"],
            "services_requested": ["Internet Access", "WAN"],
            "entities": [{"name": "Test School District", "ben": "123456", "role": "applicant"}],
            "evaluation_criteria": ["price", "technical approach", "experience"],
            "cost_allocation_mentioned": False,
            "ineligible_services_mentioned": False,
            "raw_dates": ["01/15/2026", "02/12/2026"],
            "document_length_chars": 300,
        })

        with patch("google.generativeai.configure"), \
             patch("google.generativeai.GenerativeModel") as mock_model:
            mock_model.return_value.generate_content.return_value = mock_response
            result = await extract_document_data(SAMPLE_DOC, SAMPLE_METADATA)

        assert result.form_type == "Form 470"
        assert result.posting_date == "2026-01-15"
        assert len(result.entities) == 1
        assert result.entities[0].ben == "123456"

    @pytest.mark.asyncio
    async def test_extractor_fallback_on_error(self):
        """Extractor returns empty ExtractedData on failure."""
        with patch("google.generativeai.configure"), \
             patch("google.generativeai.GenerativeModel") as mock_model:
            mock_model.return_value.generate_content.side_effect = Exception("API error")
            result = await extract_document_data(SAMPLE_DOC, SAMPLE_METADATA)

        assert result.form_type == "Form 470"
        assert result.document_length_chars == len(SAMPLE_DOC)
        assert result.entities == []


# --- Test Agent 2: Bid Reviewer ---

class TestBidReviewerAgent:
    @pytest.mark.asyncio
    async def test_reviewer_success(self):
        """Bid reviewer returns structured notes."""
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "issues": [
                {"rule_id": "REVIEW-001", "severity": "medium",
                 "description": "Evaluation weights sum to 100% but price at 60% may limit competition"}
            ],
            "observations": ["Standard Form 470 format"],
            "risk_indicators": ["Price heavily weighted"],
            "recommended_risk": "Medium",
        })

        extracted = ExtractedData(
            services_requested=["Internet Access", "WAN"],
            document_length_chars=300,
        )

        with patch("google.generativeai.configure"), \
             patch("google.generativeai.GenerativeModel") as mock_model:
            mock_model.return_value.generate_content.return_value = mock_response
            result = await review_bid(extracted, SAMPLE_RULE_FINDINGS, [])

        assert len(result.issues) == 1
        assert result.recommended_risk == "Medium"

    @pytest.mark.asyncio
    async def test_reviewer_fallback_on_error(self):
        """Bid reviewer returns empty notes on failure."""
        extracted = ExtractedData(document_length_chars=300)

        with patch("google.generativeai.configure"), \
             patch("google.generativeai.GenerativeModel") as mock_model:
            mock_model.return_value.generate_content.side_effect = Exception("timeout")
            result = await review_bid(extracted, SAMPLE_RULE_FINDINGS, [])

        assert result.issues == []
        assert result.recommended_risk == "Low"


# --- Test Agent 3: Compliance Officer ---

class TestComplianceOfficerAgent:
    @pytest.mark.asyncio
    async def test_officer_success(self):
        """Officer produces full assessment."""
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "overall_risk": "Medium",
            "summary": "Document has potential 28-day window issue.",
            "key_concerns": ["28-day window compliance"],
            "recommendations": ["Verify posting dates with USAC calendar"],
            "additional_findings": [],
            "confidence_note": "High confidence based on rule findings.",
        })

        extracted = ExtractedData(document_length_chars=300)
        review = BidReviewNotes(issues=[], recommended_risk="Low")

        with patch("google.generativeai.configure"), \
             patch("google.generativeai.GenerativeModel") as mock_model:
            mock_model.return_value.generate_content.return_value = mock_response
            result = await produce_final_assessment(extracted, review, SAMPLE_RULE_FINDINGS)

        assert result.overall_risk == "Medium"
        assert "28-day" in result.summary

    def test_fallback_assessment_high(self):
        """Fallback gives High when high-severity findings exist."""
        findings = [{"severity": "high", "description": "Bad"}]
        review = BidReviewNotes()
        result = _fallback_assessment(findings, review)
        assert result.overall_risk == "High"

    def test_fallback_assessment_low(self):
        """Fallback gives Low when only low-severity findings exist."""
        findings = [{"severity": "low", "description": "Minor"}]
        review = BidReviewNotes()
        result = _fallback_assessment(findings, review)
        assert result.overall_risk == "Low"


# --- Test Agent 4: Verifier ---

class TestVerifierAgent:
    @pytest.mark.asyncio
    async def test_verifier_agrees(self):
        """Verifier agrees with Medium assessment."""
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=json.dumps({
            "disagrees": False,
            "suggested_risk": None,
            "reasoning": "Assessment is accurate.",
            "confidence": 0.85,
        }))]

        assessment = ComplianceAssessment(overall_risk="Medium", summary="test")
        review = BidReviewNotes()

        with patch("app.services.compliance.agents.verifier_agent.get_settings") as mock_settings:
            mock_settings.return_value.ANTHROPIC_API_KEY = "test-key"
            mock_settings.return_value.CLAUDE_MODEL = "claude-3-5-sonnet-latest"
            with patch("anthropic.Anthropic") as mock_client:
                mock_client.return_value.messages.create.return_value = mock_message
                result = await verify_assessment(SAMPLE_DOC, assessment, review)

        assert result.disagrees is False
        assert result.confidence == 0.85

    @pytest.mark.asyncio
    async def test_verifier_disagrees(self):
        """Verifier disagrees and suggests High risk."""
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=json.dumps({
            "disagrees": True,
            "suggested_risk": "High",
            "reasoning": "28-day violation is a definite rejection trigger.",
            "confidence": 0.92,
        }))]

        assessment = ComplianceAssessment(overall_risk="Medium", summary="test")
        review = BidReviewNotes()

        with patch("app.services.compliance.agents.verifier_agent.get_settings") as mock_settings:
            mock_settings.return_value.ANTHROPIC_API_KEY = "test-key"
            mock_settings.return_value.CLAUDE_MODEL = "claude-3-5-sonnet-latest"
            with patch("anthropic.Anthropic") as mock_client:
                mock_client.return_value.messages.create.return_value = mock_message
                result = await verify_assessment(SAMPLE_DOC, assessment, review)

        assert result.disagrees is True
        assert result.suggested_risk == "High"

    @pytest.mark.asyncio
    async def test_verifier_skipped_no_api_key(self):
        """Verifier skips gracefully without API key."""
        assessment = ComplianceAssessment(overall_risk="Medium", summary="test")
        review = BidReviewNotes()

        with patch("app.services.compliance.agents.verifier_agent.get_settings") as mock_settings:
            mock_settings.return_value.ANTHROPIC_API_KEY = None
            result = await verify_assessment(SAMPLE_DOC, assessment, review)

        assert result.disagrees is False
        assert "skipped" in result.reasoning.lower()


# --- Test Full Pipeline ---

class TestFullPipeline:
    @pytest.mark.asyncio
    async def test_pipeline_low_risk(self):
        """Full pipeline produces result for low-risk doc (no verifier triggered)."""
        # Mock all agents
        mock_extracted = ExtractedData(
            services_requested=["Internet Access"],
            document_length_chars=300,
        )
        mock_review = BidReviewNotes(issues=[], recommended_risk="Low")
        mock_assessment = ComplianceAssessment(
            overall_risk="Low",
            summary="Document appears compliant.",
        )

        with patch("app.services.compliance.agents.extract_document_data",
                   new_callable=AsyncMock, return_value=mock_extracted), \
             patch("app.services.compliance.agents.review_bid",
                   new_callable=AsyncMock, return_value=mock_review), \
             patch("app.services.compliance.agents.produce_final_assessment",
                   new_callable=AsyncMock, return_value=mock_assessment):

            result = await run_pipeline(
                document_text=SAMPLE_DOC,
                metadata=SAMPLE_METADATA,
                rule_findings=SAMPLE_RULE_FINDINGS,
                corpus_citations=[],
                engine_version="2.0.0",
            )

        assert isinstance(result, PipelineResult)
        assert result.overall_risk == "Low"
        assert result.verification is None  # Verifier not triggered for Low
        assert result.disagreement_flag is False

    @pytest.mark.asyncio
    async def test_pipeline_medium_risk_triggers_verifier(self):
        """Medium risk triggers verifier agent."""
        mock_extracted = ExtractedData(document_length_chars=300)
        mock_review = BidReviewNotes(issues=[], recommended_risk="Medium")
        mock_assessment = ComplianceAssessment(
            overall_risk="Medium",
            summary="Borderline compliance.",
        )
        mock_verification = VerificationResult(
            disagrees=False,
            reasoning="Assessment is correct.",
            confidence=0.8,
        )

        with patch("app.services.compliance.agents.extract_document_data",
                   new_callable=AsyncMock, return_value=mock_extracted), \
             patch("app.services.compliance.agents.review_bid",
                   new_callable=AsyncMock, return_value=mock_review), \
             patch("app.services.compliance.agents.produce_final_assessment",
                   new_callable=AsyncMock, return_value=mock_assessment), \
             patch("app.services.compliance.agents.verify_assessment",
                   new_callable=AsyncMock, return_value=mock_verification):

            result = await run_pipeline(
                document_text=SAMPLE_DOC,
                metadata=SAMPLE_METADATA,
                rule_findings=[],
                corpus_citations=[],
                engine_version="2.0.0",
            )

        assert result.overall_risk == "Medium"
        assert result.verification is not None
        assert result.disagreement_flag is False

    @pytest.mark.asyncio
    async def test_pipeline_verifier_escalates_to_high(self):
        """Verifier disagreement escalates Medium to High."""
        mock_extracted = ExtractedData(document_length_chars=300)
        mock_review = BidReviewNotes(issues=[], recommended_risk="Medium")
        mock_assessment = ComplianceAssessment(
            overall_risk="Medium",
            summary="Borderline.",
        )
        mock_verification = VerificationResult(
            disagrees=True,
            suggested_risk="High",
            reasoning="Clear violation.",
            confidence=0.95,
        )

        with patch("app.services.compliance.agents.extract_document_data",
                   new_callable=AsyncMock, return_value=mock_extracted), \
             patch("app.services.compliance.agents.review_bid",
                   new_callable=AsyncMock, return_value=mock_review), \
             patch("app.services.compliance.agents.produce_final_assessment",
                   new_callable=AsyncMock, return_value=mock_assessment), \
             patch("app.services.compliance.agents.verify_assessment",
                   new_callable=AsyncMock, return_value=mock_verification):

            result = await run_pipeline(
                document_text=SAMPLE_DOC,
                metadata=SAMPLE_METADATA,
                rule_findings=[],
                corpus_citations=[],
                engine_version="2.0.0",
            )

        assert result.overall_risk == "High"  # Escalated
        assert result.disagreement_flag is True
