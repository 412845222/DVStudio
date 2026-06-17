from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Generator

from django.conf import settings
from django.utils import timezone

from codex_bridge.models import ChatMessage, ChatSession
from dwebapp.ai.credentials_store import get_codex_api_key

from .codex import CodexBridgeClient, CodexConfig
from .copilot_cli import CopilotCliBridgeClient, CopilotCliConfig

logger = logging.getLogger("codex_bridge")


class CodexOrchestrator:
    def __init__(self) -> None:
        self.codex_bridge = CodexBridgeClient(self._build_config())
        self.copilot_bridge = CopilotCliBridgeClient(self._build_copilot_config())
        self._bridge_by_model: dict[str, CodexBridgeClient] = {}
        self._copilot_bridge_by_model: dict[str, CopilotCliBridgeClient] = {}

    def _build_config(self) -> CodexConfig:
        return CodexConfig(
            enabled=bool(getattr(settings, "CODEX_ENABLED", True)),
            model=str(getattr(settings, "CODEX_MODEL", "doubao-seed-2-0-Pro")).strip(),
            provider=str(getattr(settings, "CODEX_PROVIDER", "openai")).strip() or "openai",
            base_url=str(getattr(settings, "CODEX_BASE_URL", "")).strip(),
            env_key_name=str(getattr(settings, "CODEX_ENV_KEY_NAME", "ARK_API_KEY")).strip() or "ARK_API_KEY",
            api_key=str(get_codex_api_key() or "").strip(),
            workspace_root=str(getattr(settings, "CODEX_WORKSPACE_ROOT", "")).strip() or str(Path.cwd()),
            sandbox_mode=str(getattr(settings, "CODEX_SANDBOX_MODE", "workspace-write")).strip() or "workspace-write",
            approval_policy=str(getattr(settings, "CODEX_APPROVAL_POLICY", "on-request")).strip() or "on-request",
            command=str(getattr(settings, "CODEX_COMMAND", "codex")).strip() or "codex",
            home_root=str(getattr(settings, "CODEX_HOME_ROOT", "")).strip(),
            startup_timeout_ms=int(getattr(settings, "CODEX_STARTUP_TIMEOUT_MS", 8000)),
        )

    def _build_copilot_config(self, model: str | None = None) -> CopilotCliConfig:
        normalized_model = str(model or getattr(settings, "COPILOT_CLI_MODEL", "auto")).strip() or "auto"
        return CopilotCliConfig(
            enabled=bool(getattr(settings, "COPILOT_CLI_ENABLED", True)),
            model=normalized_model,
            workspace_root=str(getattr(settings, "COPILOT_CLI_WORKSPACE_ROOT", "")).strip() or str(Path.cwd()),
            command=str(getattr(settings, "COPILOT_CLI_COMMAND", "copilot")).strip() or "copilot",
            home_root=str(getattr(settings, "COPILOT_CLI_HOME_ROOT", "")).strip(),
            startup_timeout_ms=int(getattr(settings, "COPILOT_CLI_STARTUP_TIMEOUT_MS", 12000)),
        )

    def _build_bridge(self, model: str | None = None) -> CodexBridgeClient:
        cfg = self._build_config()
        normalized_model = str(model or "").strip()
        if normalized_model:
            cfg = CodexConfig(
                enabled=cfg.enabled,
                model=normalized_model,
                provider=cfg.provider,
                base_url=cfg.base_url,
                env_key_name=cfg.env_key_name,
                workspace_root=cfg.workspace_root,
                sandbox_mode=cfg.sandbox_mode,
                approval_policy=cfg.approval_policy,
                api_key=cfg.api_key,
                command=cfg.command,
                home_root=cfg.home_root,
                startup_timeout_ms=cfg.startup_timeout_ms,
            )
        return CodexBridgeClient(cfg)

    def _bridge_for_model(self, model: str | None = None) -> CodexBridgeClient:
        normalized_model = str(model or "").strip()
        if not normalized_model:
            return self.codex_bridge
        if normalized_model == self.codex_bridge.config.model:
            return self.codex_bridge
        bridge = self._bridge_by_model.get(normalized_model)
        if bridge is None:
            bridge = self._build_bridge(normalized_model)
            self._bridge_by_model[normalized_model] = bridge
        return bridge

    def _copilot_bridge_for_model(self, model: str | None = None) -> CopilotCliBridgeClient:
        normalized_model = str(model or "").strip() or str(getattr(settings, "COPILOT_CLI_MODEL", "auto")).strip() or "auto"
        if normalized_model == self.copilot_bridge.config.model:
            return self.copilot_bridge
        bridge = self._copilot_bridge_by_model.get(normalized_model)
        if bridge is None:
            bridge = CopilotCliBridgeClient(self._build_copilot_config(normalized_model))
            self._copilot_bridge_by_model[normalized_model] = bridge
        return bridge

    def create_session(self, title: str, cwd: str = "", model: str = "", project_id: int | None = None, provider: str = "codex") -> ChatSession:
        normalized_provider = str(provider or "codex").strip().lower()
        use_copilot = normalized_provider in {"copilot", "copilot-cli"}
        bridge = self._copilot_bridge_for_model(model) if use_copilot else self._bridge_for_model(model)
        thread = bridge.create_thread(title=title, cwd=cwd)
        logger.info(
            "orchestrator_create_session project_id=%s provider=%s title=%r cwd=%r model=%s",
            project_id,
            "copilot-cli" if use_copilot else "codex",
            title,
            cwd,
            thread.model,
        )
        return ChatSession.objects.create(
            title=title,
            provider="copilot-cli" if use_copilot else "codex",
            model_name=thread.model,
            provider_thread_id=thread.thread_id,
            project_id=project_id,
            cwd=cwd or bridge.config.workspace_root,
            approval_policy=getattr(bridge.config, "approval_policy", "on-request"),
            sandbox_policy={"type": getattr(bridge.config, "sandbox_mode", "workspace-write")},
            metadata={"provider": thread.provider},
        )

    def stream_message(
        self,
        session: ChatSession,
        content: str,
        references: list[dict[str, str]] | None = None,
        skill_hints: list[str] | None = None,
        execution_hints: list[str] | None = None,
        agent_mode: str = "agent",
        permission_profile: str = "default",
    ) -> Generator[str, None, None]:
        refs = self._normalize_references(references)
        use_copilot = str(session.provider or "").strip().lower() in {"copilot", "copilot-cli"}
        bridge = self._copilot_bridge_for_model(session.model_name) if use_copilot else self._bridge_for_model(session.model_name)
        logger.info(
            "orchestrator_stream_start session_id=%s project_id=%s provider=%s refs=%s skill_hints=%s execution_hints=%s",
            session.id,
            session.project_id,
            session.provider,
            len(refs),
            len(skill_hints or []),
            len(execution_hints or []),
        )
        event_stats: dict[str, int] = {}
        user_message = ChatMessage.objects.create(
            session=session,
            role=ChatMessage.Role.USER,
            content=self._render_user_content(content, refs),
            status=ChatMessage.Status.COMPLETED,
        )
        assistant_message = ChatMessage.objects.create(
            session=session,
            role=ChatMessage.Role.ASSISTANT,
            content="",
            status=ChatMessage.Status.PENDING,
            item_type="agent_message",
            stream_phase="commentary",
        )
        session.last_turn_status = "inProgress"
        session.save(update_fields=["last_turn_status", "updated_at"])

        yield self._sse("session_started", {"session_id": str(session.id), "user_message_id": str(user_message.id)})

        tool_messages: dict[str, ChatMessage] = {}

        try:
            stream = (
                bridge.stream_turn(
                    session.provider_thread_id,
                    content,
                    cwd=session.cwd or bridge.config.workspace_root,
                    references=refs,
                    skill_hints=skill_hints or [],
                    execution_hints=execution_hints or [],
                    agent_mode=agent_mode,
                    permission_profile=permission_profile,
                )
                if use_copilot
                else bridge.stream_turn(
                    session.provider_thread_id,
                    content,
                    cwd=session.cwd or bridge.config.workspace_root,
                    references=refs,
                    skill_hints=skill_hints or [],
                    execution_hints=execution_hints or [],
                )
            )
            for event in stream:
                event_name = str(event.get("event", "message"))
                event_stats[event_name] = event_stats.get(event_name, 0) + 1
                payload = event.get("data", {})
                if not isinstance(payload, dict):
                    payload = {}

                if event_name == "plan_update":
                    self._upsert_plan_message(session, payload)
                    yield self._sse("plan_update", payload)
                    continue

                if event_name == "runtime_context":
                    yield self._sse("runtime_context", payload)
                    continue

                if event_name == "debug_event":
                    yield self._sse("debug_event", payload)
                    continue

                if event_name == "usage":
                    yield self._sse("usage", payload)
                    continue

                if event_name == "turn_started":
                    yield self._sse("turn_started", payload)
                    continue

                if event_name == "command_started":
                    msg = self._create_command_message(session, payload)
                    tool_messages[str(msg.provider_item_id)] = msg
                    yield self._sse("command_started", {"message_id": str(msg.id), **payload})
                    continue

                if event_name == "command_delta":
                    msg = tool_messages.get(str(payload.get("item_id", "")))
                    if msg is not None:
                        delta = str(payload.get("delta", ""))
                        if delta:
                            msg.content = f"{msg.content}{delta}"
                            msg.save(update_fields=["content", "updated_at"])
                        yield self._sse("command_delta", {"message_id": str(msg.id), **payload})
                    continue

                if event_name == "command_completed":
                    msg = tool_messages.get(str(payload.get("item_id", "")))
                    if msg is not None:
                        msg.status = self._resolve_tool_status(payload)
                        msg.command = {**msg.command, **payload}
                        msg.save(update_fields=["status", "command", "updated_at"])
                        yield self._sse("command_completed", {"message_id": str(msg.id), **payload})
                    continue

                if event_name == "file_change_started":
                    msg = self._create_file_change_message(session, payload)
                    tool_messages[str(msg.provider_item_id)] = msg
                    yield self._sse("file_change_started", {"message_id": str(msg.id), **payload})
                    continue

                if event_name == "file_change_completed":
                    msg = tool_messages.get(str(payload.get("item_id", "")))
                    if msg is not None:
                        msg.status = self._resolve_tool_status(payload)
                        changes = payload.get("changes", [])
                        msg.file_changes = changes if isinstance(changes, list) else []
                        msg.provider_payload = payload
                        msg.content = self._render_file_change_content(payload)
                        msg.save(update_fields=["status", "file_changes", "provider_payload", "content", "updated_at"])
                        yield self._sse("file_change_completed", {"message_id": str(msg.id), **payload})
                    continue

                if event_name == "approval_requested":
                    msg = tool_messages.get(str(payload.get("item_id", "")))
                    if msg is not None:
                        msg.approval_request = payload
                        msg.provider_payload = {**msg.provider_payload, "approval_request": payload}
                        msg.save(update_fields=["approval_request", "provider_payload", "updated_at"])
                        yield self._sse("approval_requested", {"message_id": str(msg.id), **payload})
                    continue

                if event_name == "assistant_delta":
                    delta = str(payload.get("delta", ""))
                    if delta:
                        assistant_message.content = f"{assistant_message.content}{delta}"
                        assistant_message.save(update_fields=["content", "updated_at"])
                        yield self._sse("assistant_delta", payload)
                    continue

                if event_name == "assistant_done":
                    assistant_message.content = str(payload.get("content", assistant_message.content))
                    assistant_message.provider_message_id = str(payload.get("provider_message_id", ""))
                    usage = payload.get("usage", {})
                    assistant_message.usage = usage if isinstance(usage, dict) else {}
                    assistant_message.provider_payload = payload
                    assistant_message.stream_phase = "final_answer"
                    assistant_message.status = ChatMessage.Status.COMPLETED
                    assistant_message.error_message = ""
                    assistant_message.save(
                        update_fields=[
                            "content",
                            "provider_message_id",
                            "usage",
                            "provider_payload",
                            "stream_phase",
                            "status",
                            "error_message",
                            "updated_at",
                        ]
                    )
                    yield self._sse("assistant_done", {"assistant_message_id": str(assistant_message.id), "content": assistant_message.content})
                    if assistant_message.usage:
                        yield self._sse("usage", assistant_message.usage)
                    continue

                if event_name == "error":
                    assistant_message.status = ChatMessage.Status.FAILED
                    assistant_message.error_message = str(payload.get("additional_details") or payload.get("message") or "Codex turn failed")
                    assistant_message.save(update_fields=["status", "error_message", "updated_at"])
                    session.status = ChatSession.Status.FAILED
                    session.last_turn_status = "failed"
                    session.save(update_fields=["status", "last_turn_status", "updated_at"])
                    yield self._sse("error", {"message": assistant_message.error_message})
                    logger.warning(
                        "orchestrator_stream_error_event session_id=%s message=%r",
                        session.id,
                        assistant_message.error_message,
                    )
                    continue

                if event_name == "turn_completed":
                    turn = payload.get("turn", {})
                    if isinstance(turn, dict):
                        session.last_turn_status = str(turn.get("status", "completed"))
                    else:
                        session.last_turn_status = "completed"
                    if session.status != ChatSession.Status.FAILED:
                        session.status = ChatSession.Status.ACTIVE
                    session.updated_at = timezone.now()
                    session.save(update_fields=["last_turn_status", "status", "updated_at"])
                    yield self._sse("turn_done", payload)
                    logger.info(
                        "orchestrator_stream_turn_done session_id=%s status=%s events=%s",
                        session.id,
                        session.last_turn_status,
                        event_stats,
                    )
                    continue
        except Exception as exc:
            assistant_message.status = ChatMessage.Status.FAILED
            assistant_message.error_message = str(exc)
            assistant_message.save(update_fields=["status", "error_message", "updated_at"])
            session.status = ChatSession.Status.FAILED
            session.last_turn_status = "failed"
            session.save(update_fields=["status", "last_turn_status", "updated_at"])
            logger.exception(
                "orchestrator_stream_exception session_id=%s project_id=%s events=%s",
                session.id,
                session.project_id,
                event_stats,
            )
            yield self._sse("error", {"message": str(exc)})
        finally:
            logger.info(
                "orchestrator_stream_end session_id=%s project_id=%s assistant_status=%s event_stats=%s",
                session.id,
                session.project_id,
                assistant_message.status,
                event_stats,
            )

    def stream_message_mock(
        self,
        session: ChatSession,
        content: str,
        references: list[dict[str, str]] | None = None,
        skill_hints: list[str] | None = None,
        execution_hints: list[str] | None = None,
    ) -> Generator[str, None, None]:
        refs = self._normalize_references(references)
        logger.info(
            "orchestrator_stream_mock_start session_id=%s project_id=%s refs=%s skill_hints=%s execution_hints=%s",
            session.id,
            session.project_id,
            len(refs),
            len(skill_hints or []),
            len(execution_hints or []),
        )

        user_message = ChatMessage.objects.create(
            session=session,
            role=ChatMessage.Role.USER,
            content=self._render_user_content(content, refs),
            status=ChatMessage.Status.COMPLETED,
        )
        assistant_message = ChatMessage.objects.create(
            session=session,
            role=ChatMessage.Role.ASSISTANT,
            content="",
            status=ChatMessage.Status.PENDING,
            item_type="agent_message",
            stream_phase="commentary",
        )
        session.last_turn_status = "inProgress"
        session.save(update_fields=["last_turn_status", "updated_at"])

        assistant_parts = [
            "收到，我会先走测试流以确保 SSE 与事件解析链路稳定。",
            "\n\n",
            "当前运行在 mock 模式：不会调用本地 CLI 命令。",
            "\n\n",
            "接下来可以验证：plan、command、file change、skill 与 turn_done 事件都能正常显示。",
        ]
        final_text = "".join(assistant_parts)
        turn_id = f"mock-turn-{int(time.time() * 1000)}"
        command_item_id = f"mock-cmd-{int(time.time() * 1000)}"
        file_item_id = f"mock-file-{int(time.time() * 1000)}"
        approval_item_id = f"mock-approval-{int(time.time() * 1000)}"

        command_message = self._create_command_message(
            session,
            {
                "turn_id": turn_id,
                "item_id": command_item_id,
                "command": ["npm", "run", "build"],
                "cwd": session.cwd or str(Path.cwd()),
                "status": "inProgress",
            },
        )
        file_message = self._create_file_change_message(
            session,
            {
                "turn_id": turn_id,
                "item_id": file_item_id,
                "status": "inProgress",
                "changes": [
                    {"path": "src/ui/UIComponent/BottomChatDock.vue", "kind": "update"},
                    {"path": "src/views/AIWorkflow/node-business/chat/useAIWorkflowChatGeneration.ts", "kind": "update"},
                ],
            },
        )
        approval_message = self._create_command_message(
            session,
            {
                "turn_id": turn_id,
                "item_id": approval_item_id,
                "command": ["rm", "-rf", "node_modules/.cache"],
                "cwd": session.cwd or str(Path.cwd()),
                "status": "inProgress",
            },
        )

        yield self._sse("session_started", {"session_id": str(session.id), "user_message_id": str(user_message.id)})
        yield self._sse(
            "runtime_context",
            {
                "mode": "mock",
                "skills": [
                    {
                        "name": "smartflow-flow-converter",
                        "description": "Convert external workflows to Smartflow recipes.",
                    },
                    {
                        "name": "project-setup-info-local",
                        "description": "Scaffold full project setup in workspace.",
                    },
                ],
                "active_mcp_servers": [
                    {"name": "filesystem", "status": "connected"},
                    {"name": "github", "status": "connected"},
                ],
                "installed_cli_tools": [
                    {"name": "node", "version": "20.x"},
                    {"name": "npm", "version": "10.x"},
                ],
            },
        )

        plan_payload: dict[str, Any] = {
            "turn_id": turn_id,
            "explanation": "先验证 SSE 测试链路，再对齐 Agent 卡片/skill 展示。",
            "plan": [
                {"step": "发送 mock runtime context", "status": "completed"},
                {"step": "模拟 command / file change 事件", "status": "in_progress"},
                {"step": "输出 assistant 文本并 turn_done", "status": "pending"},
            ],
        }
        self._upsert_plan_message(session, plan_payload)
        yield self._sse("plan_update", plan_payload)

        yield self._sse(
            "command_started",
            {
                "message_id": str(command_message.id),
                "turn_id": turn_id,
                "item_id": command_item_id,
                "command": ["npm", "run", "build"],
                "cwd": session.cwd or str(Path.cwd()),
                "status": "inProgress",
            },
        )
        yield self._sse(
            "command_delta",
            {
                "message_id": str(command_message.id),
                "turn_id": turn_id,
                "item_id": command_item_id,
                "stream": "stdout",
                "delta": "vite v6.0.0 building for production...",
            },
        )
        command_message.content = "npm run build\n[vite] mock build completed"
        command_message.status = ChatMessage.Status.COMPLETED
        command_message.save(update_fields=["content", "status", "updated_at"])
        yield self._sse(
            "command_completed",
            {
                "message_id": str(command_message.id),
                "turn_id": turn_id,
                "item_id": command_item_id,
                "status": "completed",
                "exit_code": 0,
                "duration_ms": 420,
                "aggregated_output": "build success",
            },
        )

        yield self._sse(
            "file_change_started",
            {
                "message_id": str(file_message.id),
                "turn_id": turn_id,
                "item_id": file_item_id,
                "status": "inProgress",
                "changes": [
                    {"path": "src/ui/UIComponent/BottomChatDock.vue", "kind": "update"},
                    {"path": "src/views/AIWorkflow/node-business/chat/useAIWorkflowChatGeneration.ts", "kind": "update"},
                ],
            },
        )
        file_message.status = ChatMessage.Status.COMPLETED
        file_message.file_changes = [
            {"path": "src/ui/UIComponent/BottomChatDock.vue", "kind": "update"},
            {"path": "src/views/AIWorkflow/node-business/chat/useAIWorkflowChatGeneration.ts", "kind": "update"},
        ]
        file_message.save(update_fields=["status", "file_changes", "updated_at"])
        yield self._sse(
            "file_change_completed",
            {
                "message_id": str(file_message.id),
                "turn_id": turn_id,
                "item_id": file_item_id,
                "status": "completed",
                "changes": [
                    {"path": "src/ui/UIComponent/BottomChatDock.vue", "kind": "update"},
                    {"path": "src/views/AIWorkflow/node-business/chat/useAIWorkflowChatGeneration.ts", "kind": "update"},
                ],
            },
        )

        approval_request: dict[str, Any] = {
            "message_id": str(approval_message.id),
            "turn_id": turn_id,
            "item_id": approval_item_id,
            "request_id": f"mock-approval-{approval_message.id}",
            "approval_type": "command",
            "reason": "Mock approval request for UI verification",
            "available_decisions": ["accept", "decline"],
            "auto_decision": "",
        }
        approval_message.approval_request = approval_request
        approval_message.provider_payload = {"approval_request": approval_request}
        approval_message.save(update_fields=["approval_request", "provider_payload", "updated_at"])
        yield self._sse("approval_requested", approval_request)

        yield self._sse(
            "skill_call",
            {
                "name": "smartflow-flow-converter",
                "status": "completed",
                "description": "Convert workflow recipe into Smartflow nodes.",
                "input": {
                    "source": "workflow-blueprint",
                    "target": "agent-workflow",
                },
                "result": {
                    "nodes": 12,
                    "links": 18,
                },
            },
        )

        for part in assistant_parts:
            assistant_message.content = f"{assistant_message.content}{part}"
            assistant_message.save(update_fields=["content", "updated_at"])
            yield self._sse("assistant_delta", {"turn_id": turn_id, "delta": part})

        usage = {"input_tokens": 128, "output_tokens": 196, "total_tokens": 324}
        assistant_message.provider_payload = {"mock": True, "turn_id": turn_id}
        assistant_message.usage = usage
        assistant_message.provider_message_id = f"mock-assistant-{assistant_message.id}"
        assistant_message.stream_phase = "final_answer"
        assistant_message.status = ChatMessage.Status.COMPLETED
        assistant_message.error_message = ""
        assistant_message.save(
            update_fields=[
                "content",
                "provider_payload",
                "usage",
                "provider_message_id",
                "stream_phase",
                "status",
                "error_message",
                "updated_at",
            ]
        )

        session.last_turn_status = "completed"
        session.status = ChatSession.Status.ACTIVE
        session.updated_at = timezone.now()
        session.save(update_fields=["last_turn_status", "status", "updated_at"])

        yield self._sse(
            "assistant_done",
            {
                "assistant_message_id": str(assistant_message.id),
                "content": final_text,
            },
        )
        yield self._sse("usage", usage)
        yield self._sse("turn_done", {"turn": {"id": turn_id, "status": "completed", "mock": True}})

        logger.info(
            "orchestrator_stream_mock_end session_id=%s project_id=%s",
            session.id,
            session.project_id,
        )

    def submit_approval(self, session: ChatSession, message_id: str, decision: str) -> ChatMessage:
        normalized_decision = decision.strip()
        if normalized_decision not in {"accept", "acceptForSession", "decline", "cancel"}:
            raise RuntimeError("approval decision is invalid")

        tool_message = ChatMessage.objects.filter(session=session, id=message_id, role=ChatMessage.Role.TOOL).first()
        if tool_message is None:
            raise RuntimeError("approval message not found")

        approval_request = tool_message.approval_request if isinstance(tool_message.approval_request, dict) else {}
        request_id = str(approval_request.get("request_id", "")).strip()
        if not request_id:
            raise RuntimeError("approval request id is missing")

        bridge = self._bridge_for_model(session.model_name)
        bridge.submit_approval(session.provider_thread_id, request_id, normalized_decision)
        tool_message.approval_request = {**approval_request, "submitted_decision": normalized_decision}
        tool_message.provider_payload = {**tool_message.provider_payload, "approval_request": tool_message.approval_request}
        tool_message.save(update_fields=["approval_request", "provider_payload", "updated_at"])
        return tool_message

    def _upsert_plan_message(self, session: ChatSession, payload: dict[str, object]) -> ChatMessage:
        explanation = str(payload.get("explanation", "")).strip()
        plan = payload.get("plan", [])
        lines: list[str] = []
        if explanation:
            lines.append(explanation)
        if isinstance(plan, list):
            for item in plan:
                if not isinstance(item, dict):
                    continue
                step = str(item.get("step", "")).strip()
                status = str(item.get("status", "")).strip()
                if step:
                    lines.append(f"- [{status}] {step}")
        content = "\n".join(lines).strip() or "Plan updated"
        return ChatMessage.objects.create(
            session=session,
            role=ChatMessage.Role.TOOL,
            content=content,
            status=ChatMessage.Status.COMPLETED,
            item_type="plan",
            provider_payload=payload,
        )

    def _create_command_message(self, session: ChatSession, payload: dict[str, object]) -> ChatMessage:
        command = payload.get("command", [])
        display_command = " ".join(str(item) for item in command) if isinstance(command, list) else str(command)
        cwd = str(payload.get("cwd", "")).strip()
        content = display_command if not cwd else f"{display_command}\n[{cwd}]\n"
        return ChatMessage.objects.create(
            session=session,
            role=ChatMessage.Role.TOOL,
            content=content,
            status=ChatMessage.Status.PENDING,
            item_type="command_execution",
            tool_name="command",
            provider_item_id=str(payload.get("item_id", "")),
            command=payload,
            provider_payload=payload,
        )

    def _create_file_change_message(self, session: ChatSession, payload: dict[str, object]) -> ChatMessage:
        changes = payload.get("changes", [])
        file_changes = changes if isinstance(changes, list) else []
        return ChatMessage.objects.create(
            session=session,
            role=ChatMessage.Role.TOOL,
            content=self._render_file_change_content(payload),
            status=ChatMessage.Status.PENDING,
            item_type="file_change",
            tool_name="apply_patch",
            provider_item_id=str(payload.get("item_id", "")),
            file_changes=file_changes,
            provider_payload=payload,
        )

    def _render_file_change_content(self, payload: dict[str, object]) -> str:
        changes = payload.get("changes", [])
        if not isinstance(changes, list) or not changes:
            return "Proposed file changes"
        lines = ["Proposed file changes"]
        for item in changes:
            if not isinstance(item, dict):
                continue
            path = str(item.get("path", "")).strip()
            kind = str(item.get("kind", "")).strip()
            if path:
                lines.append(f"- {path} [{kind or 'update'}]")
        return "\n".join(lines)

    def _resolve_tool_status(self, payload: dict[str, object]) -> str:
        status = str(payload.get("status", "completed")).strip().lower()
        if status in {"completed", "accepted", "done"}:
            return ChatMessage.Status.COMPLETED
        return ChatMessage.Status.FAILED

    def _normalize_references(self, references: list[dict[str, str]] | None) -> list[dict[str, str]]:
        if not references:
            return []
        items: list[dict[str, str]] = []
        seen_paths: set[str] = set()
        for reference in references:
            path = str(reference.get("path", "")).strip()
            if not path or path in seen_paths:
                continue
            items.append(
                {
                    "path": path,
                    "name": str(reference.get("name", "")).strip(),
                    "kind": str(reference.get("kind", "")).strip() or "file",
                }
            )
            seen_paths.add(path)
        return items

    def _render_user_content(self, content: str, references: list[dict[str, str]]) -> str:
        if not references:
            return content
        lines = [content, "", "Referenced workspace paths:"]
        for reference in references:
            path = reference["path"]
            kind = reference.get("kind", "").strip()
            lines.append(f"- {path}{f' [{kind}]' if kind else ''}")
        return "\n".join(lines)

    def _sse(self, event: str, data: dict[str, object]) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
