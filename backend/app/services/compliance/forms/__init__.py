"""
Form-specific compliance analyzers — package init.
Dispatcher routes analysis to the correct form module.
"""

from typing import Optional

VALID_FORM_TYPES = ("470", "471", "472", "474", "486", "500", "498", "other")


async def dispatch_analysis(
    form_type: str,
    document_text: str,
    supporting_documents: Optional[list[dict]] = None,
    metadata: Optional[dict] = None,
    prior_findings: Optional[dict] = None,
) -> dict:
    """
    Route to the appropriate form-specific analyzer and return structured results.
    """
    if form_type == "470":
        from .form_470 import analyze
    elif form_type == "471":
        from .form_471 import analyze
    elif form_type == "472":
        from .form_472 import analyze
    elif form_type == "474":
        from .form_474 import analyze
    elif form_type == "486":
        from .form_486 import analyze
    elif form_type == "500":
        from .form_500 import analyze
    elif form_type == "498":
        from .form_498 import analyze
    else:
        from .generic import analyze

    return await analyze(
        document_text=document_text,
        supporting_docs=supporting_documents,
        metadata=metadata or {},
        prior_findings=prior_findings,
    )
