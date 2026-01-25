"""
USAC Data Service for SkyRate AI v2
Wraps the legacy usac_client with FastAPI-friendly interface.

This service provides:
- Form 470/471 data fetching from USAC Open Data
- BEN entity enrichment using USAC API
- Caching and rate limiting
- FRN line item enrichment
- Service provider lookup
- Invoice/disbursement data
"""

import sys
import os
from typing import Dict, List, Optional, Any
from datetime import datetime
import math
import pandas as pd
import numpy as np
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Add backend directory to path for utils imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from utils.usac_client import USACDataClient, map_field_name, FIELD_NAME_MAPPING


def clean_nan_values(data: Any) -> Any:
    """
    Recursively clean NaN and Infinity values from data structures.
    Converts them to None for JSON serialization.
    """
    if isinstance(data, dict):
        return {k: clean_nan_values(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [clean_nan_values(item) for item in data]
    elif isinstance(data, float):
        if math.isnan(data) or math.isinf(data):
            return None
        return data
    elif isinstance(data, (np.floating, np.integer)):
        val = float(data) if isinstance(data, np.floating) else int(data)
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        return val
    elif pd.isna(data):
        return None
    return data


class USACService:
    """
    FastAPI service wrapper for USAC data operations.
    Provides clean async-ready interface to USAC Open Data.
    """
    
    _instance: Optional['USACService'] = None
    
    def __new__(cls):
        """Singleton pattern for service instance."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._client = USACDataClient()
        self._initialized = True
    
    @property
    def client(self) -> USACDataClient:
        """Access the underlying USAC client."""
        return self._client
    
    # ==================== FORM 471 QUERIES ====================
    
    def fetch_form_471(
        self,
        year: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """
        Fetch Form 471 application data.
        
        Args:
            year: Funding year (e.g., 2025)
            filters: Field filters (state, status, ben, etc.)
            limit: Maximum records to return
            
        Returns:
            List of Form 471 records as dictionaries
        """
        df = self._client.fetch_data(
            year=year,
            filters=filters,
            limit=limit,
            dataset='form_471'
        )
        if df.empty:
            return []
        records = df.to_dict('records')
        return clean_nan_values(records)
    
    def search_denied_applications(
        self,
        year: Optional[int] = None,
        state: Optional[str] = None,
        min_amount: Optional[float] = None,
        limit: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Search for denied E-Rate applications.
        Primary use case for consultants.
        
        Args:
            year: Funding year
            state: Two-letter state code
            min_amount: Minimum pre-discount cost
            limit: Maximum records
            
        Returns:
            List of denied applications with FCDL comments
        """
        filters = {'application_status': 'Denied'}
        if state:
            filters['state'] = state.upper()
        
        df = self._client.fetch_data(
            year=year,
            filters=filters,
            limit=limit,
            dataset='form_471'
        )
        
        # Filter by minimum amount if specified
        if not df.empty and min_amount and 'original_total_pre_discount_costs' in df.columns:
            df = df[df['original_total_pre_discount_costs'] >= min_amount]
        
        if df.empty:
            return []
        records = df.to_dict('records')
        return clean_nan_values(records)
    
    def get_application_details(
        self,
        application_number: str = None,
        frn: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get complete details for a specific application or FRN.
        
        Args:
            application_number: Application number
            frn: Funding Request Number
            
        Returns:
            Application details or None if not found
        """
        filters = {}
        if application_number:
            filters['application_number'] = application_number
        elif frn:
            filters['funding_request_number'] = frn
        else:
            return None
        
        df = self._client.fetch_data(filters=filters, limit=1, dataset='form_471')
        
        if df.empty:
            return None
        
        record = df.iloc[0].to_dict()
        return clean_nan_values(record)
    
    # ==================== FORM 470 QUERIES ====================
    
    def fetch_form_470(
        self,
        year: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """
        Fetch Form 470 (RFP/posting) data.
        Primary use case for vendors seeking opportunities.
        
        Args:
            year: Funding year
            filters: Field filters
            limit: Maximum records
            
        Returns:
            List of Form 470 records
        """
        df = self._client.fetch_data(
            year=year,
            filters=filters,
            limit=limit,
            dataset='form_470'
        )
        if df.empty:
            return []
        records = df.to_dict('records')
        return clean_nan_values(records)
    
    def search_open_rfps(
        self,
        year: Optional[int] = None,
        state: Optional[str] = None,
        service_type: Optional[str] = None,
        limit: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Search for open Form 470s (RFPs) for vendors.
        
        Args:
            year: Funding year
            state: Two-letter state code
            service_type: Category 1 or Category 2
            limit: Maximum records
            
        Returns:
            List of open RFP opportunities
        """
        filters = {}
        if state:
            filters['state'] = state.upper()
        if service_type:
            filters['service_type'] = service_type
        
        df = self._client.fetch_data(
            year=year,
            filters=filters,
            limit=limit,
            dataset='form_470'
        )
        if df.empty:
            return []
        records = df.to_dict('records')
        return clean_nan_values(records)
    
    def get_form_470_history(self, ben: str, year: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get Form 470 history for a BEN.
        
        Args:
            ben: Billed Entity Number
            year: Optional funding year filter
            
        Returns:
            List of Form 470 records
        """
        df = self._client.get_form_470_history(ben, year)
        if df.empty:
            return []
        records = df.to_dict('records')
        return clean_nan_values(records)
    
    # ==================== BEN ENRICHMENT ====================
    
    def _create_enrichment_session(self) -> requests.Session:
        """Create a robust HTTP session with retry logic for enrichment calls"""
        session = requests.Session()
        retry = Retry(
            total=5,
            backoff_factor=1,
            status_forcelist=[408, 429, 500, 502, 503, 504],
            allowed_methods=["GET"]
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=5, pool_maxsize=5)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        session.headers.update({'User-Agent': 'Mozilla/5.0 SkyRate/2.0'})
        return session
    
    def enrich_ben(self, ben: str) -> Dict[str, Any]:
        """
        Fetch comprehensive entity data for a BEN from USAC Entity API.
        
        This method queries the USAC srbr-2d59.json endpoint directly for
        detailed entity information including name, type, address, and
        aggregated funding data.
        
        Args:
            ben: Billed Entity Number
            
        Returns:
            Dictionary with enriched entity data:
            - organization_name: Entity name
            - entity_type: Type (School, Library, etc.)
            - address: Full formatted address
            - state, city, zip_code: Location components
            - frn_number: Most recent FRN
            - total_funding_committed: Sum of all funding
            - funding_years: List of active funding years
            - status: Derived status from applications
        """
        ENTITY_API_URL = "https://opendata.usac.org/resource/srbr-2d59.json"
        
        result = {
            "ben": ben,
            "organization_name": None,
            "entity_type": None,
            "address": None,
            "street": None,
            "city": None,
            "state": None,
            "zip_code": None,
            "frn_number": None,
            "dub_number": None,
            "sam_id": None,
            "total_funding_committed": 0,
            "total_funding_requested": 0,
            "funding_years": [],
            "applications_count": 0,
            "has_category1": False,
            "has_category2": False,
            "status": "Unknown",
            "latest_year": None,
            "discount_rate": None,
        }
        
        session = self._create_enrichment_session()
        params = {
            "ben": ben,
            "$limit": 100,
            "$order": "funding_year DESC"
        }
        
        try:
            response = session.get(ENTITY_API_URL, params=params, timeout=45)
            
            if response.status_code != 200:
                # Fall back to Form 471 data
                return self._enrich_from_form471(ben)
            
            data = response.json()
            
            if not data:
                # Fall back to Form 471 data
                return self._enrich_from_form471(ben)
            
            # Get entity info from most recent record
            rec = data[0]
            result["organization_name"] = rec.get("organization_name")
            result["entity_type"] = rec.get("organization_entity_type_name")
            result["state"] = rec.get("state")
            result["city"] = rec.get("city")
            result["zip_code"] = rec.get("zip_code")
            result["street"] = rec.get("street")
            
            # Build full address
            addr_parts = [
                rec.get("street"),
                rec.get("city"),
                rec.get("state"),
                rec.get("zip_code")
            ]
            result["address"] = ", ".join(filter(None, addr_parts)) or None
            
            # Aggregate funding data
            frns = set()
            years = set()
            total_committed = 0.0
            total_requested = 0.0
            statuses = []
            categories = set()
            
            for r in data:
                # Collect FRNs
                frn = r.get("funding_request_number")
                if frn:
                    frns.add(str(frn))
                
                # Collect years
                year = r.get("funding_year")
                if year:
                    years.add(int(year))
                
                # Sum funding
                try:
                    total_committed += float(r.get("funding_commitment_request") or 0)
                except (ValueError, TypeError):
                    pass
                
                try:
                    total_requested += float(r.get("original_total_pre_discount_costs") or 0)
                except (ValueError, TypeError):
                    pass
                
                # Collect statuses
                status = r.get("application_status")
                if status:
                    statuses.append(status.lower())
                
                # Check categories
                cat = r.get("service_type") or r.get("form_471_category")
                if cat:
                    categories.add(cat)
                    if "1" in str(cat):
                        result["has_category1"] = True
                    if "2" in str(cat):
                        result["has_category2"] = True
                
                # Get discount rate from first record that has it
                if not result["discount_rate"]:
                    dr = r.get("discount_rate") or r.get("erate_discount_percentage")
                    if dr:
                        try:
                            result["discount_rate"] = float(dr)
                        except (ValueError, TypeError):
                            pass
            
            # Set aggregated values
            if frns:
                result["frn_number"] = sorted(frns, reverse=True)[0]
            result["total_funding_committed"] = round(total_committed, 2)
            result["total_funding_requested"] = round(total_requested, 2)
            result["funding_years"] = sorted(years, reverse=True)
            result["latest_year"] = result["funding_years"][0] if result["funding_years"] else None
            result["applications_count"] = len(data)
            
            # Derive status from application statuses
            if any("denied" in s for s in statuses):
                result["status"] = "Has Denials"
            elif any("funded" in s for s in statuses):
                result["status"] = "Funded"
            elif any("pending" in s or "review" in s for s in statuses):
                result["status"] = "Pending"
            elif statuses:
                result["status"] = "Active"
            
            return clean_nan_values(result)
            
        except Exception as e:
            # Fall back to Form 471 data on error
            try:
                return self._enrich_from_form471(ben)
            except:
                result["error"] = str(e)
                return result
    
    def _enrich_from_form471(self, ben: str) -> Dict[str, Any]:
        """Fallback enrichment using Form 471 data"""
        applications = self.fetch_form_471(
            filters={"ben": ben},
            limit=100
        )
        
        if not applications:
            return {
                "ben": ben,
                "organization_name": None,
                "status": "Not Found",
                "error": "BEN not found in USAC database"
            }
        
        # Get info from most recent
        latest = max(applications, key=lambda x: int(x.get('funding_year', 0) or 0))
        
        result = {
            "ben": ben,
            "organization_name": latest.get("organization_name") or latest.get("billed_entity_name"),
            "entity_type": latest.get("organization_entity_type_name") or latest.get("entity_type"),
            "state": latest.get("physical_state") or latest.get("state"),
            "city": latest.get("city"),
            "zip_code": latest.get("zip_code"),
            "latest_year": latest.get("funding_year"),
            "applications_count": len(applications),
            "status": "Active",
        }
        
        # Aggregate
        total = sum(
            float(a.get("funding_commitment_request") or 0)
            for a in applications
        )
        result["total_funding_committed"] = round(total, 2)
        
        years = set(
            int(a.get("funding_year"))
            for a in applications
            if a.get("funding_year")
        )
        result["funding_years"] = sorted(years, reverse=True)
        
        # Status
        statuses = [a.get("application_status", "").lower() for a in applications]
        if any("denied" in s for s in statuses):
            result["status"] = "Has Denials"
        elif any("funded" in s for s in statuses):
            result["status"] = "Funded"
        elif any("pending" in s or "review" in s for s in statuses):
            result["status"] = "Pending"
        
        return clean_nan_values(result)
    
    # ==================== FRN ENRICHMENT ====================
    
    def get_frn_line_items(self, frn: str, year: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get detailed line items for an FRN.
        
        Args:
            frn: Funding Request Number
            year: Optional funding year
            
        Returns:
            List of FRN line item records
        """
        df = self._client.get_frn_line_items(frn, year)
        if df.empty:
            return []
        records = df.to_dict('records')
        return clean_nan_values(records)
    
    def get_service_provider(
        self,
        spin: Optional[str] = None,
        name: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get service provider information.
        
        Args:
            spin: Service Provider Identification Number
            name: Provider name for search
            
        Returns:
            Provider details or None
        """
        result = self._client.get_service_provider_info(spin=spin, provider_name=name)
        if result:
            return clean_nan_values(result)
        return None
    
    def get_invoices(
        self,
        frn: Optional[str] = None,
        ben: Optional[str] = None,
        year: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Get Form 472 invoice/disbursement data.
        
        Args:
            frn: Funding Request Number
            ben: Billed Entity Number
            year: Funding year
            
        Returns:
            List of invoice records
        """
        df = self._client.get_form_472_invoices(frn=frn, ben=ben, year=year)
        if df.empty:
            return []
        records = df.to_dict('records')
        return clean_nan_values(records)
    
    # ==================== STATISTICS ====================
    
    def get_available_years(self) -> List[int]:
        """Get list of available funding years."""
        return self._client.get_available_years()
    
    def get_statistics(self, year: Optional[int] = None) -> Dict[str, Any]:
        """
        Get summary statistics for funding year.
        
        Args:
            year: Optional funding year
            
        Returns:
            Dictionary with aggregate statistics
        """
        result = self._client.get_statistics_summary(year)
        return clean_nan_values(result) if result else {}
    
    def get_field_values(self, field: str, year: Optional[int] = None) -> List[str]:
        """
        Get unique values for a field.
        
        Args:
            field: Field name (e.g., 'state', 'application_status')
            year: Optional year filter
            
        Returns:
            List of unique values
        """
        return self._client.get_field_values(field, year)
    
    # ==================== CRN/SPIN LOOKUP ====================
    
    def get_schools_by_crn(self, crn: str, years: Optional[List[int]] = None) -> Dict[str, Any]:
        """
        Fetch all schools associated with a Consultant Registration Number (CRN).
        
        Args:
            crn: Consultant Registration Number
            years: Optional list of funding years to query (defaults to last 3 years)
            
        Returns:
            Dictionary with list of unique schools and count
        """
        if not years:
            current_year = datetime.now().year
            years = [current_year, current_year - 1, current_year - 2]
        
        all_schools = {}  # ben -> school info
        
        for year in years:
            # Query Form 471 by consultant registration number
            df = self._client.fetch_data(
                year=year,
                filters={'cnct_registration_num': crn.upper().strip()},
                limit=5000,
                dataset='form_471'
            )
            
            if not df.empty:
                for _, row in df.iterrows():
                    ben = str(row.get('ben', '')).strip()
                    if ben and ben not in all_schools:
                        all_schools[ben] = {
                            'ben': ben,
                            'organization_name': row.get('organization_name'),
                            'state': row.get('state'),
                            'city': row.get('city'),
                            'entity_type': row.get('organization_entity_type_name'),
                        }
        
        return {
            'crn': crn.upper().strip(),
            'school_count': len(all_schools),
            'schools': list(all_schools.values()),
            'years_queried': years
        }
    
    def get_schools_by_spin(self, spin: str, years: Optional[List[int]] = None) -> Dict[str, Any]:
        """
        Fetch all schools/applicants associated with a Service Provider Identification Number (SPIN).
        
        Args:
            spin: Service Provider Identification Number
            years: Optional list of funding years to query (defaults to last 3 years)
            
        Returns:
            Dictionary with list of unique schools and count
        """
        if not years:
            current_year = datetime.now().year
            years = [current_year, current_year - 1, current_year - 2]
        
        all_schools = {}  # ben -> school info
        
        for year in years:
            # Query Form 471 by service provider number
            df = self._client.fetch_data(
                year=year,
                filters={'service_provider_number': spin.upper().strip()},
                limit=5000,
                dataset='form_471'
            )
            
            if not df.empty:
                for _, row in df.iterrows():
                    ben = str(row.get('ben', '')).strip()
                    if ben and ben not in all_schools:
                        all_schools[ben] = {
                            'ben': ben,
                            'organization_name': row.get('organization_name'),
                            'state': row.get('state'),
                            'city': row.get('city'),
                            'entity_type': row.get('organization_entity_type_name'),
                        }
        
        return {
            'spin': spin.upper().strip(),
            'school_count': len(all_schools),
            'schools': list(all_schools.values()),
            'years_queried': years
        }

    def verify_crn(self, crn: str) -> Dict[str, Any]:
        """
        Verify a CRN and fetch consultant company info + their schools from USAC.
        
        Uses the USAC Consultants dataset (x5px-esft.json) which contains:
        - Consultant company info (name, address, phone, email)
        - All applications filed by that consultant
        - Schools/applicants they represent
        
        Args:
            crn: Consultant Registration Number (cnslt_epc_organization_id)
            
        Returns:
            Dictionary with consultant info and list of unique schools
        """
        CONSULTANTS_API_URL = "https://opendata.usac.org/resource/x5px-esft.json"
        
        crn_clean = crn.strip()
        
        result = {
            "valid": False,
            "crn": crn_clean,
            "consultant": {
                "company_name": None,
                "contact_name": None,
                "city": None,
                "state": None,
                "zipcode": None,
                "phone": None,
                "email": None,
            },
            "school_count": 0,
            "schools": [],
            "years_found": [],
            "error": None
        }
        
        session = self._create_enrichment_session()
        
        try:
            # Fetch all applications for this CRN (limit to 1000 records)
            params = {
                "cnslt_epc_organization_id": crn_clean,
                "$limit": 1000,
                "$order": "funding_year DESC"
            }
            
            response = session.get(CONSULTANTS_API_URL, params=params, timeout=45)
            
            if response.status_code != 200:
                result["error"] = f"USAC API error: {response.status_code}"
                return result
            
            data = response.json()
            
            if not data:
                result["error"] = "No consultant found with this CRN"
                return result
            
            # Valid CRN found
            result["valid"] = True
            
            # Get consultant info from first record
            first_rec = data[0]
            result["consultant"] = {
                "company_name": first_rec.get("cnslt_name"),
                "contact_name": None,  # Not in dataset, would need separate lookup
                "city": first_rec.get("cnslt_city"),
                "state": first_rec.get("cnslt_state"),
                "zipcode": first_rec.get("cnslt_zipcode"),
                "phone": first_rec.get("cnslt_phone"),
                "email": first_rec.get("cnslt_email"),
            }
            
            # Extract unique schools and years
            unique_schools = {}  # ben -> school info
            years_found = set()
            
            for rec in data:
                year = rec.get("funding_year")
                if year:
                    years_found.add(int(year))
                
                # Get the applicant's EPC org ID as the BEN
                ben = rec.get("epc_organization_id")
                if ben and ben not in unique_schools:
                    unique_schools[ben] = {
                        "ben": ben,
                        "organization_name": rec.get("organization_name"),
                        "state": rec.get("state"),
                        "applicant_type": rec.get("applicant_type"),
                    }
            
            result["schools"] = list(unique_schools.values())
            result["school_count"] = len(unique_schools)
            result["years_found"] = sorted(list(years_found), reverse=True)
            
            return result
            
        except requests.exceptions.Timeout:
            result["error"] = "Request timed out connecting to USAC"
            return result
        except requests.exceptions.RequestException as e:
            result["error"] = f"Network error: {str(e)}"
            return result
        except Exception as e:
            result["error"] = f"Unexpected error: {str(e)}"
            return result


# Singleton accessor
def get_usac_service() -> USACService:
    """Get the USAC service singleton instance."""
    return USACService()
