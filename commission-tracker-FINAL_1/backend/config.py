from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/commissions_db")
    jwt_secret: str = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720  # 12 hours — this is an internal tool used through a work day
    refresh_token_expire_days: int = 7
    environment: str = os.getenv("ENVIRONMENT", "development")

    class Config:
        env_file = ".env"

settings = Settings()
