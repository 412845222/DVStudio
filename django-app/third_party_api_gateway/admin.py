from __future__ import annotations

from django.contrib import admin

from .models import MeshyTaskMirror, VideoGenerationTaskMirror


@admin.register(MeshyTaskMirror)
class MeshyTaskMirrorAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "task_id",
        "root_task_id",
        "parent_task_id",
        "relation_kind",
        "task_target",
        "task_family",
        "status",
        "progress",
        "updated_at",
    )
    search_fields = ("task_id", "root_task_id", "parent_task_id", "prompt", "task_family", "last_node_id")
    list_filter = ("relation_kind", "task_target", "task_family", "status", "created_at", "updated_at")
    ordering = ("-updated_at", "-id")


@admin.register(VideoGenerationTaskMirror)
class VideoGenerationTaskMirrorAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "remote_task_id",
        "provider",
        "model",
        "status",
        "download_status",
        "synced_at",
        "updated_at",
    )
    search_fields = ("remote_task_id", "provider", "model", "prompt")
    list_filter = ("provider", "model", "status", "download_status", "created_at", "updated_at")
    ordering = ("-updated_at", "-id")