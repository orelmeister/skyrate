"""
Contact Enrichment Service

Uses Hunter.io API to enrich lead contact information:
- Domain Search: Find all contacts at an organization
- Email Finder: Get email for a specific person
- Email Verification: Verify email deliverability
- Enrichment: Get LinkedIn and social profiles

Hunter.io Free tier: 50 credits/month
Pricing: $34/mo for 24,000 credits/year

API Docs: https://hunter.io/api-documentation/v2

CACHING STRATEGY:
- Enrichment data is cached at the domain level
- Cache expires after 90 days (contacts change jobs)
- Multiple vendors looking at same org = 1 API call
- Saves credits and speeds up responses
"""

import os
import httpx
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)

# Hunter.io API configuration
HUNTER_API_KEY = os.getenv("HUNTER_API_KEY", "")
HUNTER_BASE_URL = "https://api.hunter.io/v2"

# Cache settings
CACHE_EXPIRY_DAYS = 90


class EnrichmentService:
    """
    Service for enriching lead contact information.
    
    Primary methods:
    - enrich_contact: Get all available info for a contact
    - enrich_contact_with_cache: Same as above, but checks/saves to DB cache
    - search_domain: Find contacts at an organization
    - find_email: Find email for a specific person
    - verify_email: Check if email is deliverable
    
    Caching:
    - Data is cached by domain to avoid duplicate API calls
    - Multiple vendors looking at same org = 1 credit
    - Cache expires after 90 days
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or HUNTER_API_KEY
        self.client = httpx.AsyncClient(timeout=30.0)
    
    # ===========================================
    # CACHE METHODS
    # ===========================================
    
    def _get_cached_enrichment(self, db: Session, domain: str) -> Optional[Dict[str, Any]]:
        """
        Check if we have cached enrichment data for this domain.
        
        Returns the cached data if found and not expired, None otherwise.
        """
        from ..models.vendor import OrganizationEnrichmentCache
        
        cache_entry = db.query(OrganizationEnrichmentCache).filter(
            OrganizationEnrichmentCache.domain == domain.lower()
        ).first()
        
        if not cache_entry:
            logger.info(f"Cache MISS for domain: {domain}")
            return None
        
        if cache_entry.is_expired:
            logger.info(f"Cache EXPIRED for domain: {domain} (expired at {cache_entry.expires_at})")
            return None
        
        # Record the access
        cache_entry.record_access()
        db.commit()
        
        logger.info(f"Cache HIT for domain: {domain} (access #{cache_entry.access_count}, age: {(datetime.utcnow() - cache_entry.created_at).days} days)")
        return cache_entry.to_enrichment_result()
    
    def _save_to_cache(
        self, 
        db: Session, 
        domain: str,
        result: Dict[str, Any],
        ben: str = None,
        organization_name: str = None
    ) -> None:
        """
        Save enrichment result to cache.
        
        If an entry for this domain already exists (but was expired),
        we update it instead of creating a new one.
        """
        from ..models.vendor import OrganizationEnrichmentCache
        
        domain_lower = domain.lower()
        
        # Check for existing entry
        cache_entry = db.query(OrganizationEnrichmentCache).filter(
            OrganizationEnrichmentCache.domain == domain_lower
        ).first()
        
        if cache_entry:
            # Update existing entry
            cache_entry.company_data = result.get("company", {})
            cache_entry.contacts = result.get("additional_contacts", [])
            cache_entry.primary_contact = result.get("person", {})
            cache_entry.linkedin_search_url = result.get("linkedin_search_url")
            cache_entry.org_linkedin_search_url = result.get("org_linkedin_search_url")
            cache_entry.enrichment_source = result.get("source", "hunter")
            cache_entry.credits_used = (cache_entry.credits_used or 0) + result.get("credits_used", 0)
            cache_entry.updated_at = datetime.utcnow()
            cache_entry.expires_at = datetime.utcnow() + timedelta(days=CACHE_EXPIRY_DAYS)
            cache_entry.access_count = 1  # Reset access count on refresh
            if ben:
                cache_entry.ben = ben
            if organization_name:
                cache_entry.organization_name = organization_name
            logger.info(f"Cache UPDATED for domain: {domain}")
        else:
            # Create new entry
            cache_entry = OrganizationEnrichmentCache(
                domain=domain_lower,
                ben=ben,
                organization_name=organization_name or result.get("company", {}).get("name"),
                company_data=result.get("company", {}),
                contacts=result.get("additional_contacts", []),
                primary_contact=result.get("person", {}),
                linkedin_search_url=result.get("linkedin_search_url"),
                org_linkedin_search_url=result.get("org_linkedin_search_url"),
                enrichment_source=result.get("source", "hunter"),
                credits_used=result.get("credits_used", 0),
            )
            db.add(cache_entry)
            logger.info(f"Cache CREATED for domain: {domain}")
        
        db.commit()
    
    async def enrich_contact_with_cache(
        self,
        db: Session,
        email: str = None,
        name: str = None,
        domain: str = None,
        ben: str = None,
        organization_name: str = None,
        include_domain_search: bool = False,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Enrich contact with caching support.
        
        This method checks the cache first before making API calls.
        Results are saved to cache for future use.
        
        Args:
            db: Database session for cache operations
            email: Contact's email address
            name: Contact's full name
            domain: Company domain (e.g., "company.com")
            ben: USAC BEN (Billed Entity Number) if available
            organization_name: Organization name if available
            include_domain_search: If True, also search for additional contacts
            force_refresh: If True, bypass cache and fetch fresh data
        
        Returns:
            Enrichment result dict (same format as enrich_contact)
        """
        # Extract domain from email if not provided
        if not domain and email and '@' in email:
            domain = email.split('@')[1].lower()
        
        if not domain:
            # Can't cache without a domain
            return await self.enrich_contact(
                email=email,
                name=name,
                domain=domain,
                include_domain_search=include_domain_search
            )
        
        # Check cache first (unless force_refresh)
        if not force_refresh:
            cached = self._get_cached_enrichment(db, domain)
            if cached:
                # Update person info with the specific contact we're looking for
                if name and not cached.get("person", {}).get("name"):
                    cached["person"]["name"] = name
                if email and not cached.get("person", {}).get("email"):
                    cached["person"]["email"] = email
                return cached
        
        # Cache miss or force refresh - call the API
        logger.info(f"Fetching fresh enrichment data for domain: {domain}")
        result = await self.enrich_contact(
            email=email,
            name=name,
            domain=domain,
            include_domain_search=include_domain_search
        )
        
        # Save to cache (only if we got useful data or used credits)
        if result.get("success") and (
            result.get("credits_used", 0) > 0 or 
            result.get("person") or 
            result.get("company") or 
            result.get("additional_contacts")
        ):
            self._save_to_cache(
                db=db,
                domain=domain,
                result=result,
                ben=ben,
                organization_name=organization_name
            )
        
        return result
    
    async def enrich_contact(
        self, 
        email: str = None,
        name: str = None,
        domain: str = None,
        include_domain_search: bool = False  # OFF by default to save credits
    ) -> Dict[str, Any]:
        """
        Enrich contact information using all available data sources.
        
        Args:
            email: Contact's email address
            name: Contact's full name
            domain: Company domain (e.g., "company.com")
            include_domain_search: If True, also search for additional contacts (costs 1 extra credit)
        
        Returns:
            {
                "success": True,
                "person": {
                    "name": "John Smith",
                    "email": "john@company.com",
                    "position": "Technology Director",
                    "linkedin": "https://linkedin.com/in/johnsmith",
                    "twitter": "@johnsmith",
                    "phone": "+1-555-123-4567"
                },
                "company": {
                    "name": "Company Name",
                    "domain": "company.com",
                    "linkedin": "https://linkedin.com/company/company-name"
                },
                "additional_contacts": [
                    {"name": "...", "email": "...", "position": "..."}
                ],
                "linkedin_search_url": "https://linkedin.com/search/...",
                "org_linkedin_search_url": "https://linkedin.com/search/..."
            }
        """
        result = {
            "success": True,
            "person": {},
            "company": {},
            "additional_contacts": [],
            "linkedin_search_url": None,
            "org_linkedin_search_url": None,  # For finding other staff (FREE)
            "source": "hunter.io",
            "enriched_at": datetime.utcnow().isoformat(),
            "credits_used": 0
        }
        
        # Generate LinkedIn search URLs (always works, no API needed - FREE!)
        company_name = None
        if domain:
            company_name = domain.split('.')[0].replace('-', ' ').title()
            # URL to search for other people at this organization
            result["org_linkedin_search_url"] = f"https://www.linkedin.com/search/results/people/?keywords={company_name.replace(' ', '%20')}&origin=GLOBAL_SEARCH_HEADER"
        
        if name:
            search_terms = name.replace(' ', '%20')
            if company_name:
                search_terms += f"%20{company_name.replace(' ', '%20')}"
            result["linkedin_search_url"] = f"https://www.linkedin.com/search/results/people/?keywords={search_terms}&origin=GLOBAL_SEARCH_HEADER"
        
        # If no API key, return basic info with LinkedIn search URLs
        if not self.api_key:
            logger.warning("No Hunter.io API key configured. Returning basic enrichment with LinkedIn search URLs.")
            result["person"] = {
                "name": name,
                "email": email,
            }
            result["company"] = {
                "domain": domain,
                "name": company_name
            }
            result["api_available"] = False
            return result
        
        result["api_available"] = True
        
        try:
            # Primary enrichment: Get person + company info from email (1 credit)
            email_enrichment_succeeded = False
            if email:
                person_data = await self._enrich_by_email(email)
                if person_data and (person_data.get("person") or person_data.get("company")):
                    result["person"] = person_data.get("person", {})
                    result["company"] = person_data.get("company", {})
                    result["credits_used"] += 1
                    email_enrichment_succeeded = bool(result["person"] or result["company"])
                    logger.info(f"Email enrichment returned data: person={bool(result['person'])}, company={bool(result['company'])}")
            
            # Auto-fallback: If email enrichment returned no useful data, try domain search
            # This costs 1 credit but is more likely to find contacts at the organization
            should_search_domain = include_domain_search or (not email_enrichment_succeeded and domain)
            
            if should_search_domain and domain:
                logger.info(f"Searching domain {domain} for contacts...")
                domain_results = await self._search_domain(domain, limit=10)
                if domain_results:
                    result["additional_contacts"] = domain_results.get("emails", [])
                    result["credits_used"] += 1
                    logger.info(f"Domain search found {len(result['additional_contacts'])} contacts")
                    
                    # If we didn't get company info from email enrichment
                    if not result["company"].get("name") and domain_results.get("organization"):
                        result["company"]["name"] = domain_results["organization"]
                        result["company"]["domain"] = domain
                    
                    # If we found contacts and have the person's name, try to match them
                    if name and result["additional_contacts"]:
                        name_lower = name.lower()
                        for contact in result["additional_contacts"]:
                            contact_name = f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip().lower()
                            if name_lower in contact_name or contact_name in name_lower:
                                # Found a match! Update person data
                                result["person"] = {
                                    "name": f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip(),
                                    "email": contact.get("value"),
                                    "position": contact.get("position"),
                                    "linkedin": contact.get("linkedin"),
                                    "phone": contact.get("phone_number"),
                                    "confidence": contact.get("confidence"),
                                }
                                logger.info(f"Matched contact from domain search: {result['person']}")
                                break
            
            # If we have name but no email, try to find email (1 credit)
            # Only do this if we didn't already get data from email enrichment
            if name and domain and not email and not result["person"].get("email"):
                found_email = await self._find_email(domain, name)
                if found_email:
                    result["person"]["email"] = found_email.get("email")
                    result["person"]["confidence"] = found_email.get("score")
                    result["credits_used"] += 1
            
        except Exception as e:
            logger.error(f"Enrichment error: {str(e)}")
            result["error"] = str(e)
        
        return result
    
    async def _enrich_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Get person and company info from an email address.
        Uses Hunter.io Combined Enrichment API.
        """
        try:
            response = await self.client.get(
                f"{HUNTER_BASE_URL}/combined/find",
                params={
                    "email": email,
                    "api_key": self.api_key
                }
            )
            
            if response.status_code == 404:
                return None
            
            response.raise_for_status()
            data = response.json().get("data", {})
            
            person = data.get("person", {})
            company = data.get("company", {})
            
            result = {
                "person": {
                    "name": person.get("name", {}).get("fullName"),
                    "first_name": person.get("name", {}).get("givenName"),
                    "last_name": person.get("name", {}).get("familyName"),
                    "email": email,
                    "position": person.get("employment", {}).get("title"),
                    "seniority": person.get("employment", {}).get("seniority"),
                    "linkedin": f"https://linkedin.com/in/{person.get('linkedin', {}).get('handle')}" if person.get('linkedin', {}).get('handle') else None,
                    "twitter": person.get("twitter", {}).get("handle"),
                    "location": person.get("location"),
                    "phone": person.get("phone")
                },
                "company": {
                    "name": company.get("name"),
                    "domain": company.get("domain"),
                    "description": company.get("description"),
                    "industry": company.get("category", {}).get("industry"),
                    "employees": company.get("metrics", {}).get("employees"),
                    "location": company.get("location"),
                    "linkedin": f"https://linkedin.com/company/{company.get('linkedin', {}).get('handle')}" if company.get('linkedin', {}).get('handle') else None,
                    "phone": company.get("phone"),
                    "logo": company.get("logo")
                }
            }
            
            return result
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                logger.warning("Hunter.io rate limit reached")
            logger.error(f"Hunter.io enrichment error: {e}")
            return None
        except Exception as e:
            logger.error(f"Email enrichment error: {e}")
            return None
    
    async def _search_domain(
        self, 
        domain: str, 
        limit: int = 10,
        department: str = None,
        seniority: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Search for all contacts at a domain.
        Uses Hunter.io Domain Search API.
        
        Args:
            domain: Company domain (e.g., "company.com")
            limit: Max contacts to return
            department: Filter by department (e.g., "it", "management", "executive")
            seniority: Filter by seniority (e.g., "senior", "executive")
        """
        try:
            params = {
                "domain": domain,
                "api_key": self.api_key,
                "limit": min(limit, 100)  # Hunter max is 100
            }
            
            if department:
                params["department"] = department
            if seniority:
                params["seniority"] = seniority
            
            response = await self.client.get(
                f"{HUNTER_BASE_URL}/domain-search",
                params=params
            )
            
            if response.status_code == 404:
                return None
            
            response.raise_for_status()
            data = response.json().get("data", {})
            
            # Format email results
            emails = []
            for email_data in data.get("emails", []):
                emails.append({
                    "email": email_data.get("value"),
                    "name": f"{email_data.get('first_name', '')} {email_data.get('last_name', '')}".strip(),
                    "first_name": email_data.get("first_name"),
                    "last_name": email_data.get("last_name"),
                    "position": email_data.get("position"),
                    "seniority": email_data.get("seniority"),
                    "department": email_data.get("department"),
                    "linkedin": email_data.get("linkedin"),
                    "twitter": email_data.get("twitter"),
                    "phone": email_data.get("phone_number"),
                    "confidence": email_data.get("confidence"),
                    "verified": email_data.get("verification", {}).get("status") == "valid"
                })
            
            return {
                "domain": domain,
                "organization": data.get("organization"),
                "pattern": data.get("pattern"),  # Email pattern like "{first}.{last}"
                "total_emails": data.get("meta", {}).get("results", len(emails)),
                "emails": emails
            }
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                logger.warning("Hunter.io rate limit reached")
            logger.error(f"Hunter.io domain search error: {e}")
            return None
        except Exception as e:
            logger.error(f"Domain search error: {e}")
            return None
    
    async def _find_email(
        self, 
        domain: str, 
        full_name: str = None,
        first_name: str = None,
        last_name: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Find email address for a specific person at a company.
        Uses Hunter.io Email Finder API.
        """
        try:
            params = {
                "domain": domain,
                "api_key": self.api_key
            }
            
            if full_name:
                params["full_name"] = full_name
            elif first_name and last_name:
                params["first_name"] = first_name
                params["last_name"] = last_name
            else:
                # Try to split full_name
                if full_name:
                    parts = full_name.strip().split(' ', 1)
                    if len(parts) >= 2:
                        params["first_name"] = parts[0]
                        params["last_name"] = parts[1]
                    else:
                        params["full_name"] = full_name
                else:
                    return None
            
            response = await self.client.get(
                f"{HUNTER_BASE_URL}/email-finder",
                params=params
            )
            
            if response.status_code == 404:
                return None
            
            response.raise_for_status()
            data = response.json().get("data", {})
            
            return {
                "email": data.get("email"),
                "first_name": data.get("first_name"),
                "last_name": data.get("last_name"),
                "position": data.get("position"),
                "score": data.get("score"),
                "domain": data.get("domain"),
                "company": data.get("company"),
                "linkedin": data.get("linkedin_url"),
                "twitter": data.get("twitter"),
                "phone": data.get("phone_number"),
                "verified": data.get("verification", {}).get("status") == "valid"
            }
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                logger.warning("Hunter.io rate limit reached")
            logger.error(f"Hunter.io email finder error: {e}")
            return None
        except Exception as e:
            logger.error(f"Email finder error: {e}")
            return None
    
    async def verify_email(self, email: str) -> Dict[str, Any]:
        """
        Verify if an email address is deliverable.
        Uses Hunter.io Email Verifier API.
        """
        try:
            response = await self.client.get(
                f"{HUNTER_BASE_URL}/email-verifier",
                params={
                    "email": email,
                    "api_key": self.api_key
                }
            )
            
            response.raise_for_status()
            data = response.json().get("data", {})
            
            return {
                "email": email,
                "status": data.get("status"),  # valid, invalid, accept_all, unknown
                "score": data.get("score"),
                "deliverable": data.get("status") in ["valid", "accept_all"],
                "mx_records": data.get("mx_records"),
                "smtp_check": data.get("smtp_check"),
                "disposable": data.get("disposable"),
                "webmail": data.get("webmail")
            }
            
        except Exception as e:
            logger.error(f"Email verification error: {e}")
            return {
                "email": email,
                "status": "error",
                "error": str(e)
            }
    
    async def search_organization_contacts(
        self,
        domain: str,
        departments: List[str] = None,
        seniority_levels: List[str] = None,
        limit: int = 25
    ) -> Dict[str, Any]:
        """
        Search for multiple types of contacts at an organization.
        Useful for finding decision makers at schools.
        
        Common departments for E-Rate:
        - 'it': Technology directors, IT managers
        - 'executive': Superintendents, principals  
        - 'finance': CFOs, business managers
        - 'management': Department heads
        
        Common seniority levels:
        - 'executive': C-level, superintendents
        - 'senior': Directors, department heads
        - 'junior': Managers, coordinators
        """
        if not departments:
            # Default to E-Rate relevant departments
            departments = ['it', 'executive', 'management', 'finance']
        
        results = {
            "domain": domain,
            "contacts_by_department": {},
            "all_contacts": [],
            "total_found": 0
        }
        
        for dept in departments:
            dept_results = await self._search_domain(
                domain, 
                limit=limit // len(departments),
                department=dept,
                seniority=seniority_levels[0] if seniority_levels else None
            )
            
            if dept_results and dept_results.get("emails"):
                results["contacts_by_department"][dept] = dept_results["emails"]
                results["all_contacts"].extend(dept_results["emails"])
                results["total_found"] += len(dept_results["emails"])
        
        # Remove duplicates based on email
        seen_emails = set()
        unique_contacts = []
        for contact in results["all_contacts"]:
            if contact.get("email") not in seen_emails:
                seen_emails.add(contact.get("email"))
                unique_contacts.append(contact)
        
        results["all_contacts"] = unique_contacts
        results["total_found"] = len(unique_contacts)
        
        return results
    
    def generate_linkedin_search_url(
        self,
        name: str = None,
        company: str = None,
        title: str = None,
        location: str = None
    ) -> str:
        """
        Generate a LinkedIn search URL for finding contacts.
        This is free and doesn't use any API credits.
        """
        base_url = "https://www.linkedin.com/search/results/people/?"
        params = []
        
        keywords = []
        if name:
            keywords.append(name)
        if company:
            keywords.append(company)
        if title:
            keywords.append(title)
        
        if keywords:
            params.append(f"keywords={' '.join(keywords).replace(' ', '%20')}")
        
        if location:
            params.append(f"geoUrn={location.replace(' ', '%20')}")
        
        return base_url + "&".join(params) if params else base_url
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


# Convenience function for one-off enrichment
async def enrich_contact(
    email: str = None,
    name: str = None, 
    domain: str = None
) -> Dict[str, Any]:
    """
    Quick enrichment function.
    
    Usage:
        result = await enrich_contact(
            email="john@school.edu",
            name="John Smith",
            domain="school.edu"
        )
    """
    service = EnrichmentService()
    try:
        return await service.enrich_contact(email=email, name=name, domain=domain)
    finally:
        await service.close()
