from fastapi import FastAPI, Depends, HTTPException, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from database import engine, get_db, SessionLocal
from models import Base, User, Student, Approval, AuditLog
from schemas import (
    UserCreate, UserLogin, TokenResponse, StudentCreate, StudentUpdate, StudentResponse,
    ApprovalCreate, ApprovalResponse, MonthlyReportResponse
)
from auth_utils import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, verify_token
)
from config import settings
import os
from pathlib import Path

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="4Geeks Commission Tracker",
    description="Professional commission tracking for 4Geeks Academy",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup event - create demo users
@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        # Check if users exist
        eli = db.query(User).filter(User.username == "eli").first()
        if not eli:
            eli_user = User(
                username="eli",
                email="eli@4geeks.com",
                password_hash=hash_password("password"),
                role="ADMISSIONS_REP",
                is_active=True
            )
            db.add(eli_user)

        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin_user = User(
                username="admin",
                email="admin@4geeks.com",
                password_hash=hash_password("password"),
                role="ADMIN",
                is_active=True
            )
            db.add(admin_user)

        marcelo = db.query(User).filter(User.username == "marcelo").first()
        if not marcelo:
            marcelo_user = User(
                username="marcelo",
                email="marcelo@4geeks.com",
                password_hash=hash_password("password"),
                role="MARCELO",
                is_active=True
            )
            db.add(marcelo_user)

        db.commit()
    except Exception as e:
        print(f"Startup error: {e}")
    finally:
        db.close()

# Helper function to get current user from the Authorization: Bearer <token> header
security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = credentials.credentials
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user

# ==================== AUTH ENDPOINTS ====================

@app.post("/api/v1/auth/register", response_model=dict)
def register(user: UserCreate, db: Session = Depends(get_db)):
    """Register new user"""
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    new_user = User(
        email=user.email,
        username=user.username,
        password_hash=hash_password(user.password),
        role=user.role,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"id": new_user.id, "email": new_user.email, "role": new_user.role}

@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login and get tokens"""
    user = db.query(User).filter(User.username == credentials.username).first()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")

    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@app.post("/api/v1/auth/refresh", response_model=TokenResponse)
def refresh(refresh_token: str = Body(..., embed=True), db: Session = Depends(get_db)):
    """Refresh access token"""
    payload = verify_token(refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token = create_access_token({"sub": str(user.id), "role": user.role})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

# ==================== STUDENT ENDPOINTS ====================

@app.post("/api/v1/students", response_model=StudentResponse)
def create_student(
    student: StudentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create new student (prevents duplicates by email + month)"""
    # Check for duplicate (same email + month)
    if student.email:
        existing = db.query(Student).filter(
            Student.email == student.email,
            Student.month == student.month
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Student {student.email} already exists for {student.month}"
            )

    # Calculate commission
    commission = student.tuition_amount * (student.commission_percentage / 100)

    new_student = Student(
        name=student.name,
        program=student.program,
        start_date=student.start_date,
        graduation_date=student.graduation_date,
        tuition_amount=student.tuition_amount,
        commission_percentage=student.commission_percentage,
        commission_amount=commission,
        payment_type=student.payment_type,
        status=student.status,
        email=student.email,
        is_graduate=student.is_graduate,
        month=student.month,
        created_by=user.id
    )
    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    # Log action
    log = AuditLog(
        user_id=user.id,
        action="create",
        entity_type="Student",
        entity_id=new_student.id,
        changes=f"Created {student.name}",
        month=student.month
    )
    db.add(log)
    db.commit()

    return new_student

