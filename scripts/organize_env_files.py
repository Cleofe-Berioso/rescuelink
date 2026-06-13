"""Reorganize RescueLink .env files without printing secret values."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

BACKEND_SECTIONS: list[tuple[str, list[str]]] = [
    (
        "Django Core",
        [
            "SECRET_KEY",
            "DEBUG",
            "ALLOWED_HOSTS",
            "DJANGO_ADMIN_URL",
        ],
    ),
    (
        "Security / HTTPS",
        [
            "SECURE_SSL_REDIRECT",
            "SECURE_HSTS_SECONDS",
            "SECURE_HSTS_INCLUDE_SUBDOMAINS",
            "SECURE_HSTS_PRELOAD",
            "CSRF_TRUSTED_ORIGINS",
            "CORS_ALLOWED_ORIGINS",
        ],
    ),
    (
        "Database",
        [
            "DATABASE_URL",
            "DB_HOST",
            "DB_PORT",
            "DB_NAME",
            "DB_USER",
            "DB_PASSWORD",
            "DB_SSLMODE",
        ],
    ),
    (
        "Supabase Storage",
        [
            "SUPABASE_PROJECT_REF",
            "SUPABASE_STORAGE_ENDPOINT",
            "SUPABASE_STORAGE_REGION",
            "SUPABASE_STORAGE_BUCKET",
            "SUPABASE_S3_ACCESS_KEY_ID",
            "SUPABASE_S3_SECRET_ACCESS_KEY",
        ],
    ),
    (
        "JWT",
        ["JWT_ACCESS_TOKEN_HOURS", "JWT_REFRESH_TOKEN_DAYS"],
    ),
    (
        "API / Pagination / Throttling",
        [
            "API_PAGE_SIZE",
            "THROTTLE_ANON",
            "THROTTLE_USER",
            "THROTTLE_LOGIN",
            "THROTTLE_REGISTRATION",
            "THROTTLE_REPORT_CREATE",
            "THROTTLE_IMAGE_UPLOAD",
            "THROTTLE_STAFF_ACTION",
            "THROTTLE_ADMIN_ACTION",
        ],
    ),
    (
        "Rule-Based Triage / Manual Review",
        [
            "RULE_BASED_TRIAGE_ENABLED",
            "DUPLICATE_REPORT_CHECK_ENABLED",
            "MANUAL_ABUSE_REVIEW_ENABLED",
            "ABUSE_REVIEW_THRESHOLD",
            "ABUSE_AUTO_SUSPEND_THRESHOLD",
        ],
    ),
    (
        "Upload Limits",
        ["MAX_EMERGENCY_PHOTO_BYTES", "MAX_EMERGENCY_PHOTOS"],
    ),
]

FRONTEND_SECTIONS = [("API", ["VITE_API_BASE_URL"])]
MOBILE_SECTIONS = [
    ("API", ["EXPO_PUBLIC_API_BASE_URL"]),
    ("Maps", ["EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"]),
]

BACKEND_USED = {key for _, keys in BACKEND_SECTIONS for key in keys}
FRONTEND_USED = {key for _, keys in FRONTEND_SECTIONS for key in keys}
MOBILE_USED = {key for _, keys in MOBILE_SECTIONS for key in keys}


def parse_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value
    return values


def render_env(
    sections: list[tuple[str, list[str]]],
    values: dict[str, str],
    *,
    header: str,
    footer: str = "",
) -> str:
    lines = [header.rstrip(), ""]
    ordered_keys: list[str] = []

    for title, keys in sections:
        lines.append("# =========================")
        lines.append(f"# {title}")
        lines.append("# =========================")
        lines.append("")
        for key in keys:
            ordered_keys.append(key)
            lines.append(f"{key}={values.get(key, '')}")
        lines.append("")

    extras = sorted(set(values) - set(ordered_keys))
    if extras:
        lines.append("# =========================")
        lines.append("# Additional (present in file, keep for safety)")
        lines.append("# =========================")
        lines.append("")
        for key in extras:
            lines.append(f"{key}={values[key]}")
        lines.append("")

    if footer:
        lines.append(footer.rstrip())
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_backend_env() -> tuple[list[str], list[str], list[str]]:
    path = ROOT / "backend" / ".env"
    values = parse_env(path)
    missing = sorted(BACKEND_USED - set(values))
    unused = sorted(set(values) - BACKEND_USED)
    duplicates_removed = []

    content = render_env(
        BACKEND_SECTIONS,
        values,
        header=(
            "# RescueLink backend — local development environment\n"
            "# Real secrets live here only. Do not commit this file.\n"
            "# Production values belong in Render Dashboard (not localhost URLs)."
        ),
        footer=(
            "# Production notes (Render):\n"
            "# - DEBUG=False\n"
            "# - ALLOWED_HOSTS=<render-hostname-only>\n"
            "# - CORS_ALLOWED_ORIGINS=https://<vercel-frontend-domain>\n"
            "# - CSRF_TRUSTED_ORIGINS=https://<vercel-frontend-domain>\n"
            "# - DATABASE_URL=<DATABASE_URL> OR keep DB_* vars"
        ),
    )
    path.write_text(content, encoding="utf-8")
    return missing, unused, duplicates_removed


def write_frontend_env_local() -> tuple[list[str], list[str]]:
    path = ROOT / "frontend" / ".env.local"
    values = parse_env(path)
    if not values.get("VITE_API_BASE_URL"):
        values["VITE_API_BASE_URL"] = "http://127.0.0.1:8000/api"

    missing = sorted(FRONTEND_USED - set(values))
    unused = sorted(set(values) - FRONTEND_USED)

    content = render_env(
        FRONTEND_SECTIONS,
        values,
        header=(
            "# RescueLink frontend — local development environment\n"
            "# Vite loads .env.local automatically. Do not commit this file.\n"
            "# Production: set VITE_API_BASE_URL in Vercel (https://<render-host>/api)."
        ),
        footer=(
            "# Production example (Vercel only — do not use localhost):\n"
            "# VITE_API_BASE_URL=https://<render-backend-hostname>/api"
        ),
    )
    path.write_text(content, encoding="utf-8")
    return missing, unused


def write_mobile_env() -> tuple[list[str], list[str]]:
    path = ROOT / "mobile" / ".env"
    values = parse_env(path)
    if not values.get("EXPO_PUBLIC_API_BASE_URL"):
        values["EXPO_PUBLIC_API_BASE_URL"] = "http://127.0.0.1:8000/api"

    missing = sorted(MOBILE_USED - set(values))
    unused = sorted(set(values) - MOBILE_USED)

    content = render_env(
        MOBILE_SECTIONS,
        values,
        header=(
            "# RescueLink mobile — local development environment\n"
            "# Do not commit this file. Use LAN IP instead of 127.0.0.1 on physical devices.\n"
            "# Production: set in eas.json or EAS Secrets (https://<render-host>/api)."
        ),
        footer=(
            "# Production example (EAS build only — do not use localhost):\n"
            "# EXPO_PUBLIC_API_BASE_URL=https://<render-backend-hostname>/api"
        ),
    )
    path.write_text(content, encoding="utf-8")
    return missing, unused


def write_examples() -> None:
    backend_example = render_env(
        BACKEND_SECTIONS,
        {key: "" for key in BACKEND_USED},
        header=(
            "# RescueLink backend — safe example (copy to backend/.env for local dev)\n"
            "# Replace placeholders. Production secrets go in Render Dashboard only."
        ),
        footer=(
            "# Local development examples:\n"
            "# DEBUG=True\n"
            "# ALLOWED_HOSTS=127.0.0.1,localhost\n"
            "# CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173\n"
            "# CSRF_TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173\n"
            "#\n"
            "# Production (Render) examples:\n"
            "# SECRET_KEY=<SECRET_KEY>\n"
            "# DEBUG=False\n"
            "# ALLOWED_HOSTS=<render-backend-hostname>\n"
            "# DATABASE_URL=<DATABASE_URL>\n"
            "# CORS_ALLOWED_ORIGINS=https://<vercel-frontend-domain>\n"
            "# CSRF_TRUSTED_ORIGINS=https://<vercel-frontend-domain>\n"
            "# SECURE_SSL_REDIRECT=True"
        ),
    )
    # Fill safe non-secret placeholders
    placeholder_overrides = {
        "SECRET_KEY": "your-django-secret-key",
        "DEBUG": "True",
        "ALLOWED_HOSTS": "127.0.0.1,localhost",
        "DJANGO_ADMIN_URL": "admin/",
        "DB_HOST": "db.your-project-ref.supabase.co",
        "DB_PORT": "5432",
        "DB_NAME": "postgres",
        "DB_USER": "postgres",
        "DB_PASSWORD": "your-database-password",
        "DB_SSLMODE": "require",
        "SUPABASE_PROJECT_REF": "your-project-ref",
        "SUPABASE_STORAGE_ENDPOINT": "https://your-project-ref.storage.supabase.co/storage/v1/s3",
        "SUPABASE_STORAGE_REGION": "ap-northeast-1",
        "SUPABASE_STORAGE_BUCKET": "emergency-photos",
        "SUPABASE_S3_ACCESS_KEY_ID": "your-s3-access-key-id",
        "SUPABASE_S3_SECRET_ACCESS_KEY": "your-s3-secret-access-key",
        "RULE_BASED_TRIAGE_ENABLED": "True",
        "DUPLICATE_REPORT_CHECK_ENABLED": "True",
        "MANUAL_ABUSE_REVIEW_ENABLED": "True",
        "ABUSE_REVIEW_THRESHOLD": "70",
        "ABUSE_AUTO_SUSPEND_THRESHOLD": "90",
        "MAX_EMERGENCY_PHOTO_BYTES": "5242880",
        "MAX_EMERGENCY_PHOTOS": "5",
        "JWT_ACCESS_TOKEN_HOURS": "1",
        "JWT_REFRESH_TOKEN_DAYS": "7",
        "API_PAGE_SIZE": "50",
        "THROTTLE_ANON": "60/hour",
        "THROTTLE_USER": "600/hour",
        "THROTTLE_LOGIN": "10/minute",
        "THROTTLE_REGISTRATION": "5/hour",
        "THROTTLE_REPORT_CREATE": "10/hour",
        "THROTTLE_IMAGE_UPLOAD": "20/hour",
        "THROTTLE_STAFF_ACTION": "120/hour",
        "THROTTLE_ADMIN_ACTION": "120/hour",
        "CORS_ALLOWED_ORIGINS": "http://localhost:5173,http://127.0.0.1:5173",
        "CSRF_TRUSTED_ORIGINS": "http://localhost:5173,http://127.0.0.1:5173",
    }
    lines = backend_example.splitlines()
    out_lines = []
    for line in lines:
        if "=" in line and not line.strip().startswith("#"):
            key, _ = line.split("=", 1)
            key = key.strip()
            if key in placeholder_overrides:
                out_lines.append(f"{key}={placeholder_overrides[key]}")
                continue
        out_lines.append(line)
    (ROOT / "backend" / ".env.example").write_text("\n".join(out_lines).rstrip() + "\n", encoding="utf-8")

    frontend_example = render_env(
        FRONTEND_SECTIONS,
        {"VITE_API_BASE_URL": "http://127.0.0.1:8000/api"},
        header=(
            "# RescueLink frontend — safe example (copy to frontend/.env.local)\n"
            "# Production value is set in Vercel Dashboard."
        ),
        footer="# Production: VITE_API_BASE_URL=https://<render-backend-hostname>/api",
    )
    (ROOT / "frontend" / ".env.example").write_text(frontend_example, encoding="utf-8")

    mobile_example = render_env(
        MOBILE_SECTIONS,
        {
            "EXPO_PUBLIC_API_BASE_URL": "http://127.0.0.1:8000/api",
            "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY": "",
        },
        header=(
            "# RescueLink mobile — safe example (copy to mobile/.env)\n"
            "# Production values go in eas.json or EAS Secrets."
        ),
        footer="# Production: EXPO_PUBLIC_API_BASE_URL=https://<render-backend-hostname>/api",
    )
    (ROOT / "mobile" / ".env.example").write_text(mobile_example, encoding="utf-8")


def main() -> None:
    b_missing, b_unused, _ = write_backend_env()
    f_missing, f_unused = write_frontend_env_local()
    m_missing, m_unused = write_mobile_env()
    write_examples()

    print("organized: backend/.env, frontend/.env.local, mobile/.env, *.env.example")
    print("backend_missing:", ",".join(b_missing) or "none")
    print("backend_unused:", ",".join(b_unused) or "none")
    print("frontend_missing:", ",".join(f_missing) or "none")
    print("frontend_unused:", ",".join(f_unused) or "none")
    print("mobile_missing:", ",".join(m_missing) or "none")
    print("mobile_unused:", ",".join(m_unused) or "none")


if __name__ == "__main__":
    main()
