from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()

# Locations a rep (and their records) can belong to
LOCATIONS = ("USA", "LATAM")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    full_name = Column(String, nullable=True)
    password_hash = Column(String)
    role = Column(String)  # ADMISSIONS_REP, ADMIN, MARCELO
    # Only meaningful for ADMISSIONS_REP — Admin/Marcelo see every location
    location = Column(String, default="USA", index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    students = relationship("Student", back_populates="created_by_user", foreign_keys="Student.created_by")

    @property
    def display_name(self):
        return self.full_name or self.username

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
    payment_status = Column(String, default="pending")  # paid, partial, pending — has the commission actually been paid out
    month = Column(String, index=True)  # Format: YYYY-MM (e.g., "2026-09")
    is_graduate = Column(Boolean, default=False)
    commission_amount = Column(Float, default=0.0)

    # The admissions rep this commission belongs to, and that rep's location
    rep_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    location = Column(String, default="USA", index=True)
    rep = relationship("User", foreign_keys=[rep_id])

    created_by = Column(Integer, ForeignKey("users.id"))
    created_by_user = relationship("User", back_populates="students", foreign_keys=[created_by])
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def rep_name(self):
        return self.rep.display_name if self.rep else None

class Approval(Base):
    """One approval per rep per month."""
    __tablename__ = "approvals"
    __table_args__ = (UniqueConstraint('month', 'rep_id', name='uq_approval_month_rep'),)

    id = Column(Integer, primary_key=True)
    month = Column(String, index=True)  # YYYY-MM
    rep_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    location = Column(String, default="USA", index=True)
    status = Column(String, default="draft")  # draft, submitted, approved
    rep_submitted_at = Column(DateTime, nullable=True)
    admin_reviewed_at = Column(DateTime, nullable=True)
    marcelo_approved_at = Column(DateTime, nullable=True)
    total_commission = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    rep = relationship("User", foreign_keys=[rep_id])

    @property
    def rep_name(self):
        return self.rep.display_name if self.rep else None

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
