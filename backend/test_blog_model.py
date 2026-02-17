import sys
print("STARTING", flush=True)
try:
    from app.core.database import SessionLocal, engine, Base
    from app.models.blog import BlogPost
    print("MODELS LOADED OK", flush=True)
    
    Base.metadata.create_all(bind=engine)
    print("CREATE_ALL OK", flush=True)
    
    db = SessionLocal()
    from app.models.user import User
    count = db.query(User).count()
    print(f"USER COUNT: {count}", flush=True)
    db.close()
    print("ALL GOOD", flush=True)
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}", flush=True)
    sys.exit(1)
