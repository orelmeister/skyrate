"""
Bid Compliance Copilot — knowledge base (Layer 2, RAG).

Curated, citable corpus of the FCC / E-Rate competitive-bidding rules
(47 CFR Part 54, Subpart F), the Eligible Services List framework, and a library
of appeal / denial fact patterns (FCC WC Docket 02-6 + USAC documented denial
reasons). Every passage carries a real citation + source URL, so the grounded
LLM (Layer 3) can cite-or-abstain — it may only assert what resolves to a stored
chunk here.

Retrieval is TF-IDF cosine computed in pure Python. For a corpus of a few hundred
short chunks this is instant and needs zero embeddings API or vector DB — which
also removes an entire class of external-dependency / retired-model failures.

Seeding is idempotent (keyed on ``seed_key``): re-running only inserts what is
missing, so it is safe to call on every startup and on a schedule.
"""

from __future__ import annotations

import logging
import math
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ...models.bid_copilot import FccKbChunk, AppealPrecedent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Curated corpus
# ---------------------------------------------------------------------------
# NOTE: summaries are intentionally conservative paraphrases of the public rules.
# The value is the citation + URL anchor for grounding; the LLM must cite these.

_ECFR = "https://www.ecfr.gov/current/title-47/section-54."

CFR_CHUNKS: List[Dict[str, Any]] = [
    {
        "seed_key": "cfr-54.500-definitions",
        "citation": "47 CFR § 54.500",
        "title": "Definitions — including Lowest Corresponding Price",
        "url": _ECFR + "500",
        "text": (
            "Subpart F definitions for the schools and libraries (E-Rate) program. "
            "'Lowest Corresponding Price' (LCP) is the lowest price a service provider "
            "charges to non-residential customers who are similarly situated to a "
            "particular E-Rate applicant for similar services. A service provider may "
            "not charge an eligible school, library, or consortium a price above the "
            "lowest corresponding price. Other defined terms include eligible services, "
            "Category One (connectivity to and from the building) and Category Two "
            "(internal connections, managed internal broadband services, and basic "
            "maintenance)."
        ),
    },
    {
        "seed_key": "cfr-54.501-obligations",
        "citation": "47 CFR § 54.501",
        "title": "Obligations of applicants and service providers",
        "url": _ECFR + "501",
        "text": (
            "Applicants must seek competitive bids for eligible services and select the "
            "most cost-effective offering with price as the primary factor. Service "
            "providers must comply with program rules, provide the lowest corresponding "
            "price, and may not offer or provide gifts or other inducements that would "
            "compromise the fair and open competitive bidding process."
        ),
    },
    {
        "seed_key": "cfr-54.502-eligible-services",
        "citation": "47 CFR § 54.502",
        "title": "Eligible services",
        "url": _ECFR + "502",
        "text": (
            "Supported services are limited to those on the Eligible Services List for "
            "the funding year. Category One is data transmission and internet access "
            "(connectivity to the building). Category Two is internal connections, "
            "managed internal broadband services (MIBS), and basic maintenance of "
            "internal connections (BMIC). Products or services not on the Eligible "
            "Services List are ineligible for discount and, if bundled, must be "
            "cost-allocated out of the eligible request."
        ),
    },
    {
        "seed_key": "cfr-54.503-competitive-bidding",
        "citation": "47 CFR § 54.503",
        "title": "Competitive bidding requirements (Form 470, fair and open, gift rules)",
        "url": _ECFR + "503",
        "text": (
            "An applicant must submit a Form 470 describing the services sought and post "
            "it for competitive bidding. A fair and open competitive bidding process is "
            "required: the service provider that helped write or prepare the Form 470 or "
            "RFP may not participate in the bidding, all bidders must have access to the "
            "same information, and the applicant must wait at least 28 days after the "
            "Form 470 is posted before selecting a provider and certifying the Form 471. "
            "The gift restrictions prohibit service providers from offering or providing "
            "gifts to applicant personnel involved in the procurement (de minimis "
            "exceptions apply). A bid or contract tainted by an unfair process, vendor "
            "involvement in the Form 470, or a prohibited gift is not compliant."
        ),
    },
    {
        "seed_key": "cfr-54.504-requests-for-services",
        "citation": "47 CFR § 54.504",
        "title": "Requests for services (Form 471) and cost allocation",
        "url": _ECFR + "504",
        "text": (
            "After the competitive bidding process, the applicant certifies a Form 471 "
            "requesting discounts for the eligible services selected. The request must "
            "identify eligible services and quantities and cost-allocate any ineligible "
            "components so that only the eligible portion receives discounts. Where a "
            "product has both eligible and ineligible functionality, the ineligible "
            "portion must be removed from the funding request through a documented cost "
            "allocation."
        ),
    },
    {
        "seed_key": "cfr-54.511-evaluating-bids",
        "citation": "47 CFR § 54.511",
        "title": "Evaluating bids — price as the primary factor; cost-effectiveness",
        "url": _ECFR + "511",
        "text": (
            "In evaluating bids for eligible services, the applicant must carry out a fair "
            "and open competitive bidding process and select the most cost-effective "
            "offering. The price of the eligible products and services must be the single "
            "most heavily weighted factor in the bid evaluation; it may not be tied with "
            "or outweighed by any other factor. Other factors (prior experience, technical "
            "capability, support, total cost of ownership) may be considered but must carry "
            "less weight than price. This price-primary rule was reaffirmed in FCC Order "
            "19-117."
        ),
    },
    {
        "seed_key": "cfr-54.516-recordkeeping",
        "citation": "47 CFR § 54.516",
        "title": "Auditing and recordkeeping / document retention",
        "url": _ECFR + "516",
        "text": (
            "Applicants and service providers must retain all documents related to the "
            "application for, receipt, and delivery of supported services for at least ten "
            "years after the last date of service delivered. This includes the bid "
            "responses, the bid evaluation and selection documentation, and the signed "
            "contract. A winning bid should supply the documentation the applicant will "
            "need to defend the selection during PIA review or a selective/SRIR review."
        ),
    },
]

