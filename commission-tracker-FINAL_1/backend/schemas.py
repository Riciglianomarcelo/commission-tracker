from pydantic import BaseModel, EmailStr
from datetime import date, datetime
from typing import Optional

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    role: str  # ADMISSIONS_REP, ADMIN, MARCELO

class UserLogin(BaseModel):
    username: str
    password: str

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

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    program: Optional[str] = None
    tuition_amount: Optional[float] = None
    commission_percentage: Optional[float] = None
    payment_type: Optional[str] = None
    status: Optional[str] = None

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
    created_at: datetime

    class Config:
        from_attributes = True

class ApprovalCreate(BaseModel):
    month: str  # YYYY-MM

class ApprovalResponse(BaseModel):
    id: int
    month: str
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
