from django.urls import include, path

from . import views
from . import legal_api
from . import export_api
from .ai.api import chat_api
from .ai.api import subtitle_understanding_api
from .ai.api import credentials_api

urlpatterns = [
    # Legacy sample endpoints (kept for quick smoke tests)
    path("health/", views.health, name="dweb-health"),
    path("echo/", views.echo, name="dweb-echo"),

    # Legal / agreement docs
    path(
        "legal/user-agreement-and-security.md",
        legal_api.user_agreement_and_security_md,
        name="legal-user-agreement-and-security-md",
    ),

    # Encrypted credentials storage (local)
    path("ai/credentials/status", credentials_api.credentials_status, name="ai-credentials-status"),
    path("ai/credentials", credentials_api.upsert_credentials, name="ai-credentials-upsert"),

    # AI chat APIs
    path("chat/conversations", chat_api.create_conversation, name="chat-create-conversation"),
    path(
        "chat/conversations/<str:conversation_id>/messages",
        chat_api.send_message,
        name="chat-send-message",
    ),
    path(
        "chat/conversations/<str:conversation_id>/messages:stream",
        chat_api.stream_message,
        name="chat-stream-message",
    ),

    # AI subtitle understanding (skill 1)
    path("ai/ping", subtitle_understanding_api.ping, name="ai-ping"),
    path(
        "ai/subtitle/understand:stream",
        subtitle_understanding_api.stream_understand,
        name="ai-subtitle-understand-stream",
    ),
    path(
        "ai/subtitle/style:stream",
        subtitle_understanding_api.stream_style,
        name="ai-subtitle-style-stream",
    ),
    path(
        "ai/subtitle/templates:stream",
        subtitle_understanding_api.stream_templates,
        name="ai-subtitle-templates-stream",
    ),
    path(
        "ai/subtitle/chat:stream",
        subtitle_understanding_api.stream_chat,
        name="ai-subtitle-chat-stream",
    ),
    path(
        "ai/subtitle/panel-chat:stream",
        subtitle_understanding_api.stream_panel_chat,
        name="ai-subtitle-panel-chat-stream",
    ),
    path(
        "ai/subtitle/palette:stream",
        subtitle_understanding_api.stream_palette,
        name="ai-subtitle-palette-stream",
    ),
    path(
        "ai/subtitle/template:stream",
        subtitle_understanding_api.stream_template,
        name="ai-subtitle-template-stream",
    ),

    # Export APIs
    path("export/jobs", export_api.create_job, name="export-create-job"),
    # NOTE: must be before `export/jobs/<str:job_id>` because `<str:job_id>`
    # will also match values like `exp-xxx:stream` and steal the route.
    path("export/jobs/<str:job_id>:stream", export_api.stream_job_sse, name="export-stream-job"),
    path("export/jobs/<str:job_id>", export_api.get_job, name="export-get-job"),
    path("export/jobs/<str:job_id>/frames", export_api.upload_frame, name="export-upload-frame"),
    path("export/jobs/<str:job_id>/frames:raw", export_api.upload_frame_raw, name="export-upload-frame-raw"),
    path("export/jobs/<str:job_id>/frames:raw-batch", export_api.upload_frames_raw_batch, name="export-upload-frames-raw-batch"),
    path("export/jobs/<str:job_id>/finalize", export_api.finalize_job, name="export-finalize-job"),
    path("export/jobs/<str:job_id>/file", export_api.download_job_file, name="export-download-file"),
    # Generated / user-defined APIs live here
    path("", include("dwebapp.dweb_urls")),
]