ESL_CHUNKS: List[Dict[str, Any]] = [
    {
        "seed_key": "esl-framework",
        "citation": "USAC Eligible Services List (annual)",
        "title": "Eligible Services List — Category One / Category Two framework",
        "url": "https://www.usac.org/e-rate/applicant-process/before-you-begin/eligible-services-list/",
        "text": (
            "The Eligible Services List (ESL) is published per funding year and defines "
            "exactly what is eligible for E-Rate discounts. Category One: data "
            "transmission services and internet access (e.g., leased lit/dark fiber, "
            "broadband, DIA). Category Two: internal connections (switches, routers, "
            "access points, cabling, UPS supporting eligible equipment), managed internal "
            "broadband services (MIBS), and basic maintenance of internal connections "
            "(BMIC). Common ineligible items: end-user devices (laptops/tablets), staff "
            "training unrelated to eligible equipment, ineligible software, and "
            "components used for ineligible purposes. Ineligible components bundled into a "
            "bid must be itemized and cost-allocated out. When ineligible use is more than "
            "ancillary, the whole cost can become ineligible, so allocate explicitly."
        ),
    },
    {
        "seed_key": "esl-c2-budget",
        "citation": "USAC Category Two budget rules",
        "title": "Category Two five-year budget",
        "url": "https://www.usac.org/e-rate/applicant-process/before-you-begin/category-two-budgets/",
        "text": (
            "Category Two support is subject to a per-entity five-year budget based on "
            "student count (schools) or square footage (libraries), multiplied by a "
            "per-unit amount with a funding floor for small entities. A Category Two bid "
            "should fit within the applicant's remaining C2 budget for the budget cycle; "
            "requests exceeding the remaining budget are funded only up to the budget cap."
        ),
    },
]


def _precedent_chunk(p: Dict[str, Any]) -> Dict[str, Any]:
    """Mirror an appeal precedent into a retrievable KB chunk."""
    return {
        "seed_key": "prec-" + p["seed_key"],
        "source_type": "fcc_appeal",
        "citation": p.get("release_id") or p.get("docket") or "FCC/USAC appeal",
        "title": p.get("title"),
        "url": p.get("url"),
        "text": f"{p.get('title')} — {p.get('summary')}",
    }


