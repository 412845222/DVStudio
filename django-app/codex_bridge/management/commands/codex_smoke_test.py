from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.test import Client


class Command(BaseCommand):
    help = "Run Codex bridge smoke test with optional target file/folder and persist results."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--project-id", type=int, required=True, help="Project id for session isolation.")
        parser.add_argument("--title", type=str, default="Codex Smoke Session", help="Session title.")
        parser.add_argument("--model", type=str, default="doubao-seed-2.0-code", help="Codex model name.")
        parser.add_argument("--cwd", type=str, default="", help="Workspace cwd for codex thread.")
        parser.add_argument("--target-file", type=str, default="", help="Workspace-relative file path to read.")
        parser.add_argument("--target-dir", type=str, default="", help="Workspace-relative folder path to scan.")
        parser.add_argument(
            "--output-file",
            type=str,
            default="django-app/codex_bridge/smoke_reports/latest-smoke-report.md",
            help="Workspace-relative output path for generated report.",
        )
        parser.add_argument(
            "--prompt",
            type=str,
            default="",
            help="Custom user prompt. If empty, command builds one based on target args.",
        )

    def handle(self, *args, **options):
        project_id = int(options["project_id"])
        target_file = str(options.get("target_file") or "").strip()
        target_dir = str(options.get("target_dir") or "").strip()
        output_file = str(options.get("output_file") or "").strip()
        title = str(options.get("title") or "Codex Smoke Session").strip()
        model = str(options.get("model") or "doubao-seed-2.0-code").strip()
        cwd = str(options.get("cwd") or "").strip()
        custom_prompt = str(options.get("prompt") or "").strip()

        workspace_root = Path(__file__).resolve().parents[4]
        resolved_target_file = (workspace_root / target_file).resolve() if target_file else None
        resolved_target_dir = (workspace_root / target_dir).resolve() if target_dir else None
        resolved_output_file = (workspace_root / output_file).resolve()

        if target_file and (resolved_target_file is None or not resolved_target_file.exists()):
            raise CommandError(f"target file not found: {target_file}")
        if target_dir and (resolved_target_dir is None or not resolved_target_dir.exists()):
            raise CommandError(f"target directory not found: {target_dir}")

        references: list[dict[str, str]] = []
        if target_file:
            references.append({"path": target_file.replace("\\", "/"), "name": Path(target_file).name, "kind": "file"})
        if target_dir:
            references.append({"path": target_dir.replace("\\", "/"), "name": Path(target_dir).name, "kind": "directory"})

        prompt = custom_prompt or self._build_prompt(
            target_file=target_file,
            target_dir=target_dir,
            output_file=output_file,
        )

        client = Client()
        created = self._create_session(
            client=client,
            project_id=project_id,
            title=title,
            model=model,
            cwd=cwd,
        )

        session_id = str(created.get("id", "")).strip()
        if not session_id:
            raise CommandError("failed to create codex session: missing session id")

        self.stdout.write(self.style.SUCCESS(f"Session created: {session_id}"))

        started_at = time.time()
        stream_result = self._stream_turn(
            client=client,
            session_id=session_id,
            project_id=project_id,
            prompt=prompt,
            references=references,
        )
        elapsed = time.time() - started_at

        report_payload = {
            "project_id": project_id,
            "session_id": session_id,
            "model": model,
            "cwd": cwd,
            "target_file": target_file,
            "target_dir": target_dir,
            "output_file": output_file,
            "elapsed_seconds": round(elapsed, 2),
            "event_stats": stream_result["event_stats"],
            "assistant_text": stream_result["assistant_text"],
            "errors": stream_result["errors"],
            "events": stream_result["events"],
        }

        resolved_output_file.parent.mkdir(parents=True, exist_ok=True)
        report_text = self._render_report(report_payload)
        resolved_output_file.write_text(report_text, encoding="utf-8")

        json_log_file = resolved_output_file.with_suffix(".json")
        json_log_file.write_text(json.dumps(report_payload, ensure_ascii=False, indent=2), encoding="utf-8")

        has_turn_done = int(stream_result["event_stats"].get("turn_done", 0)) > 0
        has_error = bool(stream_result["errors"])
        if not has_error and has_turn_done:
            self.stdout.write(self.style.SUCCESS("Smoke test finished successfully."))
        else:
            self.stdout.write(self.style.WARNING(f"Smoke finished with issues. See: {json_log_file}"))

        self.stdout.write(f"Report file: {resolved_output_file}")
        self.stdout.write(f"JSON log: {json_log_file}")
        if has_error or not has_turn_done:
            raise CommandError(
                f"smoke criteria not met: has_error={has_error}, has_turn_done={has_turn_done}. check {json_log_file}"
            )

    def _create_session(self, client: Client, project_id: int, title: str, model: str, cwd: str) -> dict[str, Any]:
        resp = client.post(
            "/api/workflow/codex/sessions",
            data=json.dumps(
                {
                    "projectId": project_id,
                    "title": title,
                    "model": model,
                    "cwd": cwd,
                }
            ),
            content_type="application/json",
        )
        if resp.status_code != 201:
            raise CommandError(f"session create failed: status={resp.status_code}, body={resp.content.decode('utf-8', errors='ignore')}")
        return json.loads(resp.content.decode("utf-8"))

    def _stream_turn(
        self,
        client: Client,
        session_id: str,
        project_id: int,
        prompt: str,
        references: list[dict[str, str]],
    ) -> dict[str, Any]:
        resp = client.post(
            f"/api/workflow/codex/sessions/{session_id}/messages:stream",
            data=json.dumps(
                {
                    "projectId": project_id,
                    "content": prompt,
                    "references": references,
                    "skillHints": ["scan folder", "read file", "save report"],
                    "executionHints": ["non-destructive", "prefer workspace-relative paths"],
                }
            ),
            content_type="application/json",
            HTTP_ACCEPT="text/event-stream",
        )
        if resp.status_code != 200:
            raise CommandError(f"stream failed: status={resp.status_code}, body={resp.content.decode('utf-8', errors='ignore')}")

        streaming_content = getattr(resp, "streaming_content", None)
        if streaming_content is not None:
            raw = b"".join(streaming_content).decode("utf-8", errors="replace")
        else:
            raw = resp.content.decode("utf-8", errors="replace")
        events = self._parse_sse(raw)
        event_stats: dict[str, int] = {}
        assistant_parts: list[str] = []
        errors: list[str] = []

        for item in events:
            name = str(item.get("event", "message"))
            event_stats[name] = event_stats.get(name, 0) + 1
            data = item.get("data")
            if not isinstance(data, dict):
                continue
            if name == "assistant_delta":
                delta = str(data.get("delta", ""))
                if delta:
                    assistant_parts.append(delta)
            elif name == "assistant_done":
                final_text = str(data.get("content", ""))
                if final_text:
                    assistant_parts = [final_text]
            elif name == "error":
                errors.append(str(data.get("message", "unknown error")))

        return {
            "events": events,
            "event_stats": event_stats,
            "assistant_text": "".join(assistant_parts).strip(),
            "errors": errors,
        }

    def _parse_sse(self, text: str) -> list[dict[str, Any]]:
        chunks = text.split("\n\n")
        items: list[dict[str, Any]] = []
        for chunk in chunks:
            lines = [line.strip() for line in chunk.splitlines() if line.strip()]
            if not lines:
                continue
            event_name = "message"
            data_payload: Any = {}
            for line in lines:
                if line.startswith("event:"):
                    event_name = line.split(":", 1)[1].strip() or "message"
                elif line.startswith("data:"):
                    data_text = line.split(":", 1)[1].strip()
                    try:
                        data_payload = json.loads(data_text)
                    except Exception:
                        data_payload = {"raw": data_text}
            items.append({"event": event_name, "data": data_payload})
        return items

    def _build_prompt(self, target_file: str, target_dir: str, output_file: str) -> str:
        lines = [
            "请执行一次开发冒烟任务并返回结果。",
            "目标要求：",
            "1. 扫描目标目录，概述目录下关键文件。",
            "2. 阅读目标文件，提取主要功能点。",
            "3. 生成一份 Markdown 报告并写入指定输出文件。",
        ]
        if target_dir:
            lines.append(f"- 目标目录: {target_dir}")
        if target_file:
            lines.append(f"- 目标文件: {target_file}")
        lines.append(f"- 输出文件: {output_file}")
        lines.append("执行前先给出计划，执行后给出完成摘要。")
        return "\n".join(lines)

    def _render_report(self, payload: dict[str, Any]) -> str:
        event_stats = payload.get("event_stats", {})
        stat_lines = []
        if isinstance(event_stats, dict):
            for key in sorted(event_stats.keys()):
                stat_lines.append(f"- {key}: {event_stats[key]}")

        errors = payload.get("errors", [])
        error_lines = []
        if isinstance(errors, list) and errors:
            error_lines = [f"- {str(e)}" for e in errors]
        else:
            error_lines = ["- none"]

        assistant_text = str(payload.get("assistant_text", "")).strip() or "(empty)"
        return "\n".join(
            [
                "# Codex Smoke Report",
                "",
                f"- project_id: {payload.get('project_id')}",
                f"- session_id: {payload.get('session_id')}",
                f"- model: {payload.get('model')}",
                f"- elapsed_seconds: {payload.get('elapsed_seconds')}",
                f"- target_file: {payload.get('target_file') or '(none)'}",
                f"- target_dir: {payload.get('target_dir') or '(none)'}",
                f"- output_file: {payload.get('output_file')}",
                "",
                "## Event Stats",
                *stat_lines,
                "",
                "## Errors",
                *error_lines,
                "",
                "## Assistant Output",
                assistant_text,
                "",
            ]
        )
