"""
Unit tests for the compliance validation harness.

Tests anonymization, manifest construction, and mocked API workflows.
Does NOT make any live network calls.
"""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Import the modules under test
from scripts.validation.auth import get_admin_session, AuthError
from scripts.validation.build_validation_corpus import (
    anonymize_entity_id,
    strip_applicant_names,
    build_narrative,
    fetch_form470_records,
    build_corpus,
)
from scripts.validation.run_compliance_eval import (
    scan_narrative_direct,
    run_evaluation,
)
from scripts.validation.validation_report import (
    compute_rule_fire_rates,
    compute_risk_histogram,
    compute_severity_stats,
    get_top_risk_records,
    load_json_files,
)


# ==================== SAMPLE DATA ====================

SAMPLE_CRM_RESPONSE = {
    "filing_data_coverage": {"total": 95, "with_form470": 95},
    "form470_records": [
        {
            "entity_id": "12345",
            "form470_number": "261042134",
            "form470_status": "Certified",
            "form470_posting_date": "2026-01-15",
            "form470_certified_date": "2026-02-20",
            "funding_year": 2026,
        },
        {
            "entity_id": "67890",
            "form470_number": "261042200",
            "form470_status": "Posted",
            "form470_posting_date": "2026-03-01",
            "form470_certified_date": None,
            "funding_year": 2026,
        },
        {
            "entity_id": "11111",
            "form470_number": None,
            "form470_status": None,
            "form470_posting_date": None,
            "form470_certified_date": None,
            "funding_year": 2026,
        },
    ],
}

SAMPLE_USAC_ROW = {
    "application_number": "261042134",
    "narrative": "Seeking proposals for wide area network services including MPLS and internet access.",
    "service_type": "Internet Access",
    "type_of_service_request": "WAN",
    "min_capacity": "100 Mbps",
    "max_capacity": "1 Gbps",
    "function": "Internet and Transport",
    "manufacturer": None,
    "installation_type": "New installation",
}

SAMPLE_EVAL_RESULT = {
    "overall_risk": "Medium",
    "summary": "Document shows moderate compliance risk.",
    "findings": [
        {
            "severity": "medium",
            "area": "Competitive Bidding",
            "description": "Narrative is vague about minimum requirements.",
            "suggestion": "Specify minimum bandwidth clearly.",
            "rule_reference": "FCC Order 19-117",
        }
    ],
    "rule_findings": [
        {
            "rule_id": "RULE-001",
            "rule_version": "1.0",
            "severity": "medium",
            "area": "Competitive Bidding",
            "description": "Missing minimum capacity specification.",
            "suggestion": "Add specific minimum bandwidth requirement.",
            "rule_reference": "47 CFR 54.503",
            "confidence": 0.85,
            "evidence_snippet": "Seeking proposals for...",
        }
    ],
    "llm_findings": [],
    "engine_version": "1.0.0",
    "disclaimer": "Advisory only.",
}


# ==================== ANONYMIZATION TESTS ====================


class TestAnonymization:
    """Test anonymize_entity_id function."""

    def test_deterministic_output(self) -> None:
        """Same input + salt always produces same output."""
        result1 = anonymize_entity_id("12345", "test-salt")
        result2 = anonymize_entity_id("12345", "test-salt")
        assert result1 == result2

    def test_format(self) -> None:
        """Output format is ENT-<8 hex chars>."""
        result = anonymize_entity_id("12345", "test-salt")
        assert result.startswith("ENT-")
        assert len(result) == 12  # "ENT-" + 8 chars
        # Verify hex
        hex_part = result[4:]
        int(hex_part, 16)  # Should not raise

    def test_salt_dependency(self) -> None:
        """Different salts produce different outputs."""
        result1 = anonymize_entity_id("12345", "salt-a")
        result2 = anonymize_entity_id("12345", "salt-b")
        assert result1 != result2

    def test_entity_dependency(self) -> None:
        """Different entity IDs produce different outputs."""
        result1 = anonymize_entity_id("12345", "same-salt")
        result2 = anonymize_entity_id("67890", "same-salt")
        assert result1 != result2


