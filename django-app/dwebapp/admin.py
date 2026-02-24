from __future__ import annotations

from django.contrib import admin

from .models import ApiKeySecret


@admin.register(ApiKeySecret)
class ApiKeySecretAdmin(admin.ModelAdmin):

    # NOTE: keep fields read-only; plaintext key is never stored.
    list_display = ("provider", "key_fingerprint", "updated_at", "created_at")
    list_filter = ("provider",)
    search_fields = ("provider", "key_fingerprint")
    readonly_fields = ("provider", "key_fingerprint", "key_encrypted", "updated_at", "created_at")

