from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from django.conf import settings
from django.utils import timezone

from aiworkflow_project.models import BlueprintProject

PROJECT_MARKER_DIR = ".aiworkflow"
PROJECT_MANIFEST_REL = f"{PROJECT_MARKER_DIR}/manifest.json"
PROJECT_BLUEPRINT_REL = "Blueprints/main.blueprint.json"
PROJECT_CONFIG_REL = "Config/user.json"
PROJECT_STORAGE_VERSION = 1
PROJECT_REQUIRED_DIRS = [
    "Content/Media/images",
    "Content/Media/videos",
    "Content/Media/audio",
    "Content/Media/models",
    "Content/Media/thumbnails",
    "Content/Generated/comfy",
    "Content/Generated/meshy",
    "Content/Generated/dreammaker",
    "Content/Generated/fal",
    "Content/Generated/unreal",
    "Saved/autosaves",
    "Saved/logs",
    "Saved/task-cache",
    "Intermediate/imports",
    "Intermediate/tmp",
    "Intermediate/previews",
]


def _empty_blueprint_snapshot() -> Dict[str, Any]:
    now_ms = int(timezone.now().timestamp() * 1000)
    return {
        "schemaVersion": 1,
        "savedAt": now_ms,
        "viewport": {"zoom": 1, "panX": 0, "panY": 0},
        "nodesById": {},
        "nodeOrder": [],
        "edgesById": {},
        "edgeOrder": [],
        "resourcesById": {},
        "resourceOrder": [],
        "selectedNodeId": None,
        "selectedNodeIds": [],
    }


def _as_blueprint_snapshot(snapshot: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(snapshot, dict):
        return None
    if snapshot.get("schemaVersion") != 1:
        return None
    required_keys = [
        "viewport",
        "nodesById",
        "nodeOrder",
        "edgesById",
        "edgeOrder",
        "resourcesById",
        "resourceOrder",
    ]
    for key in required_keys:
        if key not in snapshot:
            return None
    return snapshot


def _media_root_path() -> Path:
    return Path(getattr(settings, "MEDIA_ROOT", "") or Path.cwd() / "media").resolve()


def _blueprint_projects_root() -> Path:
    root = _media_root_path() / "blueprint_projects"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_project_root(raw_root: Any) -> Tuple[Optional[Path], Optional[str]]:
    root_text = str(raw_root or "").strip()
    if not root_text:
        return None, "rootPath is required"
    try:
        root = Path(root_text).expanduser().resolve()
    except Exception as exc:
        return None, f"rootPath is invalid: {exc}"
    if not root.is_absolute():
        return None, "rootPath must be absolute"
    if root.exists() and not root.is_dir():
        return None, "rootPath must be a directory"
    return root, None


def _project_manifest_path(root: Path) -> Path:
    return root / PROJECT_MANIFEST_REL


def _project_blueprint_path(root: Path) -> Path:
    return root / PROJECT_BLUEPRINT_REL


def _project_config_path(root: Path) -> Path:
    return root / PROJECT_CONFIG_REL


def _project_root_from_row(project: BlueprintProject) -> Optional[Path]:
    raw = str(getattr(project, "root_path", "") or "").strip()
    if not raw:
        return None
    try:
        root = Path(raw).expanduser().resolve()
    except Exception:
        return None
    if root.exists() and not root.is_dir():
        return None
    return root


def _is_folder_backed_project(project: BlueprintProject) -> bool:
    return _project_root_from_row(project) is not None


def _project_rel(root: Path, path: Path) -> Tuple[Optional[str], Optional[str]]:
    try:
        rel = path.resolve().relative_to(root.resolve())
    except Exception:
        return None, "path is outside project root"
    return rel.as_posix(), None


def _resolve_project_relative_path(root: Path, rel_path: str) -> Tuple[Optional[Path], Optional[str]]:
    rel = str(rel_path or "").strip().replace("\\", "/")
    if not rel:
        return None, "relative path is empty"
    if rel.startswith("/") or ".." in Path(rel).parts:
        return None, "relative path is invalid"
    try:
        candidate = (root / rel).resolve()
        resolved_root = root.resolve()
    except Exception as exc:
        return None, f"relative path is invalid: {exc}"
    if resolved_root not in candidate.parents and candidate != resolved_root:
        return None, "path is outside project root"
    return candidate, None


def _atomic_write_text(file_path: Path, text: str) -> Optional[str]:
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = file_path.parent / ("." + file_path.name + ".tmp")
        tmp_path.write_text(text, encoding="utf-8")
        os.replace(str(tmp_path), str(file_path))
        return None
    except Exception as exc:
        try:
            tmp_path = file_path.parent / ("." + file_path.name + ".tmp")
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        return str(exc)


def _atomic_write_json(file_path: Path, payload: Dict[str, Any]) -> Optional[str]:
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), indent=2)
    return _atomic_write_text(file_path, text)


