"""Django project storage unit tests.

Tests for the folder-backed blueprint project storage helpers:
- manifest path computation
- atomic JSON/text writes
- folder layout enforcement
- snapshot serialization round-trips
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from django.test import TestCase, override_settings


@override_settings(
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
)
class ProjectStorageTests(TestCase):
    databases = {"default"}

    def test_atomic_write_json_roundtrips_dict(self) -> None:
        from aiworkflow_project.projects import storage

        tmp_dir = Path(tempfile.mkdtemp())
        try:
            target = tmp_dir / "manifest.json"
            payload = {"schemaVersion": 1, "kind": "blueprint", "projectId": 1}
            err = storage._atomic_write_json(target, payload)
            self.assertIsNone(err)
            self.assertTrue(target.exists())
            parsed, read_err = storage._read_json_file(target)
            self.assertIsNone(read_err)
            self.assertEqual(parsed, payload)
        finally:
            for f in tmp_dir.iterdir():
                f.unlink(missing_ok=True)
            tmp_dir.rmdir()

    def test_atomic_write_text_creates_file(self) -> None:
        from aiworkflow_project.projects import storage

        tmp_dir = Path(tempfile.mkdtemp())
        try:
            target = tmp_dir / "file.txt"
            err = storage._atomic_write_text(target, "hello")
            self.assertIsNone(err)
            self.assertEqual(target.read_text(encoding="utf-8"), "hello")
        finally:
            for f in tmp_dir.iterdir():
                f.unlink(missing_ok=True)
            tmp_dir.rmdir()

    def test_read_json_file_rejects_non_dict(self) -> None:
        from aiworkflow_project.projects import storage

        tmp = Path(tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8").name)
        tmp.write_text("[1, 2, 3]", encoding="utf-8")
        try:
            data, err = storage._read_json_file(tmp)
            self.assertIsNotNone(err)
            self.assertIsNone(data)
        finally:
            tmp.unlink(missing_ok=True)

    def test_read_json_file_rejects_corrupt_file(self) -> None:
        from aiworkflow_project.projects import storage

        tmp = Path(tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8").name)
        tmp.write_text("{not valid json", encoding="utf-8")
        try:
            data, err = storage._read_json_file(tmp)
            self.assertIsNotNone(err)
            self.assertIsNone(data)
        finally:
            tmp.unlink(missing_ok=True)

    def test_resolve_relative_path_accepts_normal_paths(self) -> None:
        from aiworkflow_project.projects import storage

        with tempfile.TemporaryDirectory() as td:
            root = Path(td).resolve()
            resolved, err = storage._resolve_project_relative_path(root, "Content/Media/a.png")
            self.assertIsNone(err)
            self.assertIsNotNone(resolved)
            self.assertTrue(str(resolved).startswith(str(root)))

    def test_resolve_relative_path_rejects_traversal(self) -> None:
        from aiworkflow_project.projects import storage

        with tempfile.TemporaryDirectory() as td:
            root = Path(td).resolve()
            resolved, err = storage._resolve_project_relative_path(root, "../../etc/passwd")
            self.assertIsNotNone(err)
            self.assertIsNone(resolved)

    def test_resolve_relative_path_rejects_absolute(self) -> None:
        from aiworkflow_project.projects import storage

        with tempfile.TemporaryDirectory() as td:
            root = Path(td).resolve()
            resolved, err = storage._resolve_project_relative_path(root, "/etc/passwd")
            self.assertIsNotNone(err)
            self.assertIsNone(resolved)

    def test_ensure_folder_project_layout_creates_dirs(self) -> None:
        from aiworkflow_project.projects import storage

        with tempfile.TemporaryDirectory() as td:
            root = Path(td).resolve()
            # Build a minimal fake project object that exposes root_path.
            class _FakeProject:
                def __init__(self, root_path: str) -> None:
                    self.name = "test"
                    self.root_path = root_path
                    self.project_uuid = "fake-uuid"
                    self.storage_version = 1
                    self.pk = 1
                    self.manifest_path = str(root / ".aiworkflow" / "manifest.json")
                    self.id = 1
                    self.created_at = None

            fake = _FakeProject(str(root))
            _, err = storage._ensure_folder_project_layout(fake, root, create=True)
            self.assertIsNone(err)
            for sub in [
                "Content/Media/images",
                "Content/Media/videos",
                "Content/Media/audio",
                "Content/Media/models",
                "Content/Media/thumbnails",
                "Content/Generated/comfy",
            ]:
                self.assertTrue((root / sub).exists(), f"Missing: {sub}")
            self.assertTrue((root / "Blueprints" / "main.blueprint.json").exists())
            manifest = root / ".aiworkflow" / "manifest.json"
            self.assertTrue(manifest.exists())

    def test_folder_data_path_is_constant(self) -> None:
        from aiworkflow_project.projects import storage

        self.assertEqual(storage._folder_data_path(Path("/fake")), "Blueprints/main.blueprint.json")

    def test_open_folder_project_errors_on_empty_root(self) -> None:
        from aiworkflow_project.projects import storage

        project, err = storage._open_folder_project(root_path="", name="test", create=False)
        self.assertIsNotNone(err)
        self.assertIsNone(project)

    def test_media_root_is_resolved(self) -> None:
        from aiworkflow_project.projects import storage

        root = storage._media_root_path()
        self.assertTrue(root.is_absolute())
        self.assertTrue(root.exists())
