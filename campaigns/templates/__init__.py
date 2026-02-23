"""Campaign email templates."""

from campaigns.templates.consultant_sequence import CONSULTANT_TEMPLATES
from campaigns.templates.vendor_sequence import VENDOR_TEMPLATES
from campaigns.templates.entity_sequence import ENTITY_TEMPLATES

ALL_TEMPLATES = {
    "consultant": CONSULTANT_TEMPLATES,
    "vendor": VENDOR_TEMPLATES,
    "entity": ENTITY_TEMPLATES,
}