def _read_json_file(file_path: Path) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    try:
        raw = file_path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except Exception as exc:
        return None, str(exc)
    if not isinstance(data, dict):
        return None, "json root must be an object"
    return data, None


def _folder_data_path(root: Path) -> str:
    return PROJECT_BLUEPRINT_REL


def _ensure_project_uuid(project: BlueprintProject) -> str:
    current = str(getattr(project, "project_uuid", "") or "").strip()
    if current:
        return current
    current = str(uuid.uuid4())
    project.project_uuid = current
    return current


def _build_manifest(project: BlueprintProject, root: Path) -> Dict[str, Any]:
    now_ms = int(timezone.now().timestamp() * 1000)
    return {
        "schemaVersion": 1,
        "kind": "aiworkflow-blueprint-project",
        "storageVersion": PROJECT_STORAGE_VERSION,
        "projectId": project.id,
        "projectUuid": _ensure_project_uuid(project),
        "name": project.name,
        "blueprint": PROJECT_BLUEPRINT_REL,
        "configPath": PROJECT_CONFIG_REL,
        "assetRoots": {
            "images": "Content/Media/images",
            "videos": "Content/Media/videos",
            "audio": "Content/Media/audio",
            "models": "Content/Media/models",
            "thumbnails": "Content/Media/thumbnails",
        },
        "generatedRoots": {
            "comfy": "Content/Generated/comfy",
            "meshy": "Content/Generated/meshy",
            "dreammaker": "Content/Generated/dreammaker",
            "fal": "Content/Generated/fal",
            "unreal": "Content/Generated/unreal",
        },
        "createdAt": int(project.created_at.timestamp() * 1000) if project.created_at else now_ms,
        "updatedAt": now_ms,
    }