class TestStripApplicantNames:
    """Test name redaction from narrative text."""

    def test_school_district_removed(self) -> None:
        text = "Springfield School District is seeking proposals for internet."
        result = strip_applicant_names(text)
        assert "Springfield School District" not in result
        assert "[ENTITY_REDACTED]" in result

    def test_library_system_removed(self) -> None:
        text = "County Library System requires WAN services."
        # "County Library System" starts with uppercase
        result = strip_applicant_names(text)
        assert "[ENTITY_REDACTED]" in result

    def test_normal_text_preserved(self) -> None:
        text = "Seeking proposals for internet access at 100 Mbps minimum."
        result = strip_applicant_names(text)
        assert result == text

    def test_multiple_entities_removed(self) -> None:
        text = (
            "Lincoln Public Schools and Jefferson County Schools both need fiber."
        )
        result = strip_applicant_names(text)
        assert "Lincoln Public Schools" not in result
        assert "Jefferson County Schools" not in result


# ==================== BUILD NARRATIVE TESTS ====================


class TestBuildNarrative:
    """Test USAC row → narrative text construction."""

    def test_all_fields_present(self) -> None:
        result = build_narrative(SAMPLE_USAC_ROW)
        assert "narrative:" in result
        assert "service_type: Internet Access" in result
        assert "min_capacity: 100 Mbps" in result
        assert "installation_type: New installation" in result

    def test_missing_fields_skipped(self) -> None:
        row = {"narrative": "Test narrative", "manufacturer": None}
        result = build_narrative(row)
        assert "narrative: Test narrative" in result
        assert "manufacturer" not in result

    def test_empty_row(self) -> None:
        result = build_narrative({})
        assert result == ""


# ==================== MANIFEST TESTS ====================


