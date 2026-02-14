from __future__ import annotations

import uuid

from django.db import models


def _thumb_upload_path(instance: "ComponentLibraryItem", filename: str) -> str:
    # Store thumbnails under media/component_thumbs/YYYYMM/
    return f"component_thumbs/{instance.created_at.strftime('%Y%m') if instance.created_at else 'unknown'}/{filename}"


class ComponentLibraryItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template_id = models.CharField(max_length=200, unique=True, db_index=True)
    name = models.CharField(max_length=200, db_index=True)
    template = models.JSONField()
    schema_version = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    saved_at = models.DateTimeField(auto_now=True)
    thumb_asset_id = models.CharField(max_length=200, null=True, blank=True)
    thumb_file = models.FileField(upload_to=_thumb_upload_path, null=True, blank=True)

    class Meta:
        ordering = ["-saved_at"]

    def __str__(self) -> str:
        return f"ComponentLibraryItem({self.template_id})"
