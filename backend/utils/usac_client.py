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
    'frn_status': 'https://opendata.usac.org/resource/qdmp-ygft.json',  # Form 471 FRN Status
    '471_combined': 'https://opendata.usac.org/resource/avi8-svp9.json',  # Recipient Details & Commitments
    '471_basic': 'https://opendata.usac.org/resource/9s6i-myen.json',  # Form 471 Basic Information
    '471_line_items': 'https://opendata.usac.org/resource/hbj5-2bpj.json',  # Form 471 FRN Line Items
    # Form 470 Lead Generation (Sprint 3)
    '470_services': 'https://opendata.usac.org/resource/39tn-hjzv.json',  # Services Requested (has manufacturer!)
    '470_basic': 'https://opendata.usac.org/resource/jp7a-89nd.json',  # Basic Info (contacts, entity details)
    # Entity Information
    'entity_supplemental': 'https://opendata.usac.org/resource/7i5i-83qf.json',  # Supplemental Entity Info (contacts!)
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
        limit: int = 5000
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
            DataFrame with invoice records for entities serviced by the vendor
        """
        try:
            url = USAC_ENDPOINTS['invoice_disbursements']
            
            # Use direct field filtering (more reliable than $where clause)
            params = {
                'inv_service_provider_id_number_spin': spin,
                '$limit': limit,
                '$order': 'funding_year DESC'
            }
            
            # Add year filter if specified
            if year:
                params['funding_year'] = str(year)
            
            logger.info(f"Fetching serviced entities for SPIN {spin}")
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                logger.info(f"No invoice records found for SPIN {spin}")
                return pd.DataFrame()
            
            logger.info(f"Found {len(data)} invoice records for SPIN {spin}")
            df = pd.DataFrame(data)
            
            # Rename columns for clarity (use actual field names from USAC)
            column_mapping = {
                'billed_entity_number': 'ben',
                'billed_entity_name': 'organization_name',
                'billed_entity_state': 'state',
                'inv_service_provider_name': 'service_provider_name',
                'approved_inv_line_amt': 'approved_amount',
                'requested_inv_line_amt': 'requested_amount',
                'inv_line_item_status': 'status',
                'service_type': 'service_type',
                'chosen_category_of_service': 'category',
                'funding_request_number': 'frn',
                'form_471_app_num': 'application_number'
            }
            
            # Only rename columns that exist
            rename_cols = {k: v for k, v in column_mapping.items() if k in df.columns}
            df = df.rename(columns=rename_cols)
            
            return df
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching serviced entities for SPIN {spin}: {e}")
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
        df = self.get_serviced_entities(spin, year, limit=5000)
        
        if df.empty:
            return {
                'total_entities': 0,
                'total_authorized': 0,
                'entities': [],
                'funding_years': [],
                'service_provider_name': None
            }
        
        # Get service provider name from first record
        service_provider_name = df['service_provider_name'].iloc[0] if 'service_provider_name' in df.columns else None
        
        # Use approved_amount if available, otherwise requested_amount
        amount_col = 'approved_amount' if 'approved_amount' in df.columns else 'requested_amount'
        
        # Aggregate by unique entities
        entities = {}
        years = set()
        total_amount = 0
        
        for _, record in df.iterrows():
            ben = str(record.get('ben', ''))
            if not ben or ben == 'nan':
                continue
                
            name = record.get('organization_name', 'Unknown')
            year_val = record.get('funding_year')
            state = record.get('state', '')
            service_type = record.get('service_type', '')
            category = record.get('category', '')
            amount = float(record.get(amount_col) or 0)
            
            # Skip invalid year values
            if year_val and str(year_val) not in ['nan', 'None', '']:
                years.add(str(year_val))
            total_amount += amount
            
            if ben not in entities:
                entities[ben] = {
                    'ben': ben,
                    'organization_name': name,
                    'state': state,
                    'funding_years': set(),
                    'total_amount': 0,
                    'frn_count': 0,
                    'service_types': set(),
                    'categories': set(),
                    'cat1_by_year': {},  # Cat 1 amounts by year
                    'cat2_by_year': {}   # Cat 2 amounts by year
                }
            
            if year_val and str(year_val) not in ['nan', 'None', '']:
                entities[ben]['funding_years'].add(str(year_val))
                year_str = str(year_val)
                
                # Track Category 1/2 amounts by year
                is_cat1 = 'Category 1' in str(category) or 'category 1' in str(category).lower()
                is_cat2 = 'Category 2' in str(category) or 'category 2' in str(category).lower()
                
                if is_cat1:
                    if year_str not in entities[ben]['cat1_by_year']:
                        entities[ben]['cat1_by_year'][year_str] = 0
                    entities[ben]['cat1_by_year'][year_str] += amount
                elif is_cat2:
                    if year_str not in entities[ben]['cat2_by_year']:
                        entities[ben]['cat2_by_year'][year_str] = 0
                    entities[ben]['cat2_by_year'][year_str] += amount
            entities[ben]['total_amount'] += amount
            entities[ben]['frn_count'] += 1
            if service_type:
                entities[ben]['service_types'].add(service_type)
            if category:
                entities[ben]['categories'].add(category)
        
        # Convert sets to sorted lists and filter out invalid values
        entity_list = []
        for e in entities.values():
            e['funding_years'] = sorted([y for y in list(e['funding_years']) if y not in ['nan', 'None', '']], reverse=True)
            e['service_types'] = list(e['service_types'])
            e['categories'] = list(e['categories'])
            
            # Calculate current year budget (2026 if available, else 2025)
            current_year = None
            current_cat1 = 0
            current_cat2 = 0
            for yr in ['2026', '2025']:
                if yr in e['funding_years']:
                    current_year = yr
                    current_cat1 = e['cat1_by_year'].get(yr, 0)
                    current_cat2 = e['cat2_by_year'].get(yr, 0)
                    break
            
            e['current_year'] = current_year
            e['current_cat1'] = current_cat1
            e['current_cat2'] = current_cat2
            
            # Clean up internal tracking dicts before returning
            del e['cat1_by_year']
            del e['cat2_by_year']
            
            entity_list.append(e)
        
        # Sort by total amount (highest first)
        entity_list.sort(key=lambda x: x['total_amount'], reverse=True)
        
        # Filter out invalid years from the global list
        valid_years = [y for y in years if y not in ['nan', 'None', '']]
        
        return {
            'total_entities': len(entity_list),
            'total_authorized': total_amount,
            'funding_years': sorted(valid_years, reverse=True),
            'service_provider_name': service_provider_name,
            'entities': entity_list
        }
    
    def get_entity_detail(
        self,
        spin: str,
        ben: str
    ) -> Dict[str, Any]:
        """
        Get detailed year-by-year breakdown for a specific entity serviced by a SPIN.
        Includes Category 1 and Category 2 budgets per funding year.
        
        Args:
            spin: Service Provider Identification Number
            ben: Billed Entity Number
            
        Returns:
            Dictionary with detailed entity funding information by year and category
        """
        try:
            url = USAC_ENDPOINTS['invoice_disbursements']
            
            # Fetch all invoice records for this SPIN + BEN combination
            params = {
                'inv_service_provider_id_number_spin': spin,
                'billed_entity_number': ben,
                '$limit': 2000,
                '$order': 'funding_year DESC'
            }
            
            logger.info(f"Fetching entity detail for SPIN {spin}, BEN {ben}")
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                return {
                    'success': False,
                    'error': f'No records found for BEN {ben} with SPIN {spin}'
                }
            
            df = pd.DataFrame(data)
            
            # Get basic entity info from first record
            first_record = data[0]
            entity_info = {
                'ben': ben,
                'organization_name': first_record.get('billed_entity_name', 'Unknown'),
                'state': first_record.get('billed_entity_state', ''),
                'city': first_record.get('billed_entity_city', ''),
                'service_provider_name': first_record.get('inv_service_provider_name', ''),
            }
            
            # Aggregate by funding year and category
            years_data = {}
            total_cat1 = 0
            total_cat2 = 0
            total_all = 0
            all_service_types = set()
            all_frns = set()
            
            for _, record in df.iterrows():
                year = str(record.get('funding_year', ''))
                if year in ['nan', 'None', '']:
                    continue
                    
                category = record.get('chosen_category_of_service', '')
                service_type = record.get('service_type', '')
                frn = record.get('funding_request_number', '')
                
                # Get amount (approved if available, else requested)
                amount = float(record.get('approved_inv_line_amt') or record.get('requested_inv_line_amt') or 0)
                status = record.get('inv_line_item_status', '')
                
                if service_type:
                    all_service_types.add(service_type)
                if frn:
                    all_frns.add(frn)
                
                if year not in years_data:
                    years_data[year] = {
                        'year': year,
                        'cat1_total': 0,
                        'cat2_total': 0,
                        'total': 0,
                        'frn_count': 0,
                        'service_types': set(),
                        'line_items': []
                    }
                
                # Determine category
                is_cat1 = 'Category 1' in str(category) or 'category 1' in str(category).lower()
                is_cat2 = 'Category 2' in str(category) or 'category 2' in str(category).lower()
                
                if is_cat1:
                    years_data[year]['cat1_total'] += amount
                    total_cat1 += amount
                elif is_cat2:
                    years_data[year]['cat2_total'] += amount
                    total_cat2 += amount
                
                years_data[year]['total'] += amount
                total_all += amount
                years_data[year]['frn_count'] += 1
                if service_type:
                    years_data[year]['service_types'].add(service_type)
                
                # Add line item detail
                years_data[year]['line_items'].append({
                    'frn': frn,
                    'service_type': service_type,
                    'category': category,
                    'amount': amount,
                    'status': status
                })
            
            # Convert sets to lists
            for year_data in years_data.values():
                year_data['service_types'] = list(year_data['service_types'])
            
            # Sort years descending
            sorted_years = sorted(years_data.keys(), reverse=True)
            years_list = [years_data[y] for y in sorted_years]
            
            # Get current year budget (2026 if available, otherwise 2025)
            current_year_budget = None
            for year in ['2026', '2025']:
                if year in years_data:
                    current_year_budget = {
                        'year': year,
                        'cat1': years_data[year]['cat1_total'],
                        'cat2': years_data[year]['cat2_total'],
                        'total': years_data[year]['total']
                    }
                    break
            
            return {
                'success': True,
                'entity': entity_info,
                'total_cat1': total_cat1,
                'total_cat2': total_cat2,
                'total_all': total_all,
                'current_year_budget': current_year_budget,
                'all_service_types': list(all_service_types),
                'total_frns': len(all_frns),
                'years': years_list,
                'funding_years': sorted_years
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching entity detail for SPIN {spin}, BEN {ben}: {e}")
            return {
                'success': False,
                'error': f'Failed to fetch entity details: {str(e)}'
            }
        except Exception as e:
            import traceback
            logger.error(f"Error in get_entity_detail: {type(e).__name__}: {str(e)}\n{traceback.format_exc()}")
            return {
                'success': False,
                'error': f'Failed to fetch entity details: {str(e)}'
            }
    # ==========================================================================
    # FORM 471 COMPETITIVE ANALYSIS METHODS
    # ==========================================================================
    
    def get_471_by_ben(
        self,
        ben: str,
        year: Optional[int] = None,
        limit: int = 500
    ) -> Dict[str, Any]:
        """
        Get Form 471 data for a specific BEN (entity) to see which vendors have won contracts.
        This is the core competitive analysis feature.
        
        Uses the Recipient Details & Commitments Combined dataset (avi8-svp9)
        which provides comprehensive 471 data including service provider info.
        
        Note: BEN can be either a billed_entity_number (for direct applicants) or
        ros_entity_number (for recipients of service in consortia). We search both.
        
        Args:
            ben: Entity Number (can be billed_entity_number or ros_entity_number)
            year: Optional funding year filter
            limit: Maximum records to return
            
        Returns:
            Dictionary with 471 applications showing winning vendors
        """
        try:
            # Use the combined 471 dataset which has all relevant fields
            url = "https://opendata.usac.org/resource/avi8-svp9.json"
            
            # First, try searching by billed_entity_number (direct applicants)
            year_filter = f" AND funding_year='{year}'" if year else ""
            
            # Use SoQL to search both billed_entity_number and ros_entity_number
            where_clause = f"(billed_entity_number='{ben}' OR ros_entity_number='{ben}'){year_filter}"
            
            params = {
                '$where': where_clause,
                '$limit': limit,
                '$order': 'funding_year DESC'
            }
            
            logger.info(f"Fetching 471 data for BEN {ben}")
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                logger.info(f"No 471 records found for BEN {ben}")
                return {
                    'success': True,
                    'ben': ben,
                    'total_records': 0,
                    'records': [],
                    'vendors': [],
                    'funding_years': [],
                    'total_committed': 0
                }
            
            logger.info(f"Found {len(data)} 471 records for BEN {ben}")
            
            # Determine if this is a ROS entity (consortium member) or direct applicant
            first_record = data[0]
            is_ros_entity = str(first_record.get('ros_entity_number', '')) == ben
            
            # Get entity name based on whether it's a ROS entity or billed entity
            if is_ros_entity:
                # This is a recipient of service (part of a consortium)
                entity_name = first_record.get('ros_entity_name', 'Unknown')
                entity_state = first_record.get('ros_physical_state', '')
                # Also capture consortium info
                consortium_name = first_record.get('organization_name', '')
                consortium_ben = first_record.get('billed_entity_number', '')
            else:
                # This is a direct applicant (billed entity)
                entity_name = first_record.get('organization_name', 'Unknown')
                entity_state = first_record.get('org_state', first_record.get('physical_state', ''))
                consortium_name = None
                consortium_ben = None
            
            # Process records
            records = []
            vendors = {}
            years = set()
            total_committed = 0
            
            for record in data:
                year_val = record.get('funding_year', '')
                if year_val:
                    years.add(str(year_val))
                
                # USAC uses funding_request_number for FRN
                frn = record.get('funding_request_number', '')
                # USAC uses spin_number and spin_name for vendor info
                spin = record.get('spin_number', '')
                vendor_name = record.get('spin_name', 'Unknown')
                # Service type info from USAC
                service_type = record.get('form_471_service_type_name', '')
                category = record.get('chosen_category_of_service', '')
                
                # Get commitment/funding amounts - USAC uses pre/post discount fields
                pre_discount = float(record.get('pre_discount_extended_eligible_line_item_costs', 0) or 0)
                post_discount = float(record.get('post_discount_extended_eligible_line_item_costs', 0) or 0)
                committed = post_discount  # Use post-discount as committed amount
                discount_rate = 0
                if pre_discount > 0:
                    discount_rate = round((1 - (post_discount / pre_discount)) * 100, 1)
                
                frn_status = record.get('form_471_frn_status_name', '')
                
                total_committed += committed
                
                # Track unique vendors
                if spin and spin not in vendors:
                    vendors[spin] = {
                        'spin': spin,
                        'name': vendor_name,
                        'frn_count': 0,
                        'total_committed': 0
                    }
                
                if spin:
                    vendors[spin]['frn_count'] += 1
                    vendors[spin]['total_committed'] += committed
                
                records.append({
                    'funding_year': year_val,
                    'frn': frn,
                    'application_number': record.get('form_471_application_number', ''),
                    'service_provider_spin': spin,
                    'service_provider_name': vendor_name,
                    'service_type': service_type,
                    'category': category,
                    'committed_amount': committed,
                    'pre_discount_amount': pre_discount,
                    'discount_rate': discount_rate,
                    'frn_status': frn_status,
                    'product_description': record.get('form_471_service_type_name', '')
                })
            
            # Sort vendors by total committed (highest first)
            vendor_list = sorted(vendors.values(), key=lambda x: x['total_committed'], reverse=True)
            
            result = {
                'success': True,
                'ben': ben,
                'entity_name': entity_name,
                'entity_state': entity_state,
                'total_records': len(records),
                'total_committed': total_committed,
                'funding_years': sorted(list(years), reverse=True),
                'vendors': vendor_list,
                'records': records
            }
            
            # Add consortium info if this is a ROS entity
            if consortium_name:
                result['consortium_name'] = consortium_name
                result['consortium_ben'] = consortium_ben
                result['is_consortium_member'] = True
            else:
                result['is_consortium_member'] = False
            
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching 471 data for BEN {ben}: {e}")
            return {
                'success': False,
                'error': f'Failed to fetch 471 data: {str(e)}'
            }
        except Exception as e:
            import traceback
            logger.error(f"Error in get_471_by_ben: {type(e).__name__}: {str(e)}\n{traceback.format_exc()}")
            return {
                'success': False,
                'error': f'Failed to fetch 471 data: {str(e)}'
            }
    
    def get_471_by_state(
        self,
        state: str,
        year: Optional[int] = None,
        category: Optional[str] = None,
        limit: int = 1000
    ) -> Dict[str, Any]:
        """
        Search Form 471 applications by state for competitive intelligence.
        
        Args:
            state: Two-letter state code (e.g., 'NY', 'CA')
            year: Optional funding year filter
            category: Optional category filter ('1' or '2')
            limit: Maximum records to return
            
        Returns:
            Dictionary with 471 applications in the specified state
        """
        try:
            url = "https://opendata.usac.org/resource/avi8-svp9.json"
            
            # USAC uses physical_state field
            params = {
                'physical_state': state.upper(),
                '$limit': limit,
                '$order': 'funding_year DESC, pre_discount_extended_eligible_line_item_costs DESC'
            }
            
            if year:
                params['funding_year'] = str(year)
            
            if category:
                cat_val = f"Category{category}" if category in ['1', '2'] else category
                params['chosen_category_of_service'] = cat_val
            
            logger.info(f"Fetching 471 data for state {state}")
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                return {
                    'success': True,
                    'state': state,
                    'total_records': 0,
                    'records': []
                }
            
            # Process records - use correct USAC field names
            records = []
            for record in data:
                records.append({
                    'ben': record.get('billed_entity_number', ''),
                    'entity_name': record.get('organization_name', ''),
                    'funding_year': record.get('funding_year', ''),
                    'frn': record.get('funding_request_number', ''),
                    'service_provider_spin': record.get('spin_number', ''),
                    'service_provider_name': record.get('spin_name', ''),
                    'service_type': record.get('form_471_service_type_name', ''),
                    'category': record.get('chosen_category_of_service', ''),
                    'committed_amount': float(record.get('post_discount_extended_eligible_line_item_costs', 0) or 0),
                    'frn_status': record.get('form_471_frn_status_name', '')
                })
            
            return {
                'success': True,
                'state': state,
                'year': year,
                'category': category,
                'total_records': len(records),
                'records': records
            }
            
        except Exception as e:
            logger.error(f"Error fetching 471 data for state {state}: {e}")
            return {
                'success': False,
                'error': f'Failed to fetch 471 data: {str(e)}'
            }
    
    def get_471_competitors_for_spin(
        self,
        spin: str,
        year: Optional[int] = None,
        limit: int = 2000
    ) -> Dict[str, Any]:
        """
        Find competing vendors at entities that this SPIN has serviced.
        Shows which other vendors have won contracts at "your" schools.
        
        Args:
            spin: Service Provider Identification Number
            year: Optional funding year filter
            limit: Maximum records
            
        Returns:
            Dictionary with competitor analysis
        """
        try:
            # First, get all entities this SPIN services
            entities_data = self.get_serviced_entities_summary(spin)
            
            if not entities_data or entities_data['total_entities'] == 0:
                return {
                    'success': True,
                    'spin': spin,
                    'message': 'No serviced entities found for this SPIN',
                    'competitors': [],
                    'entities_analyzed': 0
                }
            
            # Get list of BENs
            bens = [e['ben'] for e in entities_data['entities'][:50]]  # Limit to top 50
            
            # Fetch 471 data for these entities
            url = "https://opendata.usac.org/resource/avi8-svp9.json"
            
            # Build query for multiple BENs
            ben_list = "', '".join(bens)
            where_clause = f"ros_entity_number IN ('{ben_list}')"
            
            if year:
                where_clause += f" AND funding_year = '{year}'"
            
            params = {
                '$where': where_clause,
                '$limit': limit,
                '$order': 'funding_year DESC'
            }
            
            logger.info(f"Fetching competitor data for SPIN {spin} across {len(bens)} entities")
            response = self.session.get(url, params=params, timeout=90)
            response.raise_for_status()
            
            data = response.json()
            
            # Track competitors (excluding self)
            competitors = {}
            my_frns = 0
            competitor_frns = 0
            
            for record in data:
                vendor_spin = record.get('service_provider_number', '')
                vendor_name = record.get('service_provider_name', '')
                committed = float(record.get('total_committed_amount', 0) or 0)
                
                if vendor_spin == spin:
                    my_frns += 1
                    continue
                
                if not vendor_spin:
                    continue
                
                competitor_frns += 1
                
                if vendor_spin not in competitors:
                    competitors[vendor_spin] = {
                        'spin': vendor_spin,
                        'name': vendor_name,
                        'frn_count': 0,
                        'total_committed': 0,
                        'entities': set()
                    }
                
                competitors[vendor_spin]['frn_count'] += 1
                competitors[vendor_spin]['total_committed'] += committed
                competitors[vendor_spin]['entities'].add(record.get('ros_entity_number', ''))
            
            # Convert sets to counts
            competitor_list = []
            for comp in competitors.values():
                comp['entity_count'] = len(comp['entities'])
                del comp['entities']
                competitor_list.append(comp)
            
            # Sort by total committed
            competitor_list.sort(key=lambda x: x['total_committed'], reverse=True)
            
            return {
                'success': True,
                'spin': spin,
                'entities_analyzed': len(bens),
                'my_frn_count': my_frns,
                'competitor_frn_count': competitor_frns,
                'competitors': competitor_list[:20]  # Top 20 competitors
            }
            
        except Exception as e:
            logger.error(f"Error in get_471_competitors_for_spin: {e}")
            return {
                'success': False,
                'error': f'Failed to analyze competitors: {str(e)}'
            }
    
    # ==========================================================================
    # FRN STATUS MONITORING METHODS (Sprint 2)
    # ==========================================================================
    
    def get_frn_status_by_spin(
        self,
        spin: str,
        year: Optional[int] = None,
        status_filter: Optional[str] = None,
        pending_reason_filter: Optional[str] = None,
        limit: int = 2000
    ) -> Dict[str, Any]:
        """
        Get FRN status details for all FRNs associated with a SPIN (vendor).
        This is for operations team to track their contracts.
        
        Args:
            spin: Service Provider Identification Number
            year: Optional funding year filter
            status_filter: Optional status filter ('Funded', 'Denied', 'Pending')
            pending_reason_filter: Optional pending reason filter (partial match)
            limit: Maximum records to return
            
        Returns:
            Dictionary with FRN status data grouped by status
        """
        try:
            url = USAC_ENDPOINTS['frn_status']
            
            # Build query - FRN Status dataset uses spin_name, not spin number
            # We need to first get the spin_name from service provider dataset
            provider_info = self.validate_spin(spin)
            if not provider_info.get('valid'):
                return {
                    'success': False,
                    'error': f'Invalid SPIN: {spin}'
                }
            
            spin_name = provider_info.get('service_provider_name', '')
            
            # Query FRN status by spin_name
            where_conditions = [f"spin_name = '{spin_name}'"]
            
            if year:
                where_conditions.append(f"funding_year = '{year}'")
            
            if status_filter:
                where_conditions.append(f"form_471_frn_status_name = '{status_filter}'")
            
            if pending_reason_filter:
                where_conditions.append(f"UPPER(pending_reason) LIKE UPPER('%{pending_reason_filter}%')")
            
            params = {
                '$where': ' AND '.join(where_conditions),
                '$limit': limit,
                '$order': 'funding_year DESC, award_date DESC'
            }
            
            logger.info(f"Fetching FRN status for SPIN {spin} ({spin_name})")
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                return {
                    'success': True,
                    'spin': spin,
                    'spin_name': spin_name,
                    'total_frns': 0,
                    'frns': [],
                    'summary': {
                        'funded': {'count': 0, 'amount': 0},
                        'denied': {'count': 0, 'amount': 0},
                        'pending': {'count': 0, 'amount': 0}
                    }
                }
            
            # Process FRN records
            frns = []
            funded_count = 0
            funded_amount = 0
            denied_count = 0
            denied_amount = 0
            pending_count = 0
            pending_amount = 0
            
            for record in data:
                status = record.get('form_471_frn_status_name', 'Unknown')
                commitment_amount = float(record.get('funding_commitment_request', 0) or 0)
                disbursed_amount = float(record.get('total_authorized_disbursement', 0) or 0)
                
                # Categorize by status
                status_lower = status.lower()
                if 'funded' in status_lower or 'committed' in status_lower:
                    funded_count += 1
                    funded_amount += commitment_amount
                elif 'denied' in status_lower:
                    denied_count += 1
                    denied_amount += commitment_amount
                else:
                    pending_count += 1
                    pending_amount += commitment_amount
                
                frns.append({
                    'frn': record.get('funding_request_number', ''),
                    'application_number': record.get('application_number', ''),
                    'ben': record.get('ben', ''),
                    'entity_name': record.get('organization_name', ''),
                    'state': record.get('state', ''),
                    'funding_year': record.get('funding_year', ''),
                    'service_type': record.get('form_471_service_type_name', ''),
                    'status': status,
                    'pending_reason': record.get('pending_reason', ''),
                    'commitment_amount': commitment_amount,
                    'disbursed_amount': disbursed_amount,
                    'discount_rate': float(record.get('dis_pct', 0) or 0) * 100,
                    'award_date': record.get('award_date', ''),
                    'fcdl_date': record.get('fcdl_letter_date', ''),
                    'last_invoice_date': record.get('last_date_to_invoice', ''),
                    'service_start': record.get('service_start_date', ''),
                    'service_end': record.get('service_delivery_deadline', ''),
                    'invoicing_mode': record.get('invoicing_mode', ''),
                    'invoicing_ready': record.get('invoicing_ready', ''),
                    'f486_status': record.get('f486_case_status', ''),
                    'wave_number': record.get('wave_sequence_number', ''),
                    'fcdl_comment': record.get('fcdl_comment_frn', '')
                })
            
            return {
                'success': True,
                'spin': spin,
                'spin_name': spin_name,
                'total_frns': len(frns),
                'summary': {
                    'funded': {'count': funded_count, 'amount': funded_amount},
                    'denied': {'count': denied_count, 'amount': denied_amount},
                    'pending': {'count': pending_count, 'amount': pending_amount}
                },
                'frns': frns
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching FRN status for SPIN {spin}: {e}")
            return {
                'success': False,
                'error': f'Failed to fetch FRN status: {str(e)}'
            }
        except Exception as e:
            import traceback
            logger.error(f"Error in get_frn_status_by_spin: {type(e).__name__}: {str(e)}\n{traceback.format_exc()}")
            return {
                'success': False,
                'error': f'Failed to fetch FRN status: {str(e)}'
            }
    
    def get_frn_status_by_ben(
        self,
        ben: str,
        year: Optional[int] = None,
        status_filter: Optional[str] = None,
        limit: int = 500,
        spin: Optional[str] = None,
        pending_reason_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get FRN status for a specific entity (BEN), optionally filtered by SPIN/status/pending reason.
        This shows the detailed status of each FRN for a specific school.
        
        Args:
            ben: Billed Entity Number
            year: Optional funding year filter
            status_filter: Optional status filter ('Funded', 'Denied', 'Pending')
            limit: Maximum records to return
            spin: Optional SPIN to filter (show only your FRNs at this entity)
            pending_reason_filter: Optional pending reason text filter
            
        Returns:
            Dictionary with FRN status details for the entity
        """
        try:
            url = USAC_ENDPOINTS['frn_status']
            
            # Build query
            where_conditions = [f"ben = '{ben}'"]
            
            if year:
                where_conditions.append(f"funding_year = '{year}'")
            
            if status_filter:
                where_conditions.append(f"UPPER(frn_status) LIKE UPPER('%{status_filter}%')")
            
            if pending_reason_filter:
                where_conditions.append(f"UPPER(pending_reason) LIKE UPPER('%{pending_reason_filter}%')")
            
            if spin:
                # Get spin_name for filtering
                provider_info = self.validate_spin(spin)
                if provider_info.get('valid'):
                    spin_name = provider_info.get('service_provider_name', '')
                    where_conditions.append(f"spin_name = '{spin_name}'")
            
            params = {
                '$where': ' AND '.join(where_conditions),
                '$limit': limit,
                '$order': 'funding_year DESC, funding_request_number ASC'
            }
            
            logger.info(f"Fetching FRN status for BEN {ben}")
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                return {
                    'success': True,
                    'ben': ben,
                    'entity_name': None,
                    'total_frns': 0,
                    'frns': [],
                    'years': [],
                    'summary': {
                        'funded': {'count': 0, 'amount': 0},
                        'denied': {'count': 0, 'amount': 0},
                        'pending': {'count': 0, 'amount': 0}
                    }
                }
            
            # Get entity info from first record
            first_record = data[0]
            entity_name = first_record.get('organization_name', 'Unknown')
            entity_state = first_record.get('state', '')
            
            # Process FRN records
            frns = []
            years = set()
            funded_count = 0
            funded_amount = 0
            denied_count = 0
            denied_amount = 0
            pending_count = 0
            pending_amount = 0
            
            for record in data:
                status = record.get('form_471_frn_status_name', 'Unknown')
                commitment_amount = float(record.get('funding_commitment_request', 0) or 0)
                disbursed_amount = float(record.get('total_authorized_disbursement', 0) or 0)
                year_val = record.get('funding_year', '')
                
                if year_val:
                    years.add(year_val)
                
                # Categorize by status
                status_lower = status.lower()
                if 'funded' in status_lower or 'committed' in status_lower:
                    funded_count += 1
                    funded_amount += commitment_amount
                elif 'denied' in status_lower:
                    denied_count += 1
                    denied_amount += commitment_amount
                else:
                    pending_count += 1
                    pending_amount += commitment_amount
                
                frns.append({
                    'frn': record.get('funding_request_number', ''),
                    'application_number': record.get('application_number', ''),
                    'funding_year': year_val,
                    'spin_name': record.get('spin_name', ''),
                    'service_type': record.get('form_471_service_type_name', ''),
                    'status': status,
                    'pending_reason': record.get('pending_reason', ''),
                    'commitment_amount': commitment_amount,
                    'disbursed_amount': disbursed_amount,
                    'discount_rate': float(record.get('dis_pct', 0) or 0) * 100,
                    'award_date': record.get('award_date', ''),
                    'fcdl_date': record.get('fcdl_letter_date', ''),
                    'last_invoice_date': record.get('last_date_to_invoice', ''),
                    'service_start': record.get('service_start_date', ''),
                    'service_end': record.get('service_delivery_deadline', ''),
                    'invoicing_mode': record.get('invoicing_mode', ''),
                    'invoicing_ready': record.get('invoicing_ready', ''),
                    'f486_status': record.get('f486_case_status', ''),
                    'wave_number': record.get('wave_sequence_number', ''),
                    'fcdl_comment': record.get('fcdl_comment_frn', '')
                })
            
            return {
                'success': True,
                'ben': ben,
                'entity_name': entity_name,
                'entity_state': entity_state,
                'total_frns': len(frns),
                'years': sorted(list(years), reverse=True),
                'summary': {
                    'funded': {'count': funded_count, 'amount': funded_amount},
                    'denied': {'count': denied_count, 'amount': denied_amount},
                    'pending': {'count': pending_count, 'amount': pending_amount}
                },
                'frns': frns
            }
            
        except Exception as e:
            logger.error(f"Error fetching FRN status for BEN {ben}: {e}")
            return {
                'success': False,
                'error': f'Failed to fetch FRN status: {str(e)}'
            }
    
    def get_frn_status_batch(
        self,
        bens: list,
        year: Optional[int] = None,
        status_filter: Optional[str] = None,
        limit: int = 50000,
        pending_reason_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get FRN status for multiple BENs in a single USAC API call.
        Uses SoQL WHERE ben IN (...) syntax instead of N sequential calls.
        
        For a consultant with 87 schools, this reduces 87 API calls to 1.
        
        Args:
            bens: List of Billed Entity Numbers
            year: Optional funding year filter
            status_filter: Optional status filter ('Funded', 'Denied', 'Pending')
            limit: Maximum records to return (default 50000 for batch)
            pending_reason_filter: Optional pending reason text filter
            
        Returns:
            Dictionary with FRN data grouped by BEN
        """
        if not bens:
            return {'success': True, 'results': {}}
        
        try:
            url = USAC_ENDPOINTS['frn_status']
            
            # Build IN clause for batch query
            ben_list = ", ".join(f"'{b}'" for b in bens)
            where_conditions = [f"ben IN ({ben_list})"]
            
            if year:
                where_conditions.append(f"funding_year = '{year}'")
            
            if status_filter:
                where_conditions.append(f"UPPER(frn_status) LIKE UPPER('%{status_filter}%')")
            
            if pending_reason_filter:
                where_conditions.append(f"UPPER(pending_reason) LIKE UPPER('%{pending_reason_filter}%')")
            
            params = {
                '$where': ' AND '.join(where_conditions),
                '$limit': limit,
                '$order': 'ben ASC, funding_year DESC, funding_request_number ASC'
            }
            
            logger.info(f"Batch fetching FRN status for {len(bens)} BENs in single query")
            response = self.session.get(url, params=params, timeout=120)
            response.raise_for_status()
            data = response.json()
            
            # Group results by BEN
            ben_groups: Dict[str, list] = {}
            for record in data:
                ben = record.get('ben', '')
                if ben not in ben_groups:
                    ben_groups[ben] = []
                ben_groups[ben].append(record)
            
            # Process each BEN group (same logic as get_frn_status_by_ben)
            results = {}
            for ben, records in ben_groups.items():
                first_record = records[0]
                entity_name = first_record.get('organization_name', 'Unknown')
                entity_state = first_record.get('state', '')
                
                frns = []
                years = set()
                funded_count = funded_amount = 0
                denied_count = denied_amount = 0
                pending_count = pending_amount = 0
                
                for record in records:
                    frn_status = record.get('form_471_frn_status_name', 'Unknown')
                    commitment_amount = float(record.get('funding_commitment_request', 0) or 0)
                    disbursed_amount = float(record.get('total_authorized_disbursement', 0) or 0)
                    year_val = record.get('funding_year', '')
                    
                    if year_val:
                        years.add(year_val)
                    
                    status_lower = frn_status.lower()
                    if 'funded' in status_lower or 'committed' in status_lower:
                        funded_count += 1
                        funded_amount += commitment_amount
                    elif 'denied' in status_lower:
                        denied_count += 1
                        denied_amount += commitment_amount
                    else:
                        pending_count += 1
                        pending_amount += commitment_amount
                    
                    frns.append({
                        'frn': record.get('funding_request_number', ''),
                        'application_number': record.get('application_number', ''),
                        'funding_year': year_val,
                        'spin_name': record.get('spin_name', ''),
                        'service_type': record.get('form_471_service_type_name', ''),
                        'status': frn_status,
                        'pending_reason': record.get('pending_reason', ''),
                        'commitment_amount': commitment_amount,
                        'disbursed_amount': disbursed_amount,
                        'discount_rate': float(record.get('dis_pct', 0) or 0) * 100,
                        'award_date': record.get('award_date', ''),
                        'fcdl_date': record.get('fcdl_letter_date', ''),
                        'last_invoice_date': record.get('last_date_to_invoice', ''),
                        'service_start': record.get('service_start_date', ''),
                        'service_end': record.get('service_delivery_deadline', ''),
                        'invoicing_mode': record.get('invoicing_mode', ''),
                        'invoicing_ready': record.get('invoicing_ready', ''),
                        'f486_status': record.get('f486_case_status', ''),
                        'wave_number': record.get('wave_sequence_number', ''),
                        'fcdl_comment': record.get('fcdl_comment_frn', '')
                    })
                
                results[ben] = {
                    'success': True,
                    'ben': ben,
                    'entity_name': entity_name,
                    'entity_state': entity_state,
                    'total_frns': len(frns),
                    'years': sorted(list(years), reverse=True),
                    'summary': {
                        'funded': {'count': funded_count, 'amount': funded_amount},
                        'denied': {'count': denied_count, 'amount': denied_amount},
                        'pending': {'count': pending_count, 'amount': pending_amount}
                    },
                    'frns': frns
                }
            
            # Add empty entries for BENs with no data
            for ben in bens:
                if ben not in results:
                    results[ben] = {
                        'success': True,
                        'ben': ben,
                        'entity_name': None,
                        'total_frns': 0,
                        'frns': [],
                        'years': [],
                        'summary': {
                            'funded': {'count': 0, 'amount': 0},
                            'denied': {'count': 0, 'amount': 0},
                            'pending': {'count': 0, 'amount': 0}
                        }
                    }
            
            logger.info(f"Batch FRN query returned {len(data)} records for {len(ben_groups)}/{len(bens)} BENs")
            return {
                'success': True,
                'total_bens': len(bens),
                'bens_with_data': len(ben_groups),
                'total_records': len(data),
                'results': results
            }
        
        except Exception as e:
            logger.error(f"Error batch fetching FRN status for {len(bens)} BENs: {e}")
            return {
                'success': False,
                'error': f'Failed to batch fetch FRN status: {str(e)}'
            }
    
    def get_entity_frn_summary(
        self,
        spin: str,
        ben: str
    ) -> Dict[str, Any]:
        """
        Get a summary of FRN status for a specific entity that a vendor services.
        Enhanced version for the entity detail modal in My Entities.
        
        Args:
            spin: Service Provider SPIN
            ben: Billed Entity Number
            
        Returns:
            Dictionary with FRN status summary for the entity
        """
        try:
            # Get FRN status filtered by both BEN and SPIN
            result = self.get_frn_status_by_ben(ben, spin=spin)
            
            if not result.get('success'):
                return result
            
            # Group FRNs by year for detailed breakdown
            years_data = {}
            for frn in result.get('frns', []):
                year = frn.get('funding_year', 'Unknown')
                if year not in years_data:
                    years_data[year] = {
                        'year': year,
                        'funded': {'count': 0, 'amount': 0},
                        'denied': {'count': 0, 'amount': 0},
                        'pending': {'count': 0, 'amount': 0},
                        'total': 0,
                        'frns': []
                    }
                
                status_lower = frn.get('status', '').lower()
                amount = frn.get('commitment_amount', 0)
                
                if 'funded' in status_lower or 'committed' in status_lower:
                    years_data[year]['funded']['count'] += 1
                    years_data[year]['funded']['amount'] += amount
                elif 'denied' in status_lower:
                    years_data[year]['denied']['count'] += 1
                    years_data[year]['denied']['amount'] += amount
                else:
                    years_data[year]['pending']['count'] += 1
                    years_data[year]['pending']['amount'] += amount
                
                years_data[year]['total'] += amount
                years_data[year]['frns'].append(frn)
            
            # Sort years descending
            sorted_years = sorted(years_data.keys(), reverse=True)
            years_list = [years_data[y] for y in sorted_years]
            
            result['years_breakdown'] = years_list
            return result
            
        except Exception as e:
            logger.error(f"Error in get_entity_frn_summary: {e}")
            return {
                'success': False,
                'error': f'Failed to get entity FRN summary: {str(e)}'
            }
    
    # ==========================================================================
    # FORM 470 LEAD GENERATION METHODS (Sprint 3)
    # ==========================================================================
    
    def get_470_leads(
        self,
        year: Optional[int] = None,
        state: Optional[str] = None,
        category: Optional[str] = None,
        service_type: Optional[str] = None,
        manufacturer: Optional[str] = None,
        equipment_type: Optional[str] = None,
        service_function: Optional[str] = None,
        min_speed: Optional[str] = None,
        max_speed: Optional[str] = None,
        sort_by: Optional[str] = None,
        limit: int = 2000,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get Form 470 postings for lead generation.
        This is the core sales workflow for vendors - finding schools seeking services.
        
        Joins 470_services (for manufacturer/service details) with 470_basic (for entity info).
        
        Args:
            year: Optional funding year filter (default: current + next year)
            state: Optional two-letter state code filter
            category: Optional category filter ('1' for Cat1, '2' for Cat2)
            service_type: Optional service type filter
            manufacturer: Optional manufacturer name filter (partial match)
            equipment_type: Optional equipment/function type filter (e.g., 'Switches', 'Routers')
            service_function: Optional service function filter (e.g., 'Managed Internal Broadband Services')
            min_speed: Optional minimum speed/capacity filter
            max_speed: Optional maximum speed/capacity filter
            sort_by: Sort order - 'entity_name' for ABC, 'posting_date' (default) for newest first
            limit: Maximum records to return (default 2000)
            offset: Pagination offset
            
        Returns:
            Dictionary with 470 leads including entity info and services requested
        """
        try:
            # Default to current and next funding year if not specified
            if not year:
                import datetime
                current_year = datetime.datetime.now().year
                # E-Rate funding years typically are current year + 1
                year_filter = f"funding_year IN ('{current_year}', '{current_year + 1}')"
            else:
                year_filter = f"funding_year = '{year}'"
            
            # Build WHERE clause for services dataset
            where_conditions = [year_filter]
            
            if category:
                cat_name = f"Category {category}" if category in ['1', '2'] else category
                where_conditions.append(f"service_category = '{cat_name}'")
            
            if service_type:
                where_conditions.append(f"service_type LIKE '%{service_type}%'")
            
            if manufacturer:
                where_conditions.append(f"UPPER(manufacturer) LIKE UPPER('%{manufacturer}%')")
            
            # NEW: Equipment type / function filter (Items 6, 7)
            if equipment_type:
                where_conditions.append(f"UPPER(function) LIKE UPPER('%{equipment_type}%')")
            
            if service_function:
                where_conditions.append(f"UPPER(function) LIKE UPPER('%{service_function}%')")
            
            # NEW: Speed/capacity range filter (Item 8)
            if min_speed:
                where_conditions.append(f"minimum_capacity >= '{min_speed}'")
            
            if max_speed:
                where_conditions.append(f"maximum_capacity <= '{max_speed}'")
            
            # Fetch services data — use large limit to get ALL matching records
            services_url = USAC_ENDPOINTS['470_services']
            all_services_data = []
            fetch_offset = 0
            fetch_limit = 5000  # USAC max per request
            
            while True:
                params = {
                    '$where': ' AND '.join(where_conditions),
                    '$limit': fetch_limit,
                    '$offset': fetch_offset,
                    '$order': 'funding_year DESC'
                }
                
                logger.info(f"Fetching 470 services batch at offset {fetch_offset}: {params.get('$where', '')[:200]}")
                response = self.session.get(services_url, params=params, timeout=60)
                response.raise_for_status()
                batch = response.json()
                
                if not batch:
                    break
                    
                all_services_data.extend(batch)
                
                # If we got fewer than the limit, we've fetched everything
                if len(batch) < fetch_limit:
                    break
                    
                fetch_offset += fetch_limit
                
                # Safety cap to avoid infinite loops
                if fetch_offset > 50000:
                    logger.warning("Hit 50k service records safety cap")
                    break
            
            services_data = all_services_data
            
            if not services_data:
                return {
                    'success': True,
                    'total_leads': 0,
                    'leads': [],
                    'has_more': False,
                    'filters_applied': {
                        'year': year,
                        'state': state,
                        'category': category,
                        'service_type': service_type,
                        'manufacturer': manufacturer,
                        'equipment_type': equipment_type,
                        'service_function': service_function,
                        'min_speed': min_speed,
                        'max_speed': max_speed,
                    }
                }
            
            # Get unique application numbers to fetch basic info
            app_numbers = list(set(s.get('application_number') for s in services_data if s.get('application_number')))
            
            # Fetch basic info in batches of 200 (no more [:100] cap!)
            basic_url = USAC_ENDPOINTS['470_basic']
            basic_data = []
            batch_size = 200
            
            for i in range(0, len(app_numbers), batch_size):
                batch_apps = app_numbers[i:i + batch_size]
                quoted_app_nums = ','.join(f"'{an}'" for an in batch_apps)
                basic_where = f"application_number IN ({quoted_app_nums})"
                if state:
                    basic_where += f" AND billed_entity_state = '{state.upper()}'"
                
                basic_params = {
                    '$where': basic_where,
                    '$limit': 5000
                }
                
                logger.info(f"Fetching 470 basic info batch {i // batch_size + 1} ({len(batch_apps)} apps)")
                basic_response = self.session.get(basic_url, params=basic_params, timeout=60)
                basic_response.raise_for_status()
                basic_data.extend(basic_response.json())
            
            # Create lookup for basic info by application_number
            basic_lookup = {b.get('application_number'): b for b in basic_data}
            
            # Group services by application and build lead records
            leads_by_app = {}
            for service in services_data:
                app_num = service.get('application_number')
                if not app_num:
                    continue
                
                basic_info = basic_lookup.get(app_num, {})
                
                # Apply state filter if we have basic info
                if state and basic_info.get('billed_entity_state', '').upper() != state.upper():
                    continue
                
                if app_num not in leads_by_app:
                    leads_by_app[app_num] = {
                        'application_number': app_num,
                        'funding_year': service.get('funding_year'),
                        'ben': basic_info.get('ben'),
                        'entity_name': basic_info.get('billed_entity_name'),
                        'state': basic_info.get('billed_entity_state'),
                        'city': basic_info.get('billed_entity_city'),
                        'applicant_type': basic_info.get('applicant_type'),
                        'status': basic_info.get('f470_status'),
                        'posting_date': basic_info.get('certified_datetime'),
                        'allowable_contract_date': basic_info.get('allowable_contract_date'),
                        # Contact info
                        'contact_name': basic_info.get('contact_name'),
                        'contact_email': basic_info.get('contact_email'),
                        'contact_phone': basic_info.get('contact_phone'),
                        'technical_contact': basic_info.get('technical_contact_name'),
                        'technical_email': basic_info.get('technical_contact_email'),
                        'technical_phone': basic_info.get('technical_contact_phone'),
                        # Category descriptions
                        'cat1_description': basic_info.get('category_one_description'),
                        'cat2_description': basic_info.get('category_two_description'),
                        # Service details
                        'services': [],
                        'manufacturers': set(),
                        'service_types': set(),
                        'categories': set()
                    }
                
                # Add service details
                leads_by_app[app_num]['services'].append({
                    'service_category': service.get('service_category'),
                    'service_type': service.get('service_type'),
                    'function': service.get('function'),
                    'manufacturer': service.get('manufacturer'),
                    'quantity': service.get('quantity'),
                    'unit': service.get('unit'),
                    'min_capacity': service.get('minimum_capacity'),
                    'max_capacity': service.get('maximum_capacity'),
                    'installation_required': service.get('installation_initial_configuration')
                })
                
                if service.get('manufacturer'):
                    leads_by_app[app_num]['manufacturers'].add(service.get('manufacturer'))
                if service.get('service_type'):
                    leads_by_app[app_num]['service_types'].add(service.get('service_type'))
                if service.get('service_category'):
                    leads_by_app[app_num]['categories'].add(service.get('service_category'))
            
            # Convert sets to lists for JSON serialization
            leads = []
            for lead in leads_by_app.values():
                lead['manufacturers'] = list(lead['manufacturers'])
                lead['service_types'] = list(lead['service_types'])
                lead['categories'] = list(lead['categories'])
                leads.append(lead)
            
            # Sort based on sort_by parameter (Item 10: ABC sorting)
            if sort_by == 'entity_name':
                leads.sort(key=lambda x: (x.get('entity_name') or '').lower())
            else:
                # Default: Sort by posting date (newest first)
                leads.sort(key=lambda x: x.get('posting_date') or '', reverse=True)
            
            # Apply pagination
            total_leads = len(leads)
            paginated_leads = leads[offset:offset + limit]
            
            return {
                'success': True,
                'total_leads': total_leads,
                'leads': paginated_leads,
                'has_more': (offset + limit) < total_leads,
                'filters_applied': {
                    'year': year,
                    'state': state,
                    'category': category,
                    'service_type': service_type,
                    'manufacturer': manufacturer,
                    'equipment_type': equipment_type,
                    'service_function': service_function,
                    'min_speed': min_speed,
                    'max_speed': max_speed,
                    'sort_by': sort_by,
                }
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching 470 leads: {e}")
            return {
                'success': False,
                'error': f'Failed to fetch Form 470 leads: {str(e)}'
            }
        except Exception as e:
            logger.error(f"Error in get_470_leads: {e}")
            return {
                'success': False,
                'error': f'Failed to process 470 leads: {str(e)}'
            }
    
    def get_470_by_state(
        self,
        state: str,
        year: Optional[int] = None,
        category: Optional[str] = None,
        limit: int = 500
    ) -> Dict[str, Any]:
        """
        Get Form 470 postings for a specific state.
        Convenience method for state-based lead generation.
        
        Args:
            state: Two-letter state code (e.g., 'NY', 'CA')
            year: Optional funding year filter
            category: Optional category filter ('1' or '2')
            limit: Maximum records
            
        Returns:
            Dictionary with 470 leads for the state
        """
        return self.get_470_leads(
            year=year,
            state=state,
            category=category,
            limit=limit
        )
    
    def get_470_by_manufacturer(
        self,
        manufacturer: str,
        year: Optional[int] = None,
        state: Optional[str] = None,
        limit: int = 500
    ) -> Dict[str, Any]:
        """
        Get Form 470 postings that mention a specific manufacturer.
        KEY DIFFERENTIATOR: Manufacturer filtering - exclusive to SkyRate!
        
        Useful for vendors who represent specific product lines (Cisco, Meraki, Aruba, etc.)
        
        Args:
            manufacturer: Manufacturer name to search for (partial match)
            year: Optional funding year filter
            state: Optional state filter
            limit: Maximum records
            
        Returns:
            Dictionary with 470 leads mentioning the manufacturer
        """
        return self.get_470_leads(
            year=year,
            state=state,
            manufacturer=manufacturer,
            limit=limit
        )
    
    def get_470_detail(
        self,
        application_number: str
    ) -> Dict[str, Any]:
        """
        Get detailed information about a specific Form 470 application.
        Includes all services requested, contacts, and descriptions.
        
        Args:
            application_number: The 470 application number
            
        Returns:
            Dictionary with complete 470 details
        """
        try:
            # Fetch basic info
            basic_url = USAC_ENDPOINTS['470_basic']
            basic_params = {
                '$where': f"application_number = '{application_number}'",
                '$limit': 1
            }
            
            basic_response = self.session.get(basic_url, params=basic_params, timeout=30)
            basic_response.raise_for_status()
            basic_data = basic_response.json()
            
            if not basic_data:
                return {
                    'success': False,
                    'error': f'Form 470 application {application_number} not found'
                }
            
            basic_info = basic_data[0]
            
            # Fetch all services for this application
            services_url = USAC_ENDPOINTS['470_services']
            services_params = {
                '$where': f"application_number = '{application_number}'",
                '$limit': 100
            }
            
            services_response = self.session.get(services_url, params=services_params, timeout=30)
            services_response.raise_for_status()
            services_data = services_response.json()
            
            # Build comprehensive response
            return {
                'success': True,
                'application_number': application_number,
                'funding_year': basic_info.get('funding_year'),
                'status': basic_info.get('f470_status'),
                'form_nickname': basic_info.get('form_nickname'),
                # Entity info
                'entity': {
                    'ben': basic_info.get('ben'),
                    'name': basic_info.get('billed_entity_name'),
                    'type': basic_info.get('applicant_type'),
                    'address': basic_info.get('billed_entity_address1'),
                    'address2': basic_info.get('billed_entity_address2'),
                    'city': basic_info.get('billed_entity_city'),
                    'state': basic_info.get('billed_entity_state'),
                    'zip': basic_info.get('billed_entity_zip'),
                    'phone': basic_info.get('billed_entity_phone'),
                    'email': basic_info.get('billed_entity_email'),
                    'website': basic_info.get('website_url'),
                    'eligible_entities': basic_info.get('number_of_eligible_entities')
                },
                # Contacts
                'contact': {
                    'name': basic_info.get('contact_name'),
                    'email': basic_info.get('contact_email'),
                    'phone': basic_info.get('contact_phone'),
                    'address': basic_info.get('contact_address1'),
                    'city': basic_info.get('contact_city'),
                    'state': basic_info.get('contact_state'),
                    'zip': basic_info.get('contact_zip')
                },
                'technical_contact': {
                    'name': basic_info.get('technical_contact_name'),
                    'title': basic_info.get('technical_contact_title'),
                    'email': basic_info.get('technical_contact_email'),
                    'phone': basic_info.get('technical_contact_phone')
                },
                'authorized_person': {
                    'name': basic_info.get('authorized_person_name'),
                    'title': basic_info.get('authorized_person_title'),
                    'email': basic_info.get('authorized_person_email'),
                    'phone': basic_info.get('authorized_person_phone')
                },
                # Descriptions
                'category_one_description': basic_info.get('category_one_description'),
                'category_two_description': basic_info.get('category_two_description'),
                # Dates
                'posting_date': basic_info.get('certified_datetime'),
                'allowable_contract_date': basic_info.get('allowable_contract_date'),
                'created_date': basic_info.get('created_datetime'),
                # Services requested
                'services': [{
                    'service_category': s.get('service_category'),
                    'service_type': s.get('service_type'),
                    'function': s.get('function'),
                    'manufacturer': s.get('manufacturer'),
                    'quantity': s.get('quantity'),
                    'unit': s.get('unit'),
                    'entities': s.get('entities'),
                    'min_capacity': s.get('minimum_capacity'),
                    'max_capacity': s.get('maximum_capacity'),
                    'installation_required': s.get('installation_initial_configuration')
                } for s in services_data],
                # Summary
                'total_services': len(services_data),
                'manufacturers': list(set(s.get('manufacturer') for s in services_data if s.get('manufacturer'))),
                'service_types': list(set(s.get('service_type') for s in services_data if s.get('service_type'))),
                'categories': list(set(s.get('service_category') for s in services_data if s.get('service_category')))
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching 470 detail: {e}")
            return {
                'success': False,
                'error': f'Failed to fetch Form 470 details: {str(e)}'
            }
        except Exception as e:
            logger.error(f"Error in get_470_detail: {e}")
            return {
                'success': False,
                'error': f'Failed to process 470 details: {str(e)}'
            }

    def get_frn_status_for_ben(
        self,
        ben: str,
        year: Optional[int] = None,
        frn: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get detailed FRN status information for a BEN.
        Queries the Form 471 FRN Status dataset (qdmp-ygft).
        
        Actual field names in qdmp-ygft:
        - ben (not billed_entity_number)
        - form_471_frn_status_name (Funded/Denied/Pending)
        - funding_request_number
        - funding_commitment_request
        - total_authorized_disbursement
        """
        try:
            url = USAC_ENDPOINTS['frn_status']
            
            # Build query - qdmp-ygft uses simple field names
            where_parts = [f"ben = '{ben}'"]
            if year:
                where_parts.append(f"funding_year = '{year}'")
            if frn:
                where_parts.append(f"funding_request_number = '{frn}'")
            
            params = {
                '$where': ' AND '.join(where_parts),
                '$limit': 500,
                '$order': 'funding_year DESC'
            }
            
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            frn_data = response.json()
            
            if not frn_data:
                return {'success': True, 'frns': [], 'count': 0}
            
            # Process FRN status data with correct field names
            frns = []
            for frn_record in frn_data:
                frns.append({
                    'frn': frn_record.get('funding_request_number'),
                    'frn_status': frn_record.get('form_471_frn_status_name'),  # Funded, Denied, Pending
                    'funding_year': frn_record.get('funding_year'),
                    'application_number': frn_record.get('application_number'),
                    'commitment_amount': float(frn_record.get('funding_commitment_request') or 0),
                    'original_request': float(frn_record.get('funding_commitment_request') or 0),
                    'funded_amount': float(frn_record.get('total_authorized_disbursement') or 0),
                    'denied_amount': 0,
                    'pending_amount': 0,
                    'service_type': frn_record.get('form_471_service_type_name'),
                    'category': '',
                    'frn_nickname': frn_record.get('nickname'),
                    'wave_number': frn_record.get('wave_sequence_number'),
                    'fcdl_date': frn_record.get('fcdl_letter_date'),
                    'fcdl_comment': frn_record.get('fcdl_comment_frn')
                })
            
            # Calculate summary stats
            summary = {
                'total_frns': len(frns),
                'funded_count': len([f for f in frns if f['frn_status'] == 'Funded']),
                'denied_count': len([f for f in frns if f['frn_status'] == 'Denied']),
                'pending_count': len([f for f in frns if f['frn_status'] in ['Pending', 'In Review']]),
                'total_committed': sum(f['commitment_amount'] for f in frns),
                'total_funded': sum(f['funded_amount'] for f in frns),
                'total_denied': sum(f['denied_amount'] for f in frns),
            }
            
            return {
                'success': True,
                'ben': ben,
                'frns': frns,
                'count': len(frns),
                'summary': summary
            }
            
        except Exception as e:
            logger.error(f"Error fetching FRN status for BEN {ben}: {e}")
            return {'success': False, 'error': str(e), 'frns': [], 'count': 0}

    def get_entity_contacts(
        self,
        ben: str
    ) -> Dict[str, Any]:
        """
        Get contact information for an entity from multiple USAC sources.
        
        Sources:
        - Form 470 Basic Info (jp7a-89nd) - recent Form 470 contacts
        - Supplemental Entity Info (7i5i-83qf) - entity directory contacts
        
        Args:
            ben: Billed Entity Number
            
        Returns:
            Dict with contact information from various sources
        """
        contacts = []
        entity_info = {}
        
        try:
            # 1. Get contacts from Form 470 Basic Info (most recent filings)
            url_470 = USAC_ENDPOINTS['470_basic']
            params_470 = {
                '$where': f"ben = '{ben}'",
                '$limit': 10,
                '$order': 'funding_year DESC'
            }
            
            try:
                response = self.session.get(url_470, params=params_470, timeout=20)
                response.raise_for_status()
                data_470 = response.json()
                
                for record in data_470:
                    # Primary contact
                    if record.get('contact_name'):
                        contacts.append({
                            'source': 'form_470',
                            'year': record.get('funding_year'),
                            'name': record.get('contact_name'),
                            'title': record.get('contact_title', 'E-Rate Contact'),
                            'email': record.get('contact_email'),
                            'phone': record.get('contact_phone'),
                            'role': 'Primary Contact'
                        })
                    
                    # Technical contact
                    if record.get('technical_contact_name'):
                        contacts.append({
                            'source': 'form_470',
                            'year': record.get('funding_year'),
                            'name': record.get('technical_contact_name'),
                            'title': record.get('technical_contact_title', 'Technical Contact'),
                            'email': record.get('technical_contact_email'),
                            'phone': record.get('technical_contact_phone'),
                            'role': 'Technical Contact'
                        })
                    
                    # Authorized person
                    if record.get('authorized_person_name'):
                        contacts.append({
                            'source': 'form_470',
                            'year': record.get('funding_year'),
                            'name': record.get('authorized_person_name'),
                            'title': record.get('authorized_person_title', 'Authorized Person'),
                            'email': record.get('authorized_person_email'),
                            'phone': record.get('authorized_person_phone'),
                            'role': 'Authorized Person'
                        })
                    
                    # Extract entity info from most recent record
                    if not entity_info and record:
                        entity_info = {
                            'name': record.get('billed_entity_name'),
                            'address': record.get('billed_entity_address1'),
                            'city': record.get('billed_entity_city'),
                            'state': record.get('billed_entity_state'),
                            'zip': record.get('billed_entity_zip'),
                            'phone': record.get('billed_entity_phone'),
                            'website': record.get('website_url'),
                            'entity_type': record.get('applicant_type')
                        }
            except Exception as e:
                logger.warning(f"Error fetching 470 contacts for BEN {ben}: {e}")
            
            # 2. Get contacts from Supplemental Entity Info
            url_entity = USAC_ENDPOINTS['entity_supplemental']
            params_entity = {
                '$where': f"ben = '{ben}'",
                '$limit': 5
            }
            
            try:
                response = self.session.get(url_entity, params=params_entity, timeout=20)
                response.raise_for_status()
                data_entity = response.json()
                
                for record in data_entity:
                    if record.get('contact_name'):
                        contacts.append({
                            'source': 'entity_supplemental',
                            'year': None,
                            'name': record.get('contact_name'),
                            'title': record.get('contact_title', 'Entity Contact'),
                            'email': record.get('contact_email'),
                            'phone': record.get('contact_phone'),
                            'role': 'Entity Contact'
                        })
                    
                    # Update entity info if we don't have it yet
                    if not entity_info.get('name') and record.get('entity_name'):
                        entity_info = {
                            'name': record.get('entity_name'),
                            'address': record.get('address1'),
                            'city': record.get('city'),
                            'state': record.get('state'),
                            'zip': record.get('zip_code'),
                            'phone': record.get('phone'),
                            'entity_type': record.get('entity_type')
                        }
            except Exception as e:
                logger.warning(f"Error fetching entity supplemental for BEN {ben}: {e}")
            
            # Deduplicate contacts by email (keep most recent)
            seen_emails = set()
            unique_contacts = []
            for contact in contacts:
                email = contact.get('email', '').lower() if contact.get('email') else None
                if email and email not in seen_emails:
                    seen_emails.add(email)
                    unique_contacts.append(contact)
                elif not email:
                    unique_contacts.append(contact)
            
            return {
                'success': True,
                'ben': ben,
                'entity': entity_info,
                'contacts': unique_contacts,
                'contact_count': len(unique_contacts)
            }
            
        except Exception as e:
            logger.error(f"Error getting contacts for BEN {ben}: {e}")
            return {'success': False, 'error': str(e), 'contacts': [], 'entity': {}}

    def enrich_entity(
        self,
        ben: str,
        year: Optional[int] = None,
        application_number: Optional[str] = None,
        frn: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get comprehensive enriched data for an entity/application.
        Combines data from multiple USAC sources for full lead profile.
        
        Args:
            ben: Billed Entity Number
            year: Optional funding year
            application_number: Optional specific application
            frn: Optional specific FRN
            
        Returns:
            Comprehensive entity profile with:
            - Entity information
            - Application status and details
            - FRN history with actual status
            - Contact information
            - Funding summary
        """
        try:
            result = {
                'success': True,
                'ben': ben,
                'entity': {},
                'applications': [],
                'frn_status': {},
                'contacts': [],
                'funding_summary': {}
            }
            
            # 1. Get FRN Status (has actual Funded/Denied/Pending status)
            frn_result = self.get_frn_status_for_ben(ben, year, frn)
            if frn_result.get('success'):
                result['frn_status'] = frn_result
                result['frns'] = frn_result.get('frns', [])
            
            # 2. Get Entity Contacts
            contacts_result = self.get_entity_contacts(ben)
            if contacts_result.get('success'):
                result['entity'] = contacts_result.get('entity', {})
                result['contacts'] = contacts_result.get('contacts', [])
            
            # 3. Get Form 471 Basic Info for application details
            try:
                url_471 = USAC_ENDPOINTS['471_basic']
                where_parts = [f"ben = '{ben}'"]
                if year:
                    where_parts.append(f"funding_year = '{year}'")
                if application_number:
                    where_parts.append(f"application_number = '{application_number}'")
                
                params = {
                    '$where': ' AND '.join(where_parts),
                    '$limit': 100,
                    '$order': 'funding_year DESC'
                }
                
                response = self.session.get(url_471, params=params, timeout=30)
                response.raise_for_status()
                apps_data = response.json()
                
                for app in apps_data:
                    result['applications'].append({
                        'application_number': app.get('application_number'),
                        'funding_year': app.get('funding_year'),
                        'application_status': app.get('application_status'),
                        'category': app.get('category_of_service'),
                        'total_requested': float(app.get('total_funding_year_commitment_request') or 0),
                        'certified_date': app.get('certified_timestamp'),
                        'billed_entity_name': app.get('billed_entity_name')
                    })
                
                # Update entity name if we got it
                if apps_data and not result['entity'].get('name'):
                    result['entity']['name'] = apps_data[0].get('billed_entity_name')
                    result['entity']['state'] = apps_data[0].get('billed_entity_state')
                    result['entity']['city'] = apps_data[0].get('billed_entity_city')
                    
            except Exception as e:
                logger.warning(f"Error fetching 471 basic info for BEN {ben}: {e}")
            
            # 4. Calculate funding summary
            frns = result.get('frns', [])
            if frns:
                years_funded = set(f['funding_year'] for f in frns if f['frn_status'] == 'Funded')
                result['funding_summary'] = {
                    'total_frns': len(frns),
                    'total_committed': sum(f['commitment_amount'] for f in frns),
                    'total_funded': sum(f['funded_amount'] for f in frns),
                    'years_with_funding': len(years_funded),
                    'funding_years': sorted(list(years_funded), reverse=True),
                    'status_breakdown': {
                        'funded': len([f for f in frns if f['frn_status'] == 'Funded']),
                        'denied': len([f for f in frns if f['frn_status'] == 'Denied']),
                        'pending': len([f for f in frns if f['frn_status'] in ['Pending', 'In Review']])
                    }
                }
            
            return result
            
        except Exception as e:
            logger.error(f"Error enriching entity {ben}: {e}")
            return {
                'success': False,
                'error': str(e),
                'ben': ben
            }

    def get_disbursements_by_ben(
        self,
        ben: str,
        year: Optional[int] = None,
        limit: int = 500
    ) -> Dict[str, Any]:
        """
        Get invoice/disbursement data for a BEN from USAC Open Data.
        Uses the Invoice Disbursements dataset (jpiu-tj8h).
        
        Args:
            ben: Billed Entity Number
            year: Optional funding year filter
            limit: Maximum records to return
            
        Returns:
            Dictionary with disbursement records and summary
        """
        try:
            url = USAC_ENDPOINTS['invoice_disbursements']
            
            where_conditions = [f"ben = '{ben}'"]
            if year:
                where_conditions.append(f"funding_year = '{year}'")
            
            params = {
                '$where': ' AND '.join(where_conditions),
                '$limit': limit,
                '$order': 'funding_year DESC'
            }
            
            logger.info(f"Fetching disbursements for BEN {ben}")
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if not data:
                return {
                    'success': True,
                    'ben': ben,
                    'total_records': 0,
                    'total_disbursed': 0,
                    'total_authorized': 0,
                    'disbursements': []
                }
            
            total_disbursed = 0
            total_authorized = 0
            records = []
            
            for record in data:
                disbursed = float(record.get('total_authorized_disbursement', 0) or 0)
                authorized = float(record.get('total_authorized_amount', 0) or 0)
                total_disbursed += disbursed
                total_authorized += authorized
                
                records.append({
                    'funding_request_number': record.get('funding_request_number', ''),
                    'funding_year': record.get('funding_year', ''),
                    'service_provider_name': record.get('service_provider_name', ''),
                    'service_type': record.get('service_type', ''),
                    'total_authorized_amount': authorized,
                    'total_authorized_disbursement': disbursed,
                    'remaining': authorized - disbursed,
                    'last_date_to_invoice': record.get('last_date_to_invoice', ''),
                    'frn_status': record.get('frn_status', ''),
                    'applicant_name': record.get('applicant_name', record.get('ros_entity_name', '')),
                })
            
            return {
                'success': True,
                'ben': ben,
                'entity_name': data[0].get('applicant_name', data[0].get('ros_entity_name', '')) if data else '',
                'total_records': len(records),
                'total_disbursed': total_disbursed,
                'total_authorized': total_authorized,
                'disbursement_rate': round((total_disbursed / total_authorized * 100), 1) if total_authorized > 0 else 0,
                'disbursements': records
            }
            
        except Exception as e:
            logger.error(f"Error fetching disbursements for BEN {ben}: {e}")
            return {
                'success': False,
                'error': str(e),
                'ben': ben
            }

    def get_disbursements_batch(
        self,
        bens: list,
        year: Optional[int] = None,
        limit: int = 50000
    ) -> Dict[str, Any]:
        """
        Get disbursement data for multiple BENs in a single USAC API call.
        Uses SoQL WHERE ben IN (...) instead of N sequential calls.
        
        Args:
            bens: List of Billed Entity Numbers
            year: Optional funding year filter
            limit: Maximum records to return
            
        Returns:
            Dictionary with disbursement data grouped by BEN
        """
        if not bens:
            return {'success': True, 'results': {}}
        
        try:
            url = USAC_ENDPOINTS['invoice_disbursements']
            
            # Build IN clause for batch query
            ben_list = ", ".join(f"'{b}'" for b in bens)
            where_conditions = [f"ben IN ({ben_list})"]
            
            if year:
                where_conditions.append(f"funding_year = '{year}'")
            
            params = {
                '$where': ' AND '.join(where_conditions),
                '$limit': limit,
                '$order': 'ben ASC, funding_year DESC'
            }
            
            logger.info(f"Batch fetching disbursements for {len(bens)} BENs in single query")
            response = self.session.get(url, params=params, timeout=120)
            response.raise_for_status()
            data = response.json()
            
            # Group results by BEN
            ben_groups: Dict[str, list] = {}
            for record in data:
                ben = record.get('ben', '')
                if ben not in ben_groups:
                    ben_groups[ben] = []
                ben_groups[ben].append(record)
            
            # Process each BEN group (same logic as get_disbursements_by_ben)
            results = {}
            for ben, records in ben_groups.items():
                total_disbursed = 0
                total_authorized = 0
                processed = []
                
                for record in records:
                    disbursed = float(record.get('total_authorized_disbursement', 0) or 0)
                    authorized = float(record.get('total_authorized_amount', 0) or 0)
                    total_disbursed += disbursed
                    total_authorized += authorized
                    
                    processed.append({
                        'funding_request_number': record.get('funding_request_number', ''),
                        'funding_year': record.get('funding_year', ''),
                        'service_provider_name': record.get('service_provider_name', ''),
                        'service_type': record.get('service_type', ''),
                        'total_authorized_amount': authorized,
                        'total_authorized_disbursement': disbursed,
                        'remaining': authorized - disbursed,
                        'last_date_to_invoice': record.get('last_date_to_invoice', ''),
                        'frn_status': record.get('frn_status', ''),
                        'applicant_name': record.get('applicant_name', record.get('ros_entity_name', '')),
                    })
                
                entity_name = records[0].get('applicant_name', records[0].get('ros_entity_name', '')) if records else ''
                
                results[ben] = {
                    'success': True,
                    'ben': ben,
                    'entity_name': entity_name,
                    'total_records': len(processed),
                    'total_disbursed': total_disbursed,
                    'total_authorized': total_authorized,
                    'disbursement_rate': round((total_disbursed / total_authorized * 100), 1) if total_authorized > 0 else 0,
                    'disbursements': processed
                }
            
            # Include BENs with no data
            for ben in bens:
                if ben not in results:
                    results[ben] = {
                        'success': True,
                        'ben': ben,
                        'entity_name': '',
                        'total_records': 0,
                        'total_disbursed': 0,
                        'total_authorized': 0,
                        'disbursement_rate': 0,
                        'disbursements': []
                    }
            
            logger.info(f"Batch disbursements: {len(data)} records across {len(ben_groups)} BENs")
            return {'success': True, 'results': results}
            
        except Exception as e:
            logger.error(f"Error batch fetching disbursements for {len(bens)} BENs: {e}")
            return {'success': False, 'error': str(e), 'results': {}}
    
    # =========================================================================
    # PREDICTIVE LEAD INTELLIGENCE METHODS
    # Premium feature: Fetches data for contract expiry, equipment refresh,
    # C2 budget reset, and historical pattern predictions.
    # =========================================================================
    
    def get_expiring_contracts(
        self,
        months_ahead: int = 12,
        states: Optional[List[str]] = None,
        funded_only: bool = True,
        limit: int = 5000,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Find FRNs with contracts expiring within N months.
        Uses: frn_status dataset (qdmp-ygft) which has contract_expiration_date.
        
        Returns dict with 'success', 'data' (list of dicts), 'total' count.
        """
        try:
            url = USAC_ENDPOINTS['frn_status']
            
            from datetime import datetime, timedelta
            now = datetime.utcnow()
            future_date = now + timedelta(days=months_ahead * 30)
            
            # SoQL: contracts expiring between now and N months ahead
            where_parts = [
                f"contract_expiration_date >= '{now.strftime('%Y-%m-%dT00:00:00.000')}'",
                f"contract_expiration_date <= '{future_date.strftime('%Y-%m-%dT00:00:00.000')}'",
            ]
            
            if funded_only:
                where_parts.append("form_471_frn_status_name = 'Funded'")
            
            if states:
                state_list = ", ".join(f"'{s}'" for s in states)
                where_parts.append(f"state IN ({state_list})")
            
            params = {
                '$where': ' AND '.join(where_parts),
                '$limit': limit,
                '$offset': offset,
                '$order': 'contract_expiration_date ASC',
                '$select': (
                    'funding_request_number, application_number, ben, organization_name, '
                    'state, contract_expiration_date, extended_expiration_date, '
                    'contract_number, contract_type_name, spin_name, '
                    'form_471_service_type_name, form_471_frn_status_name, '
                    'funding_year, funding_commitment_request, total_pre_discount_costs, '
                    'dis_pct, bid_count, cnct_email, organization_entity_type_name, '
                    'service_start_date, months_of_service'
                ),
            }
            
            if self.app_token:
                params['$$app_token'] = self.app_token
            
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"Expiring contracts query: {len(data)} results (months_ahead={months_ahead})")
            return {'success': True, 'data': data, 'total': len(data)}
            
        except Exception as e:
            logger.error(f"Error fetching expiring contracts: {e}")
            return {'success': False, 'error': str(e), 'data': []}
    
    def get_471_equipment_details(
        self,
        funding_years: Optional[List[int]] = None,
        manufacturers: Optional[List[str]] = None,
        states: Optional[List[str]] = None,
        limit: int = 5000,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get Form 471 line item equipment details for equipment refresh predictions.
        Uses: 471_line_items dataset (hbj5-2bpj) which has manufacturer and model info.
        
        Returns dict with 'success', 'data' (list of dicts), 'total' count.
        """
        try:
            url = USAC_ENDPOINTS['471_line_items']
            
            where_parts = []
            
            if funding_years:
                year_list = ", ".join(f"'{y}'" for y in funding_years)
                where_parts.append(f"funding_year IN ({year_list})")
            
            if manufacturers:
                # Use UPPER for case-insensitive matching
                mfr_conditions = []
                for mfr in manufacturers:
                    mfr_conditions.append(f"upper(form_471_manufacturer_name) LIKE upper('%{mfr}%')")
                where_parts.append(f"({' OR '.join(mfr_conditions)})")
            
            if states:
                state_list = ", ".join(f"'{s}'" for s in states)
                where_parts.append(f"state IN ({state_list})")
            
            params = {
                '$limit': limit,
                '$offset': offset,
                '$order': 'funding_year ASC',
                '$select': (
                    'funding_request_number, application_number, ben, organization_name, '
                    'state, funding_year, form_471_manufacturer_name, model_of_equipment, '
                    'form_471_product_name, form_471_function_name, '
                    'one_time_eligible_costs, total_eligible_one_time_costs, '
                    'total_eligible_recurring_costs, months_of_service, '
                    'applicant_type, cnct_email, form_471_line_item_number'
                ),
            }
            
            if where_parts:
                params['$where'] = ' AND '.join(where_parts)
            
            if self.app_token:
                params['$$app_token'] = self.app_token
            
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"471 equipment query: {len(data)} results")
            return {'success': True, 'data': data, 'total': len(data)}
            
        except Exception as e:
            logger.error(f"Error fetching 471 equipment details: {e}")
            return {'success': False, 'error': str(e), 'data': []}
    
    def get_c2_budget_opportunities(
        self,
        min_remaining_budget: float = 5000,
        budget_cycles: Optional[List[str]] = None,
        states: Optional[List[str]] = None,
        limit: int = 5000,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Find schools with significant C2 budget remaining near cycle end.
        Uses: c2_budget dataset (6brt-5pbv) which has budget cycle and remaining amounts.
        
        Schools with large remaining budgets near cycle reset = strong leads.
        
        Returns dict with 'success', 'data' (list of dicts), 'total' count.
        """
        try:
            url = USAC_ENDPOINTS['c2_budget']
            
            where_parts = [
                f"available_c2_budget_amount >= {min_remaining_budget}",
            ]
            
            if budget_cycles:
                cycle_list = ", ".join(f"'{c}'" for c in budget_cycles)
                where_parts.append(f"c2_budget_cycle IN ({cycle_list})")
            
            if states:
                state_list = ", ".join(f"'{s}'" for s in states)
                where_parts.append(f"state IN ({state_list})")
            
            params = {
                '$where': ' AND '.join(where_parts),
                '$limit': limit,
                '$offset': offset,
                '$order': 'available_c2_budget_amount DESC',
                '$select': (
                    'ben, billed_entity_name, state, city, applicant_type, '
                    'c2_budget, available_c2_budget_amount, funded_c2_budget_amount, '
                    'pending_c2_budget_amount, c2_budget_cycle, c2_budget_version, '
                    'full_time_students, consulting_firm_name_crn'
                ),
            }
            
            if self.app_token:
                params['$$app_token'] = self.app_token
            
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"C2 budget opportunities: {len(data)} results (min_remaining=${min_remaining_budget})")
            return {'success': True, 'data': data, 'total': len(data)}
            
        except Exception as e:
            logger.error(f"Error fetching C2 budget opportunities: {e}")
            return {'success': False, 'error': str(e), 'data': []}
    
    def get_historical_471_by_entity(
        self,
        ben: str,
        limit: int = 100
    ) -> Dict[str, Any]:
        """
        Get historical Form 471 filings for a specific entity (BEN).
        Used to detect rebid patterns (e.g., school files every 3 years).
        
        Returns dict with 'success', 'data' (list of dicts).
        """
        try:
            url = USAC_ENDPOINTS['471_basic']
            
            params = {
                '$where': f"ben = '{ben}'",
                '$limit': limit,
                '$order': 'funding_year DESC',
                '$select': (
                    'application_number, funding_year, organization_name, '
                    'form_471_status_name, chosen_category_of_service, '
                    'c1_discount, c2_discount, pre_discount_eligible_amount, '
                    'funding_request_amount, org_state, org_city, '
                    'cnct_email, cnct_first_name, cnct_last_name, cnct_phone, '
                    'organization_entity_type_name, full_time_students, '
                    'is_urban, nslp_percentage'
                ),
            }
            
            if self.app_token:
                params['$$app_token'] = self.app_token
            
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            data = response.json()
            
            return {'success': True, 'data': data}
            
        except Exception as e:
            logger.error(f"Error fetching historical 471 for BEN {ben}: {e}")
            return {'success': False, 'error': str(e), 'data': []}