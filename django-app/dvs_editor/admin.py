from __future__ import annotations

from django.contrib import admin

from .models import ComponentLibraryItem


@admin.register(ComponentLibraryItem)
class ComponentLibraryItemAdmin(admin.ModelAdmin):
	list_display = ("template_id", "name", "schema_version", "saved_at", "created_at")
	search_fields = ("template_id", "name")
	list_filter = ("schema_version",)
	ordering = ("-saved_at",)
	readonly_fields = ("id", "created_at", "saved_at")
