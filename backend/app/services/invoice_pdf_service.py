"""
Invoice PDF Service
Renders a SkyRate-branded invoice/quote PDF for the admin custom invoice builder.

Plain ASCII only — NO emoji anywhere (Windows cp1252 terminals crash on Unicode
emoji in stdout, and PDF core fonts don't render them either).
"""

import io
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Company constants (from workspace constitution)
COMPANY_NAME = "SkyRate AI"
COMPANY_LEGAL = "SkyRate LLC"
COMPANY_ADDRESS_LINES = ["30 N Gould St Ste N", "Sheridan, WY 82801", "USA"]
COMPANY_PHONE = "(855) 765-7291"
COMPANY_EMAIL = "billing@skyrate.ai"

PURPLE = "#7c3aed"
DARK = "#1e293b"
GRAY = "#64748b"
LIGHT = "#f1f5f9"


def _fmt_money(cents: int, currency: str = "usd") -> str:
    sign = "-" if cents < 0 else ""
    dollars = abs(int(cents)) / 100.0
    return f"{sign}${dollars:,.2f}"


def _interval_label(interval: str) -> str:
    return {
        "one_time": "one-time",
        "month": "per month",
        "year": "per year",
    }.get(interval, "one-time")


def generate_invoice_pdf(invoice, pay_url: Optional[str] = None) -> bytes:
    """
    Build the invoice PDF and return raw bytes.

    `invoice` may be a BillingInvoice ORM object or a plain dict (invoice.to_dict()).
    Accepting a dict keeps this safe to call from a background task after the DB
    session has closed (no lazy-load / DetachedInstance risk).
    """
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate,
        Table,
        TableStyle,
        Paragraph,
        Spacer,
    )

    inv = invoice if isinstance(invoice, dict) else invoice.to_dict()
    currency = inv.get("currency", "usd")
    lines = inv.get("lines", []) or []

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title=f"Invoice {inv.get('invoice_number', '')}",
    )

    styles = getSampleStyleSheet()
    h_brand = ParagraphStyle(
        "brand", parent=styles["Title"], fontSize=22, textColor=colors.HexColor(PURPLE),
        spaceAfter=2, alignment=0,
    )
    p_small = ParagraphStyle(
        "small", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor(GRAY), leading=12,
    )
    p_label = ParagraphStyle(
        "label", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor(GRAY),
        leading=11, spaceAfter=2,
    )
    p_body = ParagraphStyle(
        "body", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor(DARK), leading=13,
    )
    p_invtitle = ParagraphStyle(
        "invtitle", parent=styles["Title"], fontSize=18, textColor=colors.HexColor(DARK),
        alignment=2, spaceAfter=2,
    )
    p_cell = ParagraphStyle("cell", parent=styles["Normal"], fontSize=9.5, textColor=colors.HexColor(DARK), leading=12)
    p_cell_r = ParagraphStyle("cellr", parent=p_cell, alignment=2)
    p_hdr_l = ParagraphStyle("hdrl", parent=p_cell, textColor=colors.white, alignment=0)
    p_hdr_r = ParagraphStyle("hdrr", parent=p_cell, textColor=colors.white, alignment=2)

    story = []

    # ---- Header row: brand (left) + INVOICE title/number (right) ----------
    def _created_date():
        c = inv.get("created_at")
        if c:
            try:
                return datetime.fromisoformat(c.replace("Z", "")).strftime("%B %d, %Y")
            except (ValueError, AttributeError):
                pass
        return datetime.utcnow().strftime("%B %d, %Y")

    def _due_date():
        e = inv.get("expires_at")
        if e:
            try:
                return datetime.fromisoformat(e.replace("Z", "")).strftime("%B %d, %Y")
            except (ValueError, AttributeError):
                pass
        return "Upon receipt"

    left_cell = [
        Paragraph(f"SkyRate<font color='{DARK}'>.AI</font>", h_brand),
        Paragraph("<br/>".join(COMPANY_ADDRESS_LINES), p_small),
        Paragraph(f"Toll-free: {COMPANY_PHONE}", p_small),
        Paragraph(COMPANY_EMAIL, p_small),
    ]
    right_cell = [
        Paragraph("INVOICE", p_invtitle),
        Paragraph(f"<b>{inv.get('invoice_number', '')}</b>", ParagraphStyle(
            "invno", parent=p_body, alignment=2)),
        Paragraph(f"Issued: {_created_date()}", ParagraphStyle("d1", parent=p_small, alignment=2)),
        Paragraph(f"Due: {_due_date()}", ParagraphStyle("d2", parent=p_small, alignment=2)),
    ]
    header = Table([[left_cell, right_cell]], colWidths=[3.6 * inch, 3.4 * inch])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header)
    story.append(Spacer(1, 0.3 * inch))

    # ---- Bill To ----------------------------------------------------------
    bill_to = [Paragraph("BILL TO", p_label)]
    if inv.get("customer_name"):
        bill_to.append(Paragraph(f"<b>{inv['customer_name']}</b>", p_body))
    if inv.get("company_name"):
        bill_to.append(Paragraph(inv["company_name"], p_body))
    if inv.get("customer_email"):
        bill_to.append(Paragraph(inv["customer_email"], p_small))
    bt = Table([[bill_to]], colWidths=[7.0 * inch])
    bt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(bt)
    story.append(Spacer(1, 0.25 * inch))

    # ---- Line items table -------------------------------------------------
    table_data = [[
        Paragraph("Description", p_hdr_l),
        Paragraph("Qty", p_hdr_r),
        Paragraph("Unit Price", p_hdr_r),
        Paragraph("Billing", p_hdr_l),
        Paragraph("Amount", p_hdr_r),
    ]]
    for ln in lines:
        table_data.append([
            Paragraph(str(ln.get("description", "")), p_cell),
            Paragraph(str(ln.get("quantity", 1)), p_cell_r),
            Paragraph(_fmt_money(ln.get("unit_amount_cents", 0), currency), p_cell_r),
            Paragraph(_interval_label(ln.get("interval", "one_time")), p_cell),
            Paragraph(_fmt_money(ln.get("amount_cents", 0), currency), p_cell_r),
        ])

    items = Table(
        table_data,
        colWidths=[3.1 * inch, 0.5 * inch, 1.0 * inch, 1.0 * inch, 1.1 * inch],
        repeatRows=1,
    )
    items.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(PURPLE)),
        ("FONTSIZE", (0, 0), (-1, 0), 9.5),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor(LIGHT)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(items)
    story.append(Spacer(1, 0.15 * inch))

    # ---- Totals (right-aligned block) -------------------------------------
    subtotal = inv.get("subtotal_cents", 0)
    discount = inv.get("discount_cents", 0)
    total = inv.get("total_cents", 0)

    totals_rows = [
        [Paragraph("Subtotal", p_cell_r), Paragraph(_fmt_money(subtotal, currency), p_cell_r)],
    ]
    if discount and discount > 0:
        totals_rows.append(
            [Paragraph("Discount", p_cell_r), Paragraph(_fmt_money(-discount, currency), p_cell_r)]
        )
    totals_rows.append([
        Paragraph("<b>Total Due</b>", ParagraphStyle("td", parent=p_cell_r, fontSize=11)),
        Paragraph(f"<b>{_fmt_money(total, currency)}</b>", ParagraphStyle("tdv", parent=p_cell_r, fontSize=11)),
    ])
    totals = Table(totals_rows, colWidths=[1.4 * inch, 1.3 * inch], hAlign="RIGHT")
    totals.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor(DARK)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(totals)
    story.append(Spacer(1, 0.35 * inch))

    # ---- Pay online + payment methods ------------------------------------
    if pay_url:
        story.append(Paragraph("Pay Online", ParagraphStyle(
            "payh", parent=p_body, fontSize=12, textColor=colors.HexColor(PURPLE), spaceAfter=4)))
        story.append(Paragraph(
            f"<a href='{pay_url}'><font color='{PURPLE}'>{pay_url}</font></a>", p_body))
        story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph(
        "We accept payment by Credit Card and ACH bank transfer. "
        "Choose your preferred method on the secure checkout page.",
        p_small,
    ))

    if inv.get("notes"):
        story.append(Spacer(1, 0.2 * inch))
        story.append(Paragraph("Notes", p_label))
        story.append(Paragraph(str(inv["notes"]), p_small))

    story.append(Spacer(1, 0.4 * inch))
    story.append(Paragraph(
        f"Thank you for your business. {COMPANY_LEGAL} - E-Rate Funding Intelligence.",
        ParagraphStyle("foot", parent=p_small, alignment=1),
    ))

    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes
