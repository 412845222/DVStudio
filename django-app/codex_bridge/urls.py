from django.urls import path

from . import views

urlpatterns = [
    path("health", views.health_check, name="codex-health"),
    path("workspace/references", views.workspace_references, name="codex-workspace-references"),
    path("sessions", views.sessions_collection, name="codex-sessions"),
    path("sessions/<uuid:session_id>", views.session_detail, name="codex-session-detail"),
    path("sessions/<uuid:session_id>/messages", views.session_messages, name="codex-session-messages"),
    path("sessions/<uuid:session_id>/messages:stream", views.session_message_stream, name="codex-session-message-stream"),
    path("sessions/<uuid:session_id>/messages:stream-test", views.session_message_stream_test, name="codex-session-message-stream-test"),
    path("sessions/<uuid:session_id>/approvals", views.session_approvals, name="codex-session-approvals"),
]
