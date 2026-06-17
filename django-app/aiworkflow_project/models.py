from __future__ import annotations

from django.db import models


class BlueprintProject(models.Model):
    name = models.CharField(max_length=120)
    data = models.CharField(max_length=500, blank=True, default="")
    project_uuid = models.CharField(max_length=64, blank=True, default="", db_index=True)
    root_path = models.CharField(max_length=1000, blank=True, default="")
    manifest_path = models.CharField(max_length=1000, blank=True, default="")
    storage_version = models.PositiveIntegerField(default=1)
    last_opened_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "comfyui_blueprint_project"
        managed = False
        ordering = ["-updated_at", "-id"]

    def __str__(self) -> str:
        return f"{self.name} (#{self.pk})"
