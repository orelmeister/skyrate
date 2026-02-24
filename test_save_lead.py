"""Test the save predicted lead logic locally"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DATABASE_URL', '')

from app.models.prediction import PredictedLead
from app.models.vendor import SavedLead
from app.core.database import SessionLocal

db = SessionLocal()
try:
    p = db.query(PredictedLead).filter(PredictedLead.id == 256).first()
    if not p:
        print('No prediction found')
        sys.exit(1)
    print('Prediction found:', p.organization_name)
    print('prediction_type:', repr(p.prediction_type))
    print('confidence_score:', repr(p.confidence_score))
    print('estimated_deal_value:', repr(p.estimated_deal_value))
    print('predicted_action_date:', repr(p.predicted_action_date))
    print('contract_expiration_date:', repr(p.contract_expiration_date))
    print('ben:', repr(p.ben))
    print('frn:', repr(p.frn))
    print('app_number:', repr(p.application_number))
    print('manufacturer:', repr(p.manufacturer))
    print('prediction_reason length:', len(p.prediction_reason or ''))
    
    # Try building the SavedLead
    notes_text = f'Saved from Predicted Leads ({p.prediction_type}). {p.prediction_reason or ""}'
    print('notes_text:', notes_text[:100])
    
    sl = SavedLead(
        vendor_profile_id=1,
        form_type='predicted',
        application_number=p.application_number or p.frn or str(p.id),
        ben=p.ben or '',
        frn=p.frn,
        entity_name=p.organization_name,
        entity_type=p.entity_type,
        entity_state=p.state,
        entity_city=p.city,
        contact_name=p.contact_name,
        contact_email=p.contact_email,
        contact_phone=p.contact_phone,
        funding_year=p.funding_year,
        service_type=p.service_type,
        manufacturers=[p.manufacturer] if p.manufacturer else [],
        lead_status='new',
        notes=notes_text,
        source_data={
            'prediction_id': p.id,
            'prediction_type': str(p.prediction_type),
            'confidence_score': float(p.confidence_score) if p.confidence_score else None,
            'estimated_deal_value': float(p.estimated_deal_value) if p.estimated_deal_value else None,
            'predicted_action_date': p.predicted_action_date.isoformat() if p.predicted_action_date else None,
            'contract_expiration_date': p.contract_expiration_date.isoformat() if p.contract_expiration_date else None,
            'current_provider_name': p.current_provider_name,
            'current_spin': p.current_spin,
            'manufacturer': p.manufacturer,
            'equipment_model': p.equipment_model,
        },
    )
    if p.estimated_deal_value:
        sl.funding_amount = int(p.estimated_deal_value)
    print('SavedLead created successfully')
    print('notes length:', len(sl.notes))
    
    # Try adding to DB
    db.add(sl)
    db.commit()
    print('SAVED! id:', sl.id)
    
    # Clean up
    db.delete(sl)
    db.commit()
    print('Cleaned up')
    
except Exception as e:
    print(f'ERROR: {type(e).__name__}: {e}')
    import traceback
    traceback.print_exc()
    db.rollback()
finally:
    db.close()
