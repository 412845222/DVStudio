from __future__ import annotations

from django.db import models


class MeshyTaskMirror(models.Model):
    task_id = models.CharField(max_length=128, unique=True, db_index=True)
    mode = models.CharField(max_length=48, blank=True, default="")
    task_target = models.CharField(max_length=16, blank=True, default="")
    task_family = models.CharField(max_length=48, blank=True, default="")
    relation_kind = models.CharField(max_length=24, blank=True, default="", db_index=True)
    root_task_id = models.CharField(max_length=128, blank=True, default="", db_index=True)
    parent_task_id = models.CharField(max_length=128, blank=True, default="", db_index=True)
    capabilities = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=32, blank=True, default="idle", db_index=True)
    progress = models.PositiveIntegerField(default=0)
    prompt = models.TextField(blank=True, default="")
    negative_prompt = models.TextField(blank=True, default="")
    image_count = models.PositiveIntegerField(default=0)
    thumbnail_url = models.CharField(max_length=1000, blank=True, default="")
    preferred_model_url = models.CharField(max_length=1000, blank=True, default="")
    local_asset_url = models.CharField(max_length=1000, blank=True, default="")
    local_asset_path = models.CharField(max_length=1000, blank=True, default="")
    source_model_url = models.CharField(max_length=1000, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    status_text = models.TextField(blank=True, default="")
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    project = models.ForeignKey(
        "comfyui_bridge.BlueprintProject",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="third_party_meshy_tasks",
    )
    last_node_id = models.CharField(max_length=128, blank=True, default="")
    remote_created_at = models.CharField(max_length=64, blank=True, default="")
    remote_finished_at = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "third_party_meshy_task_mirror"
        ordering = ["-updated_at", "-id"]

    def __str__(self) -> str:
        return f"{self.task_id} ({self.status})"


class VideoGenerationTaskMirror(models.Model):
    remote_task_id = models.CharField(max_length=128, unique=True, db_index=True)
    provider = models.CharField(max_length=32, blank=True, default="seedance", db_index=True)
    model = models.CharField(max_length=128, blank=True, default="", db_index=True)
    task_type = models.CharField(max_length=32, blank=True, default="")
    source = models.CharField(max_length=32, blank=True, default="bottom-chat")
    status = models.CharField(max_length=32, blank=True, default="queued", db_index=True)
    prompt = models.TextField(blank=True, default="")
    ratio = models.CharField(max_length=32, blank=True, default="")
    resolution = models.CharField(max_length=32, blank=True, default="")
    duration = models.PositiveIntegerField(default=0)
    seed = models.BigIntegerField(null=True, blank=True)
    generate_audio = models.BooleanField(default=False)
    watermark = models.BooleanField(default=False)
    camera_fixed = models.BooleanField(default=False)
    service_tier = models.CharField(max_length=32, blank=True, default="")
    tools = models.JSONField(default=list, blank=True)
    usage = models.JSONField(default=dict, blank=True)
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    video_url_remote = models.CharField(max_length=1000, blank=True, default="")
    video_url_local = models.CharField(max_length=1000, blank=True, default="")
    video_source_path_local = models.CharField(max_length=1000, blank=True, default="")
    last_frame_url_remote = models.CharField(max_length=1000, blank=True, default="")
    last_frame_url_local = models.CharField(max_length=1000, blank=True, default="")
    last_frame_source_path_local = models.CharField(max_length=1000, blank=True, default="")
    download_status = models.CharField(max_length=32, blank=True, default="idle", db_index=True)
    download_progress = models.PositiveIntegerField(default=0)
    download_error = models.TextField(blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    status_text = models.TextField(blank=True, default="")
    project = models.ForeignKey(
        "comfyui_bridge.BlueprintProject",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="third_party_video_generation_tasks",
    )
    remote_created_at = models.BigIntegerField(null=True, blank=True)
    remote_updated_at = models.BigIntegerField(null=True, blank=True)
    synced_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "third_party_video_generation_task_mirror"
        ordering = ["-updated_at", "-id"]

    def __str__(self) -> str:
        return f"{self.remote_task_id} ({self.status})"