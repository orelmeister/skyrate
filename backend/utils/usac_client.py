"""
USAC Open Data Client for SkyRate AI
Fetches data from USAC Socrata Open Data Portal.

USAC Datasets used:
- Form 471: https://opendata.usac.org/resource/srbr-2d59.json
- Form 470: https://opendata.usac.org/resource/avi8-svp9.json
- C2 Budget: https://opendata.usac.org/resource/6brt-5pbv.json
- Service Provider Info: https://opendata.usac.org/resource/xcy2-bdid.json
- Invoice Disbursements: https://opendata.usac.org/resource/jpiu-tj8h.json
"""

import requests
import pandas as pd
from typing import Dict, List, Optional, Any
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import os
import logging

logger = logging.getLogger(__name__)

# USAC Open Data API endpoints
USAC_ENDPOINTS = {
    'form_471': 'https://opendata.usac.org/resource/srbr-2d59.json',
    'form_470': 'https://opendata.usac.org/resource/avi8-svp9.json',
    'c2_budget': 'https://opendata.usac.org/resource/6brt-5pbv.json',
    'service_provider': 'https://opendata.usac.org/resource/xcy2-bdid.json',
    'invoice_disbursements': 'https://opendata.usac.org/resource/jpiu-tj8h.json',
}

# Field name mapping from common names to USAC API field names
FIELD_NAME_MAPPING = {
    # Form 471 common fields
    'ben': 'ben',
    'organization_name': 'organization_name',
    'state': 'state',
    'funding_year': 'funding_year',
    'application_number': 'application_number',
    'funding_request_number': 'funding_request_number',
    'application_status': 'application_status',
    'original_total_pre_discount_costs': 'original_total_pre_discount_costs',
    'fcdl_comment': 'fcdl_comment',
    'frn_status': 'frn_status',
    'service_type': 'service_type',
    'applicant_type': 'applicant_type',
    
    # Additional mappings
    'consultant_crn': 'cnslt_epc_organization_id',
    'city': 'city',
    'zip_code': 'zipcode',
}


def map_field_name(field_name: str) -> str:
    """
    Map a common field name to the USAC API field name.
    
    Args:
        field_name: Common field name
        
    Returns:
        USAC API field name
    """
    return FIELD_NAME_MAPPING.get(field_name, field_name)


