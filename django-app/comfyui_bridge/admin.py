from __future__ import annotations

from django.contrib import admin

from .models import BlueprintProject


@admin.register(BlueprintProject)
class BlueprintProjectAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "data", "updated_at", "created_at")
    search_fields = ("name", "data")
    list_filter = ("created_at", "updated_at")
    ordering = ("-updated_at", "-id")
