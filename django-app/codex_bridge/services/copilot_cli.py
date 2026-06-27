from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Generator


COPILOT_MODELS = [
    "auto",
    "gpt-5.3-codex",
    "gpt-5.4",
    "gpt-5.2-codex",
    "gpt-5.2",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex",
    "gpt-5.1",
    "gpt-5.1-codex-mini",
    "gpt-5-mini",
    "gpt-4.1",
    "claude-sonnet-4.6",
    "claude-sonnet-4.5",
    "claude-haiku-4.5",
    "claude-opus-4.6",
    "claude-opus-4.6-fast",
    "claude-opus-4.5",
    "claude-sonnet-4",
    "gemini-3-pro-preview",
]


@dataclass(frozen=True)
class CopilotCliConfig:
    enabled: bool
    model: str
    workspace_root: str
    command: str = "copilot"
    home_root: str = ""
    startup_timeout_ms: int = 12000

    @property
    def is_configured(self) -> bool:
        return self.enabled


@dataclass(frozen=True)
class CopilotCliThread:
    thread_id: str
    model: str
    provider: str = "copilot-cli"


class CopilotCliBridgeClient:
    def __init__(self, config: CopilotCliConfig) -> None:
        self.config = config
        self._last_error = ""
        self._last_version = ""

    def health_check(self) -> dict[str, object]:
        if not self.config.is_configured:
            return {"configured": False, "reachable": False, "error": "Copilot CLI bridge is disabled"}

        command_path = self._resolve_command_path()
        if not command_path:
            error_message = f"Copilot CLI command not found: {self.config.command}"
            self._last_error = error_message
            return {
                "configured": False,
                "reachable": False,
                "error": error_message,
                "payload": self._health_payload(False, error_message, ""),
            }

        try:
            probe = subprocess.run(
                [command_path, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            error_message = str(exc)
            self._last_error = error_message
            return {
                "configured": False,
                "reachable": False,
                "error": error_message,
                "payload": self._health_payload(False, error_message, command_path),
            }

        version_text = (probe.stdout or probe.stderr or "").strip()
        if probe.returncode != 0:
            error_message = version_text or f"copilot --version exited with status {probe.returncode}"
            self._last_error = error_message
            return {
                "configured": False,
                "reachable": False,
                "error": error_message,
                "payload": self._health_payload(False, error_message, command_path),
            }

        self._last_version = version_text
        self._last_error = ""
        return {
            "configured": True,
            "reachable": True,
            "payload": self._health_payload(True, "", command_path),
        }

    def create_thread(self, title: str = "", cwd: str = "") -> CopilotCliThread:
        del title
        if not self.config.is_configured:
            raise RuntimeError("Copilot CLI bridge is not configured")
        command_path = self._resolve_command_path()
        if not command_path:
            raise RuntimeError(f"Copilot CLI command not found: {self.config.command}")
        normalized_cwd = cwd.strip() or self.config.workspace_root
        if normalized_cwd and not Path(normalized_cwd).exists():
            raise RuntimeError(f"Copilot working directory is unavailable: {normalized_cwd}")
        return CopilotCliThread(thread_id=str(uuid.uuid4()), model=self._normalized_model(self.config.model))

    def stream_turn(
        self,
        thread_id: str,
        content: str,
        cwd: str = "",
        references: list[dict[str, str]] | None = None,
        skill_hints: list[str] | None = None,
        execution_hints: list[str] | None = None,
        agent_mode: str = "agent",
        permission_profile: str = "default",
    ) -> Generator[dict[str, object], None, None]:
        if not self.config.is_configured:
            raise RuntimeError("Copilot CLI bridge is not configured")
        if not content.strip():
            raise RuntimeError("content is required")

        command_path = self._resolve_command_path()
        if not command_path:
            raise RuntimeError(f"Copilot CLI command not found: {self.config.command}")

        normalized_cwd = cwd.strip() or self.config.workspace_root
        if normalized_cwd and not Path(normalized_cwd).exists():
            raise RuntimeError(f"Copilot working directory is unavailable: {normalized_cwd}")

        mode = self._normalize_agent_mode(agent_mode)
        prompt = self._build_prompt(content, normalized_cwd, references or [], skill_hints or [], execution_hints or [], mode)
        command = self._build_command(command_path, prompt, mode, permission_profile)

        yield {
            "event": "runtime_context",
            "data": {
                "mode": "copilot-cli",
                "thread_id": thread_id,
                "agent_mode": mode,
                "model": self._normalized_model(self.config.model),
                "command": self.config.command,
                "cwd": normalized_cwd,
                "skills": [{"name": item} for item in (skill_hints or [])],
                "active_mcp_servers": [],
                "installed_cli_tools": [{"name": "copilot", "version": self._last_version}],
            },
        }

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
            cwd=normalized_cwd,
            env=self._build_env(),
        )

        assistant_text = ""
        assistant_message_id = ""
        turn_id = ""
        usage: dict[str, Any] = {}
        stderr_chunks: list[str] = []
        stdout_tail: list[str] = []
        started_at = time.monotonic()
        emitted_turn_completed = False

        assert process.stdout is not None
        assert process.stderr is not None

        for raw_line in process.stdout:
            line = raw_line.strip()
            if not line:
                continue
            stdout_tail.append(line)
            if len(stdout_tail) > 8:
                stdout_tail = stdout_tail[-8:]
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                yield {
                    "event": "debug_event",
                    "data": {"source": "copilot-cli", "raw": line[:4000]},
                }
                continue

            for event in self._map_jsonl_message(message, thread_id):
                event_name = str(event.get("event", ""))
                data = event.get("data", {}) if isinstance(event.get("data"), dict) else {}
                if event_name == "assistant_delta":
                    assistant_text = f"{assistant_text}{str(data.get('delta', ''))}"
                elif event_name == "assistant_done":
                    assistant_message_id = str(data.get("provider_message_id", assistant_message_id))
                    content_value = str(data.get("content", ""))
                    if content_value:
                        assistant_text = content_value
                    usage_value = data.get("usage", {})
                    if isinstance(usage_value, dict):
                        usage = usage_value
                elif event_name == "turn_started":
                    turn_value = data.get("turn", {})
                    if isinstance(turn_value, dict):
                        turn_id = str(turn_value.get("id", turn_id))
                elif event_name == "turn_completed":
                    emitted_turn_completed = True
                yield event

        stderr_text = process.stderr.read().strip()
        if stderr_text:
            stderr_chunks.append(stderr_text)

        exit_code = process.wait(timeout=5)
        duration_ms = int((time.monotonic() - started_at) * 1000)
        if exit_code != 0:
            error_text = "\n".join(item for item in stderr_chunks if item).strip()
            if not error_text:
                stdout_preview = "\n".join(stdout_tail).strip()
                error_text = f"Copilot CLI exited with status {exit_code}"
                if stdout_preview:
                    error_text = f"{error_text}\nstdout tail:\n{stdout_preview[:4000]}"
            yield {
                "event": "error",
                "data": {
                    "message": self._sanitize_error(error_text),
                    "additional_details": error_text[:4000],
                    "exit_code": exit_code,
                    "source": "copilot-cli",
                },
            }
            return

        if assistant_text and not assistant_message_id:
            assistant_message_id = str(uuid.uuid4())
            yield {
                "event": "assistant_done",
                "data": {
                    "content": assistant_text,
                    "provider_message_id": assistant_message_id,
                    "usage": usage,
                },
            }

        if not emitted_turn_completed:
            yield {
                "event": "turn_completed",
                "data": {
                    "turn": {
                        "id": turn_id or thread_id,
                        "status": "completed",
                        "duration_ms": duration_ms,
                        "source": "copilot-cli",
                    }
                },
            }

    def submit_approval(self, thread_id: str, request_id: str, decision: str) -> dict[str, object]:
        del thread_id, request_id, decision
        raise RuntimeError("Copilot CLI approval forwarding is not available in this adapter yet")

    def _build_command(self, command_path: str, prompt: str, agent_mode: str, permission_profile: str) -> list[str]:
        command = [
            command_path,
            "-p",
            prompt,
            "--output-format",
            "json",
            "--stream",
            "on",
            "--no-alt-screen",
            "--no-color",
            "--no-auto-update",
            "--log-level",
            "error",
        ]
        model = self._normalized_model(self.config.model)
        if model and model != "auto":
            command.extend(["--model", model])

        profile = str(permission_profile or "default").strip().lower()
        if agent_mode in {"ask", "plan"}:
            command.append("--no-ask-user")
        elif profile in {"allow-all", "full", "full-access", "yolo"}:
            command.append("--allow-all")
        return command

    def _build_prompt(
        self,
        content: str,
        cwd: str,
        references: list[dict[str, str]],
        skill_hints: list[str],
        execution_hints: list[str],
        agent_mode: str,
    ) -> str:
        lines: list[str] = []
        if agent_mode == "ask":
            lines.append("You are in Ask mode. Answer the user directly. Do not edit files or run tools unless explicitly necessary.")
        elif agent_mode == "plan":
            lines.append("You are in Plan mode. Produce an implementation plan first. Do not edit files or run commands.")
        else:
            lines.append("You are in Agent mode inside DVStudio. Help with the workspace task and report useful progress.")
        lines.append(f"Working directory: {cwd}")
        if references:
            lines.append("Workspace references:")
            lines.append(json.dumps(references, ensure_ascii=False, indent=2))
        if skill_hints:
            lines.append("Skill hints:")
            lines.extend(f"- {item}" for item in skill_hints if item)
        if execution_hints:
            lines.append("Execution hints:")
            lines.extend(f"- {item}" for item in execution_hints if item)
        lines.append("User request:")
        lines.append(content)
        return "\n\n".join(lines)

    def _map_jsonl_message(self, message: dict[str, Any], thread_id: str) -> list[dict[str, object]]:
        message_type = str(message.get("type", "")).strip()
        data = message.get("data", {}) if isinstance(message.get("data"), dict) else {}

        if message_type == "assistant.turn_start":
            turn_id = str(data.get("turnId", ""))
            return [{"event": "turn_started", "data": {"turn": {"id": turn_id or thread_id, "status": "inProgress"}}}]

        if message_type == "assistant.message_delta":
            delta = self._pick_string(data.get("deltaContent"), data.get("delta"), data.get("text"))
            item_id = self._pick_string(data.get("messageId"), message.get("id"))
            return [{"event": "assistant_delta", "data": {"item_id": item_id, "delta": delta}}] if delta else []

        if message_type == "assistant.message":
            content = self._pick_string(data.get("content"), data.get("text"))
            item_id = self._pick_string(data.get("messageId"), message.get("id"))
            output_tokens = data.get("outputTokens")
            usage = {"output_tokens": output_tokens} if isinstance(output_tokens, int) else {}
            events: list[dict[str, object]] = []
            tool_requests = data.get("toolRequests", [])
            if isinstance(tool_requests, list):
                for index, tool in enumerate(tool_requests):
                    if not isinstance(tool, dict):
                        continue
                    events.append(self._map_tool_request(tool, index))
            events.append(
                {
                    "event": "assistant_done",
                    "data": {
                        "item_id": item_id,
                        "content": content,
                        "provider_message_id": item_id,
                        "usage": usage,
                    },
                }
            )
            return events

        if message_type == "assistant.turn_end":
            turn_id = str(data.get("turnId", ""))
            return [{"event": "turn_completed", "data": {"turn": {"id": turn_id or thread_id, "status": "completed"}}}]

        if message_type == "result":
            usage = message.get("usage", {}) if isinstance(message.get("usage"), dict) else {}
            session_id = self._pick_string(message.get("sessionId"), thread_id)
            return [{"event": "usage", "data": {"session_id": session_id, **usage}}] if usage else []

        if message_type.endswith("error") or message_type == "error":
            text = self._pick_string(data.get("message"), data.get("error"), message.get("message"), "Copilot CLI error")
            return [{"event": "error", "data": {"message": text, "source": "copilot-cli", "payload": message}}]

        return [{"event": "debug_event", "data": {"source": "copilot-cli", "type": message_type, "payload": message}}]

    def _map_tool_request(self, tool: dict[str, Any], index: int) -> dict[str, object]:
        item_id = self._pick_string(tool.get("id"), f"copilot-tool-{index + 1}")
        name = self._pick_string(tool.get("name"), tool.get("toolName"), "tool")
        payload = tool.get("input", tool.get("arguments", {}))
        if name.lower() in {"run_shell_command", "shell", "terminal", "bash"}:
            command_value = payload.get("command", "") if isinstance(payload, dict) else ""
            command_list = [str(command_value)] if command_value else []
            return {
                "event": "command_started",
                "data": {
                    "item_id": item_id,
                    "command": command_list,
                    "status": "inProgress",
                    "provider_payload": tool,
                },
            }
        return {
            "event": "skill_call",
            "data": {
                "name": name,
                "status": "pending",
                "input": payload,
                "provider_payload": tool,
            },
        }

    def _health_payload(self, reachable: bool, error: str, command_path: str) -> dict[str, object]:
        return {
            "status": "ok" if reachable else "error",
            "mode": "copilot-cli-jsonl",
            "configured": reachable,
            "reachable": reachable,
            "supports_streaming": True,
            "command": self.config.command,
            "command_path": command_path,
            "version": self._last_version,
            "effective_provider": "copilot-cli",
            "effective_provider_name": "GitHub Copilot CLI",
            "effective_model": self._normalized_model(self.config.model),
            "workspace_root": self.config.workspace_root,
            "copilot_home": self.config.home_root or str(Path.home() / ".copilot"),
            "models": COPILOT_MODELS,
            "error": error or self._last_error,
        }

    def _resolve_command_path(self) -> str:
        command = self.config.command.strip() or "copilot"
        found = shutil.which(command)
        if found:
            return found
        if Path(command).exists():
            return command
        if Path(command).name != "copilot":
            return ""
        nvm_root = Path.home() / ".nvm" / "versions" / "node"
        if not nvm_root.exists():
            return ""
        candidates = sorted(nvm_root.glob("*/bin/copilot"), key=lambda item: item.as_posix(), reverse=True)
        for item in candidates:
            if item.exists() and os.access(item, os.X_OK):
                return str(item)
        return ""

    def _build_env(self) -> dict[str, str]:
        env = os.environ.copy()
        if self.config.home_root.strip():
            env["COPILOT_HOME"] = self.config.home_root.strip()
        env.setdefault("COPILOT_AUTO_UPDATE", "false")
        return env

    @staticmethod
    def _normalize_agent_mode(value: str) -> str:
        normalized = str(value or "agent").strip().lower()
        if normalized in {"ask", "plan"}:
            return normalized
        return "agent"

    @staticmethod
    def _normalized_model(value: str) -> str:
        model = str(value or "auto").strip()
        return model or "auto"

    @staticmethod
    def _pick_string(*values: object) -> str:
        for value in values:
            if isinstance(value, str) and value.strip():
                return value
        return ""

    @staticmethod
    def _sanitize_error(value: str) -> str:
        text = re.sub(r"\x1b\[[0-9;]*m", "", str(value or "")).strip()
        if "not logged" in text.lower() or "login" in text.lower():
            return "Copilot CLI is not authenticated. Run `copilot login` in a terminal, then retry."
        return text or "Copilot CLI failed"
