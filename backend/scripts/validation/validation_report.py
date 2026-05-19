"""
Stage 3: Validation Report Generator

Reads evaluation results and corpus data, computes statistics, and generates
a self-contained HTML report.

Usage:
    python -m scripts.validation.validation_report [--in PATH] [--out PATH]
"""

import argparse
import json
import logging
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_RESULTS_DIR = Path("data/validation/eval_results")
DEFAULT_CORPUS_DIR = Path("data/validation/form470_corpus")
DEFAULT_REPORT_PATH = Path("data/validation/report.html")


def load_json_files(directory: Path) -> list[dict]:
    """Load all JSON files from directory (excluding manifests)."""
    files = sorted(
        f for f in directory.glob("*.json")
        if "manifest" not in f.name
    )
    records = []
    for fp in files:
        with open(fp, "r", encoding="utf-8") as f:
            records.append(json.load(f))
    return records


def compute_rule_fire_rates(eval_records: list[dict]) -> dict[str, dict]:
    """
    Compute per-rule fire rate and confidence stats.

    Returns dict mapping rule_id -> {count, rate, confidence_stats}.
    """
    total = len(eval_records)
    if total == 0:
        return {}

    rule_data: dict[str, list[float]] = {}

    for rec in eval_records:
        result = rec.get("result", {})
        rule_findings = result.get("rule_findings", [])
        for rf in rule_findings:
            rule_id = rf.get("rule_id", "unknown")
            confidence = rf.get("confidence", 0.0)
            if rule_id not in rule_data:
                rule_data[rule_id] = []
            rule_data[rule_id].append(confidence)

    stats = {}
    for rule_id, confidences in rule_data.items():
        sorted_conf = sorted(confidences)
        n = len(sorted_conf)
        stats[rule_id] = {
            "count": n,
            "fire_rate": round(n / total, 4),
            "confidence_min": round(sorted_conf[0], 4),
            "confidence_p25": round(sorted_conf[max(0, n // 4 - 1)], 4),
            "confidence_median": round(statistics.median(sorted_conf), 4),
            "confidence_p75": round(sorted_conf[min(n - 1, 3 * n // 4)], 4),
            "confidence_max": round(sorted_conf[-1], 4),
        }
    return stats


def compute_risk_histogram(eval_records: list[dict]) -> list[int]:
    """
    Compute LLM risk score histogram (10 buckets from 0 to 1).

    Maps overall_risk string to numeric: Low=0.2, Medium=0.5, High=0.8.
    """
    risk_map = {"Low": 0.2, "Medium": 0.5, "High": 0.8}
    buckets = [0] * 10

    for rec in eval_records:
        result = rec.get("result", {})
        risk_str = result.get("overall_risk", "Medium")
        score = risk_map.get(risk_str, 0.5)

        # Also check for numeric risk_score if present
        if "risk_score" in result:
            try:
                score = float(result["risk_score"])
            except (TypeError, ValueError):
                pass

        bucket_idx = min(int(score * 10), 9)
        buckets[bucket_idx] += 1

    return buckets


def compute_severity_stats(eval_records: list[dict]) -> dict[str, float]:
    """Compute average findings per document by severity."""
    severity_counts: dict[str, list[int]] = {"high": [], "medium": [], "low": []}
    total = len(eval_records)

    for rec in eval_records:
        result = rec.get("result", {})
        counts: dict[str, int] = {"high": 0, "medium": 0, "low": 0}

        all_findings = (
            result.get("findings", [])
            + result.get("rule_findings", [])
            + result.get("llm_findings", [])
        )
        for f in all_findings:
            sev = f.get("severity", "low").lower()
            if sev in counts:
                counts[sev] += 1

        for sev, count in counts.items():
            severity_counts[sev].append(count)

    avg = {}
    for sev, counts_list in severity_counts.items():
        if counts_list:
            avg[sev] = round(sum(counts_list) / len(counts_list), 2)
        else:
            avg[sev] = 0.0
    return avg


def compute_status_correlation(
    eval_records: list[dict], corpus_records: list[dict]
) -> dict:
    """
    Correlate LLM risk score with form470_status.

    Returns breakdown by status category.
    """
    # Map form470_number -> corpus record for status lookup
    corpus_map = {r.get("form470_number"): r for r in corpus_records}
    risk_map = {"Low": 0.2, "Medium": 0.5, "High": 0.8}

    status_scores: dict[str, list[float]] = {}

    for rec in eval_records:
        form470_number = rec.get("form470_number")
        corpus_rec = corpus_map.get(form470_number, {})
        status = corpus_rec.get("form470_status", "Unknown")
        result = rec.get("result", {})
        risk_str = result.get("overall_risk", "Medium")
        score = risk_map.get(risk_str, 0.5)

        if "risk_score" in result:
            try:
                score = float(result["risk_score"])
            except (TypeError, ValueError):
                pass

        if status not in status_scores:
            status_scores[status] = []
        status_scores[status].append(score)

    correlation = {}
    for status, scores in status_scores.items():
        correlation[status] = {
            "count": len(scores),
            "avg_risk_score": round(sum(scores) / len(scores), 4) if scores else 0,
            "min": round(min(scores), 4) if scores else 0,
            "max": round(max(scores), 4) if scores else 0,
        }
    return correlation


def get_top_risk_records(eval_records: list[dict], n: int = 10) -> list[dict]:
    """Get top N highest-risk records."""
    risk_map = {"Low": 0.2, "Medium": 0.5, "High": 0.8}
    scored = []
    for rec in eval_records:
        result = rec.get("result", {})
        risk_str = result.get("overall_risk", "Medium")
        score = risk_map.get(risk_str, 0.5)
        if "risk_score" in result:
            try:
                score = float(result["risk_score"])
            except (TypeError, ValueError):
                pass
        scored.append({
            "anon_id": rec.get("anon_id"),
            "form470_number": rec.get("form470_number"),
            "risk_score": round(score, 4),
            "overall_risk": risk_str,
        })

    scored.sort(key=lambda x: x["risk_score"], reverse=True)
    return scored[:n]


def generate_html_report(
    rule_stats: dict,
    histogram: list[int],
    severity_avg: dict,
    status_correlation: dict,
    top_risk: list[dict],
    total_records: int,
    output_path: Path,
) -> None:
    """Generate self-contained HTML report."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # Build histogram SVG bars
    max_count = max(histogram) if any(histogram) else 1
    bar_svgs = []
    for i, count in enumerate(histogram):
        height = int((count / max_count) * 120) if max_count > 0 else 0
        x = i * 40 + 10
        bar_svgs.append(
            f'<rect x="{x}" y="{140 - height}" width="30" '
            f'height="{height}" fill="#6b46c1" opacity="0.8"/>'
            f'<text x="{x + 15}" y="{155}" text-anchor="middle" '
            f'font-size="10">{i * 10}-{(i + 1) * 10}%</text>'
            f'<text x="{x + 15}" y="{135 - height}" text-anchor="middle" '
            f'font-size="9">{count}</text>'
        )
    histogram_svg = "\n".join(bar_svgs)

    # Rule stats table rows
    rule_rows = ""
    for rule_id, stats in sorted(rule_stats.items()):
        rule_rows += f"""<tr>
            <td>{rule_id}</td>
            <td>{stats['count']}</td>
            <td>{stats['fire_rate']:.1%}</td>
            <td>{stats['confidence_min']:.2f}</td>
            <td>{stats['confidence_p25']:.2f}</td>
            <td>{stats['confidence_median']:.2f}</td>
            <td>{stats['confidence_p75']:.2f}</td>
            <td>{stats['confidence_max']:.2f}</td>
        </tr>"""

    # Top risk table rows
    top_risk_rows = ""
    for rec in top_risk:
        top_risk_rows += f"""<tr>
            <td>{rec['anon_id']}</td>
            <td>{rec['form470_number']}</td>
            <td>{rec['risk_score']:.2f}</td>
            <td>{rec['overall_risk']}</td>
        </tr>"""

    # Status correlation rows
    status_rows = ""
    for status, data in sorted(status_correlation.items()):
        status_rows += f"""<tr>
            <td>{status}</td>
            <td>{data['count']}</td>
            <td>{data['avg_risk_score']:.4f}</td>
            <td>{data['min']:.4f}</td>
            <td>{data['max']:.4f}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Compliance Validation Report</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                line-height: 1.6; padding: 2rem; max-width: 1200px; margin: 0 auto;
                color: #1a1a2e; background: #f8f9fa; }}
        h1 {{ color: #6b46c1; margin-bottom: 0.5rem; }}
        h2 {{ color: #2d3748; margin: 2rem 0 1rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }}
        .meta {{ color: #718096; margin-bottom: 2rem; }}
        table {{ width: 100%; border-collapse: collapse; margin: 1rem 0; background: white;
                 border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        th, td {{ padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #e2e8f0; }}
        th {{ background: #6b46c1; color: white; font-weight: 600; }}
        tr:hover {{ background: #f7fafc; }}
        .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                         gap: 1rem; margin: 1rem 0; }}
        .summary-card {{ background: white; padding: 1.5rem; border-radius: 8px;
                         box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }}
        .summary-card .value {{ font-size: 2rem; font-weight: 700; color: #6b46c1; }}
        .summary-card .label {{ font-size: 0.875rem; color: #718096; }}
        .chart-container {{ background: white; padding: 1.5rem; border-radius: 8px;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin: 1rem 0; }}
        svg {{ display: block; margin: 0 auto; }}
        .disclaimer {{ margin-top: 3rem; padding: 1.5rem; background: #fffbeb;
                       border: 1px solid #f6e05e; border-radius: 8px; font-size: 0.875rem; }}
        .footer {{ margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;
                   color: #a0aec0; font-size: 0.75rem; }}
    </style>
</head>
<body>
    <h1>Compliance Validation Report</h1>
    <p class="meta">Generated: {now} | Corpus size: {total_records} records</p>

    <div class="summary-grid">
        <div class="summary-card">
            <div class="value">{total_records}</div>
            <div class="label">Total Records Evaluated</div>
        </div>
        <div class="summary-card">
            <div class="value">{severity_avg.get('high', 0):.1f}</div>
            <div class="label">Avg High-Severity / Doc</div>
        </div>
        <div class="summary-card">
            <div class="value">{severity_avg.get('medium', 0):.1f}</div>
            <div class="label">Avg Medium-Severity / Doc</div>
        </div>
        <div class="summary-card">
            <div class="value">{severity_avg.get('low', 0):.1f}</div>
            <div class="label">Avg Low-Severity / Doc</div>
        </div>
    </div>

    <h2>USAC Issue Risk Score Distribution</h2>
    <div class="chart-container">
        <svg width="420" height="170" viewBox="0 0 420 170">
            {histogram_svg}
        </svg>
        <p style="text-align:center; color:#718096; font-size:0.8rem; margin-top:0.5rem;">
            Risk score buckets (0-100%). Low=20%, Medium=50%, High=80%.
        </p>
    </div>

    <h2>Per-Rule Fire Rate and Confidence</h2>
    <table>
        <thead>
            <tr>
                <th>Rule ID</th>
                <th>Count</th>
                <th>Fire Rate</th>
                <th>Conf Min</th>
                <th>Conf P25</th>
                <th>Conf Median</th>
                <th>Conf P75</th>
                <th>Conf Max</th>
            </tr>
        </thead>
        <tbody>
            {rule_rows if rule_rows else '<tr><td colspan="8">No rule findings in evaluation results.</td></tr>'}
        </tbody>
    </table>

    <h2>Risk Score by Form 470 Status</h2>
    <table>
        <thead>
            <tr>
                <th>Status</th>
                <th>Count</th>
                <th>Avg Risk Score</th>
                <th>Min</th>
                <th>Max</th>
            </tr>
        </thead>
        <tbody>
            {status_rows if status_rows else '<tr><td colspan="5">No status data available.</td></tr>'}
        </tbody>
    </table>

    <h2>Top 10 Highest-Risk Records</h2>
    <table>
        <thead>
            <tr>
                <th>Anon ID</th>
                <th>Form 470 #</th>
                <th>Risk Score</th>
                <th>Risk Level</th>
            </tr>
        </thead>
        <tbody>
            {top_risk_rows if top_risk_rows else '<tr><td colspan="4">No records evaluated.</td></tr>'}
        </tbody>
    </table>

    <div class="disclaimer">
        <strong>Privacy Notice:</strong> All entity identifiers in this report are anonymized
        using a salted one-way hash. No applicant names, BENs, or personally identifiable
        information are stored in evaluation outputs.<br><br>
        <strong>Disclaimer:</strong> This validation report is for internal calibration purposes
        only. Risk scores are advisory and do not represent USAC determinations. "USAC issue risk"
        refers to the likelihood of triggering a USAC Program Integrity review, not a guarantee
        of approval or denial.
    </div>

    <div class="footer">
        <p>SkyRate AI Compliance Validation Harness | Internal Use Only</p>
        <p>Data derived from USAC Open Data (public records) cross-referenced with CRM filing metadata.</p>
        <p>Do not distribute this report externally. Corpus files are excluded from version control.</p>
    </div>
</body>
</html>"""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)


def generate_report(
    results_dir: Optional[Path] = None,
    corpus_dir: Optional[Path] = None,
    output_path: Optional[Path] = None,
) -> None:
    """Main report generation logic."""
    r_dir = results_dir or DEFAULT_RESULTS_DIR
    c_dir = corpus_dir or DEFAULT_CORPUS_DIR
    out_path = output_path or DEFAULT_REPORT_PATH

    if not r_dir.exists():
        print(f"[ERROR] Results directory not found: {r_dir}", file=sys.stderr)
        sys.exit(1)

    eval_records = load_json_files(r_dir)
    corpus_records = load_json_files(c_dir) if c_dir.exists() else []

    if not eval_records:
        print("[ERROR] No evaluation results found.", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] Loaded {len(eval_records)} eval results, {len(corpus_records)} corpus records.")

    # Compute statistics
    rule_stats = compute_rule_fire_rates(eval_records)
    histogram = compute_risk_histogram(eval_records)
    severity_avg = compute_severity_stats(eval_records)
    status_correlation = compute_status_correlation(eval_records, corpus_records)
    top_risk = get_top_risk_records(eval_records, n=10)

    # Generate HTML
    generate_html_report(
        rule_stats=rule_stats,
        histogram=histogram,
        severity_avg=severity_avg,
        status_correlation=status_correlation,
        top_risk=top_risk,
        total_records=len(eval_records),
        output_path=out_path,
    )
    print(f"[INFO] HTML report written to: {out_path}")

    # Print markdown summary to stdout
    print("\n--- VALIDATION SUMMARY (Markdown) ---\n")
    print(f"## Compliance Validation Report")
    print(f"- **Records evaluated:** {len(eval_records)}")
    print(f"- **Avg findings per doc:** High={severity_avg.get('high', 0):.1f}, "
          f"Medium={severity_avg.get('medium', 0):.1f}, Low={severity_avg.get('low', 0):.1f}")
    print(f"\n### Rule Fire Rates")
    if rule_stats:
        print(f"| Rule ID | Fire Rate | Median Confidence |")
        print(f"|---------|-----------|-------------------|")
        for rule_id, stats in sorted(rule_stats.items()):
            print(f"| {rule_id} | {stats['fire_rate']:.1%} | {stats['confidence_median']:.2f} |")
    else:
        print("No rule-engine findings detected in evaluated corpus.")

    print(f"\n### Risk Distribution")
    bucket_labels = [f"{i * 10}-{(i + 1) * 10}%" for i in range(10)]
    for label, count in zip(bucket_labels, histogram):
        if count > 0:
            print(f"- {label}: {count} records")

    print(f"\n### Top 5 Highest-Risk")
    for rec in top_risk[:5]:
        print(f"- {rec['anon_id']} (Form 470 #{rec['form470_number']}): "
              f"risk={rec['risk_score']:.2f} ({rec['overall_risk']})")

    if status_correlation:
        print(f"\n### Status Correlation")
        for status, data in sorted(status_correlation.items()):
            print(f"- {status}: n={data['count']}, avg_risk={data['avg_risk_score']:.3f}")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Stage 3: Generate compliance validation report"
    )
    parser.add_argument(
        "--in", dest="input_dir", type=str, default=None,
        help="Eval results directory"
    )
    parser.add_argument(
        "--out", type=str, default=None,
        help="Output HTML report path"
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    results_path = Path(args.input_dir) if args.input_dir else None
    out_path = Path(args.out) if args.out else None

    generate_report(results_dir=results_path, output_path=out_path)


if __name__ == "__main__":
    main()
