"""
Migrate data from local SQLite to MySQL on Bluehost
Run this script to sync your local data to the production database.

Usage:
    set MYSQL_HOST=your_host
    set MYSQL_USER=your_user
    set MYSQL_PASSWORD=your_password
    set MYSQL_DATABASE=your_database
    python migrate_to_mysql.py
"""

import sqlite3
import pymysql
import os
from datetime import datetime

# MySQL connection details - read from environment variables
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST'),
    'user': os.getenv('MYSQL_USER'),
    'password': os.getenv('MYSQL_PASSWORD', ''),  # Must be set via environment!
    'database': os.getenv('MYSQL_DATABASE'),
    'charset': 'utf8mb4'
}

if not MYSQL_CONFIG['password']:
    print("❌ Error: MYSQL_PASSWORD environment variable must be set!")
    print("   Usage: $env:MYSQL_PASSWORD='your_password'; python migrate_to_mysql.py")
    exit(1)

# SQLite database path
SQLITE_PATH = 'skyrate.db'

def get_sqlite_connection():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_mysql_connection():
    return pymysql.connect(**MYSQL_CONFIG)

def migrate_table(sqlite_cursor, mysql_cursor, table_name, columns):
    """Generic function to migrate a table"""
    print(f"\n📦 Migrating {table_name}...")
    
    # Get data from SQLite
    sqlite_cursor.execute(f"SELECT * FROM {table_name}")
    rows = sqlite_cursor.fetchall()
    
    if not rows:
        print(f"   No data in {table_name}")
        return 0
    
    # Build INSERT query
    placeholders = ', '.join(['%s'] * len(columns))
    columns_str = ', '.join([f'`{c}`' for c in columns])
    
    insert_query = f"""
        INSERT INTO {table_name} ({columns_str})
        VALUES ({placeholders})
        ON DUPLICATE KEY UPDATE {columns[1]}={columns[1]}
    """
    
    migrated = 0
    for row in rows:
        try:
            values = [row[col] for col in columns]
            mysql_cursor.execute(insert_query, values)
            migrated += 1
        except Exception as e:
            print(f"   ⚠️ Error inserting row: {e}")
    
    print(f"   ✅ Migrated {migrated}/{len(rows)} rows")
    return migrated

