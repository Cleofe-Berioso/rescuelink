import logging
import re
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from django.conf import settings

logger = logging.getLogger(__name__)

ALLOWED_EMERGENCY_PHOTO_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.SUPABASE_STORAGE_ENDPOINT,
        aws_access_key_id=settings.SUPABASE_S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.SUPABASE_S3_SECRET_ACCESS_KEY,
        region_name=settings.SUPABASE_STORAGE_REGION,
        config=Config(s3={"addressing_style": "path"}),
    )


def sanitize_filename(filename: str) -> str:
    name = Path(filename).name
    name = re.sub(r"[^\w.\-]", "_", name)
    if not name or name.startswith("."):
        name = "photo"
    return name[:100]


def build_object_key(report_id: int, filename: str) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_name = sanitize_filename(filename)
    return f"emergency-reports/{report_id}/{timestamp}_{safe_name}"


def upload_emergency_photo(report_id: int, file_obj, content_type: str, filename: str) -> str:
    object_key = build_object_key(report_id, filename)
    client = _get_s3_client()
    file_obj.seek(0)
    client.put_object(
        Bucket=settings.SUPABASE_STORAGE_BUCKET,
        Key=object_key,
        Body=file_obj.read(),
        ContentType=content_type,
    )
    return object_key


def download_emergency_photo(object_key: str) -> tuple[bytes, str]:
    client = _get_s3_client()
    response = client.get_object(
        Bucket=settings.SUPABASE_STORAGE_BUCKET,
        Key=object_key,
    )
    body = response["Body"].read()
    content_type = response.get("ContentType") or "application/octet-stream"
    return body, content_type


def delete_emergency_photo(object_key: str) -> None:
    if not object_key:
        return
    client = _get_s3_client()
    try:
        client.delete_object(
            Bucket=settings.SUPABASE_STORAGE_BUCKET,
            Key=object_key,
        )
    except ClientError:
        logger.exception("Failed to delete S3 object %s", object_key)
        raise


def ensure_storage_bucket() -> None:
    client = _get_s3_client()
    bucket = settings.SUPABASE_STORAGE_BUCKET
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code", "")
        if error_code in ("404", "NoSuchBucket", "NotFound"):
            client.create_bucket(Bucket=bucket)
        else:
            raise
