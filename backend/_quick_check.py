from sodapy import Socrata
c = Socrata("opendata.usac.org", None)
r = c.get("jt8s-3q52", where="application_number='260026339'", limit=1)
print(len(r), "results")
if r:
    print("OK - dataset accessible")
else:
    print("EMPTY - no results")