# Appeal / denial fact patterns. These are documented USAC denial reasons and the
# rule bases the FCC applies in WC Docket 02-6 appeals — indexed as patterns, NOT
# invented case cites. Each resolves to a real FCC/USAC source URL.
APPEAL_PRECEDENTS: List[Dict[str, Any]] = [
    {
        "seed_key": "nonresponsive-substitution",
        "docket": "WC 02-6",
        "release_id": "PATTERN-NONRESPONSIVE-470",
        "title": "Bid non-responsive to the Form 470 (service substitution)",
        "issue_tags": ["responsiveness", "bidding"],
        "outcome": "denied",
        "url": "https://www.fcc.gov/ecfs/search/search-filings?proceedings_name=02-6",
        "summary": (
            "Bids that offer a materially different service than the Form 470 requested "
            "(for example a shared/best-effort or DIA circuit when a dedicated symmetrical "
            "circuit was specified), omit a required line item, or provide insufficient "
            "bandwidth/quantity/term are non-responsive and cannot be selected regardless "
            "of price. Funding requests built on a non-responsive selection are denied for "
            "failing the competitive bidding requirements of 47 CFR § 54.503."
        ),
    },
    {
        "seed_key": "ineligible-services",
        "docket": "WC 02-6",
        "release_id": "PATTERN-INELIGIBLE-SERVICES",
        "title": "Ineligible services or entities in the request",
        "issue_tags": ["eligibility"],
        "outcome": "denied",
        "url": "https://www.usac.org/e-rate/applicant-process/before-you-begin/eligible-services-list/",
        "summary": (
            "Requests that include products or services not on the funding-year Eligible "
            "Services List, or that seek support for ineligible entities/locations, are "
            "denied for the ineligible portion. A bid that bundles ineligible items without "
            "clearly itemizing and pricing them separately puts the entire line at risk."
        ),
    },
    {
        "seed_key": "missing-cost-allocation",
        "docket": "WC 02-6",
        "release_id": "PATTERN-COST-ALLOCATION",
        "title": "Missing cost allocation for ineligible components",
        "issue_tags": ["eligibility", "cost-allocation"],
        "outcome": "denied",
        "url": "https://www.ecfr.gov/current/title-47/section-54.504",
        "summary": (
            "When eligible and ineligible components are combined (e.g., an appliance with "
            "both eligible and ineligible functionality, or equipment partly serving "
            "ineligible locations), the ineligible portion must be removed through an "
            "explicit, documented cost allocation. Failure to cost-allocate leads to denial "
            "or reduction of the affected costs."
        ),
    },
    {
        "seed_key": "unfair-bidding-vendor-involvement",
        "docket": "WC 02-6",
        "release_id": "PATTERN-FAIR-AND-OPEN",
        "title": "Competitive bidding violation — not fair and open / vendor involvement",
        "issue_tags": ["bidding", "fair-and-open"],
        "outcome": "denied",
        "url": "https://www.ecfr.gov/current/title-47/section-54.503",
        "summary": (
            "The competitive bidding process must be fair and open. If the winning service "
            "provider helped write the Form 470 or RFP, had advance or exclusive access to "
            "information, or the applicant lacked genuine independence in the selection, the "
            "funding request is denied. A compliant bid should demonstrate arm's-length "
            "conduct and equal access to information for all bidders."
        ),
    },
    {
        "seed_key": "gift-rule",
        "docket": "WC 02-6",
        "release_id": "PATTERN-GIFT-RULE",
        "title": "Gift-rule violation",
        "issue_tags": ["bidding", "gift-rule"],
        "outcome": "denied",
        "url": "https://www.ecfr.gov/current/title-47/section-54.503",
        "summary": (
            "Service providers may not offer or give gifts or inducements to applicant "
            "personnel involved in the procurement beyond de minimis exceptions. A bid or "
            "relationship tainted by prohibited gifts compromises the fair and open process "
            "and results in denial. Bids should avoid any inducement language and reflect "
            "compliance with the gift restrictions."
        ),
    },
    {
        "seed_key": "lowest-corresponding-price",
        "docket": "WC 02-6",
        "release_id": "PATTERN-LCP",
        "title": "Lowest Corresponding Price violation",
        "issue_tags": ["price", "lcp"],
        "outcome": "denied",
        "url": "https://www.ecfr.gov/current/title-47/section-54.500",
        "summary": (
            "A service provider may not charge an E-Rate applicant more than the lowest "
            "corresponding price it charges similarly situated non-residential customers "
            "for similar services. Pricing above the lowest corresponding price is a rule "
            "violation and can trigger recovery. Bids should be priced consistently with "
            "the provider's LCP obligation."
        ),
    },
    {
        "seed_key": "28-day-waiting",
        "docket": "WC 02-6",
        "release_id": "PATTERN-28-DAY",
        "title": "28-day waiting period not observed",
        "issue_tags": ["bidding", "timing"],
        "outcome": "denied",
        "url": "https://www.ecfr.gov/current/title-47/section-54.503",
        "summary": (
            "The applicant must wait at least 28 days after posting the Form 470 before "
            "selecting a provider and signing a contract. Selections or contracts dated "
            "inside the 28-day window are non-compliant. A bid should reflect an allowable "
            "contract award date on or after the 28-day mark."
        ),
    },
    {
        "seed_key": "insufficient-documentation",
        "docket": "WC 02-6",
        "release_id": "PATTERN-DOCUMENTATION",
        "title": "Missing or insufficient documentation (SPIN, contract, signatures)",
        "issue_tags": ["documentation", "completeness"],
        "outcome": "denied",
        "url": "https://www.ecfr.gov/current/title-47/section-54.516",
        "summary": (
            "Denials frequently result from missing or inconsistent documentation: no valid "
            "SPIN, an unsigned or undated contract, mismatched service terms, or an inability "
            "to produce the bid-evaluation records during PIA or a selective review. A "
            "compliant bid includes the provider's SPIN, a clear contract term with any "
            "voluntary extensions, signature/date fields, and an itemized scope of work."
        ),
    },
    {
        "seed_key": "ministerial-clerical-appeal-granted",
        "docket": "WC 02-6",
        "release_id": "PATTERN-MINISTERIAL-GRANTED",
        "title": "Ministerial/clerical error — appeal granted",
        "issue_tags": ["appeal", "ministerial"],
        "outcome": "granted",
        "url": "https://www.fcc.gov/ecfs/search/search-filings?proceedings_name=02-6",
        "summary": (
            "The FCC has granted appeals where a denial resulted from a genuine ministerial "
            "or clerical error (for example a transposed number or an obvious typo) that the "
            "applicant could correct, provided the underlying competitive bidding was sound. "
            "This shows well-documented, good-faith bids with minor fixable defects can be "
            "recoverable on appeal — but substantive bidding/eligibility failures are not."
        ),
    },
]

