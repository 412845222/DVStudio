from django.urls import include, path

from . import views
from . import ai_chat_api

urlpatterns = [
    # Legacy sample endpoints (kept for quick smoke tests)
    path("health/", views.health, name="dweb-health"),
    path("echo/", views.echo, name="dweb-echo"),

    # AI chat APIs
    path("chat/conversations", ai_chat_api.create_conversation, name="chat-create-conversation"),
    path(
        "chat/conversations/<str:conversation_id>/messages",
        ai_chat_api.send_message,
        name="chat-send-message",
    ),
    path(
        "chat/conversations/<str:conversation_id>/messages:stream",
        ai_chat_api.stream_message,
        name="chat-stream-message",
    ),
    # Generated / user-defined APIs live here
    path("", include("dwebapp.dweb_urls")),
]
