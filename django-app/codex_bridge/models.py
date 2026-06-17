from __future__ import annotations

import uuid

from django.db import models


class ChatSession(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        FAILED = "failed", "Failed"
        CLOSED = "closed", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200, blank=True)
    provider = models.CharField(max_length=50, default="codex")
    model_name = models.CharField(max_length=120, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    provider_thread_id = models.CharField(max_length=120, blank=True)
    project_id = models.IntegerField(null=True, blank=True, db_index=True)
    cwd = models.CharField(max_length=500, blank=True)
    approval_policy = models.CharField(max_length=60, blank=True)
    last_turn_status = models.CharField(max_length=60, blank=True)
    sandbox_policy = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "codex_bridge_chat_session"
        ordering = ["-updated_at"]


class ChatMessage(models.Model):
    class Role(models.TextChoices):
        SYSTEM = "system", "System"
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"
        TOOL = "tool", "Tool"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(ChatSession, related_name="messages", on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.COMPLETED)
    item_type = models.CharField(max_length=60, blank=True)
    stream_phase = models.CharField(max_length=40, blank=True)
    tool_name = models.CharField(max_length=120, blank=True)
    provider_item_id = models.CharField(max_length=120, blank=True)
    command = models.JSONField(default=dict, blank=True)
    file_changes = models.JSONField(default=list, blank=True)
    approval_request = models.JSONField(default=dict, blank=True)
    usage = models.JSONField(default=dict, blank=True)
    provider_message_id = models.CharField(max_length=120, blank=True)
    provider_payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "codex_bridge_chat_message"
        ordering = ["created_at"]
