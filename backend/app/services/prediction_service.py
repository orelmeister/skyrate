"""
Predictive Lead Intelligence Service
Premium feature ($499/mo addon for vendors).

Generates predicted leads by analyzing:
1. Contract Expiry — FRNs with contracts expiring in 3-12 months
2. Equipment Refresh — Schools with aging equipment (5+ year cycle for C2)
3. C2 Budget Reset — Schools with unspent budget near cycle end
4. Historical Patterns — Schools that rebid on predictable schedules

Data sources: USAC Socrata API (Form 471, FRN Status, C2 Budget)
"""

import sys
import os
import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

# Add backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from utils.usac_client import USACDataClient

from ..models.prediction import (
    PredictedLead, PredictionRefreshLog,
    PredictionType, PredictionStatus
)

logger = logging.getLogger(__name__)


# Equipment lifecycle constants (years)
EQUIPMENT_REFRESH_CYCLES = {
    'switches': 5,
    'routers': 5,
    'access_points': 5,
    'firewall': 5,
    'ups': 5,
    'cabling': 10,
    'license': 1,  # Licenses typically annual
    'default': 5,
}

# C2 budget cycle pattern: FY{start}-{end}, each cycle is 5 years
C2_CYCLE_END_YEARS = {
    'FY2021-2025': 2025,
    'FY2026-2030': 2030,
    'FY2016-2020': 2020,
}

# Minimum deal value to consider (filters noise)
MIN_DEAL_VALUE = 1000.0

# Confidence score weights
CONFIDENCE_WEIGHTS = {
    'contract_expiry': {
        'base': 0.7,
        'funded_bonus': 0.1,
        'high_value_bonus': 0.1,
        'soon_expiry_bonus': 0.1,  # < 6 months
    },
    'equipment_refresh': {
        'base': 0.5,
        'age_factor': 0.2,  # Older = higher confidence
        'high_value_bonus': 0.15,
        'known_manufacturer_bonus': 0.15,
    },
    'c2_budget_reset': {
        'base': 0.6,
        'high_remaining_bonus': 0.2,  # > 50% budget remaining
        'cycle_ending_soon_bonus': 0.2,  # Within 1 year
    },
}


