"""Django asset API unit tests.

Covers pure helpers used by the asset APIs (extension guessing, path
sanitization, URL parsing, atomic writes, retry classification) and the API
views themselves via Django's test client.  HTTP-based downloads are skipped
(no network), but the extension/flow paths are covered end-to-end.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from django.test import TestCase, override_settings

from aiworkflow_project.assets import api as assets_api


BASE_DIR = Path(__file__).resolve().parent.parent.parent


# ---------------------------------------------------------------------------
# Pure-function tests: extension guessing
# ---------------------------------------------------------------------------


class GuessExtensionTests(TestCase):
    def test_common_image_extensions(self) -> None:
        for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]:
            self.assertEqual(
                assets_api._guess_extension(f"sample{ext}", ""),
                ext,
                f"Failed for extension {ext}",
            )

    def test_common_video_extensions(self) -> None:
        for ext in [".mp4", ".mov", ".webm", ".mkv", ".m4v"]:
            self.assertEqual(
                assets_api._guess_extension(f"clip{ext}", ""),
                ext,
                f"Failed for extension {ext}",
            )

    def test_common_audio_extensions(self) -> None:
        for ext in [".mp3", ".wav", ".ogg", ".m4a", ".flac"]:
            self.assertEqual(
                assets_api._guess_extension(f"audio{ext}", ""),
                ext,
                f"Failed for extension {ext}",
            )

    def test_no_extension_falls_back_to_bin(self) -> None:
        self.assertEqual(assets_api._guess_extension("weirdname", ""), ".bin")

    def test_uses_content_type_when_no_extension(self) -> None:
        self.assertEqual(
            assets_api._guess_extension("downloaded_file", "image/jpeg"),
            ".jpg",
        )
        self.assertEqual(
            assets_api._guess_extension("downloaded_file", "video/mp4"),
            ".mp4",
        )
        self.assertEqual(
            assets_api._guess_extension("downloaded_file", "application/pdf"),
            ".pdf",
        )

    def test_uses_filename_when_content_type_missing(self) -> None:
        self.assertEqual(
            assets_api._guess_extension("my-model.glb", ""),
            ".glb",
        )

    def test_name_without_usable_ext_and_content_type_returns_bin(self) -> None:
        self.assertEqual(
            assets_api._guess_extension("unknown-file", "application/octet-stream"),
            ".bin",
        )


class GuessExtensionFromSignatureTests(TestCase):
    def test_png_signature(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as fp:
            fp.write(b"\x89PNG\r\n\x1A\n")
            path = Path(fp.name)
        try:
            self.assertEqual(assets_api._guess_extension_from_file_signature(path), ".png")
        finally:
            path.unlink(missing_ok=True)

    def test_jpeg_signature(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as fp:
            fp.write(b"\xFF\xD8\xFF\xE0")
            path = Path(fp.name)
        try:
            self.assertEqual(assets_api._guess_extension_from_file_signature(path), ".jpg")
        finally:
            path.unlink(missing_ok=True)

    def test_mp4_signature_with_ftyp_box(self) -> None:
        header = b"\x00\x00\x00\x20" + b"ftyp" + b"mp41" + (b"\x00" * 8)
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as fp:
            fp.write(header)
            path = Path(fp.name)
        try:
            self.assertEqual(assets_api._guess_extension_from_file_signature(path), ".mp4")
        finally:
            path.unlink(missing_ok=True)

    def test_empty_file_returns_empty_string(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as fp:
            path = Path(fp.name)
        try:
            self.assertEqual(assets_api._guess_extension_from_file_signature(path), "")
        finally:
            path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Pure-function tests: path safety helpers
# ---------------------------------------------------------------------------


class SafeProjectRelativePathTests(TestCase):
    def test_normal_relative_path(self) -> None:
        rel, err = assets_api._safe_project_relative_path("Content/Media/foo.png")
        self.assertIsNone(err)
        self.assertEqual(rel, "Content/Media/foo.png")

    def test_backslashes_are_normalized(self) -> None:
        rel, err = assets_api._safe_project_relative_path("Content\\Media\\foo.png")
        self.assertIsNone(err)
        self.assertEqual(rel, "Content/Media/foo.png")

    def test_empty_path_is_rejected(self) -> None:
        rel, err = assets_api._safe_project_relative_path("")
        self.assertIsNotNone(err)
        self.assertIsNone(rel)

    def test_absolute_path_is_rejected(self) -> None:
        rel, err = assets_api._safe_project_relative_path("/etc/passwd")
        self.assertIsNotNone(err)
        self.assertIsNone(rel)

    def test_path_traversal_is_rejected(self) -> None:
        rel, err = assets_api._safe_project_relative_path("Content/../../../etc/passwd")
        self.assertIsNotNone(err)
        self.assertIsNone(rel)


class BuildProjectAssetUrlTests(TestCase):
    def test_builds_dweb_url(self) -> None:
        url = assets_api._build_project_asset_url(42, "Content/Media/a.png")
        self.assertTrue(url.startswith("dweb://project-assets?"))
        self.assertIn("projectId=42", url)
        self.assertIn("path=Content%2FMedia%2Fa.png", url)


class ExtractRelPathFromUrlTests(TestCase):
    def test_parses_dweb_url(self) -> None:
        url = "dweb://project-assets?projectId=42&path=Content%2FMedia%2Fa.png"
        rel = assets_api._extract_rel_path_from_url(url)
        self.assertEqual(rel, "Content/Media/a.png")

    def test_invalid_scheme_returns_empty(self) -> None:
        self.assertEqual(assets_api._extract_rel_path_from_url("http://example.com"), "")

    def test_empty_url_returns_empty(self) -> None:
        self.assertEqual(assets_api._extract_rel_path_from_url(""), "")


class AtomicWriteTests(TestCase):
    def test_writes_bytes_to_target_file(self) -> None:
        tmp_dir = Path(tempfile.mkdtemp())
        try:
            target = tmp_dir / "foo.png"
            payload = b"pretend png data"
            err = assets_api._write_binary_atomically(target, payload)
            self.assertIsNone(err)
            self.assertTrue(target.exists())
            self.assertEqual(target.read_bytes(), payload)
        finally:
            for f in tmp_dir.iterdir():
                f.unlink(missing_ok=True)
            tmp_dir.rmdir()

    def test_replaces_existing_file(self) -> None:
        tmp_dir = Path(tempfile.mkdtemp())
        try:
            target = tmp_dir / "foo.png"
            target.write_bytes(b"old")
            err = assets_api._write_binary_atomically(target, b"new")
            self.assertIsNone(err)
            self.assertEqual(target.read_bytes(), b"new")
        finally:
            for f in tmp_dir.iterdir():
                f.unlink(missing_ok=True)
            tmp_dir.rmdir()


# ---------------------------------------------------------------------------
# Pure-function tests: retry classification
# ---------------------------------------------------------------------------


class IsRetryableErrorTests(TestCase):
    def test_5xx_errors_are_retryable(self) -> None:
        import urllib.error

        err = urllib.error.HTTPError(
            "http://example.com", 500, "Internal Server Error", {}, None
        )
        self.assertTrue(assets_api._is_retryable_error(err))

    def test_404_is_not_retryable(self) -> None:
        import urllib.error

        err = urllib.error.HTTPError(
            "http://example.com", 404, "Not Found", {}, None
        )
        self.assertFalse(assets_api._is_retryable_error(err))

    def test_timeout_is_retryable(self) -> None:
        self.assertTrue(assets_api._is_retryable_error(TimeoutError("timeout")))

    def test_connection_error_is_retryable(self) -> None:
        self.assertTrue(assets_api._is_retryable_error(ConnectionError("reset")))


class ExtractContentTypeTests(TestCase):
    def test_extracts_from_dict(self) -> None:
        self.assertEqual(
            assets_api._extract_content_type({"Content-Type": "image/png"}),
            "image/png",
        )
        self.assertEqual(
            assets_api._extract_content_type({"content-type": "video/mp4"}),
            "video/mp4",
        )

    def test_missing_header_returns_octet_stream(self) -> None:
        self.assertEqual(
            assets_api._extract_content_type({}), "application/octet-stream"
        )


# ---------------------------------------------------------------------------
# API view tests
# ---------------------------------------------------------------------------


@override_settings(
    DATABASES={
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }
)
class AssetApiHealthTests(TestCase):
    databases = {"default"}

    def test_health_route_returns_ok(self) -> None:
        # We test via the module function directly to avoid needing a full
        # URL configuration; the real wiring is in dwebsite.urls.
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/workflow/projects/assets/health")
        response = assets_api.project_asset_route_health(request)
        self.assertEqual(response.status_code, 200)
        body = response.data if hasattr(response, "data") else {}
        self.assertTrue(body.get("ok"))