class TestManifestConstruction:
    """Test that manifests correctly count records."""

    @patch("scripts.validation.build_validation_corpus.get_admin_session")
    @patch("scripts.validation.build_validation_corpus.Socrata")
    def test_manifest_counts(
        self, mock_socrata_cls: MagicMock, mock_auth: MagicMock
    ) -> None:
        """Verify manifest counts add up correctly."""
        # Mock auth
        mock_session = MagicMock()
        mock_auth.return_value = mock_session
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = SAMPLE_CRM_RESPONSE
        mock_session.get.return_value = mock_response

        # Mock Socrata
        mock_client = MagicMock()
        mock_socrata_cls.return_value = mock_client
        # First record found, second not found
        mock_client.get.side_effect = [
            [SAMPLE_USAC_ROW],  # found for 261042134
            [],  # not found for 261042200
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            os.environ["VALIDATION_SALT"] = "test-salt"
            os.environ["ERATEAPP_ADMIN_EMAIL"] = "test@test.com"
            os.environ["ERATEAPP_ADMIN_PASSWORD"] = "testpass"

            manifest = build_corpus(output_dir=Path(tmpdir))

            # 3 CRM records total, but one has form470_number=None
            # So only 2 are processed. Of those, 1 found in USAC, 1 not.
            assert manifest["total_crm_records"] == 3
            assert manifest["fetched_usac"] == 1
            assert manifest["missing_usac"] == 1
            assert manifest["written"] == 1
            # 1 error for null form470_number + 1 for missing USAC
            assert len(manifest["errors"]) == 2

            # Verify written file exists
            json_files = list(Path(tmpdir).glob("ENT-*.json"))
            assert len(json_files) == 1

            # Verify manifest file
            manifest_file = Path(tmpdir) / "manifest.json"
            assert manifest_file.exists()

    @patch("scripts.validation.build_validation_corpus.get_admin_session")
    @patch("scripts.validation.build_validation_corpus.Socrata")
    def test_manifest_with_limit(
        self, mock_socrata_cls: MagicMock, mock_auth: MagicMock
    ) -> None:
        """Verify --limit parameter restricts processing."""
        mock_session = MagicMock()
        mock_auth.return_value = mock_session
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = SAMPLE_CRM_RESPONSE
        mock_session.get.return_value = mock_response

        mock_client = MagicMock()
        mock_socrata_cls.return_value = mock_client
        mock_client.get.return_value = [SAMPLE_USAC_ROW]

        with tempfile.TemporaryDirectory() as tmpdir:
            os.environ["VALIDATION_SALT"] = "test-salt"
            os.environ["ERATEAPP_ADMIN_EMAIL"] = "test@test.com"
            os.environ["ERATEAPP_ADMIN_PASSWORD"] = "testpass"

            manifest = build_corpus(limit=1, output_dir=Path(tmpdir))

            # Limited to 1 record
            assert manifest["total_crm_records"] == 1


# ==================== AUTH TESTS ====================


class TestAuth:
    """Test authentication helper."""

    def test_missing_env_vars(self) -> None:
        """Raises AuthError when env vars missing."""
        with patch.dict(os.environ, {}, clear=True):
            # Remove the vars if present
            os.environ.pop("ERATEAPP_ADMIN_EMAIL", None)
            os.environ.pop("ERATEAPP_ADMIN_PASSWORD", None)
            with pytest.raises(AuthError, match="Missing required"):
                get_admin_session()

    @patch("scripts.validation.auth.requests.Session")
    def test_login_failure(self, mock_session_cls: MagicMock) -> None:
        """Raises AuthError on HTTP error."""
        os.environ["ERATEAPP_ADMIN_EMAIL"] = "test@test.com"
        os.environ["ERATEAPP_ADMIN_PASSWORD"] = "badpass"

        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        mock_session.post.return_value = mock_response

        with pytest.raises(AuthError, match="Login failed"):
            get_admin_session()


# ==================== EVAL TESTS ====================


class TestRunEvaluation:
    """Test compliance evaluation runner."""

    @patch("scripts.validation.run_compliance_eval.scan_narrative_direct")
    def test_evaluation_writes_results(
        self, mock_scan: MagicMock
    ) -> None:
        """Verify evaluation reads corpus and writes results."""
        mock_scan.return_value = SAMPLE_EVAL_RESULT

        with tempfile.TemporaryDirectory() as tmpdir:
            corpus_dir = Path(tmpdir) / "corpus"
            results_dir = Path(tmpdir) / "results"
            corpus_dir.mkdir()

            # Write a sample corpus file
            sample_record = {
                "anon_id": "ENT-1a2b3c4d",
                "form470_number": "261042134",
                "funding_year": 2026,
                "form470_status": "Certified",
                "posting_date": "2026-01-15",
                "certified_date": "2026-02-20",
                "narrative": "Seeking proposals for internet access.",
                "service_categories": ["Internet Access"],
                "source": "usac_form470_jp7s_vbzh",
                "fetched_at": "2026-05-19T00:00:00Z",
            }
            with open(corpus_dir / "ENT-1a2b3c4d__261042134.json", "w") as f:
                json.dump(sample_record, f)

            manifest = run_evaluation(
                corpus_dir=corpus_dir, results_dir=results_dir
            )

            assert manifest["total_evaluated"] == 1
            assert manifest["successful"] == 1
            assert manifest["errors"] == 0

            # Verify result file written
            result_files = list(results_dir.glob("*.json"))
            # Should have 1 result + 1 manifest
            assert len(result_files) == 2

            # Verify result content
            result_file = results_dir / "ENT-1a2b3c4d__261042134.json"
            assert result_file.exists()
            with open(result_file) as f:
                result_data = json.load(f)
            assert result_data["result"]["overall_risk"] == "Medium"


# ==================== REPORT TESTS ====================


class TestReportComputation:
    """Test report statistics computation."""

    def _make_eval_records(self) -> list[dict]:
        """Create sample eval records for testing."""
        return [
            {
                "anon_id": "ENT-aaaa1111",
                "form470_number": "261000001",
                "result": {
                    "overall_risk": "High",
                    "findings": [
                        {"severity": "high", "area": "X", "description": "Y", "suggestion": "Z"},
                    ],
                    "rule_findings": [
                        {"rule_id": "RULE-001", "confidence": 0.9, "severity": "high",
                         "area": "A", "description": "B", "suggestion": "C", "rule_reference": "D",
                         "rule_version": "1.0"},
                        {"rule_id": "RULE-002", "confidence": 0.7, "severity": "medium",
                         "area": "E", "description": "F", "suggestion": "G", "rule_reference": "H",
                         "rule_version": "1.0"},
                    ],
                    "llm_findings": [],
                },
            },
            {
                "anon_id": "ENT-bbbb2222",
                "form470_number": "261000002",
                "result": {
                    "overall_risk": "Low",
                    "findings": [],
                    "rule_findings": [
                        {"rule_id": "RULE-001", "confidence": 0.6, "severity": "medium",
                         "area": "A", "description": "B2", "suggestion": "C2", "rule_reference": "D",
                         "rule_version": "1.0"},
                    ],
                    "llm_findings": [],
                },
            },
            {
                "anon_id": "ENT-cccc3333",
                "form470_number": "261000003",
                "result": {
                    "overall_risk": "Medium",
                    "findings": [
                        {"severity": "low", "area": "Q", "description": "R", "suggestion": "S"},
                    ],
                    "rule_findings": [],
                    "llm_findings": [
                        {"severity": "medium", "area": "T", "description": "U",
                         "suggestion": "V", "source": "llm"},
                    ],
                },
            },
        ]

    def test_rule_fire_rates(self) -> None:
        """Per-rule fire rate computed correctly."""
        records = self._make_eval_records()
        stats = compute_rule_fire_rates(records)

        # RULE-001 fires in 2/3 records
        assert stats["RULE-001"]["count"] == 2
        assert abs(stats["RULE-001"]["fire_rate"] - 2 / 3) < 0.01

        # RULE-002 fires in 1/3 records
        assert stats["RULE-002"]["count"] == 1
        assert abs(stats["RULE-002"]["fire_rate"] - 1 / 3) < 0.01

    def test_risk_histogram(self) -> None:
        """Histogram buckets are populated correctly."""
        records = self._make_eval_records()
        histogram = compute_risk_histogram(records)

        # Low=0.2 -> bucket 2, Medium=0.5 -> bucket 5, High=0.8 -> bucket 8
        assert histogram[2] == 1  # Low
        assert histogram[5] == 1  # Medium
        assert histogram[8] == 1  # High
        assert sum(histogram) == 3

    def test_severity_stats(self) -> None:
        """Severity averages computed correctly."""
        records = self._make_eval_records()
        avg = compute_severity_stats(records)

        # Record 1: 1 high (from findings) + 1 high (rule_findings) + 1 medium (rule_findings) = 2 high, 1 medium
        # Record 2: 1 medium (rule_findings)
        # Record 3: 1 low (findings) + 1 medium (llm_findings)
        # High: [2, 0, 0] -> avg 0.67
        # Medium: [1, 1, 1] -> avg 1.0
        # Low: [0, 0, 1] -> avg 0.33
        assert avg["high"] == round(2 / 3, 2)
        assert avg["medium"] == 1.0
        assert avg["low"] == round(1 / 3, 2)

    def test_top_risk_records(self) -> None:
        """Top risk records sorted correctly."""
        records = self._make_eval_records()
        top = get_top_risk_records(records, n=2)

        assert len(top) == 2
        assert top[0]["overall_risk"] == "High"
        assert top[0]["risk_score"] == 0.8
        assert top[1]["overall_risk"] == "Medium"

    def test_load_json_files_excludes_manifest(self) -> None:
        """load_json_files skips manifest files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Write a data file and a manifest
            with open(Path(tmpdir) / "ENT-test__123.json", "w") as f:
                json.dump({"test": True}, f)
            with open(Path(tmpdir) / "manifest.json", "w") as f:
                json.dump({"count": 1}, f)
            with open(Path(tmpdir) / "results_manifest.json", "w") as f:
                json.dump({"count": 1}, f)

            records = load_json_files(Path(tmpdir))
            assert len(records) == 1
            assert records[0]["test"] is True