class PredictionService:
    """
    Core prediction engine for vendor lead intelligence.
    
    Pre-computes predicted leads weekly and stores in DB.
    Real-time enrichment happens on individual lead access.
    """
    
    def __init__(self):
        self.usac_client = USACDataClient()
    
    # =========================================================================
    # MAIN ORCHESTRATOR
    # =========================================================================
    
    def generate_all_predictions(
        self,
        db: Session,
        states: Optional[List[str]] = None,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Master orchestrator: runs all prediction algorithms and stores results.
        Called by the scheduled weekly job or manual refresh.
        
        Args:
            db: Database session
            states: Optional list of states to limit predictions
            force_refresh: If True, clears existing predictions first
            
        Returns:
            Summary of predictions generated
        """
        batch_id = f"pred_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
        start_time = datetime.utcnow()
        
        # Create refresh log entry
        refresh_log = PredictionRefreshLog(
            batch_id=batch_id,
            started_at=start_time,
            status="running"
        )
        db.add(refresh_log)
        db.commit()
        
        errors = []
        counts = {
            'contract_expiry': 0,
            'equipment_refresh': 0,
            'c2_budget_reset': 0,
            'historical_pattern': 0,
        }
        
        try:
            # Clear old predictions if force refresh
            if force_refresh:
                deleted = db.query(PredictedLead).filter(
                    PredictedLead.status.in_([PredictionStatus.NEW, PredictionStatus.VIEWED])
                ).delete(synchronize_session='fetch')
                logger.info(f"Cleared {deleted} old predictions (force refresh)")
            
            # 1. Contract Expiry Predictions
            try:
                contract_leads = self._predict_contract_expiry(db, batch_id, states)
                counts['contract_expiry'] = contract_leads
                logger.info(f"Contract expiry predictions: {contract_leads}")
            except Exception as e:
                logger.error(f"Contract expiry prediction failed: {e}")
                errors.append(f"contract_expiry: {str(e)}")
            
            # 2. Equipment Refresh Predictions
            try:
                equipment_leads = self._predict_equipment_refresh(db, batch_id, states)
                counts['equipment_refresh'] = equipment_leads
                logger.info(f"Equipment refresh predictions: {equipment_leads}")
            except Exception as e:
                logger.error(f"Equipment refresh prediction failed: {e}")
                errors.append(f"equipment_refresh: {str(e)}")
            
            # 3. C2 Budget Reset Predictions
            try:
                budget_leads = self._predict_c2_budget_reset(db, batch_id, states)
                counts['c2_budget_reset'] = budget_leads
                logger.info(f"C2 budget reset predictions: {budget_leads}")
            except Exception as e:
                logger.error(f"C2 budget reset prediction failed: {e}")
                errors.append(f"c2_budget_reset: {str(e)}")
            
            # Update refresh log
            end_time = datetime.utcnow()
            refresh_log.completed_at = end_time
            refresh_log.status = "completed" if not errors else "completed_with_errors"
            refresh_log.total_predictions = sum(counts.values())
            refresh_log.contract_expiry_count = counts['contract_expiry']
            refresh_log.equipment_refresh_count = counts['equipment_refresh']
            refresh_log.c2_budget_reset_count = counts['c2_budget_reset']
            refresh_log.historical_pattern_count = counts['historical_pattern']
            refresh_log.errors = errors
            refresh_log.duration_seconds = (end_time - start_time).total_seconds()
            db.commit()
            
            total = sum(counts.values())
            logger.info(f"Prediction generation complete: {total} total predictions in {refresh_log.duration_seconds:.1f}s")
            
            return {
                'success': True,
                'batch_id': batch_id,
                'total_predictions': total,
                'counts': counts,
                'errors': errors,
                'duration_seconds': refresh_log.duration_seconds,
            }
            
        except Exception as e:
            logger.error(f"Prediction generation failed: {e}")
            refresh_log.status = "failed"
            refresh_log.completed_at = datetime.utcnow()
            refresh_log.errors = errors + [f"fatal: {str(e)}"]
            refresh_log.duration_seconds = (datetime.utcnow() - start_time).total_seconds()
            db.commit()
            return {
                'success': False,
                'batch_id': batch_id,
                'error': str(e),
                'counts': counts,
            }
    
    # =========================================================================
    # PREDICTION ALGORITHM 1: CONTRACT EXPIRY
    # =========================================================================
    
    def _predict_contract_expiry(
        self,
        db: Session,
        batch_id: str,
        states: Optional[List[str]] = None
    ) -> int:
        """
        Find FRNs with contracts expiring in the next 3-12 months.
        These entities will need to rebid — high-value vendor leads.
        
        Confidence scoring:
        - Base 0.7 (contract expiry dates are factual)
        - +0.1 if currently funded (confirmed active contract)
        - +0.1 if high value (>$50k)
        - +0.1 if expiring < 6 months (urgent)
        """
        count = 0
        
        # Fetch expiring contracts from USAC
        result = self.usac_client.get_expiring_contracts(
            months_ahead=12,
            states=states,
            funded_only=True,
            limit=5000
        )
        
        if not result.get('success') or not result.get('data'):
            logger.warning("No expiring contracts found or API error")
            return 0
        
        for record in result['data']:
            try:
                ben = record.get('ben', '')
                frn = record.get('funding_request_number', '')
                
                # Skip if we already have this prediction (avoid duplicates)
                existing = db.query(PredictedLead).filter(
                    PredictedLead.ben == ben,
                    PredictedLead.frn == frn,
                    PredictedLead.prediction_type == PredictionType.CONTRACT_EXPIRY,
                    PredictedLead.status.in_([PredictionStatus.NEW, PredictionStatus.VIEWED])
                ).first()
                
                if existing:
                    continue
                
                # Parse contract expiration
                exp_date_str = record.get('contract_expiration_date', '')
                if not exp_date_str:
                    continue
                
                try:
                    exp_date = datetime.fromisoformat(exp_date_str.replace('T', ' ').split('.')[0])
                except (ValueError, AttributeError):
                    continue
                
                # Calculate confidence score
                confidence = CONFIDENCE_WEIGHTS['contract_expiry']['base']
                
                status = record.get('form_471_frn_status_name', '')
                if status == 'Funded':
                    confidence += CONFIDENCE_WEIGHTS['contract_expiry']['funded_bonus']
                
                total_cost = float(record.get('total_pre_discount_costs', 0) or 0)
                if total_cost > 50000:
                    confidence += CONFIDENCE_WEIGHTS['contract_expiry']['high_value_bonus']
                
                months_until_expiry = (exp_date - datetime.utcnow()).days / 30
                if months_until_expiry < 6:
                    confidence += CONFIDENCE_WEIGHTS['contract_expiry']['soon_expiry_bonus']
                
                confidence = min(confidence, 1.0)
                
                # Skip low-value contracts
                if total_cost < MIN_DEAL_VALUE:
                    continue
                
                # Build prediction reason
                months_str = f"{months_until_expiry:.0f} months"
                reason = (
                    f"Contract expiring in {months_str} ({exp_date.strftime('%B %Y')}). "
                    f"Current provider: {record.get('spin_name', 'Unknown')}. "
                    f"Service: {record.get('form_471_service_type_name', 'Unknown')}. "
                    f"Contract value: ${total_cost:,.0f}."
                )
                
                discount = record.get('dis_pct')
                discount_float = float(discount) if discount else None
                
                lead = PredictedLead(
                    prediction_type=PredictionType.CONTRACT_EXPIRY,
                    confidence_score=round(confidence, 2),
                    prediction_reason=reason,
                    predicted_action_date=exp_date - timedelta(days=90),  # 3 months before expiry
                    ben=ben,
                    organization_name=record.get('organization_name', 'Unknown'),
                    state=record.get('state', ''),
                    entity_type=record.get('organization_entity_type_name', ''),
                    contact_email=record.get('cnct_email', ''),
                    funding_year=int(record.get('funding_year', 0) or 0),
                    discount_rate=discount_float,
                    estimated_deal_value=total_cost,
                    service_type=record.get('form_471_service_type_name', ''),
                    contract_expiration_date=exp_date,
                    contract_number=record.get('contract_number', ''),
                    current_provider_name=record.get('spin_name', ''),
                    application_number=record.get('application_number', ''),
                    frn=frn,
                    source_dataset='frn_status',
                    status=PredictionStatus.NEW,
                    batch_id=batch_id,
                    expires_at=exp_date + timedelta(days=30),  # Prediction expires 30 days after contract
                )
                db.add(lead)
                count += 1
                
                # Commit in batches of 100
                if count % 100 == 0:
                    db.commit()
                    logger.info(f"Contract expiry: committed batch ({count} so far)")
                    
            except Exception as e:
                logger.warning(f"Error processing contract record: {e}")
                continue
        
        db.commit()
        return count
    
    # =========================================================================
    # PREDICTION ALGORITHM 2: EQUIPMENT REFRESH
    # =========================================================================
    
    def _predict_equipment_refresh(
        self,
        db: Session,
        batch_id: str,
        states: Optional[List[str]] = None
    ) -> int:
        """
        Find schools with aging equipment that should be due for refresh.
        
        Logic: If a school bought networking equipment in funding year X,
        and X + 5 <= current year, they're likely due for an upgrade.
        C2 equipment has a standard 5-year lifecycle.
        
        Confidence scoring:
        - Base 0.5 (predicted, not factual like contract dates)
        - +0.2 based on equipment age (older = higher)
        - +0.15 if high value deal
        - +0.15 if known manufacturer (better lead quality)
        """
        count = 0
        current_year = datetime.utcnow().year
        
        # Look for equipment purchased 4-7 years ago (due for refresh)
        target_years = list(range(current_year - 7, current_year - 3))
        
        result = self.usac_client.get_471_equipment_details(
            funding_years=target_years,
            states=states,
            limit=5000
        )
        
        if not result.get('success') or not result.get('data'):
            logger.warning("No equipment data found or API error")
            return 0
        
        # Group by BEN + manufacturer to avoid duplicate predictions per line item
        seen_ben_mfr = set()
        
        for record in result['data']:
            try:
                ben = record.get('ben', '')
                manufacturer = record.get('form_471_manufacturer_name', '')
                
                if not ben or not manufacturer:
                    continue
                
                # Deduplicate by BEN + manufacturer
                dedup_key = f"{ben}_{manufacturer}"
                if dedup_key in seen_ben_mfr:
                    continue
                seen_ben_mfr.add(dedup_key)
                
                # Skip if prediction already exists
                existing = db.query(PredictedLead).filter(
                    PredictedLead.ben == ben,
                    PredictedLead.manufacturer == manufacturer,
                    PredictedLead.prediction_type == PredictionType.EQUIPMENT_REFRESH,
                    PredictedLead.status.in_([PredictionStatus.NEW, PredictionStatus.VIEWED])
                ).first()
                
                if existing:
                    continue
                
                funding_year = int(record.get('funding_year', 0) or 0)
                if funding_year == 0:
                    continue
                
                equipment_age = current_year - funding_year
                total_cost = float(record.get('total_eligible_one_time_costs', 0) or 0)
                
                if total_cost < MIN_DEAL_VALUE:
                    continue
                
                # Determine equipment type from product/function
                product = (record.get('form_471_product_name', '') or '').lower()
                function = (record.get('form_471_function_name', '') or '').lower()
                model = record.get('model_of_equipment', '') or ''
                
                # Determine refresh cycle based on product type
                refresh_years = EQUIPMENT_REFRESH_CYCLES['default']
                for equip_type, years in EQUIPMENT_REFRESH_CYCLES.items():
                    if equip_type in product or equip_type in function or equip_type in model.lower():
                        refresh_years = years
                        break
                
                # Only flag if equipment is at or past refresh cycle
                if equipment_age < refresh_years - 1:
                    continue
                
                # Calculate confidence
                confidence = CONFIDENCE_WEIGHTS['equipment_refresh']['base']
                
                # Age factor: older = more likely to refresh
                age_factor = min((equipment_age - refresh_years + 1) / 3, 1.0) * \
                             CONFIDENCE_WEIGHTS['equipment_refresh']['age_factor']
                confidence += age_factor
                
                if total_cost > 50000:
                    confidence += CONFIDENCE_WEIGHTS['equipment_refresh']['high_value_bonus']
                
                if manufacturer.strip():
                    confidence += CONFIDENCE_WEIGHTS['equipment_refresh']['known_manufacturer_bonus']
                
                confidence = min(confidence, 1.0)
                
                # Predicted refresh date: original purchase + refresh cycle
                predicted_refresh = datetime(funding_year + refresh_years, 7, 1)  # July = start of new E-Rate year
                if predicted_refresh < datetime.utcnow():
                    predicted_refresh = datetime.utcnow() + timedelta(days=90)  # Overdue, expect action soon
                
                reason = (
                    f"Equipment purchased in FY{funding_year} ({equipment_age} years ago) "
                    f"is due for refresh. Manufacturer: {manufacturer}. "
                    f"Model: {model or 'Unknown'}. "
                    f"Original cost: ${total_cost:,.0f}. "
                    f"Standard {refresh_years}-year refresh cycle exceeded."
                )
                
                lead = PredictedLead(
                    prediction_type=PredictionType.EQUIPMENT_REFRESH,
                    confidence_score=round(confidence, 2),
                    prediction_reason=reason,
                    predicted_action_date=predicted_refresh,
                    ben=ben,
                    organization_name=record.get('organization_name', 'Unknown'),
                    state=record.get('state', ''),
                    entity_type=record.get('applicant_type', ''),
                    contact_email=record.get('cnct_email', ''),
                    funding_year=funding_year,
                    estimated_deal_value=total_cost,
                    manufacturer=manufacturer,
                    equipment_model=model,
                    product_type=product or function,
                    application_number=record.get('application_number', ''),
                    frn=record.get('funding_request_number', ''),
                    source_dataset='471_line_items',
                    status=PredictionStatus.NEW,
                    batch_id=batch_id,
                    expires_at=predicted_refresh + timedelta(days=365),
                )
                db.add(lead)
                count += 1
                
                if count % 100 == 0:
                    db.commit()
                    logger.info(f"Equipment refresh: committed batch ({count} so far)")
                    
            except Exception as e:
                logger.warning(f"Error processing equipment record: {e}")
                continue
        
        db.commit()
        return count
    
    # =========================================================================
    # PREDICTION ALGORITHM 3: C2 BUDGET RESET
    # =========================================================================
    
    def _predict_c2_budget_reset(
        self,
        db: Session,
        batch_id: str,
        states: Optional[List[str]] = None
    ) -> int:
        """
        Find schools with significant unspent C2 budget near cycle end.
        
        Logic: C2 budgets run in 5-year cycles. If a school has $10k+
        remaining and the cycle ends within 18 months, they're likely
        to spend it ("use it or lose it" psychology).
        
        Confidence scoring:
        - Base 0.6 (budget data is factual, behavior is predicted)
        - +0.2 if > 50% budget remaining (stronger motivation)
        - +0.2 if cycle ending within 12 months (urgency)
        """
        count = 0
        current_year = datetime.utcnow().year
        
        # Determine which budget cycles are ending soon
        ending_cycles = []
        for cycle, end_year in C2_CYCLE_END_YEARS.items():
            if current_year <= end_year <= current_year + 2:
                ending_cycles.append(cycle)
        
        if not ending_cycles:
            # Fallback: use most recent cycle
            ending_cycles = [f"FY{current_year - 4}-{current_year}"]
        
        result = self.usac_client.get_c2_budget_opportunities(
            min_remaining_budget=5000,
            budget_cycles=ending_cycles,
            states=states,
            limit=5000
        )
        
        if not result.get('success') or not result.get('data'):
            logger.warning("No C2 budget opportunities found or API error")
            return 0
        
        for record in result['data']:
            try:
                ben = record.get('ben', '')
                if not ben:
                    continue
                
                # Skip if prediction already exists
                existing = db.query(PredictedLead).filter(
                    PredictedLead.ben == ben,
                    PredictedLead.prediction_type == PredictionType.C2_BUDGET_RESET,
                    PredictedLead.status.in_([PredictionStatus.NEW, PredictionStatus.VIEWED])
                ).first()
                
                if existing:
                    continue
                
                budget_total = float(record.get('c2_budget', 0) or 0)
                budget_remaining = float(record.get('available_c2_budget_amount', 0) or 0)
                budget_cycle = record.get('c2_budget_cycle', '')
                
                if budget_remaining < 5000 or budget_total == 0:
                    continue
                
                # Calculate confidence
                confidence = CONFIDENCE_WEIGHTS['c2_budget_reset']['base']
                
                budget_pct_remaining = budget_remaining / budget_total if budget_total > 0 else 0
                if budget_pct_remaining > 0.5:
                    confidence += CONFIDENCE_WEIGHTS['c2_budget_reset']['high_remaining_bonus']
                
                # Check if cycle ending within 12 months
                cycle_end_year = C2_CYCLE_END_YEARS.get(budget_cycle)
                if cycle_end_year:
                    months_until_end = (datetime(cycle_end_year + 1, 7, 1) - datetime.utcnow()).days / 30
                    if months_until_end < 12:
                        confidence += CONFIDENCE_WEIGHTS['c2_budget_reset']['cycle_ending_soon_bonus']
                    predicted_action = datetime(cycle_end_year, 1, 1)  # They'll likely act early in last year
                else:
                    predicted_action = datetime.utcnow() + timedelta(days=180)
                
                confidence = min(confidence, 1.0)
                
                budget_funded = float(record.get('funded_c2_budget_amount', 0) or 0)
                
                reason = (
                    f"C2 budget cycle {budget_cycle} ending soon. "
                    f"${budget_remaining:,.0f} of ${budget_total:,.0f} remaining "
                    f"({budget_pct_remaining:.0%} unspent). "
                    f"Already funded: ${budget_funded:,.0f}. "
                    f"'Use it or lose it' opportunity for equipment sales."
                )
                
                lead = PredictedLead(
                    prediction_type=PredictionType.C2_BUDGET_RESET,
                    confidence_score=round(confidence, 2),
                    prediction_reason=reason,
                    predicted_action_date=predicted_action,
                    ben=ben,
                    organization_name=record.get('billed_entity_name', 'Unknown'),
                    state=record.get('state', ''),
                    city=record.get('city', ''),
                    entity_type=record.get('applicant_type', ''),
                    estimated_deal_value=budget_remaining,
                    c2_budget_total=budget_total,
                    c2_budget_remaining=budget_remaining,
                    c2_budget_cycle=budget_cycle,
                    source_dataset='c2_budget',
                    status=PredictionStatus.NEW,
                    batch_id=batch_id,
                    expires_at=datetime(cycle_end_year + 1, 7, 1) if cycle_end_year else None,
                )
                db.add(lead)
                count += 1
                
                if count % 100 == 0:
                    db.commit()
                    logger.info(f"C2 budget reset: committed batch ({count} so far)")
                    
            except Exception as e:
                logger.warning(f"Error processing C2 budget record: {e}")
                continue
        
        db.commit()
        return count
    
    # =========================================================================
    # QUERY & ACCESS METHODS (used by API endpoints)
    # =========================================================================
    
    def get_predictions(
        self,
        db: Session,
        vendor_profile_id: Optional[int] = None,
        prediction_type: Optional[PredictionType] = None,
        states: Optional[List[str]] = None,
        manufacturers: Optional[List[str]] = None,
        min_confidence: float = 0.0,
        min_deal_value: float = 0.0,
        status_filter: Optional[List[PredictionStatus]] = None,
        sort_by: str = 'confidence_score',
        sort_order: str = 'desc',
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Query predicted leads with filters. Used by vendor API endpoints.
        
        Returns paginated results with total count.
        """
        try:
            query = db.query(PredictedLead)
            
            # Apply filters
            if prediction_type:
                query = query.filter(PredictedLead.prediction_type == prediction_type)
            
            if states:
                query = query.filter(PredictedLead.state.in_(states))
            
            if manufacturers:
                # Case-insensitive manufacturer matching
                mfr_conditions = []
                for mfr in manufacturers:
                    mfr_conditions.append(
                        func.lower(PredictedLead.manufacturer).contains(mfr.lower())
                    )
                query = query.filter(or_(*mfr_conditions))
            
            if min_confidence > 0:
                query = query.filter(PredictedLead.confidence_score >= min_confidence)
            
            if min_deal_value > 0:
                query = query.filter(PredictedLead.estimated_deal_value >= min_deal_value)
            
            if status_filter:
                query = query.filter(PredictedLead.status.in_(status_filter))
            else:
                # Default: exclude dismissed and expired
                query = query.filter(
                    PredictedLead.status.in_([
                        PredictionStatus.NEW,
                        PredictionStatus.VIEWED,
                        PredictionStatus.CONTACTED
                    ])
                )
            
            # Exclude expired predictions
            query = query.filter(
                or_(
                    PredictedLead.expires_at.is_(None),
                    PredictedLead.expires_at > datetime.utcnow()
                )
            )
            
            # Get total count before pagination
            total = query.count()
            
            # Apply sorting
            sort_column = getattr(PredictedLead, sort_by, PredictedLead.confidence_score)
            if sort_order == 'asc':
                query = query.order_by(sort_column.asc())
            else:
                query = query.order_by(sort_column.desc())
            
            # Apply pagination
            leads = query.offset(offset).limit(limit).all()
            
            return {
                'success': True,
                'data': [lead.to_dict() for lead in leads],
                'total': total,
                'limit': limit,
                'offset': offset,
                'has_more': (offset + limit) < total,
            }
            
        except Exception as e:
            logger.error(f"Error querying predictions: {e}")
            return {'success': False, 'error': str(e), 'data': [], 'total': 0}
    
    def get_prediction_by_id(
        self,
        db: Session,
        prediction_id: int,
        mark_viewed: bool = True
    ) -> Optional[Dict[str, Any]]:
        """Get a single prediction by ID. Optionally mark as viewed."""
        try:
            lead = db.query(PredictedLead).filter(PredictedLead.id == prediction_id).first()
            if not lead:
                return None
            
            if mark_viewed and lead.status == PredictionStatus.NEW:
                lead.status = PredictionStatus.VIEWED
                db.commit()
            
            return lead.to_dict()
            
        except Exception as e:
            logger.error(f"Error getting prediction {prediction_id}: {e}")
            return None
    
    def update_prediction_status(
        self,
        db: Session,
        prediction_id: int,
        new_status: PredictionStatus
    ) -> bool:
        """Update the status of a prediction (e.g., contacted, converted, dismissed)."""
        try:
            lead = db.query(PredictedLead).filter(PredictedLead.id == prediction_id).first()
            if not lead:
                return False
            
            lead.status = new_status
            lead.updated_at = datetime.utcnow()
            db.commit()
            return True
            
        except Exception as e:
            logger.error(f"Error updating prediction status: {e}")
            return False
    
    def get_prediction_stats(
        self,
        db: Session
    ) -> Dict[str, Any]:
        """Get summary statistics for the prediction dashboard."""
        try:
            # Total active predictions
            total = db.query(PredictedLead).filter(
                PredictedLead.status.in_([
                    PredictionStatus.NEW,
                    PredictionStatus.VIEWED,
                    PredictionStatus.CONTACTED
                ]),
                or_(
                    PredictedLead.expires_at.is_(None),
                    PredictedLead.expires_at > datetime.utcnow()
                )
            ).count()
            
            # Count by type
            type_counts = {}
            for ptype in PredictionType:
                type_counts[ptype.value] = db.query(PredictedLead).filter(
                    PredictedLead.prediction_type == ptype,
                    PredictedLead.status.in_([
                        PredictionStatus.NEW,
                        PredictionStatus.VIEWED,
                        PredictionStatus.CONTACTED
                    ])
                ).count()
            
            # Count by status
            status_counts = {}
            for status in PredictionStatus:
                status_counts[status.value] = db.query(PredictedLead).filter(
                    PredictedLead.status == status
                ).count()
            
            # Average confidence
            avg_confidence = db.query(func.avg(PredictedLead.confidence_score)).filter(
                PredictedLead.status.in_([PredictionStatus.NEW, PredictionStatus.VIEWED])
            ).scalar() or 0
            
            # Total estimated deal value
            total_value = db.query(func.sum(PredictedLead.estimated_deal_value)).filter(
                PredictedLead.status.in_([PredictionStatus.NEW, PredictionStatus.VIEWED])
            ).scalar() or 0
            
            # Top states
            top_states = db.query(
                PredictedLead.state,
                func.count(PredictedLead.id).label('count')
            ).filter(
                PredictedLead.status.in_([PredictionStatus.NEW, PredictionStatus.VIEWED])
            ).group_by(PredictedLead.state).order_by(
                func.count(PredictedLead.id).desc()
            ).limit(10).all()
            
            # Top manufacturers
            top_manufacturers = db.query(
                PredictedLead.manufacturer,
                func.count(PredictedLead.id).label('count')
            ).filter(
                PredictedLead.manufacturer.isnot(None),
                PredictedLead.manufacturer != '',
                PredictedLead.status.in_([PredictionStatus.NEW, PredictionStatus.VIEWED])
            ).group_by(PredictedLead.manufacturer).order_by(
                func.count(PredictedLead.id).desc()
            ).limit(10).all()
            
            # Last refresh info
            last_refresh = db.query(PredictionRefreshLog).order_by(
                PredictionRefreshLog.started_at.desc()
            ).first()
            
            return {
                'success': True,
                'total_predictions': total,
                'by_type': type_counts,
                'by_status': status_counts,
                'average_confidence': round(float(avg_confidence), 2),
                'total_estimated_value': round(float(total_value), 2),
                'top_states': [{'state': s, 'count': c} for s, c in top_states],
                'top_manufacturers': [{'manufacturer': m, 'count': c} for m, c in top_manufacturers if m],
                'last_refresh': {
                    'batch_id': last_refresh.batch_id,
                    'started_at': last_refresh.started_at.isoformat() if last_refresh.started_at else None,
                    'completed_at': last_refresh.completed_at.isoformat() if last_refresh.completed_at else None,
                    'status': last_refresh.status,
                    'total_predictions': last_refresh.total_predictions,
                    'duration_seconds': last_refresh.duration_seconds,
                } if last_refresh else None,
            }
            
        except Exception as e:
            logger.error(f"Error getting prediction stats: {e}")
            return {
                'success': False,
                'error': str(e),
                'total_predictions': 0,
            }


# Singleton instance
prediction_service = PredictionService()