@app.get("/api/v1/students", response_model=list[StudentResponse])
def list_students(month: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List students for a month"""
    students = db.query(Student).filter(Student.month == month).all()
    return students

@app.get("/api/v1/students/{student_id}", response_model=StudentResponse)
def get_student(student_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get student details"""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    return student

@app.patch("/api/v1/students/{student_id}", response_model=StudentResponse)
def update_student(
    student_id: int,
    update: StudentUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Edit a student record (Admin/Marcelo only)"""
    if user.role not in ("ADMIN", "MARCELO"):
        raise HTTPException(status_code=403, detail="Only Admin or Marcelo can edit records")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    update_data = update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(student, field, value)

    # Recalculate commission if tuition or percentage changed
    if "tuition_amount" in update_data or "commission_percentage" in update_data:
        student.commission_amount = student.tuition_amount * (student.commission_percentage / 100)

    db.commit()
    db.refresh(student)

    log = AuditLog(
        user_id=user.id,
        action="update",
        entity_type="Student",
        entity_id=student.id,
        changes=f"Updated fields: {', '.join(update_data.keys())}",
        month=student.month
    )
    db.add(log)
    db.commit()

    return student

@app.delete("/api/v1/students/{student_id}")
def delete_student(student_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete student (Admin/Marcelo only)"""
    if user.role not in ("ADMIN", "MARCELO"):
        raise HTTPException(status_code=403, detail="Only Admin or Marcelo can delete records")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    month = student.month
    db.delete(student)
    db.commit()

    # Log action
    log = AuditLog(
        user_id=user.id,
        action="delete",
        entity_type="Student",
        entity_id=student_id,
        changes=f"Deleted {student.name}",
        month=month
    )
    db.add(log)
    db.commit()

    return {"message": "Student deleted"}

# ==================== APPROVAL ENDPOINTS ====================

@app.post("/api/v1/approvals/submit", response_model=ApprovalResponse)
def submit_for_approval(approval: ApprovalCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Submit month for admin review"""
    # Only ADMISSIONS_REP can submit
    if user.role != "ADMISSIONS_REP":
        raise HTTPException(status_code=403, detail="Only admissions rep can submit")

    # Get or create approval
    apr = db.query(Approval).filter(Approval.month == approval.month).first()
    if not apr:
        apr = Approval(month=approval.month)
        db.add(apr)
        db.commit()

    # Calculate total commission for the month
    students = db.query(Student).filter(Student.month == approval.month).all()
    total = sum(s.commission_amount for s in students)

    apr.status = "submitted"
    apr.rep_submitted_at = datetime.utcnow()
    apr.total_commission = total
    db.commit()
    db.refresh(apr)

    # Log
    log = AuditLog(
        user_id=user.id,
        action="submit",
        entity_type="Approval",
        entity_id=apr.id,
        changes=f"Submitted for review",
        month=approval.month
    )
    db.add(log)
    db.commit()

    return apr

@app.post("/api/v1/approvals/approve", response_model=ApprovalResponse)
def approve_commission(approval: ApprovalCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Final approval by Marcelo"""
    # Only MARCELO can approve
    if user.role != "MARCELO":
        raise HTTPException(status_code=403, detail="Only Marcelo can approve")

    apr = db.query(Approval).filter(Approval.month == approval.month).first()
    if not apr:
        raise HTTPException(status_code=404, detail="Approval not found")

    apr.status = "approved"
    apr.marcelo_approved_at = datetime.utcnow()
    db.commit()
    db.refresh(apr)

    # Log
    log = AuditLog(
        user_id=user.id,
        action="approve",
        entity_type="Approval",
        entity_id=apr.id,
        changes=f"Approved by Marcelo",
        month=approval.month
    )
    db.add(log)
    db.commit()

    return apr

@app.get("/api/v1/approvals/history", response_model=list[ApprovalResponse])
def approval_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get approval history"""
    approvals = db.query(Approval).order_by(Approval.month.desc()).all()
    return approvals

# ==================== REPORT ENDPOINTS ====================

@app.get("/api/v1/reports/monthly/{month}", response_model=MonthlyReportResponse)
def monthly_report(month: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get monthly report"""
    # Get students
    students = db.query(Student).filter(Student.month == month).all()
    enrolled = [s for s in students if not s.is_graduate]
    graduates = [s for s in students if s.is_graduate]

    # Calculate totals
    total_enrolled_tuition = sum(s.tuition_amount for s in enrolled)
    total_enrolled_commission = sum(s.commission_amount for s in enrolled)
    total_graduate_tuition = sum(s.tuition_amount for s in graduates)
    total_graduate_commission = sum(s.commission_amount for s in graduates)

    # Get approval status
    apr = db.query(Approval).filter(Approval.month == month).first()

    return MonthlyReportResponse(
        month=month,
        enrolled_count=len(enrolled),
        graduate_count=len(graduates),
        total_enrolled_tuition=total_enrolled_tuition,
        total_enrolled_commission=total_enrolled_commission,
        total_graduate_tuition=total_graduate_tuition,
        total_graduate_commission=total_graduate_commission,
        total_tuition=total_enrolled_tuition + total_graduate_tuition,
        total_commission=total_enrolled_commission + total_graduate_commission,
        approval_status=apr.status if apr else "draft",
        submitted_at=apr.rep_submitted_at if apr else None,
        approved_at=apr.marcelo_approved_at if apr else None,
    )

@app.get("/api/v1/reports/all", response_model=list[MonthlyReportResponse])
def all_reports(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all monthly reports"""
    # Get unique months
    months = db.query(Student.month).distinct().order_by(Student.month.desc()).all()

    reports = []
    for (month,) in months:
        students = db.query(Student).filter(Student.month == month).all()
        enrolled = [s for s in students if not s.is_graduate]
        graduates = [s for s in students if s.is_graduate]

        total_enrolled_tuition = sum(s.tuition_amount for s in enrolled)
        total_enrolled_commission = sum(s.commission_amount for s in enrolled)
        total_graduate_tuition = sum(s.tuition_amount for s in graduates)
        total_graduate_commission = sum(s.commission_amount for s in graduates)

        apr = db.query(Approval).filter(Approval.month == month).first()

        reports.append(MonthlyReportResponse(
            month=month,
            enrolled_count=len(enrolled),
            graduate_count=len(graduates),
            total_enrolled_tuition=total_enrolled_tuition,
            total_enrolled_commission=total_enrolled_commission,
            total_graduate_tuition=total_graduate_tuition,
            total_graduate_commission=total_graduate_commission,
            total_tuition=total_enrolled_tuition + total_graduate_tuition,
            total_commission=total_enrolled_commission + total_graduate_commission,
            approval_status=apr.status if apr else "draft",
            submitted_at=apr.rep_submitted_at if apr else None,
            approved_at=apr.marcelo_approved_at if apr else None,
        ))

    return reports

# ==================== HEALTH CHECK ====================

@app.get("/api/v1/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok", "timestamp": datetime.utcnow()}

@app.get("/api/v1/info")
def api_info():
    """API info endpoint"""
    return {
        "name": "4Geeks Commission Tracker API",
        "version": "1.0.0",
        "docs": "/docs"
    }

# ==================== STATIC FILES ====================

# Serve React frontend as static files.
# In the Docker image, the built frontend is copied to /app/dist (sibling of main.py).
# In local dev (running from backend/), fall back to ../frontend/dist.
_candidates = [
    Path(__file__).parent / "dist",
    Path(__file__).parent.parent / "frontend" / "dist",
]
frontend_dist = next((p for p in _candidates if p.exists()), None)

if frontend_dist:
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")
else:
    # Fallback if dist doesn't exist yet
    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        """Serve frontend - will be replaced by static files mount once built"""
        return {"message": "Frontend not yet built. Visit /docs for API docs."}
