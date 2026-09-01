from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String)  # ADMISSIONS_REP, ADMIN, MARCELO
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    students = relationship("Student", back_populates="created_by_user")

class StudentStatus(str, enum.Enum):
    ACTIVE = "active"
    GRADUATED = "graduated"
    DROPPED = "dropped"
    PENDING = "pending"

class PaymentType(str, enum.Enum):
    CASH = "cash"
    FINANCED = "financed"
    OTHER = "other"

class Student(Base):
    __tablename__ = "students"
    __table_args__ = (UniqueConstraint('email', 'month', name='uq_student_email_month'),)

    id = Column(Integer, primary_key=True)
    email = Column(String, nullable=True, index=True)  # For duplicate prevention
    name = Column(String, index=True)
    program = Column(String)
    start_date = Column(Date)
    graduation_date = Column(Date, nullable=True)
    tuition_amount = Column(Float)
    commission_percentage = Column(Float)
    payment_type = Column(String)  # cash, financed, other
    status = Column(String)  # active, graduated, dropped, pending
    month = Column(String, index=True)  # Format: YYYY-MM (e.g., "2026-09")
    is_graduate = Column(Boolean, default=False)
    commission_amount = Column(Float, default=0.0)

    created_by = Column(Integer, ForeignKey("users.id"))
    created_by_user = relationship("User", back_populates="students")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Approval(Base):
    __tablename__ = "approvals"

    id = Column(Integer, primary_key=True)
    month = Column(String, unique=True, index=True)  # YYYY-MM
    status = Column(String, default="draft")  # draft, submitted, approved
    rep_submitted_at = Column(DateTime, nullable=True)
    admin_reviewed_at = Column(DateTime, nullable=True)
    marcelo_approved_at = Column(DateTime, nullable=True)
    total_commission = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String)  # create, update, delete, approve, submit
    entity_type = Column(String)  # Student, Approval, etc
    entity_id = Column(Integer)
    changes = Column(String)  # JSON string of what changed
    month = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