# ESL/CFR chunks default to source_type via their list; assign here.
for _c in CFR_CHUNKS:
    _c.setdefault("source_type", "cfr")
for _c in ESL_CHUNKS:
    _c.setdefault("source_type", "esl")


def all_seed_chunks() -> List[Dict[str, Any]]:
    chunks = list(CFR_CHUNKS) + list(ESL_CHUNKS)
    chunks += [_precedent_chunk(p) for p in APPEAL_PRECEDENTS]
    return chunks


# ---------------------------------------------------------------------------
# Seeding (idempotent)
# ---------------------------------------------------------------------------

def seed_knowledge_base(db: Session, force: bool = False) -> Dict[str, int]:
    """Insert any missing KB chunks / precedents. Idempotent via seed_key.

    Returns counts of inserted rows. Never raises fatally — logs and returns."""
    inserted_chunks = 0
    inserted_precedents = 0
    try:
        existing_chunk_keys = {
            k for (k,) in db.query(FccKbChunk.seed_key).all() if k
        }
        for c in all_seed_chunks():
            if c["seed_key"] in existing_chunk_keys:
                continue
            db.add(FccKbChunk(
                source_type=c.get("source_type", "cfr"),
                citation=c.get("citation"),
                title=c.get("title"),
                url=c.get("url"),
                text=c["text"],
                funding_year=c.get("funding_year"),
                seed_key=c["seed_key"],
                created_at=datetime.utcnow(),
            ))
            inserted_chunks += 1

        existing_prec_keys = {
            k for (k,) in db.query(AppealPrecedent.seed_key).all() if k
        }
        for p in APPEAL_PRECEDENTS:
            if p["seed_key"] in existing_prec_keys:
                continue
            db.add(AppealPrecedent(
                docket=p.get("docket"),
                release_id=p.get("release_id"),
                title=p.get("title"),
                issue_tags_json=p.get("issue_tags"),
                outcome=p.get("outcome"),
                summary=p.get("summary"),
                url=p.get("url"),
                seed_key=p["seed_key"],
                created_at=datetime.utcnow(),
            ))
            inserted_precedents += 1

        if inserted_chunks or inserted_precedents:
            db.commit()
            _CORPUS_CACHE["v"] = None  # invalidate retrieval cache
        logger.info(
            "[bid_copilot] KB seed: +%s chunks, +%s precedents",
            inserted_chunks, inserted_precedents,
        )
    except Exception as e:  # pragma: no cover - defensive
        db.rollback()
        logger.error("[bid_copilot] KB seed failed: %s", e)
    return {"chunks_added": inserted_chunks, "precedents_added": inserted_precedents}


