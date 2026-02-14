from __future__ import annotations

import base64
import re
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from django.core.files.base import ContentFile
from django.db import models, transaction
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from ..models import ComponentLibraryItem


_DATA_URL_RE = re.compile(r"^data:(?P<mime>[^;]+);base64,(?P<data>.+)$")


def _json_error(message: str, status: int = 400) -> Response:
    return Response({"error": message}, status=status)


def _parse_limit(v: Any, default: int = 200, max_limit: int = 1000) -> int:
    try:
        n = int(str(v))
    except Exception:
        return default
    n = max(1, min(max_limit, n))
    return n


def _parse_offset(v: Any) -> int:
    try:
        n = int(str(v))
    except Exception:
        return 0
    return max(0, n)


def _is_record(v: Any) -> bool:
    return isinstance(v, dict)


def _validate_template(template: Any) -> Optional[str]:
    if not _is_record(template):
        return "template must be object"
    if template.get("schemaVersion") != 1:
        return "template.schemaVersion must be 1"
    if not isinstance(template.get("templateId"), str) or not template.get("templateId").strip():
        return "template.templateId must be non-empty string"
    if not isinstance(template.get("name"), str) or not template.get("name").strip():
        return "template.name must be non-empty string"
    if not isinstance(template.get("rootLocalId"), str) or not template.get("rootLocalId").strip():
        return "template.rootLocalId must be non-empty string"
    if not isinstance(template.get("nodes"), list):
        return "template.nodes must be array"
    if not isinstance(template.get("params"), list):
        return "template.params must be array"
    return None


def _coerce_template(template: Dict[str, Any], template_id: str, name: str) -> Dict[str, Any]:
    # Ensure templateId and name are consistent with request payload.
    template["templateId"] = template_id
    template["name"] = name
    return template


def _parse_data_url(data_url: str) -> Optional[Tuple[str, bytes]]:
    m = _DATA_URL_RE.match(data_url.strip())
    if not m:
        return None
    mime = m.group("mime")
    payload = m.group("data")
    try:
        raw = base64.b64decode(payload)
    except Exception:
        return None
    return mime, raw


def _mime_to_ext(mime: str) -> str:
    mime = (mime or "").lower().strip()
    if mime == "image/png":
        return "png"
    if mime in ("image/jpeg", "image/jpg"):
        return "jpg"
    if mime == "image/webp":
        return "webp"
    return "bin"


def _serialize_item(item: ComponentLibraryItem, request: Optional[Request] = None) -> Dict[str, Any]:
    thumb_url = item.thumb_file.url if item.thumb_file else None
    if request and thumb_url and thumb_url.startswith("/"):
        thumb_url = request.build_absolute_uri(thumb_url)
    return {
        "id": str(item.id),
        "createdAt": item.created_at.isoformat().replace("+00:00", "Z") if item.created_at else None,
        "savedAt": item.saved_at.isoformat().replace("+00:00", "Z") if item.saved_at else None,
        "templateId": item.template_id,
        "name": item.name,
        "template": item.template,
        "thumbAssetId": item.thumb_asset_id,
        "thumbUrl": thumb_url,
    }


def _apply_thumbnail(item: ComponentLibraryItem, request: Request, payload: Dict[str, Any]) -> None:
    # Accept either multipart file or base64 data URL.
    # 1) multipart file: request.FILES["thumb"]
    # 2) data URL: payload["thumbDataUrl"]
    # If neither provided, do nothing.
    files = getattr(request, "FILES", None)
    file = files.get("thumb") if files is not None and hasattr(files, "get") else None
    if file:
        if item.thumb_file:
            item.thumb_file.delete(save=False)
        item.thumb_file.save(file.name, file, save=False)
        return

    data_url = payload.get("thumbDataUrl")
    if isinstance(data_url, str) and data_url.strip():
        parsed = _parse_data_url(data_url)
        if not parsed:
            return
        mime, raw = parsed
        ext = _mime_to_ext(mime)
        filename = f"{item.template_id}_{item.id}.{ext}"
        if item.thumb_file:
            item.thumb_file.delete(save=False)
        item.thumb_file.save(filename, ContentFile(raw), save=False)


