from fastapi import FastAPI, Depends, HTTPException, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, date
from typing import Optional
from database import engine, get_db, SessionLocal
from models import Base, User, Student, Approval, AuditLog, LOCATIONS
from migrations import run_migrations
from schemas import (
    UserCreate, UserUpdate, UserResponse, UserLogin, ChangePasswordRequest, TokenResponse,
    StudentCreate, StudentUpdate, StudentResponse, DuplicateGroup, DuplicateReport, PaymentUpdate,
    ApprovalCreate, ApprovalResponse, MonthlyReportResponse, RepMonthSummary
)
from auth_utils import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, verify_token
)
from config import settings
import os
import re
import unicodedata
from pathlib import Path

# Create tables, then upgrade any existing ones in place
Base.metadata.create_all(bind=engine)
run_migrations(engine)

app = FastAPI(
    title="4Geeks Commission Tracker",
    description="Professional commission tracking for 4Geeks Academy",
    version="1.1.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROLES = ("ADMISSIONS_REP", "ADMIN", "MARCELO")
MANAGERS = ("ADMIN", "MARCELO")
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Startup event - create the original accounts if they don't exist yet
@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        defaults = [
            ("eli", "eli@4geeks.com", "ADMISSIONS_REP"),
            ("admin", "admin@4geeks.com", "ADMIN"),
            ("marcelo", "marcelo@4geeks.com", "MARCELO"),
        ]
        for username, email, role in defaults:
            if not db.query(User).filter(User.username == username).first():
                db.add(User(
                    username=username, email=email, password_hash=hash_password("password"),
                    role=role, location="USA", is_active=True,
                ))
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
    if not user.is_active:
        raise HTTPException(status_code=401, detail="This account has been deactivated")

    return user

def require_manager(user: User):
    if user.role not in MANAGERS:
        raise HTTPException(status_code=403, detail="Only Admin or Marcelo can do this")

def require_marcelo(user: User):
    if user.role != "MARCELO":
        raise HTTPException(status_code=403, detail="Only the super admin can do this")

def check_month(month: str):
    if not month or not MONTH_RE.match(month):
        raise HTTPException(status_code=422, detail="Month must be in YYYY-MM format")

def check_location(location: Optional[str]):
    if location is not None and location not in LOCATIONS:
        raise HTTPException(status_code=422, detail=f"Location must be one of {', '.join(LOCATIONS)}")

def get_rep(db: Session, rep_id: int) -> User:
    rep = db.query(User).filter(User.id == rep_id, User.role == "ADMISSIONS_REP").first()
    if not rep:
        raise HTTPException(status_code=404, detail="Admissions rep not found")
    return rep

def scope_students(q, user: User, location: Optional[str] = None, rep_id: Optional[int] = None):
    """Reps only ever see their own records; managers can filter by location / rep."""
    if user.role == "ADMISSIONS_REP":
        return q.filter(Student.rep_id == user.id)
    if location:
        q = q.filter(Student.location == location)
    if rep_id:
        q = q.filter(Student.rep_id == rep_id)
    return q

def refresh_approval_total(db: Session, month: str, rep_id: Optional[int]):
    """Recompute the stored total on a rep's month approval (if one exists)."""
    apr = db.query(Approval).filter(Approval.month == month, Approval.rep_id == rep_id).first()
    if apr:
        total = db.query(func.coalesce(func.sum(Student.commission_amount), 0.0)).filter(
            Student.month == month, Student.rep_id == rep_id
        ).scalar()
        apr.total_commission = float(total or 0.0)
        db.commit()

def log_action(db: Session, user: User, action: str, entity_type: str, entity_id: int, changes: str, month: Optional[str] = None):
    db.add(AuditLog(user_id=user.id, action=action, entity_type=entity_type,
                    entity_id=entity_id, changes=changes, month=month))
    db.commit()

# ---------- Payments & duplicate detection ----------

PAYMENT_STATUSES = ("pending", "partial", "paid")

def norm_name(name: Optional[str]) -> str:
    """Lower-case, accent-free, single-spaced — so 'José  Pérez' matches 'jose perez'."""
    base = unicodedata.normalize("NFKD", name or "")
    base = "".join(c for c in base if not unicodedata.combining(c))
    return " ".join(base.lower().split())

def money(n: float) -> str:
    return f"${n:,.2f}"

def same_student_records(db: Session, student: Student) -> list:
    """Other records of the SAME kind (enrolled vs graduate) for the same person,
    matched by email or by normalized name. An enrolled record plus a later graduate
    record is expected (two different commissions) — only same-kind repeats are risky."""
    email = (student.email or "").strip().lower()
    name = norm_name(student.name)
    out = []
    for o in db.query(Student).filter(Student.id != student.id, Student.is_graduate == student.is_graduate).all():
        if (email and (o.email or "").strip().lower() == email) or (name and norm_name(o.name) == name):
            out.append(o)
    return out

def apply_payment(db: Session, user: User, student: Student, new_status: str,
                  paid_amount: Optional[float], confirm_duplicate: bool):
    """Record a payout on one commission record, refusing a likely double payment
    unless the user has explicitly confirmed it."""
    if new_status not in PAYMENT_STATUSES:
        raise HTTPException(status_code=422, detail=f"Payment status must be one of {', '.join(PAYMENT_STATUSES)}")
    commission = student.commission_amount or 0.0

    if new_status == "partial":
        if paid_amount is None or paid_amount <= 0:
            raise HTTPException(status_code=422, detail="Enter how much has been paid so far")
        if paid_amount >= commission - 0.005:
            raise HTTPException(status_code=422, detail=f"That is the full commission ({money(commission)}) — choose Paid instead")

    starting_to_pay = new_status in ("paid", "partial") and student.payment_status not in ("paid", "partial")
    if starting_to_pay and not confirm_duplicate:
        already = [o for o in same_student_records(db, student) if o.payment_status in ("paid", "partial")]
        if already:
            raise HTTPException(status_code=409, detail={
                "code": "possible_duplicate",
                "message": f"{student.name} already has a {'graduate' if student.is_graduate else 'enrolled'} commission marked as paid in another month.",
                "matches": [{
                    "id": o.id, "month": o.month, "rep_name": o.rep_name,
                    "payment_status": o.payment_status, "paid_total": o.paid_total,
                    "commission_amount": o.commission_amount, "paid_at": o.paid_at.isoformat() if o.paid_at else None,
                } for o in already],
            })

    old = student.payment_status
    student.payment_status = new_status
    if new_status == "paid":
        student.paid_amount = commission
        student.paid_at = student.paid_at or date.today()
    elif new_status == "partial":
        student.paid_amount = round(paid_amount, 2)
        student.paid_at = student.paid_at or date.today()
    else:
        student.paid_amount = 0.0
        student.paid_at = None
    db.commit()
    db.refresh(student)
    detail = f"{old or 'pending'} → {new_status}" + (f" ({money(student.paid_total)})" if new_status != "pending" else "")
    if confirm_duplicate and starting_to_pay:
        detail += " [duplicate warning acknowledged]"
    log_action(db, user, "payment", "Student", student.id, f"{student.name}: {detail}", student.month)
    return student

def month_totals(students: list) -> dict:
    earned = sum(s.commission_amount or 0 for s in students)
    paid = sum(s.paid_total for s in students)
    return {"earned": earned, "paid": paid, "outstanding": max(earned - paid, 0.0)}

# ==================== AUTH ENDPOINTS ====================

@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login with username OR email (case-insensitive) and get tokens"""
    ident = (credentials.username or "").strip().lower()
    user = db.query(User).filter(
        (func.lower(User.username) == ident) | (func.lower(User.email) == ident)
    ).first()

    # Accept the password as typed, or without stray leading/trailing spaces
    # (common when it was copied from a chat message)
    raw = credentials.password or ""
    ok = bool(user) and (
        verify_password(raw, user.password_hash)
        or (raw.strip() != raw and verify_password(raw.strip(), user.password_hash))
    )
    if not ok:
        # Logged for troubleshooting only — never the password itself
        reason = "unknown username/email" if not user else "wrong password"
        print(f"[auth] failed login for '{ident}': {reason}", flush=True)
        raise HTTPException(
            status_code=401,
            detail="Wrong username or password. You can use your username or your email. Ask Marcelo to reset it if needed.",
        )

    if not user.is_active:
        print(f"[auth] blocked login for '{ident}': account deactivated", flush=True)
        raise HTTPException(status_code=403, detail="This account is deactivated. Ask Marcelo to reactivate it.")
    print(f"[auth] login ok for '{user.username}'", flush=True)

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
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    access_token = create_access_token({"sub": str(user.id), "role": user.role})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@app.get("/api/v1/auth/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    """The logged-in user's profile (name, role, location)"""
    return user

@app.post("/api/v1/auth/change-password")
def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the logged-in user's own password"""
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Password updated"}

# ==================== USER MANAGEMENT ====================

@app.get("/api/v1/users", response_model=list[UserResponse])
def list_users(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """All users (Admin/Marcelo) — used for the rep pickers and the Users tab"""
    require_manager(user)
    return db.query(User).order_by(User.role, User.location, User.username).all()

def _create_user(data: UserCreate, actor: User, db: Session) -> User:
    require_marcelo(actor)
    if data.role not in ROLES:
        raise HTTPException(status_code=422, detail=f"Role must be one of {', '.join(ROLES)}")
    check_location(data.location)
    password = (data.password or "").strip()
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    username = data.username.strip().lower()
    if not re.match(r"^[a-z0-9._-]{2,40}$", username):
        raise HTTPException(status_code=422, detail="Username: 2–40 characters, letters, numbers, dot, dash or underscore")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    email = data.email.strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        email=email, username=username, full_name=(data.full_name or "").strip() or None,
        password_hash=hash_password(password), role=data.role, location=data.location, is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    log_action(db, actor, "create", "User", new_user.id, f"Created {data.role} {username} ({data.location})")
    return new_user

@app.post("/api/v1/users", response_model=UserResponse)
def create_user(data: UserCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a user (super admin only)"""
    return _create_user(data, user, db)

@app.post("/api/v1/auth/register", response_model=UserResponse)
def register(data: UserCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Kept for compatibility — now requires the super admin (was open to anyone)"""
    return _create_user(data, user, db)

@app.patch("/api/v1/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, update: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Edit a user, (de)activate them or reset their password (super admin only)"""
    require_marcelo(user)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    data = update.dict(exclude_unset=True)
    if "role" in data and data["role"] not in ROLES:
        raise HTTPException(status_code=422, detail=f"Role must be one of {', '.join(ROLES)}")
    check_location(data.get("location"))
    if target.id == user.id and (data.get("is_active") is False or data.get("role", "MARCELO") != "MARCELO"):
        raise HTTPException(status_code=400, detail="You can't deactivate or demote your own account")
    if "email" in data:
        data["email"] = data["email"].strip().lower()
    if "email" in data and db.query(User).filter(func.lower(User.email) == data["email"], User.id != target.id).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    new_password = data.pop("new_password", None)
    new_password = new_password.strip() if new_password else None
    if new_password is not None:
        if len(new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        target.password_hash = hash_password(new_password)

    old_location = target.location
    for field, value in data.items():
        setattr(target, field, value)
    db.commit()

    # A rep's records follow them if their location changes
    if "location" in data and data["location"] != old_location and target.role == "ADMISSIONS_REP":
        db.query(Student).filter(Student.rep_id == target.id).update({Student.location: target.location})
        db.query(Approval).filter(Approval.rep_id == target.id).update({Approval.location: target.location})
        db.commit()

    db.refresh(target)
    changed = list(data.keys()) + (["password"] if new_password else [])
    log_action(db, user, "update", "User", target.id, f"Updated {target.username}: {', '.join(changed)}")
    return target

# ==================== STUDENT ENDPOINTS ====================

@app.post("/api/v1/students", response_model=StudentResponse)
def create_student(
    student: StudentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create new student (prevents duplicates by email + month)"""
    check_month(student.month)

    # Reps always own what they add; Admin/Marcelo must pick the rep
    if user.role == "ADMISSIONS_REP":
        rep = user
    else:
        if not student.rep_id:
            raise HTTPException(status_code=422, detail="Choose which admissions rep this record belongs to")
        rep = get_rep(db, student.rep_id)

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
        payment_status="pending",   # payouts are recorded later via /students/{id}/payment
        paid_amount=0.0,
        email=student.email,
        is_graduate=student.is_graduate,
        month=student.month,
        rep_id=rep.id,
        location=rep.location or "USA",
        created_by=user.id
    )
    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    refresh_approval_total(db, new_student.month, new_student.rep_id)
    log_action(db, user, "create", "Student", new_student.id, f"Created {student.name} for {rep.username}", student.month)

    return new_student

@app.get("/api/v1/students", response_model=list[StudentResponse])
def list_students(
    month: str,
    location: Optional[str] = None,
    rep_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List students for a month (reps: their own; managers: filter by location / rep)"""
    check_location(location)
    q = scope_students(db.query(Student).filter(Student.month == month), user, location, rep_id)
    return q.order_by(Student.name).all()

RISK_RANK = {"double_paid": 3, "at_risk": 2, "repeat": 1}

@app.get("/api/v1/students/duplicates", response_model=DuplicateReport)
def find_duplicate_students(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Scan every record (all months, reps and locations) for the same student entered
    more than once as the same kind of commission (enrolled or graduate):
      double_paid — 2+ of those records are already paid/partly paid
      at_risk     — one is paid and another is still pending: paying it would double up
      repeat      — entered twice but nothing paid yet (likely a double entry)
    An enrolled record plus a later graduate record is NOT flagged — that is two
    different commissions by design. Students are matched by email or normalized name.
    """
    require_manager(user)

    students = db.query(Student).order_by(Student.month.desc(), Student.id.desc()).all()
    parent = {s.id: s.id for s in students}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    seen = {}
    for s in students:
        keys = []
        if s.email and s.email.strip():
            keys.append("e:" + s.email.strip().lower())
        if norm_name(s.name):
            keys.append("n:" + norm_name(s.name))
        for k in keys:
            if k in seen:
                parent[find(s.id)] = find(seen[k])
            else:
                seen[k] = s.id

    clusters = {}
    for s in students:
        clusters.setdefault(find(s.id), []).append(s)

    groups = []
    for recs in clusters.values():
        if len(recs) < 2:
            continue
        worst, reason, worst_paid = None, "", 0
        for is_grad, label in ((False, "enrolled"), (True, "graduate")):
            same = [r for r in recs if r.is_graduate == is_grad]
            if len(same) < 2:
                continue
            paid = [r for r in same if r.payment_status in ("paid", "partial")]
            pending = [r for r in same if r.payment_status not in ("paid", "partial")]
            if len(paid) >= 2:
                risk = "double_paid"
                r_reason = f"Paid {len(paid)} times as {label} ({', '.join(sorted(r.month for r in paid))}) — check whether this was a double payment."
            elif len(paid) == 1:
                risk = "at_risk"
                r_reason = (f"Already paid as {label} in {paid[0].month}; another {label} record "
                            f"({', '.join(sorted(r.month for r in pending))}) is still pending — paying it would be a double payment.")
            else:
                risk = "repeat"
                r_reason = f"Entered {len(same)} times as {label} ({', '.join(sorted(r.month for r in same))}), nothing paid yet — likely a double entry."
            if worst is None or RISK_RANK[risk] > RISK_RANK[worst]:
                worst, reason, worst_paid = risk, r_reason, len(paid)
        if worst is None:
            continue
        emails = [r.email.strip().lower() for r in recs if r.email and r.email.strip()]
        by_email = any(emails.count(e) >= 2 for e in set(emails))
        groups.append(DuplicateGroup(
            match_key=(emails[0] if by_email else norm_name(recs[0].name)),
            match_type="email" if by_email else "name",
            risk=worst,
            reason=reason,
            paid_or_partial_count=sum(1 for r in recs if r.payment_status in ("paid", "partial")),
            records=sorted(recs, key=lambda r: (r.month, r.id), reverse=True),
        ))

    groups.sort(key=lambda g: (RISK_RANK[g.risk], len(g.records)), reverse=True)
    return DuplicateReport(
        students_checked=len(students),
        months_checked=len({s.month for s in students}),
        groups=groups,
    )

@app.post("/api/v1/students/{student_id}/payment", response_model=StudentResponse)
def record_payment(
    student_id: int,
    payment: PaymentUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a commission pending / partly paid / paid (Admin/Marcelo). Warns before double payments."""
    require_manager(user)
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return apply_payment(db, user, student, payment.payment_status, payment.paid_amount, payment.confirm_duplicate)

@app.get("/api/v1/students/{student_id}", response_model=StudentResponse)
def get_student(student_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get student details"""
    student = scope_students(db.query(Student), user).filter(Student.id == student_id).first()
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
    if user.role not in MANAGERS:
        raise HTTPException(status_code=403, detail="Only Admin or Marcelo can edit records")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    update_data = update.dict(exclude_unset=True)
    old_month, old_rep = student.month, student.rep_id
    old_commission = student.commission_amount or 0.0

    # Payment fields go through the same guarded path as the "Record payment" action
    pay_status = update_data.pop("payment_status", None)
    pay_amount = update_data.pop("paid_amount", None)
    confirm_dup = update_data.pop("confirm_duplicate", False)

    # --- Commission month change (super admin only) ---
    new_month = update_data.pop("month", None)
    if new_month is not None and new_month != old_month:
        if user.role != "MARCELO":
            raise HTTPException(status_code=403, detail="Only the super admin can change a record's commission month")
        check_month(new_month)
        if student.email:
            clash = db.query(Student).filter(
                Student.email == student.email,
                Student.month == new_month,
                Student.id != student.id,
            ).first()
            if clash:
                raise HTTPException(
                    status_code=400,
                    detail=f"{student.email} already has a record in {new_month} — delete or merge that one first",
                )
        student.month = new_month
    else:
        new_month = None

    # --- Reassign to a different rep (location follows the rep) ---
    new_rep_id = update_data.pop("rep_id", None)
    if new_rep_id is not None and new_rep_id != old_rep:
        rep = get_rep(db, new_rep_id)
        student.rep_id = rep.id
        student.location = rep.location or "USA"
    else:
        new_rep_id = None

    for field, value in update_data.items():
        setattr(student, field, value)

    # Recalculate commission if tuition or percentage changed
    if "tuition_amount" in update_data or "commission_percentage" in update_data:
        student.commission_amount = student.tuition_amount * (student.commission_percentage / 100)
        # A commission raised after it was fully paid leaves the difference still owed
        if student.payment_status == "paid" and student.commission_amount > old_commission + 0.005:
            student.payment_status = "partial"
            student.paid_amount = old_commission

    db.commit()
    db.refresh(student)

    if pay_status is not None and (pay_status != student.payment_status or pay_amount is not None):
        apply_payment(db, user, student, pay_status, pay_amount, confirm_dup)

    # Keep stored approval totals in sync with the records actually in each rep-month
    refresh_approval_total(db, student.month, student.rep_id)
    if new_month or new_rep_id:
        refresh_approval_total(db, old_month, old_rep)

    changed = list(update_data.keys())
    if new_month:
        changed.append(f"month {old_month} → {new_month}")
    if new_rep_id:
        changed.append(f"rep → {student.rep_name}")
    log_action(db, user, "update", "Student", student.id, f"Updated fields: {', '.join(changed)}", student.month)

    return student

@app.delete("/api/v1/students/{student_id}")
def delete_student(student_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete student (Admin/Marcelo only)"""
    if user.role not in MANAGERS:
        raise HTTPException(status_code=403, detail="Only Admin or Marcelo can delete records")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    month, rep_id, name = student.month, student.rep_id, student.name
    db.delete(student)
    db.commit()

    refresh_approval_total(db, month, rep_id)
    log_action(db, user, "delete", "Student", student_id, f"Deleted {name}", month)

    return {"message": "Student deleted"}

# ==================== APPROVAL ENDPOINTS ====================

@app.post("/api/v1/approvals/submit", response_model=ApprovalResponse)
def submit_for_approval(approval: ApprovalCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """A rep submits their own month for review"""
    if user.role != "ADMISSIONS_REP":
        raise HTTPException(status_code=403, detail="Only admissions reps can submit")
    check_month(approval.month)

    apr = db.query(Approval).filter(Approval.month == approval.month, Approval.rep_id == user.id).first()
    if not apr:
        apr = Approval(month=approval.month, rep_id=user.id, location=user.location or "USA")
        db.add(apr)
        db.commit()

    total = db.query(func.coalesce(func.sum(Student.commission_amount), 0.0)).filter(
        Student.month == approval.month, Student.rep_id == user.id
    ).scalar()

    apr.status = "submitted"
    apr.rep_submitted_at = datetime.utcnow()
    apr.total_commission = float(total or 0.0)
    db.commit()
    db.refresh(apr)

    log_action(db, user, "submit", "Approval", apr.id, "Submitted for review", approval.month)
    return apr

@app.post("/api/v1/approvals/approve", response_model=ApprovalResponse)
def approve_commission(approval: ApprovalCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Final approval of one rep's month by Marcelo"""
    if user.role != "MARCELO":
        raise HTTPException(status_code=403, detail="Only Marcelo can approve")

    q = db.query(Approval).filter(Approval.month == approval.month)
    if approval.rep_id:
        q = q.filter(Approval.rep_id == approval.rep_id)
    matches = q.all()
    if not matches:
        raise HTTPException(status_code=404, detail="Nothing submitted for that month")
    if len(matches) > 1:
        raise HTTPException(status_code=422, detail="Several reps submitted this month — specify which rep to approve")
    apr = matches[0]

    apr.status = "approved"
    apr.marcelo_approved_at = datetime.utcnow()
    db.commit()
    db.refresh(apr)

    log_action(db, user, "approve", "Approval", apr.id, f"Approved by Marcelo ({apr.rep_name})", approval.month)
    return apr

@app.get("/api/v1/approvals/history", response_model=list[ApprovalResponse])
def approval_history(
    location: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Approval history (reps: their own; managers: optionally one location)"""
    check_location(location)
    q = db.query(Approval)
    if user.role == "ADMISSIONS_REP":
        q = q.filter(Approval.rep_id == user.id)
    elif location:
        q = q.filter(Approval.location == location)
    return q.order_by(Approval.month.desc(), Approval.location, Approval.rep_id).all()

@app.get("/api/v1/approvals/month/{month}", response_model=list[RepMonthSummary])
def approvals_for_month(
    month: str,
    location: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One row per rep for a month — totals and approval status (Admin/Marcelo)"""
    require_manager(user)
    check_month(month)
    check_location(location)

    students = scope_students(db.query(Student).filter(Student.month == month), user, location).all()
    approvals = {a.rep_id: a for a in db.query(Approval).filter(Approval.month == month).all()}

    reps_q = db.query(User).filter(User.role == "ADMISSIONS_REP")
    if location:
        reps_q = reps_q.filter(User.location == location)
    reps = {r.id: r for r in reps_q.all()}
    # Include inactive reps only if they have records or a submission this month
    active_ids = {r.id for r in reps.values() if r.is_active}
    rep_ids = active_ids | {s.rep_id for s in students} | {rid for rid in approvals if rid in reps}

    rows = []
    for rid in rep_ids:
        rep = reps.get(rid) or db.query(User).filter(User.id == rid).first()
        if not rep:
            continue
        mine = [s for s in students if s.rep_id == rid]
        apr = approvals.get(rid)
        rows.append(RepMonthSummary(
            rep_id=rid,
            rep_name=rep.display_name,
            location=rep.location or "USA",
            enrolled_count=sum(1 for s in mine if not s.is_graduate),
            graduate_count=sum(1 for s in mine if s.is_graduate),
            total_tuition=sum(s.tuition_amount or 0 for s in mine),
            total_commission=sum(s.commission_amount or 0 for s in mine),
            total_paid=sum(s.paid_total for s in mine),
            total_outstanding=month_totals(mine)["outstanding"],
            approval_status=apr.status if apr else "draft",
            submitted_at=apr.rep_submitted_at if apr else None,
            approved_at=apr.marcelo_approved_at if apr else None,
        ))
    return sorted(rows, key=lambda r: (r.location, r.rep_name.lower()))

# ==================== REPORT ENDPOINTS ====================

def _build_report(db: Session, user: User, month: str, location: Optional[str], rep_id: Optional[int]) -> MonthlyReportResponse:
    students = scope_students(db.query(Student).filter(Student.month == month), user, location, rep_id).all()
    enrolled = [s for s in students if not s.is_graduate]
    graduates = [s for s in students if s.is_graduate]

    total_enrolled_tuition = sum(s.tuition_amount for s in enrolled)
    total_enrolled_commission = sum(s.commission_amount for s in enrolled)
    total_graduate_tuition = sum(s.tuition_amount for s in graduates)
    total_graduate_commission = sum(s.commission_amount for s in graduates)

    # Approval status is per rep; for a multi-rep view report the least-advanced one
    apr_q = db.query(Approval).filter(Approval.month == month)
    if user.role == "ADMISSIONS_REP":
        apr_q = apr_q.filter(Approval.rep_id == user.id)
    else:
        if rep_id:
            apr_q = apr_q.filter(Approval.rep_id == rep_id)
        if location:
            apr_q = apr_q.filter(Approval.location == location)
    aprs = apr_q.all()
    if user.role == "ADMISSIONS_REP" or rep_id:
        apr = aprs[0] if aprs else None
        status_ = apr.status if apr else "draft"
        submitted, approved = (apr.rep_submitted_at, apr.marcelo_approved_at) if apr else (None, None)
    else:
        order = {"draft": 0, "submitted": 1, "approved": 2}
        rep_ids = {s.rep_id for s in students}
        statuses = [next((a.status for a in aprs if a.rep_id == r), "draft") for r in rep_ids] or ["draft"]
        status_ = min(statuses, key=lambda s: order.get(s, 0))
        submitted = max((a.rep_submitted_at for a in aprs if a.rep_submitted_at), default=None)
        approved = max((a.marcelo_approved_at for a in aprs if a.marcelo_approved_at), default=None)

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
        total_paid=month_totals(students)["paid"],
        total_outstanding=month_totals(students)["outstanding"],
        approval_status=status_,
        submitted_at=submitted,
        approved_at=approved,
    )

@app.get("/api/v1/reports/monthly/{month}", response_model=MonthlyReportResponse)
def monthly_report(
    month: str,
    location: Optional[str] = None,
    rep_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Monthly report (reps: their own; managers: filter by location / rep)"""
    check_location(location)
    return _build_report(db, user, month, location, rep_id)

@app.get("/api/v1/reports/all", response_model=list[MonthlyReportResponse])
def all_reports(
    location: Optional[str] = None,
    rep_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All monthly reports"""
    check_location(location)
    months = scope_students(db.query(Student.month), user, location, rep_id).distinct().order_by(Student.month.desc()).all()
    return [_build_report(db, user, m, location, rep_id) for (m,) in months]

# ==================== DASHBOARD ====================

@app.get("/api/v1/dashboard/data")
def dashboard_data(
    from_month: Optional[str] = None,
    to_month: Optional[str] = None,
    location: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All records (optionally within a month range / location) plus per-rep approval
    statuses, for the dashboard. The frontend slices and aggregates these, so any
    filter/breakdown can be added there without a new endpoint. Admin/Marcelo only."""
    require_manager(user)
    for m in (from_month, to_month):
        if m:
            check_month(m)
    check_location(location)

    q = scope_students(db.query(Student), user, location)
    if from_month:
        q = q.filter(Student.month >= from_month)
    if to_month:
        q = q.filter(Student.month <= to_month)
    students = q.order_by(Student.month).all()

    apr_q = db.query(Approval)
    if location:
        apr_q = apr_q.filter(Approval.location == location)
    approvals = [
        {"month": a.month, "rep_id": a.rep_id, "location": a.location, "status": a.status}
        for a in apr_q.all()
    ]

    return {
        "records": [StudentResponse.model_validate(s).model_dump(mode="json") for s in students],
        "approvals": approvals,
    }

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
        "version": "1.1.0",
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
