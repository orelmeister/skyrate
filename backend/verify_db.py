import mysql.connector

conn = mysql.connector.connect(
    host='173.254.91.77',
    user='skylimi5_admin',
    password='Y=jLbSp.^8gh',
    database='skylimi5_skyrate'
)
cursor = conn.cursor(dictionary=True)

print("=" * 50)
print("DATABASE VERIFICATION REPORT")
print("=" * 50)

print("\n[VENDOR PROFILES]")
cursor.execute("SELECT * FROM vendor_profiles")
vendors = cursor.fetchall()
if vendors:
    for v in vendors:
        print(f"  User ID: {v.get('user_id')}, SPIN: {v.get('spin')}, Company: {v.get('company_name')}")
else:
    print("  No vendor profiles found")

print("\n[CONSULTANT SCHOOLS]")
cursor.execute("SELECT * FROM consultant_schools")
schools = cursor.fetchall()
if schools:
    for s in schools:
        print(f"  User ID: {s.get('user_id')}, BEN: {s.get('ben')}, Name: {s.get('school_name')}")
else:
    print("  No consultant schools found")

print("\n[APPLICANT BENS]")
cursor.execute("SELECT * FROM applicant_bens")
bens = cursor.fetchall()
if bens:
    for b in bens:
        print(f"  User ID: {b.get('user_id')}, BEN: {b.get('ben')}")
else:
    print("  No applicant BENs found")

print("\n" + "=" * 50)
print("VERIFICATION COMPLETE")
print("=" * 50)

conn.close()
