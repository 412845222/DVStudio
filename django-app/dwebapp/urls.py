from django.urls import include, path

from . import views
from .ai.api import chat_api
from .ai.api import subtitle_understanding_api

urlpatterns = [
    # Legacy sample endpoints (kept for quick smoke tests)
    path("health/", views.health, name="dweb-health"),
    path("echo/", views.echo, name="dweb-echo"),

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
    # Generated / user-defined APIs live here
    path("", include("dwebapp.dweb_urls")),
]
