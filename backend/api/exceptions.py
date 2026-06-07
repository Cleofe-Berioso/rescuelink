import logging

from django.conf import settings
from rest_framework.exceptions import Throttled
from rest_framework.views import exception_handler

security_logger = logging.getLogger("rescuelink.security")

RATE_LIMIT_MESSAGE = "Too many requests. Please wait and try again."


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    request = context.get("request")

    if isinstance(exc, Throttled) and response is not None:
        response.data = {"detail": RATE_LIMIT_MESSAGE}

    if request is not None and response is not None:
        status_code = response.status_code
        if status_code in (401, 403, 429):
            username = "anonymous"
            if request.user and request.user.is_authenticated:
                username = request.user.username
            security_logger.warning(
                "HTTP %s on %s %s user=%s",
                status_code,
                request.method,
                request.path,
                username,
            )

    if response is not None and not settings.DEBUG:
        if response.status_code >= 500:
            response.data = {"detail": "An unexpected error occurred."}
        elif response.status_code == 400 and isinstance(response.data, dict):
            for key in list(response.data.keys()):
                if key in ("traceback", "exception_type"):
                    del response.data[key]

    return response
