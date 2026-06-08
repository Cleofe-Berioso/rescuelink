"""
Django settings for config project.
"""

import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def _csv_env(name, default=""):
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _env_bool(name, default="False"):
    return os.environ.get(name, default).lower() in ("true", "1", "yes")


SECRET_KEY = os.environ.get("SECRET_KEY", "django-insecure-change-me-in-production")
DEBUG = _env_bool("DEBUG", "True")

ALLOWED_HOSTS = _csv_env("ALLOWED_HOSTS")

if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = [
        "127.0.0.1",
        "localhost",
        "rescuelink-backend-biwl.onrender.com",
    ]
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


def _database_from_url(database_url: str) -> dict:
    parsed = urlparse(database_url)
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": (parsed.path or "").lstrip("/"),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or "5432"),
        "OPTIONS": {
            "sslmode": os.environ.get("DB_SSLMODE", "require"),
        },
    }


_database_url = os.environ.get("DATABASE_URL", "").strip()
if _database_url:
    DATABASES = {"default": _database_from_url(_database_url)}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["DB_NAME"],
            "USER": os.environ["DB_USER"],
            "PASSWORD": os.environ["DB_PASSWORD"],
            "HOST": os.environ["DB_HOST"],
            "PORT": os.environ.get("DB_PORT", "5432"),
            "OPTIONS": {
                "sslmode": os.environ.get("DB_SSLMODE", "require"),
            },
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

MEDIA_URL = "/uploads/"
MEDIA_ROOT = BASE_DIR.parent / ".uploads"

CORS_ALLOW_ALL_ORIGINS = DEBUG and not _csv_env("CORS_ALLOWED_ORIGINS")
CORS_ALLOWED_ORIGINS = _csv_env("CORS_ALLOWED_ORIGINS")

CSRF_TRUSTED_ORIGINS = _csv_env("CSRF_TRUSTED_ORIGINS")

MAX_EMERGENCY_PHOTO_BYTES = int(
    os.environ.get("MAX_EMERGENCY_PHOTO_BYTES", str(5 * 1024 * 1024))
)
MAX_EMERGENCY_PHOTOS = int(os.environ.get("MAX_EMERGENCY_PHOTOS", "5"))

DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_EMERGENCY_PHOTO_BYTES + (512 * 1024)
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_EMERGENCY_PHOTO_BYTES

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": int(os.environ.get("API_PAGE_SIZE", "50")),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("THROTTLE_ANON", "60/hour"),
        "user": os.environ.get("THROTTLE_USER", "600/hour"),
        "login": os.environ.get("THROTTLE_LOGIN", "10/minute"),
        "registration": os.environ.get("THROTTLE_REGISTRATION", "5/hour"),
        "report_create": os.environ.get("THROTTLE_REPORT_CREATE", "10/hour"),
        "image_upload": os.environ.get("THROTTLE_IMAGE_UPLOAD", "20/hour"),
        "staff_action": os.environ.get("THROTTLE_STAFF_ACTION", "120/hour"),
        "admin_action": os.environ.get("THROTTLE_ADMIN_ACTION", "120/hour"),
    },
    "EXCEPTION_HANDLER": "api.exceptions.custom_exception_handler",
}

JWT_ACCESS_HOURS = int(os.environ.get("JWT_ACCESS_TOKEN_HOURS", "1"))
JWT_REFRESH_DAYS = int(os.environ.get("JWT_REFRESH_TOKEN_DAYS", "7"))

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=JWT_ACCESS_HOURS),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=JWT_REFRESH_DAYS),
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

SUPABASE_PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "")
SUPABASE_STORAGE_ENDPOINT = os.environ.get("SUPABASE_STORAGE_ENDPOINT", "")
SUPABASE_STORAGE_REGION = os.environ.get("SUPABASE_STORAGE_REGION", "ap-northeast-1")
SUPABASE_S3_ACCESS_KEY_ID = os.environ.get("SUPABASE_S3_ACCESS_KEY_ID", "")
SUPABASE_S3_SECRET_ACCESS_KEY = os.environ.get("SUPABASE_S3_SECRET_ACCESS_KEY", "")
SUPABASE_STORAGE_BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "emergency-photos")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")
OPENROUTER_FALLBACK_MODEL = os.environ.get("OPENROUTER_FALLBACK_MODEL", "nvidia/nemotron-3-super:free")
OPENROUTER_SAFETY_MODEL = os.environ.get("OPENROUTER_SAFETY_MODEL", "nvidia/nemotron-3.5-content-safety:free")
OPENROUTER_SITE_URL = os.environ.get("OPENROUTER_SITE_URL", "http://localhost:5173")
OPENROUTER_APP_NAME = os.environ.get("OPENROUTER_APP_NAME", "RescueLink")
AI_PRIORITY_ENABLED = _env_bool("AI_PRIORITY_ENABLED", "True")
AI_ABUSE_DETECTION_ENABLED = _env_bool("AI_ABUSE_DETECTION_ENABLED", "True")
AI_PRIORITY_TIMEOUT_SECONDS = int(os.environ.get("AI_PRIORITY_TIMEOUT_SECONDS", "20"))
AI_REVIEW_THRESHOLD = int(os.environ.get("AI_REVIEW_THRESHOLD", "70"))
AI_AUTO_SUSPEND_THRESHOLD = int(os.environ.get("AI_AUTO_SUSPEND_THRESHOLD", "90"))

DJANGO_ADMIN_URL = os.environ.get("DJANGO_ADMIN_URL", "admin/").strip("/") + "/"

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", "True")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", "True")
    SECURE_HSTS_PRELOAD = _env_bool("SECURE_HSTS_PRELOAD", "True")
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    X_FRAME_OPTIONS = "DENY"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {
            "format": "{levelname} {asctime} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
    },
    "loggers": {
        "rescuelink.security": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