class USACDataClient:
    """
    Client for fetching data from USAC Open Data Portal.
    Uses the Socrata Open Data API (SODA).
    """
    
    def __init__(self, app_token: Optional[str] = None):
        """
        Initialize the USAC Data Client.
        
        Args:
            app_token: Optional Socrata app token for higher rate limits
        """
        self.app_token = app_token or os.getenv('SOCRATA_APP_TOKEN')
        self.session = self._create_session()
        
    def _create_session(self) -> requests.Session:
        """Create a robust HTTP session with retry logic."""
        session = requests.Session()
        retry = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[408, 429, 500, 502, 503, 504],
            allowed_methods=["GET"]
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=5, pool_maxsize=5)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        
        headers = {'User-Agent': 'SkyRate AI/2.0'}
        if self.app_token:
            headers['X-App-Token'] = self.app_token
        session.headers.update(headers)
        
        return session
    
    def fetch_data(
        self,
        dataset: str = 'form_471',
        year: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 1000,
        offset: int = 0,
        order_by: Optional[str] = None
    ) -> pd.DataFrame:
        """
        Fetch data from USAC Open Data.
        
        Args:
            dataset: Dataset key ('form_471', 'form_470', 'c2_budget')
            year: Funding year filter
            filters: Dictionary of field filters
            limit: Maximum records to return
            offset: Number of records to skip
            order_by: Field to order by (add DESC for descending)
            
        Returns:
            DataFrame with the fetched data
        """
        if dataset not in USAC_ENDPOINTS:
            raise ValueError(f"Unknown dataset: {dataset}. Available: {list(USAC_ENDPOINTS.keys())}")
        
        url = USAC_ENDPOINTS[dataset]
        params = {
            '$limit': limit,
            '$offset': offset,
        }
        
        # Build WHERE clause
        where_conditions = []
        
        if year:
            where_conditions.append(f"funding_year = '{year}'")
        
        if filters:
            for field, value in filters.items():
                mapped_field = map_field_name(field)
                if isinstance(value, str):
                    # Handle special status values
                    if field == 'application_status' and value.lower() == 'denied':
                        where_conditions.append(f"{mapped_field} = 'Denied'")
                    else:
                        where_conditions.append(f"{mapped_field} = '{value}'")
                elif isinstance(value, (int, float)):
                    where_conditions.append(f"{mapped_field} = {value}")
                elif isinstance(value, list):
                    # Handle list of values (IN clause)
                    quoted_values = [f"'{v}'" for v in value]
                    where_conditions.append(f"{mapped_field} IN ({', '.join(quoted_values)})")
        
        if where_conditions:
            params['$where'] = ' AND '.join(where_conditions)
        
        if order_by:
            params['$order'] = order_by
        else:
            params['$order'] = 'funding_year DESC'
        
        try:
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                return pd.DataFrame()
            
            return pd.DataFrame(data)
            
        except requests.exceptions.RequestException as e:
            print(f"Error fetching USAC data: {e}")
            return pd.DataFrame()
        except Exception as e:
            print(f"Unexpected error: {e}")
            return pd.DataFrame()
    
    def get_form_470_history(
        self,
        ben: str,
        year: Optional[int] = None
    ) -> pd.DataFrame:
        """
        Get Form 470 history for a specific BEN.
        
        Args:
            ben: Billed Entity Number
            year: Optional funding year filter
            
        Returns:
            DataFrame with Form 470 records
        """
        filters = {'ben': ben}
        return self.fetch_data(
            dataset='form_470',
            year=year,
            filters=filters,
            limit=500,
            order_by='funding_year DESC'
        )
    
    def search_by_ben(
        self,
        ben: str,
        dataset: str = 'form_471',
        limit: int = 100
    ) -> pd.DataFrame:
        """
        Search for records by BEN.
        
        Args:
            ben: Billed Entity Number
            dataset: Dataset to search
            limit: Maximum records
            
        Returns:
            DataFrame with matching records
        """
        return self.fetch_data(
            dataset=dataset,
            filters={'ben': ben},
            limit=limit
        )
    
    def get_c2_budget_data(
        self,
        ben: str,
        year: Optional[int] = None
    ) -> pd.DataFrame:
        """
        Get C2 Budget Tool data for a BEN.
        
        Args:
            ben: Billed Entity Number
            year: Optional funding year
            
        Returns:
            DataFrame with C2 budget data
        """
        return self.fetch_data(
            dataset='c2_budget',
            year=year,
            filters={'ben': ben},
            limit=100
        )
    
    def validate_spin(self, spin: str) -> Dict[str, Any]:
        """
        Validate a SPIN and get service provider information.
        
        Args:
            spin: Service Provider Identification Number
            
        Returns:
            Dictionary with provider info or error
        """
        try:
            url = USAC_ENDPOINTS['service_provider']
            params = {
                '$where': f"spin = '{spin}'",
                '$limit': 1,
            }
            
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                return {
                    'valid': False,
                    'error': f'SPIN {spin} not found in USAC database'
                }
            
            provider = data[0]
            return {
                'valid': True,
                'spin': provider.get('spin'),
                'service_provider_name': provider.get('service_provider_name'),
                'doing_business_as': provider.get('doing_business_as_dba_'),
                'status': provider.get('status'),
                'fcc_registration_number': provider.get('fcc_registration_number'),
                'general_contact_name': provider.get('general_contact_name'),
                'general_contact_email': provider.get('general_contact_email'),
                'phone_number': provider.get('phone_number'),
                'mailing_address': {
                    'address1': provider.get('mailing_address_1'),
                    'address2': provider.get('mailing_address_2'),
                    'city': provider.get('mailing_city'),
                    'state': provider.get('mailing_state'),
                    'zip': provider.get('mailing_zip_code'),
                },
                'physical_address': {
                    'address1': provider.get('physical_address_1'),
                    'address2': provider.get('physical_address_2'),
                    'city': provider.get('physical_city'),
                    'state': provider.get('physical_state'),
                    'zip': provider.get('physical_zip_code'),
                }
            }
            
        except requests.exceptions.RequestException as e:
            return {
                'valid': False,
                'error': f'Failed to validate SPIN: {str(e)}'
            }
        except Exception as e:
            import traceback
            logger.error(f"Error validating SPIN {spin}: {type(e).__name__}: {str(e)}\n{traceback.format_exc()}")
            return {
                'valid': False,
                'error': f'Failed to validate SPIN: {str(e)}'
            }
    
    def get_serviced_entities(
        self,
        spin: str,
        year: Optional[int] = None,
        limit: int = 500
    ) -> pd.DataFrame:
        """
        Get all schools/entities serviced by a specific SPIN (vendor).
        Uses the Invoice Disbursements dataset to find all entities
        that have received services from this vendor.
        
        Args:
            spin: Service Provider Identification Number
            year: Optional funding year filter
            limit: Maximum records to return
            
        Returns:
            DataFrame with unique entities serviced by the vendor
        """
        try:
            url = USAC_ENDPOINTS['invoice_disbursements']
            
            # Build query - get invoices where this SPIN is the service provider
            where_clause = f"inv_service_provider_id_number_spin = '{spin}'"
            if year:
                where_clause += f" AND funding_year = {year}"
            
            params = {
                '$where': where_clause,
                '$limit': limit,
                '$order': 'funding_year DESC',
                '$select': 'billed_entity_number_applicant_invoice, billed_entity_name_applicant_invoice, funding_year, frn, inv_service_provider_name, inv_total_authorized_amt, inv_line_item_status'
            }
            
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                return pd.DataFrame()
            
            df = pd.DataFrame(data)
            
            # Rename columns for clarity
            df = df.rename(columns={
                'billed_entity_number_applicant_invoice': 'ben',
                'billed_entity_name_applicant_invoice': 'organization_name',
                'inv_service_provider_name': 'service_provider_name',
                'inv_total_authorized_amt': 'total_authorized_amount',
                'inv_line_item_status': 'status'
            })
            
            return df
            
        except requests.exceptions.RequestException as e:
            print(f"Error fetching serviced entities: {e}")
            return pd.DataFrame()
    
    def get_serviced_entities_summary(
        self,
        spin: str,
        year: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get a summary of all entities serviced by a SPIN with aggregated data.
        
        Args:
            spin: Service Provider Identification Number
            year: Optional funding year filter
            
        Returns:
            Dictionary with summary statistics and unique entity list
        """
        df = self.get_serviced_entities(spin, year, limit=2000)
        
        if df.empty:
            return {
                'total_entities': 0,
                'total_authorized': 0,
                'entities': [],
                'funding_years': [],
                'service_provider_name': None
            }
        
        # Get unique entities with aggregated amounts
        entities_summary = df.groupby(['ben', 'organization_name']).agg({
            'funding_year': lambda x: list(x.unique()),
            'total_authorized_amount': lambda x: pd.to_numeric(x, errors='coerce').sum(),
            'frn': 'count'
        }).reset_index()
        
        entities_summary = entities_summary.rename(columns={
            'frn': 'frn_count',
            'total_authorized_amount': 'total_amount'
        })
        
        # Sort by total amount
        entities_summary = entities_summary.sort_values('total_amount', ascending=False)
        
        return {
            'total_entities': len(entities_summary),
            'total_authorized': entities_summary['total_amount'].sum(),
            'funding_years': sorted(df['funding_year'].unique().tolist(), reverse=True),
            'service_provider_name': df['service_provider_name'].iloc[0] if not df.empty else None,
            'entities': entities_summary.to_dict('records')
        }
