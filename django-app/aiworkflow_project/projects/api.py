from __future__ import annotations

import shutil
from typing import Any, Dict, Optional

from django.db import connection
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from aiworkflow_project.models import BlueprintProject
from aiworkflow_project.projects.storage import (
    PROJECT_STORAGE_VERSION,
    _as_blueprint_snapshot,
    _blueprint_projects_root,
    _open_folder_project,
    _project_root_from_row,
    _serialize_blueprint_project,
    load_project_snapshot,
    save_project_snapshot,
)


def _json_error(message: str, status: int = 400) -> Response:
    return Response({"ok": False, "error": message}, status=status)


def _coerce_request_payload(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    dict_method = getattr(value, "dict", None)
    if callable(dict_method):
        try:
            out = dict_method()
            if isinstance(out, dict):
                return out
        except Exception:
            return {}
    return {}


def _project_from_id(raw: Any) -> Optional[BlueprintProject]:
    try:
        project_id = int(raw)
    except Exception:
        return None
    if project_id <= 0:
        return None
    return BlueprintProject.objects.filter(id=project_id).first()


def _detach_provider_task_refs(project_id: int) -> None:
    with connection.cursor() as cursor:
        cursor.execute("UPDATE comfyui_meshy_task_mirror SET project_id = NULL WHERE project_id = %s", [project_id])
        cursor.execute("UPDATE comfyui_video_generation_task_mirror SET project_id = NULL WHERE project_id = %s", [project_id])


@api_view(["GET"])
def list_projects(_: Request) -> Response:
    items = BlueprintProject.objects.all().order_by("-updated_at", "-id")
    return Response({"ok": True, "projects": [_serialize_blueprint_project(item) for item in items]})


@api_view(["POST"])
def open_project_folder(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    root_path = payload.get("rootPath")
    name = str(payload.get("name") or "").strip()
    create = payload.get("create")
    create_bool = create is True or str(create).strip().lower() in ("1", "true", "yes", "y")

    project, err = _open_folder_project(root_path=root_path, name=name, create=create_bool)
    if err or project is None:
        return _json_error(err or "open project folder failed", status=400)

    return Response({"ok": True, "project": _serialize_blueprint_project(project)})


@api_view(["POST"])
def save_project(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    name = str(payload.get("name") or "").strip()
    if not name:
        return _json_error("name is required")

    snapshot = _as_blueprint_snapshot(payload.get("snapshot"))
    if snapshot is None:
        return _json_error("snapshot is invalid")

    project_id_raw = payload.get("projectId")
    if project_id_raw in (None, "", 0):
        project = BlueprintProject.objects.create(
            name=name,
            data="",
            storage_version=PROJECT_STORAGE_VERSION,
        )
    else:
        project = _project_from_id(project_id_raw)
        if project is None:
            return _json_error("projectId not found", status=404)
        project.name = name

    data_path, write_err = save_project_snapshot(project, snapshot)
    if write_err or not data_path:
        if project and not project.data:
            try:
                project.delete()
            except Exception:
                pass
        return _json_error(f"保存项目文件失败：{write_err or 'unknown error'}", status=500)

    project.data = data_path
    update_fields = ["name", "data", "updated_at"]
    root = _project_root_from_row(project)
    if root is not None:
        project.root_path = str(root)
        project.last_opened_at = timezone.now()
        update_fields.extend(["project_uuid", "root_path", "manifest_path", "storage_version", "last_opened_at"])
    project.save(update_fields=update_fields)

    return Response({"ok": True, "project": _serialize_blueprint_project(project)})


@api_view(["GET"])
def load_project(request: Request) -> Response:
    project = _project_from_id(request.query_params.get("id"))
    if project is None:
        return _json_error("project not found", status=404)

    snapshot, err, status = load_project_snapshot(project)
    if err or snapshot is None:
        return _json_error(err or "project snapshot is invalid", status=status)

    if _project_root_from_row(project) is not None:
        project.last_opened_at = timezone.now()
        project.save(update_fields=["last_opened_at"])

    return Response(
        {
            "ok": True,
            "project": _serialize_blueprint_project(project),
            "snapshot": snapshot,
        }
    )


@api_view(["POST"])
def delete_project(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    try:
        project_id = int(payload.get("id"))
    except Exception:
        return _json_error("id is required")

    project = BlueprintProject.objects.filter(id=project_id).first()
    if project is None:
        return _json_error("project not found", status=404)

    is_folder_backed = _project_root_from_row(project) is not None
    legacy_project_dir = (_blueprint_projects_root() / str(project.id)).resolve()
    _detach_provider_task_refs(project.id)
    project.delete()
    if not is_folder_backed:
        try:
            legacy_root = _blueprint_projects_root().resolve()
            if legacy_project_dir.exists() and (legacy_root in legacy_project_dir.parents or legacy_project_dir == legacy_root):
                shutil.rmtree(legacy_project_dir, ignore_errors=True)
        except Exception:
            pass
    return Response({"ok": True, "id": project_id})
