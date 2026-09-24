from pydantic import BaseModel, EmailStr
from datetime import date, datetime
from typing import Optional

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    role: str = "ADMISSIONS_REP"  # ADMISSIONS_REP, ADMIN, MARCELO
    full_name: Optional[str] = None
    location: str = "USA"  # USA, LATAM

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    location: Optional[str] = None
    is_active: Optional[bool] = None
    new_password: Optional[str] = None  # set by Marcelo to reset someone's password

class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    display_name: str
    role: str
    location: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class StudentCreate(BaseModel):
    name: str
    program: str
    start_date: date
    graduation_date: Optional[date] = None
    tuition_amount: float
    commission_percentage: float
    payment_type: str  # cash, financed, other
    status: str  # active, graduated, dropped, pending
    email: Optional[str] = None
    is_graduate: bool = False
    month: str  # YYYY-MM format
    # Admin/Marcelo must say which rep a record belongs to; reps always own what they add
    rep_id: Optional[int] = None

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    program: Optional[str] = None
    tuition_amount: Optional[float] = None
    commission_percentage: Optional[float] = None
    payment_type: Optional[str] = None
    status: Optional[str] = None
    graduation_date: Optional[date] = None
    is_graduate: Optional[bool] = None
    # Commission month (YYYY-MM). Only the super admin (MARCELO) may change it —
    # used to fix records a rep filed under the wrong month.
    month: Optional[str] = None
    # Reassign to a different admissions rep (Admin/Marcelo); location follows the rep
    rep_id: Optional[int] = None

class StudentResponse(BaseModel):
    id: int
    name: str
    program: str
    start_date: date
    graduation_date: Optional[date]
    tuition_amount: float
    commission_percentage: float
    commission_amount: float
    payment_type: str
    status: str
    is_graduate: bool
    month: str
    email: Optional[str] = None
    rep_id: Optional[int] = None
    rep_name: Optional[str] = None
    location: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ApprovalCreate(BaseModel):
    month: str  # YYYY-MM
    rep_id: Optional[int] = None  # required when Marcelo approves; ignored when a rep submits

class ApprovalResponse(BaseModel):
    id: int
    month: str
    rep_id: Optional[int] = None
    rep_name: Optional[str] = None
    location: Optional[str] = None
    status: str
    total_commission: float
    rep_submitted_at: Optional[datetime]
    admin_reviewed_at: Optional[datetime]
    marcelo_approved_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True

class MonthlyReportResponse(BaseModel):
    month: str
    enrolled_count: int
    graduate_count: int
    total_enrolled_tuition: float
    total_enrolled_commission: float
    total_graduate_tuition: float
    total_graduate_commission: float
    total_tuition: float
    total_commission: float
    approval_status: str
    submitted_at: Optional[datetime]
    approved_at: Optional[datetime]

class RepMonthSummary(BaseModel):
    rep_id: int
    rep_name: str
    location: str
    enrolled_count: int
    graduate_count: int
    total_tuition: float
    total_commission: float
    approval_status: str
    submitted_at: Optional[datetime]
    approved_at: Optional[datetime]