def _ensure_folder_project_layout(
    project: BlueprintProject,
    root: Path,
    *,
    create: bool,
    snapshot: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if not root.exists():
        if not create:
            return None, "project folder not found"
        try:
            root.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            return None, f"create project folder failed: {exc}"

    manifest_path = _project_manifest_path(root)
    blueprint_path = _project_blueprint_path(root)
    config_path = _project_config_path(root)

    for rel in PROJECT_REQUIRED_DIRS:
        try:
            (root / rel).mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            return None, f"create project directory failed ({rel}): {exc}"

    if not blueprint_path.exists():
        if not create:
            return None, "project blueprint file not found"
        err = _atomic_write_json(blueprint_path, snapshot or _empty_blueprint_snapshot())
        if err:
            return None, f"write blueprint file failed: {err}"

    if not config_path.exists():
        err = _atomic_write_json(config_path, {"schemaVersion": 1})
        if err:
            return None, f"write project config failed: {err}"

    manifest = _build_manifest(project, root)
    err = _atomic_write_json(manifest_path, manifest)
    if err:
        return None, f"write project manifest failed: {err}"
    return manifest, None


def _open_folder_project(*, root_path: Any, name: str, create: bool) -> Tuple[Optional[BlueprintProject], Optional[str]]:
    root, root_err = _safe_project_root(root_path)
    if root_err or root is None:
        return None, root_err or "rootPath is invalid"

    name_text = str(name or "").strip() or root.name or "未命名项目"
    now = timezone.now()
    existing = BlueprintProject.objects.filter(root_path=str(root)).first()
    project = existing or BlueprintProject(name=name_text, data="")
    project.name = name_text
    project.root_path = str(root)
    project.project_uuid = _ensure_project_uuid(project)
    project.manifest_path = str(_project_manifest_path(root))
    project.storage_version = PROJECT_STORAGE_VERSION
    project.last_opened_at = now
    project.data = _folder_data_path(root)

    if project.pk:
        project.save(
            update_fields=[
                "name",
                "data",
                "project_uuid",
                "root_path",
                "manifest_path",
                "storage_version",
                "last_opened_at",
                "updated_at",
            ]
        )
    else:
        project.save()

    _, layout_err = _ensure_folder_project_layout(project, root, create=create)
    if layout_err:
        if existing is None:
            try:
                project.delete()
            except Exception:
                pass
        return None, layout_err

    return project, None


def _serialize_blueprint_project(project: BlueprintProject) -> Dict[str, Any]:
    root = _project_root_from_row(project)
    return {
        "id": project.id,
        "name": project.name,
        "data": project.data,
        "projectUuid": str(getattr(project, "project_uuid", "") or ""),
        "rootPath": str(root or ""),
        "manifestPath": str(getattr(project, "manifest_path", "") or ""),
        "storageVersion": int(getattr(project, "storage_version", 1) or 1),
        "folderBacked": root is not None,
        "createdAt": int(project.created_at.timestamp() * 1000) if project.created_at else None,
        "updatedAt": int(project.updated_at.timestamp() * 1000) if project.updated_at else None,
        "lastOpenedAt": int(project.last_opened_at.timestamp() * 1000) if project.last_opened_at else None,
    }


def _project_file_from_data_path(data_path: str) -> Tuple[Optional[Path], Optional[str]]:
    rel = str(data_path or "").strip().replace("\\", "/")
    if not rel:
        return None, "data path is empty"
    root = _blueprint_projects_root().resolve()
    candidate = (_media_root_path() / rel).resolve()
    if root not in candidate.parents and candidate != root:
        return None, "invalid data path"
    return candidate, None


def _project_snapshot_path(project: BlueprintProject) -> Tuple[Optional[Path], Optional[str]]:
    root = _project_root_from_row(project)
    if root is not None:
        return _project_blueprint_path(root), None
    return _project_file_from_data_path(project.data)


def _write_project_snapshot_file(project: BlueprintProject, snapshot: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    folder_root = _project_root_from_row(project)
    if folder_root is not None:
        _, layout_err = _ensure_folder_project_layout(project, folder_root, create=True, snapshot=snapshot)
        if layout_err:
            return None, layout_err
        file_path = _project_blueprint_path(folder_root)
        err = _atomic_write_json(file_path, snapshot)
        if err:
            return None, f"write project json failed: {err}"
        project.manifest_path = str(_project_manifest_path(folder_root))
        project.storage_version = PROJECT_STORAGE_VERSION
        return _folder_data_path(folder_root), None

    root = _blueprint_projects_root()
    project_dir = (root / str(project.id)).resolve()
    project_dir.mkdir(parents=True, exist_ok=True)
    file_path = (project_dir / "blueprint.json").resolve()
    if project_dir not in file_path.parents and file_path != project_dir:
        file_path = project_dir / "blueprint.json"

    err = _atomic_write_json(file_path, snapshot)
    if err:
        return None, f"write project json failed: {err}"

    try:
        for path in project_dir.iterdir():
            if not path.is_file() or path.suffix.lower() != ".json" or path.name == file_path.name:
                continue
            path.unlink()
    except Exception:
        pass

    try:
        rel = file_path.resolve().relative_to(_media_root_path())
    except Exception:
        return None, "failed to compute media relative path"
    return rel.as_posix(), None


def load_project_snapshot(project: BlueprintProject) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    file_path, path_err = _project_snapshot_path(project)
    if path_err or file_path is None:
        return None, f"project data path invalid: {path_err or 'unknown error'}", 500
    if not file_path.exists():
        return None, "project json file not found", 404
    raw, read_err = _read_json_file(file_path)
    if read_err or raw is None:
        return None, f"读取项目文件失败：{read_err or 'unknown error'}", 500
    snapshot = _as_blueprint_snapshot(raw)
    if snapshot is None:
        return None, "project snapshot is invalid", 500
    return snapshot, None, 200


def save_project_snapshot(project: BlueprintProject, snapshot: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    snapshot["savedAt"] = int(timezone.now().timestamp() * 1000)
    return _write_project_snapshot_file(project, snapshot)