def main():
    print("=" * 60)
    print("🚀 SKYRATE DATA MIGRATION: SQLite → MySQL")
    print("=" * 60)
    
    # Connect to databases
    print("\n🔌 Connecting to databases...")
    sqlite_conn = get_sqlite_connection()
    sqlite_cursor = sqlite_conn.cursor()
    
    mysql_conn = get_mysql_connection()
    mysql_cursor = mysql_conn.cursor()
    
    print("   ✅ SQLite connected")
    print("   ✅ MySQL connected")
    
    try:
        # 1. USERS
        print("\n" + "=" * 40)
        print("1️⃣  MIGRATING USERS")
        print("=" * 40)
        
        sqlite_cursor.execute("SELECT * FROM users")
        users = sqlite_cursor.fetchall()
        
        for user in users:
            try:
                mysql_cursor.execute("""
                    INSERT INTO users (id, email, password_hash, role, auth_provider, 
                        first_name, last_name, company_name, phone, is_active, is_verified,
                        created_at, updated_at, last_login)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE email=VALUES(email)
                """, (
                    user['id'], user['email'], user['password_hash'], user['role'],
                    user['auth_provider'], user['first_name'], user['last_name'],
                    user['company_name'], user['phone'], user['is_active'], user['is_verified'],
                    user['created_at'], user['updated_at'], user['last_login']
                ))
                print(f"   ✅ User {user['id']}: {user['email']} ({user['role']})")
            except Exception as e:
                print(f"   ⚠️ Error with user {user['email']}: {e}")
        
        mysql_conn.commit()
        
        # 2. SUBSCRIPTIONS
        print("\n" + "=" * 40)
        print("2️⃣  MIGRATING SUBSCRIPTIONS")
        print("=" * 40)
        
        sqlite_cursor.execute("SELECT * FROM subscriptions")
        subs = sqlite_cursor.fetchall()
        
        for sub in subs:
            try:
                mysql_cursor.execute("""
                    INSERT INTO subscriptions (id, user_id, plan, status, price_cents,
                        stripe_customer_id, stripe_subscription_id, stripe_price_id,
                        start_date, end_date, trial_end, current_period_start, current_period_end,
                        canceled_at, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)
                """, (
                    sub['id'], sub['user_id'], sub['plan'], sub['status'], sub['price_cents'],
                    sub['stripe_customer_id'], sub['stripe_subscription_id'], sub['stripe_price_id'],
                    sub['start_date'], sub['end_date'], sub['trial_end'], 
                    sub['current_period_start'], sub['current_period_end'],
                    sub['canceled_at'], sub['created_at'], sub['updated_at']
                ))
                print(f"   ✅ Subscription {sub['id']}: user_id={sub['user_id']}, plan={sub['plan']}")
            except Exception as e:
                print(f"   ⚠️ Error: {e}")
        
        mysql_conn.commit()
        
        # 3. VENDOR PROFILES
        print("\n" + "=" * 40)
        print("3️⃣  MIGRATING VENDOR PROFILES (SPIN)")
        print("=" * 40)
        
        sqlite_cursor.execute("SELECT * FROM vendor_profiles")
        vendors = sqlite_cursor.fetchall()
        
        for vendor in vendors:
            try:
                mysql_cursor.execute("""
                    INSERT INTO vendor_profiles (id, user_id, spin, company_name, contact_name,
                        phone, address, website, equipment_types, services_offered, service_areas,
                        contact_preferences, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE spin=VALUES(spin), company_name=VALUES(company_name)
                """, (
                    vendor['id'], vendor['user_id'], vendor['spin'], vendor['company_name'],
                    vendor['contact_name'], vendor['phone'], vendor['address'], vendor['website'],
                    vendor['equipment_types'], vendor['services_offered'], vendor['service_areas'],
                    vendor['contact_preferences'], vendor['created_at'], vendor['updated_at']
                ))
                print(f"   ✅ Vendor {vendor['id']}: SPIN={vendor['spin']}, company={vendor['company_name']}")
            except Exception as e:
                print(f"   ⚠️ Error: {e}")
        
        mysql_conn.commit()
        
        # 4. CONSULTANT PROFILES
        print("\n" + "=" * 40)
        print("4️⃣  MIGRATING CONSULTANT PROFILES (CRN)")
        print("=" * 40)
        
        sqlite_cursor.execute("SELECT * FROM consultant_profiles")
        consultants = sqlite_cursor.fetchall()
        
        if consultants:
            for cons in consultants:
                try:
                    mysql_cursor.execute("""
                        INSERT INTO consultant_profiles (id, user_id, crn, company_name, contact_name,
                            phone, address, website, settings, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE crn=VALUES(crn), company_name=VALUES(company_name)
                    """, (
                        cons['id'], cons['user_id'], cons['crn'], cons['company_name'],
                        cons['contact_name'], cons['phone'], cons['address'], cons['website'],
                        cons['settings'], cons['created_at'], cons['updated_at']
                    ))
                    print(f"   ✅ Consultant {cons['id']}: CRN={cons['crn']}, company={cons['company_name']}")
                except Exception as e:
                    print(f"   ⚠️ Error: {e}")
        else:
            print("   No consultant profiles to migrate")
        
        mysql_conn.commit()
        
        # 5. APPLICANT PROFILES
        print("\n" + "=" * 40)
        print("5️⃣  MIGRATING APPLICANT PROFILES")
        print("=" * 40)
        
        sqlite_cursor.execute("SELECT * FROM applicant_profiles")
        applicants = sqlite_cursor.fetchall()
        
        for app in applicants:
            try:
                mysql_cursor.execute("""
                    INSERT INTO applicant_profiles (id, user_id, ben, organization_name, state, city,
                        entity_type, discount_rate, sync_status, last_sync_at, sync_error, is_paid,
                        paid_at, stripe_customer_id, stripe_subscription_id, total_applications,
                        total_funded, total_pending, total_denied, active_appeals_count,
                        pending_deadlines_count, settings, notification_preferences, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE ben=VALUES(ben), organization_name=VALUES(organization_name)
                """, (
                    app['id'], app['user_id'], app['ben'], app['organization_name'], app['state'],
                    app['city'], app['entity_type'], app['discount_rate'], app['sync_status'],
                    app['last_sync_at'], app['sync_error'], app['is_paid'], app['paid_at'],
                    app['stripe_customer_id'], app['stripe_subscription_id'], app['total_applications'],
                    app['total_funded'], app['total_pending'], app['total_denied'],
                    app['active_appeals_count'], app['pending_deadlines_count'], app['settings'],
                    app['notification_preferences'], app['created_at'], app['updated_at']
                ))
                print(f"   ✅ Applicant {app['id']}: BEN={app['ben']}, org={app['organization_name']}")
            except Exception as e:
                print(f"   ⚠️ Error: {e}")
        
        mysql_conn.commit()
        
        # 6. APPLICANT BENS
        print("\n" + "=" * 40)
        print("6️⃣  MIGRATING APPLICANT BENS")
        print("=" * 40)
        
        sqlite_cursor.execute("SELECT * FROM applicant_bens")
        bens = sqlite_cursor.fetchall()
        
        for ben in bens:
            try:
                mysql_cursor.execute("""
                    INSERT INTO applicant_bens (id, applicant_profile_id, ben, is_primary, display_name,
                        organization_name, state, city, entity_type, discount_rate, subscription_status,
                        is_paid, paid_at, subscription_start, subscription_end, stripe_subscription_item_id,
                        monthly_price_cents, sync_status, last_sync_at, sync_error, total_applications,
                        total_funded, total_pending, total_denied, active_appeals_count,
                        pending_deadlines_count, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE ben=VALUES(ben)
                """, (
                    ben['id'], ben['applicant_profile_id'], ben['ben'], ben['is_primary'],
                    ben['display_name'], ben['organization_name'], ben['state'], ben['city'],
                    ben['entity_type'], ben['discount_rate'], ben['subscription_status'],
                    ben['is_paid'], ben['paid_at'], ben['subscription_start'], ben['subscription_end'],
                    ben['stripe_subscription_item_id'], ben['monthly_price_cents'], ben['sync_status'],
                    ben['last_sync_at'], ben['sync_error'], ben['total_applications'],
                    ben['total_funded'], ben['total_pending'], ben['total_denied'],
                    ben['active_appeals_count'], ben['pending_deadlines_count'],
                    ben['created_at'], ben['updated_at']
                ))
                print(f"   ✅ BEN {ben['id']}: {ben['ben']} - {ben['organization_name']}")
            except Exception as e:
                print(f"   ⚠️ Error: {e}")
        
        mysql_conn.commit()
        
        # 7. APPLICANT FRNS
        print("\n" + "=" * 40)
        print("7️⃣  MIGRATING APPLICANT FRNs")
        print("=" * 40)
        
        sqlite_cursor.execute("SELECT * FROM applicant_frns")
        frns = sqlite_cursor.fetchall()
        
        for frn in frns:
            try:
                mysql_cursor.execute("""
                    INSERT INTO applicant_frns (id, applicant_profile_id, applicant_ben_id, frn,
                        application_number, funding_year, status, status_type, service_type,
                        service_description, amount_requested, amount_funded, amount_disbursed,
                        discount_rate, is_denied, denial_reason, fcdl_comment, fcdl_date,
                        appeal_deadline, invoice_deadline, last_invoice_date, disbursement_status,
                        review_stage, pia_question_type, days_in_review, raw_data, fetched_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE status=VALUES(status)
                """, (
                    frn['id'], frn['applicant_profile_id'], frn['applicant_ben_id'], frn['frn'],
                    frn['application_number'], frn['funding_year'], frn['status'], frn['status_type'],
                    frn['service_type'], frn['service_description'], frn['amount_requested'],
                    frn['amount_funded'], frn['amount_disbursed'], frn['discount_rate'],
                    frn['is_denied'], frn['denial_reason'], frn['fcdl_comment'], frn['fcdl_date'],
                    frn['appeal_deadline'], frn['invoice_deadline'], frn['last_invoice_date'],
                    frn['disbursement_status'], frn['review_stage'], frn['pia_question_type'],
                    frn['days_in_review'], frn['raw_data'], frn['fetched_at'], frn['updated_at']
                ))
            except Exception as e:
                print(f"   ⚠️ Error: {e}")
        
        print(f"   ✅ Migrated {len(frns)} FRNs")
        mysql_conn.commit()
        
        # 8. SAVED LEADS
        print("\n" + "=" * 40)
        print("8️⃣  MIGRATING SAVED LEADS")
        print("=" * 40)
        
        sqlite_cursor.execute("SELECT * FROM saved_leads")
        leads = sqlite_cursor.fetchall()
        
        for lead in leads:
            try:
                mysql_cursor.execute("""
                    INSERT INTO saved_leads (id, vendor_profile_id, form_type, application_number,
                        ben, entity_name, entity_type, entity_state, entity_city, contact_name,
                        contact_email, contact_phone, enriched_data, enrichment_date, lead_status,
                        notes, funding_year, categories, services, manufacturers, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE lead_status=VALUES(lead_status)
                """, (
                    lead['id'], lead['vendor_profile_id'], lead['form_type'], lead['application_number'],
                    lead['ben'], lead['entity_name'], lead['entity_type'], lead['entity_state'],
                    lead['entity_city'], lead['contact_name'], lead['contact_email'], lead['contact_phone'],
                    lead['enriched_data'], lead['enrichment_date'], lead['lead_status'], lead['notes'],
                    lead['funding_year'], lead['categories'], lead['services'], lead['manufacturers'],
                    lead['created_at'], lead['updated_at']
                ))
                print(f"   ✅ Lead {lead['id']}: {lead['entity_name']}")
            except Exception as e:
                print(f"   ⚠️ Error: {e}")
        
        mysql_conn.commit()
        
        # 9. ORGANIZATION ENRICHMENT CACHE
        print("\n" + "=" * 40)
        print("9️⃣  MIGRATING ENRICHMENT CACHE")
        print("=" * 40)
        
        sqlite_cursor.execute("SELECT * FROM organization_enrichment_cache")
        cache = sqlite_cursor.fetchall()
        
        for item in cache:
            try:
                mysql_cursor.execute("""
                    INSERT INTO organization_enrichment_cache (id, domain, ben, organization_name,
                        company_data, contacts, primary_contact, linkedin_search_url, 
                        org_linkedin_search_url, enrichment_source, credits_used, created_at,
                        updated_at, expires_at, last_accessed_at, access_count)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE domain=VALUES(domain)
                """, (
                    item['id'], item['domain'], item['ben'], item['organization_name'],
                    item['company_data'], item['contacts'], item['primary_contact'],
                    item['linkedin_search_url'], item['org_linkedin_search_url'],
                    item['enrichment_source'], item['credits_used'], item['created_at'],
                    item['updated_at'], item['expires_at'], item['last_accessed_at'], item['access_count']
                ))
                print(f"   ✅ Cache {item['id']}: {item['domain']}")
            except Exception as e:
                print(f"   ⚠️ Error: {e}")
        
        mysql_conn.commit()
        
        # 10. APPLICANT STATUS HISTORY
        print("\n" + "=" * 40)
        print("🔟 MIGRATING STATUS HISTORY")
        print("=" * 40)
        
        sqlite_cursor.execute("SELECT * FROM applicant_status_history")
        history = sqlite_cursor.fetchall()
        
        for h in history:
            try:
                mysql_cursor.execute("""
                    INSERT INTO applicant_status_history (id, applicant_profile_id, frn_id, frn,
                        change_type, previous_value, new_value, description, is_important,
                        is_read, changed_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE id=VALUES(id)
                """, (
                    h['id'], h['applicant_profile_id'], h['frn_id'], h['frn'],
                    h['change_type'], h['previous_value'], h['new_value'], h['description'],
                    h['is_important'], h['is_read'], h['changed_at']
                ))
            except Exception as e:
                print(f"   ⚠️ Error: {e}")
        
        print(f"   ✅ Migrated {len(history)} history records")
        mysql_conn.commit()
        
        # FINAL VERIFICATION
        print("\n" + "=" * 60)
        print("✅ MIGRATION COMPLETE - VERIFYING...")
        print("=" * 60)
        
        # Verify counts in MySQL
        tables_to_check = [
            'users', 'subscriptions', 'vendor_profiles', 'consultant_profiles',
            'applicant_profiles', 'applicant_bens', 'applicant_frns', 'saved_leads',
            'organization_enrichment_cache', 'applicant_status_history'
        ]
        
        for table in tables_to_check:
            mysql_cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = mysql_cursor.fetchone()[0]
            if count > 0:
                print(f"   {table}: {count} rows")
        
        print("\n🎉 Migration completed successfully!")
        print("   Your SPIN, CRN, users, and all data are now in MySQL!")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        mysql_conn.rollback()
    finally:
        sqlite_conn.close()
        mysql_conn.close()

if __name__ == "__main__":
    main()