def ensure_seeded(db: Session) -> None:
    """Fast path: seed only when the chunk table looks empty."""
    try:
        count = db.query(FccKbChunk.id).limit(1).count()
    except Exception:
        count = 0
    if not count:
        seed_knowledge_base(db)


# ---------------------------------------------------------------------------
# TF-IDF retrieval (pure Python)
# ---------------------------------------------------------------------------

_STOPWORDS = set("""
a an and are as at be by for from has have in into is it its of on or that the to
with will would can may must shall not no this these those which who whom your you
our we they he she them his her their any all each other than then there here where
""".split())

_TOKEN_RE = re.compile(r"[a-z0-9§\.]+")

# In-process cache of the corpus + IDF, invalidated when the KB changes.
_CORPUS_CACHE: Dict[str, Any] = {"v": None, "docs": [], "idf": {}}


def _tokenize(text: str) -> List[str]:
    if not text:
        return []
    toks = _TOKEN_RE.findall(text.lower())
    return [t for t in toks if t not in _STOPWORDS and len(t) > 1]


def _term_freqs(tokens: List[str]) -> Dict[str, float]:
    tf: Dict[str, float] = {}
    for t in tokens:
        tf[t] = tf.get(t, 0.0) + 1.0
    return tf


def _load_corpus(db: Session) -> Dict[str, Any]:
    """Load + cache all KB chunks with per-doc term frequencies and corpus IDF."""
    try:
        rows = db.query(FccKbChunk).all()
    except Exception as e:
        logger.error("[bid_copilot] corpus load failed: %s", e)
        rows = []

    version = len(rows)
    if _CORPUS_CACHE.get("v") == version and _CORPUS_CACHE.get("docs"):
        return _CORPUS_CACHE

    docs: List[Dict[str, Any]] = []
    df: Dict[str, int] = {}
    for r in rows:
        tokens = _tokenize(f"{r.citation or ''} {r.title or ''} {r.text or ''}")
        tf = _term_freqs(tokens)
        docs.append({"row": r, "tf": tf})
        for term in tf.keys():
            df[term] = df.get(term, 0) + 1

    n = max(1, len(docs))
    idf = {term: math.log(1.0 + (n / (1 + cnt))) for term, cnt in df.items()}

    _CORPUS_CACHE.update({"v": version, "docs": docs, "idf": idf})
    return _CORPUS_CACHE


def retrieve(
    db: Session,
    query: str,
    k: int = 6,
    source_types: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Return the top-k most relevant KB chunks for a query via TF-IDF cosine."""
    corpus = _load_corpus(db)
    docs: List[Dict[str, Any]] = corpus["docs"]
    idf: Dict[str, float] = corpus["idf"]
    if not docs:
        return []

    q_tf = _term_freqs(_tokenize(query))
    if not q_tf:
        return []
    q_vec = {t: f * idf.get(t, 0.0) for t, f in q_tf.items()}
    q_norm = math.sqrt(sum(v * v for v in q_vec.values())) or 1.0

    scored: List[Dict[str, Any]] = []
    for d in docs:
        row: FccKbChunk = d["row"]
        if source_types and row.source_type not in source_types:
            continue
        d_tf = d["tf"]
        dot = 0.0
        d_sq = 0.0
        for t, f in d_tf.items():
            w = f * idf.get(t, 0.0)
            d_sq += w * w
            if t in q_vec:
                dot += w * q_vec[t]
        if dot <= 0:
            continue
        d_norm = math.sqrt(d_sq) or 1.0
        score = dot / (q_norm * d_norm)
        scored.append({
            "score": round(score, 4),
            "id": row.id,
            "source_type": row.source_type,
            "citation": row.citation,
            "title": row.title,
            "url": row.url,
            "text": row.text,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:k]
