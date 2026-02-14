from __future__ import annotations

from django.db import models


class BlueprintProject(models.Model):
    name = models.CharField(max_length=120)
    data = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "comfyui_blueprint_project"
        ordering = ["-updated_at", "-id"]

    def __str__(self) -> str:
        return f"{self.name} (#{self.pk})"
