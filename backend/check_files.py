import ast
files = ['app/api/v1/applicant.py','app/api/v1/vendor.py','app/api/v1/consultant.py','app/services/alert_service.py','app/services/scheduler_service.py','app/models/alert.py','utils/usac_client.py']
for f in files:
    try:
        with open(f, 'r', encoding='utf-8') as fh:
            ast.parse(fh.read())
        print(f'OK: {f}')
    except Exception as e:
        print(f'ERROR in {f}: {e}')