def _list_components(request: Request) -> Response:
    q = str(request.GET.get("q", "")).strip()
    limit = _parse_limit(request.GET.get("limit"))
    offset = _parse_offset(request.GET.get("offset"))

    qs = ComponentLibraryItem.objects.all()
    if q:
        qs = qs.filter(models.Q(name__icontains=q) | models.Q(template_id__icontains=q))

    total = qs.count()
    items = qs[offset : offset + limit]
    return Response({
        "items": [_serialize_item(it, request) for it in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    })


@api_view(["GET", "POST"])
@transaction.atomic
def components(request: Request) -> Response:
    if request.method == "GET":
        return _list_components(request)
    if request.method != "POST":
        return _json_error("method not allowed", status=405)

    payload = request.data if isinstance(request.data, dict) else {}
    template_id = str(payload.get("templateId", "")).strip()
    name = str(payload.get("name", "")).strip()
    template = payload.get("template")

    if not template_id:
        return _json_error("templateId is required")
    if not name:
        return _json_error("name is required")
    if not _is_record(template):
        return _json_error("template must be object")

    template = _coerce_template(dict(template) if isinstance(template, dict) else {}, template_id, name)
    err = _validate_template(template)
    if err:
        return _json_error(err)

    item, _created = ComponentLibraryItem.objects.get_or_create(
        template_id=template_id,
        defaults={
            "name": name,
            "template": template,
            "schema_version": int(template.get("schemaVersion") or 1),
        },
    )

    item.name = name
    item.template = template
    item.schema_version = int(template.get("schemaVersion") or 1)
    if isinstance(payload.get("thumbAssetId"), str):
        item.thumb_asset_id = payload.get("thumbAssetId")

    item.save()
    _apply_thumbnail(item, request, payload)
    item.save()

    return Response({"item": _serialize_item(item, request), "upserted": True})


@api_view(["POST"])
@transaction.atomic
def import_components(request: Request) -> Response:
    payload = request.data if isinstance(request.data, dict) else {}
    items = payload.get("items")
    items_list: List[Dict[str, Any]] = items if isinstance(items, list) else []

    imported = 0
    failed: List[Dict[str, Any]] = []

    for idx, it in enumerate(items_list):
        if not isinstance(it, dict):
            failed.append({"index": idx, "error": "item must be object"})
            continue
        template_id = str(it.get("templateId", "")).strip()
        name = str(it.get("name", "")).strip()
        template = it.get("template")
        if not template_id or not name or not _is_record(template):
            failed.append({"index": idx, "error": "templateId/name/template required"})
            continue
        template = _coerce_template(dict(template) if isinstance(template, dict) else {}, template_id, name)
        err = _validate_template(template)
        if err:
            failed.append({"index": idx, "error": err})
            continue
        item, _created = ComponentLibraryItem.objects.get_or_create(
            template_id=template_id,
            defaults={
                "name": name,
                "template": template,
                "schema_version": int(template.get("schemaVersion") or 1),
            },
        )
        item.name = name
        item.template = template
        item.schema_version = int(template.get("schemaVersion") or 1)
        if isinstance(it.get("thumbAssetId"), str):
            item.thumb_asset_id = it.get("thumbAssetId")
        item.save()
        _apply_thumbnail(item, request, it)
        item.save()
        imported += 1

    return Response({"ok": True, "imported": imported, "failed": failed})


@api_view(["GET", "DELETE"])
def component_detail(request: Request, item_id: UUID) -> Response:
    try:
        item = ComponentLibraryItem.objects.get(id=item_id)
    except ComponentLibraryItem.DoesNotExist:
        return _json_error("not found", status=404)

    if request.method == "GET":
        return Response({"item": _serialize_item(item, request)})
    if request.method == "DELETE":
        if item.thumb_file:
            item.thumb_file.delete(save=False)
        item.delete()
        return Response({"ok": True})

    return _json_error("method not allowed", status=405)
