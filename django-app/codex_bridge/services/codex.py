from __future__ import annotations

import json
import os
import queue
import re
import shutil
import socket
import subprocess
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Generator
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request


@dataclass(frozen=True)
class CodexConfig:
    enabled: bool
    model: str
    provider: str
    base_url: str
    env_key_name: str
    workspace_root: str
    sandbox_mode: str
    approval_policy: str
    api_key: str = ''
    command: str = 'codex'
    home_root: str = ''
    startup_timeout_ms: int = 8000

    @property
    def is_configured(self) -> bool:
        return self.enabled


@dataclass(frozen=True)
class CodexThread:
    thread_id: str
    model: str
    provider: str


@dataclass(frozen=True)
class _PendingResponse:
    event: threading.Event
    holder: dict[str, Any]


@dataclass(frozen=True)
class _ProviderProxyRuntime:
    base_url: str
    server: ThreadingHTTPServer
    thread: threading.Thread


class CodexBridgeClient:
    def __init__(self, config: CodexConfig) -> None:
        self.config = config
        self._process: subprocess.Popen[str] | None = None
        self._stdout_thread: threading.Thread | None = None
        self._stderr_thread: threading.Thread | None = None
        self._next_id = 1
        self._pending: dict[int, _PendingResponse] = {}
        self._pending_server_requests: dict[int, dict[str, Any]] = {}
        self._subscribers: list[Callable[[dict[str, Any]], None]] = []
        self._lock = threading.RLock()
        self._write_lock = threading.Lock()
        self._stream_lock = threading.Lock()
        self._last_error = ''
        self._last_account: dict[str, Any] | None = None
        self._provider_proxy = self._start_provider_proxy()
        self._runtime = self._prepare_runtime()

    def health_check(self) -> dict[str, object]:
        if not self.config.is_configured:
            return {'configured': False, 'reachable': False}

        configuration_error = self._configuration_error()
        configured = not configuration_error

        if self._process is not None and self._process.poll() is None:
            payload = self._health_payload(True)
            if configuration_error:
                payload['error'] = configuration_error
            return {'configured': configured, 'reachable': True, 'payload': payload, **({'error': configuration_error} if configuration_error else {})}

        command_path = shutil.which(self.config.command)
        if not command_path:
            error_message = f'Codex command not found: {self.config.command}'
            self._last_error = error_message
            payload = self._health_payload(False)
            payload['error'] = error_message
            return {'configured': configured, 'reachable': False, 'error': error_message, 'payload': payload}

        try:
            probe = subprocess.run(
                [command_path, '--version'],
                capture_output=True,
                text=True,
                timeout=3,
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            self._last_error = str(exc)
            payload = self._health_payload(False)
            payload['error'] = str(exc)
            return {'configured': configured, 'reachable': False, 'error': str(exc), 'payload': payload}

        if probe.returncode != 0:
            self._last_error = (probe.stderr or probe.stdout or f'codex --version exited with status {probe.returncode}').strip()
            payload = self._health_payload(False)
            payload['error'] = self._last_error
            return {'configured': configured, 'reachable': False, 'error': self._last_error, 'payload': payload}

        payload = self._health_payload(True)
        if configuration_error:
            payload['error'] = configuration_error
        return {'configured': configured, 'reachable': True, 'payload': payload, **({'error': configuration_error} if configuration_error else {})}

    def create_thread(self, title: str = '', cwd: str = '') -> CodexThread:
        if not self.config.is_configured:
            raise RuntimeError('Codex bridge is not configured')

        normalized_cwd = cwd or self.config.workspace_root
        result = self._send_request(
            'thread/start',
            {
                'model': self.config.model,
                'cwd': normalized_cwd,
                'approvalPolicy': self._normalized_approval_policy(),
                'sandbox': self._build_thread_sandbox_mode(self.config.sandbox_mode),
                'serviceName': 'claw_django_bridge',
                'experimentalRawEvents': True,
                'persistExtendedHistory': True,
            },
            timeout_ms=20_000,
        )
        thread = result.get('thread') if isinstance(result, dict) else None
        if not isinstance(thread, dict) or not isinstance(thread.get('id'), str):
            raise RuntimeError('Codex app-server returned an invalid thread payload')

        if title.strip():
            try:
                self._send_request('thread/name/set', {'threadId': thread['id'], 'name': title.strip()}, timeout_ms=5_000)
            except RuntimeError:
                pass

        return CodexThread(
            thread_id=thread['id'],
            model=self.config.model,
            provider=str(thread.get('modelProvider', self.config.provider)),
        )

    def stream_turn(
        self,
        thread_id: str,
        content: str,
        cwd: str = '',
        references: list[dict[str, str]] | None = None,
        skill_hints: list[str] | None = None,
        execution_hints: list[str] | None = None,
    ) -> Generator[dict[str, object], None, None]:
        if not self.config.is_configured:
            raise RuntimeError('Codex bridge is not configured')
        if not content.strip():
            raise RuntimeError('content is required')
        if not self._stream_lock.acquire(blocking=False):
            raise RuntimeError('Codex bridge already has an active turn stream')

        normalized_cwd = cwd.strip() or self.config.workspace_root
        turn_input = self._build_turn_input(content, normalized_cwd, references or [], skill_hints or [], execution_hints or [])

        event_queue: queue.Queue[dict[str, object] | None] = queue.Queue()
        state = {
            'threadId': thread_id,
            'turnId': '',
            'turnStarted': False,
            'assistantItemId': '',
            'assistantText': '',
            'usage': {},
            'latestError': {},
        }

        def subscriber(message: dict[str, Any]) -> None:
            if not self._matches_stream(message, state):
                return
            for event in self._map_app_server_message(message, state):
                event_queue.put(event)
                if event['event'] == 'turn_completed':
                    event_queue.put(None)

        self._subscribe(subscriber)

        try:
            result = self._send_request(
                'turn/start',
                {
                    'threadId': thread_id,
                    'input': turn_input,
                    'cwd': normalized_cwd,
                    'approvalPolicy': self._normalized_approval_policy(),
                    'sandboxPolicy': self._build_sandbox_policy(self.config.sandbox_mode, normalized_cwd),
                    'model': self.config.model,
                    'summary': 'concise',
                },
                timeout_ms=30_000,
            )
            if not state['turnStarted']:
                turn = result.get('turn', {}) if isinstance(result, dict) else {}
                state['turnStarted'] = True
                state['turnId'] = str(turn.get('id', ''))
                event_queue.put({'event': 'turn_started', 'data': {'turn': turn or {'id': state['turnId'], 'status': 'inProgress'}}})

            while True:
                try:
                    event = event_queue.get(timeout=60)
                except queue.Empty as exc:
                    raise RuntimeError('Timed out while waiting for Codex turn events') from exc
                if event is None:
                    break
                yield event
        finally:
            self._unsubscribe(subscriber)
            self._stream_lock.release()

    def submit_approval(self, thread_id: str, request_id: str, decision: str) -> dict[str, object]:
        del thread_id
        if not self.config.is_configured:
            raise RuntimeError('Codex bridge is not configured')

        try:
            approval_id = int(request_id)
        except ValueError as exc:
            raise RuntimeError('Unsupported approval request id') from exc

        with self._lock:
            pending = self._pending_server_requests.pop(approval_id, None)
        if pending is None:
            raise RuntimeError('approval request not found')

        self._send_response(approval_id, self._build_server_request_response(str(pending.get('method', '')), decision))
        return {'status': 'resolved', 'request_id': request_id, 'decision': decision}

    def _health_payload(self, reachable: bool) -> dict[str, object]:
        return {
            'status': 'ok',
            'mode': 'django-app-server',
            'configured': True,
            'reachable': reachable,
            'supports_streaming': True,
            'auto_approve': False,
            'command': self.config.command,
            'auth_env_name': self.config.env_key_name,
            'api_key_present': bool(self._provider_api_key()),
            'effective_provider': self.config.provider,
            'effective_provider_name': self._readable_provider_name(self.config.provider),
            'effective_model': self.config.model,
            'effective_base_url': self._effective_base_url(),
            'upstream_base_url': self.config.base_url,
            'codex_home': str(self._runtime['home_dir']),
            'config_path': str(self._runtime['config_path']),
            'child_pid': self._process.pid if self._process is not None and self._process.poll() is None else None,
            'account': self._last_account,
            'error': self._health_error(),
        }

    def _health_error(self) -> str:
        error_text = self._last_error.strip()
        if not error_text:
            return ''
        normalized = re.sub(r'\x1b\[[0-9;]*m', '', error_text)
        uppercase = normalized.upper()
        if ' WARN ' in uppercase or uppercase.startswith('WARN ') or ': WARN ' in uppercase:
            return ''
        return error_text

    def _configuration_error(self) -> str:
        if not self.config.workspace_root.strip():
            return 'CODEX_WORKSPACE_ROOT is required'
        if self.config.provider != 'openai' and not self.config.base_url.strip():
            return 'CODEX_BASE_URL is required for custom providers'
        if self.config.env_key_name.strip() and not self._provider_api_key():
            return f'{self.config.env_key_name} is not set'
        return ''

    def _provider_api_key(self) -> str:
        direct_value = self.config.api_key.strip()
        if direct_value:
            return direct_value
        return os.getenv(self.config.env_key_name, '').strip()

    def _prepare_runtime(self) -> dict[str, object]:
        root = Path(self.config.home_root or (Path(self.config.workspace_root) / '.codex-runtime'))
        runtime_id = f"{self.config.provider.replace('/', '_').replace(' ', '_')}_{self.config.model.replace('/', '_').replace(' ', '_')}"
        home_dir = root / runtime_id
        home_dir.mkdir(parents=True, exist_ok=True)
        config_path = home_dir / 'config.toml'
        config_path.write_text(self._build_config_toml(), encoding='utf-8')
        return {'home_dir': home_dir, 'config_path': config_path}

    def _build_config_toml(self) -> str:
        lines = [
            '# This file is generated by Django Codex bridge.',
            f'model = {json.dumps(self.config.model)}',
            f'model_provider = {json.dumps(self.config.provider)}',
            f'approval_policy = {json.dumps(self._normalized_approval_policy())}',
            'sandbox_mode = "workspace-write"',
        ]
        if self.config.provider != 'openai':
            lines.append('web_search = "disabled"')
        if self.config.provider == 'openai':
            if self.config.base_url:
                lines.append(f'openai_base_url = {json.dumps(self.config.base_url)}')
        else:
            lines.extend(
                [
                    '',
                    f'[model_providers.{self.config.provider}]',
                    f'name = {json.dumps(self._readable_provider_name(self.config.provider))}',
                    f'base_url = {json.dumps(self._effective_base_url())}',
                    f'env_key = {json.dumps(self.config.env_key_name)}',
                    'wire_api = "responses"',
                ]
            )
        return '\n'.join(lines) + '\n'

    def _effective_base_url(self) -> str:
        if self._provider_proxy is not None:
            return self._provider_proxy.base_url
        return self.config.base_url

    def _start_provider_proxy(self) -> _ProviderProxyRuntime | None:
        if self.config.provider == 'openai':
            return None
        upstream = self.config.base_url.strip()
        if not upstream:
            return None

        outer = self

        class _ProxyHandler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def do_POST(self) -> None:
                self._forward()

            def do_GET(self) -> None:
                self._forward()

            def do_DELETE(self) -> None:
                self._forward()

            def log_message(self, format: str, *args: object) -> None:
                del format, args

            def _forward(self) -> None:
                content_length = int(self.headers.get('Content-Length', '0') or '0')
                raw_body = self.rfile.read(content_length) if content_length > 0 else b''
                body = outer._sanitize_provider_request_body(raw_body, self.path) if raw_body else raw_body
                target_url = outer._build_proxy_target_url(self.path)
                headers = outer._build_proxy_headers(self.headers)
                request = urllib_request.Request(target_url, data=body or None, headers=headers, method=self.command)

                try:
                    with urllib_request.urlopen(request, timeout=300) as response:
                        self.send_response(response.status)
                        for header_name, header_value in response.headers.items():
                            lowered = header_name.lower()
                            if lowered in {'transfer-encoding', 'connection', 'content-length'}:
                                continue
                            self.send_header(header_name, header_value)
                        self.end_headers()
                        while True:
                            chunk = response.read(8192)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                        self.wfile.flush()
                except urllib_error.HTTPError as exc:
                    payload = exc.read()
                    self.send_response(exc.code)
                    content_type = exc.headers.get('Content-Type', 'application/json')
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Length', str(len(payload)))
                    self.end_headers()
                    if payload:
                        self.wfile.write(payload)
                        self.wfile.flush()
                except OSError as exc:
                    payload = json.dumps({'error': {'message': str(exc)}}).encode('utf-8')
                    self.send_response(502)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                    self.wfile.flush()

        server = ThreadingHTTPServer(('127.0.0.1', 0), _ProxyHandler)
        thread = threading.Thread(target=server.serve_forever, name='codex-provider-proxy', daemon=True)
        thread.start()
        address = server.server_address
        host = str(address[0])
        port = int(address[1])
        return _ProviderProxyRuntime(base_url=f'http://{host}:{port}', server=server, thread=thread)

    def _build_proxy_target_url(self, request_path: str) -> str:
        base = self.config.base_url.rstrip('/')
        parsed_path = urllib_parse.urlsplit(request_path)
        path = parsed_path.path or '/'
        query = f'?{parsed_path.query}' if parsed_path.query else ''
        return f'{base}{path}{query}'

    def _build_proxy_headers(self, incoming_headers: Any) -> dict[str, str]:
        headers: dict[str, str] = {}
        content_type = incoming_headers.get('Content-Type') if incoming_headers is not None else None
        accept = incoming_headers.get('Accept') if incoming_headers is not None else None
        if isinstance(content_type, str) and content_type.strip():
            headers['Content-Type'] = content_type
        if isinstance(accept, str) and accept.strip():
            headers['Accept'] = accept
        api_key = self._provider_api_key()
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'
        return headers

    def _sanitize_provider_request_body(self, raw_body: bytes, request_path: str = '') -> bytes:
        try:
            payload = json.loads(raw_body.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return raw_body
        sanitized = self._sanitize_provider_payload(payload)
        sanitized = self._normalize_volcengine_responses_payload(sanitized, request_path)
        return json.dumps(sanitized, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

    def _sanitize_provider_payload(self, value: Any) -> Any:
        if isinstance(value, dict):
            sanitized: dict[str, Any] = {}
            for key, item in value.items():
                if key in {'external_web_access', 'prompt_cache_key'}:
                    continue
                sanitized[key] = self._sanitize_provider_payload(item)
            return sanitized
        if isinstance(value, list):
            return [self._sanitize_provider_payload(item) for item in value]
        return value

    def _normalize_volcengine_responses_payload(self, payload: Any, request_path: str) -> Any:
        if self.config.provider.strip().lower() != 'volcengine':
            return payload
        if not isinstance(payload, dict) or not self._is_responses_request(request_path):
            return payload

        input_items = payload.get('input')
        if not isinstance(input_items, list):
            return payload

        return {
            **payload,
            'input': [self._normalize_volcengine_input_item(item) for item in input_items],
        }

    def _normalize_volcengine_input_item(self, item: Any) -> Any:
        if not isinstance(item, dict):
            return item
        if item.get('type') != 'message':
            return item
        if str(item.get('role', '')).strip().lower() != 'assistant':
            return item

        status = item.get('status')
        if isinstance(status, str) and status.strip():
            return item
        return {**item, 'status': 'completed'}

    @staticmethod
    def _is_responses_request(request_path: str) -> bool:
        parsed_path = urllib_parse.urlsplit(request_path)
        normalized_path = (parsed_path.path or '').rstrip('/')
        return normalized_path.endswith('/responses')

    def _build_turn_input(
        self,
        content: str,
        cwd: str,
        references: list[dict[str, str]],
        skill_hints: list[str],
        execution_hints: list[str],
    ) -> list[dict[str, object]]:
        items: list[dict[str, object]] = [{'type': 'text', 'text': content, 'text_elements': []}]

        reference_context = self._build_reference_context(cwd, references)
        if reference_context:
            items.append({'type': 'text', 'text': reference_context, 'text_elements': []})

        execution_context = self._build_execution_context(execution_hints)
        if execution_context:
            items.append({'type': 'text', 'text': execution_context, 'text_elements': []})

        skill_context = self._build_skill_context(skill_hints)
        if skill_context:
            items.append({'type': 'text', 'text': skill_context, 'text_elements': []})

        return items

    def _build_reference_context(self, cwd: str, references: list[dict[str, str]]) -> str:
        serialized: list[dict[str, Any]] = []
        for reference in references:
            entry = self._serialize_reference(reference)
            if entry:
                serialized.append(entry)

        if not serialized:
            return ''

        return '\n'.join(
            [
                'Workspace references selected by the user. Treat them as trusted context for this turn.',
                f'Current working directory: {cwd}',
                'Referenced entries:',
                json.dumps(serialized, ensure_ascii=False, indent=2),
            ]
        )

    def _build_skill_context(self, skill_hints: list[str]) -> str:
        normalized = [item.strip() for item in skill_hints if item and item.strip()]
        if not normalized:
            return ''
        return 'Skill hints for this turn:\n' + '\n'.join(f'- {item}' for item in normalized)

    def _build_execution_context(self, execution_hints: list[str]) -> str:
        normalized = [item.strip() for item in execution_hints if item and item.strip()]
        if not normalized:
            return ''
        return 'Execution requirements for this turn:\n' + '\n'.join(f'- {item}' for item in normalized)

    def _normalized_approval_policy(self) -> str:
        raw_value = (self.config.approval_policy or '').strip()
        normalized = raw_value.lower()
        mapping = {
            'unlesstrusted': 'on-request',
            'unless_trusted': 'on-request',
            'on-request': 'on-request',
            'onrequest': 'on-request',
            'on_failure': 'on-failure',
            'on-failure': 'on-failure',
            'granular': 'granular',
            'never': 'never',
            'untrusted': 'untrusted',
        }
        return mapping.get(normalized, 'on-request')

    def _serialize_reference(self, reference: dict[str, str]) -> dict[str, Any]:
        requested_path = str(reference.get('path', '')).strip()
        if not requested_path:
            return {}

        try:
            workspace_root = Path(self.config.workspace_root).resolve()
            target_path = (workspace_root / requested_path).resolve()
            relative_path = target_path.relative_to(workspace_root).as_posix()
        except (OSError, RuntimeError, ValueError):
            return {}

        if not target_path.exists():
            return {}

        if target_path.is_dir():
            return {
                'path': relative_path,
                'kind': 'directory',
                'children': self._list_directory_entries(target_path, workspace_root),
            }

        excerpt, truncated = self._read_file_excerpt(target_path)
        return {
            'path': relative_path,
            'kind': 'file',
            'excerpt': excerpt,
            'truncated': truncated,
        }

    def _list_directory_entries(self, directory: Path, workspace_root: Path) -> list[dict[str, str]]:
        items: list[dict[str, str]] = []
        try:
            children = sorted(directory.iterdir(), key=lambda item: (item.is_file(), item.name.lower()))
        except OSError:
            return items

        for child in children[:40]:
            try:
                relative_path = child.relative_to(workspace_root).as_posix()
            except ValueError:
                continue
            items.append(
                {
                    'path': relative_path,
                    'kind': 'directory' if child.is_dir() else 'file',
                }
            )
        return items

    def _read_file_excerpt(self, file_path: Path) -> tuple[str, bool]:
        try:
            content = file_path.read_text(encoding='utf-8', errors='replace')
        except OSError:
            return '', False

        max_chars = 12_000
        excerpt = content[:max_chars]
        return excerpt, len(content) > max_chars

    def _ensure_started(self) -> None:
        if self._process is not None and self._process.poll() is None:
            return

        started = False
        with self._lock:
            if self._process is not None and self._process.poll() is None:
                return

            command_path = shutil.which(self.config.command)
            if not command_path:
                raise RuntimeError(f'Codex command not found: {self.config.command}')

            env = os.environ.copy()
            env['CODEX_HOME'] = str(self._runtime['home_dir'])
            if self.config.env_key_name:
                env[self.config.env_key_name] = self._provider_api_key()

            launch_command, use_shell = self._build_launch_command(command_path)

            try:
                self._process = subprocess.Popen(
                    launch_command,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding='utf-8',
                    bufsize=1,
                    env=env,
                    cwd=self.config.workspace_root,
                    shell=use_shell,
                )
            except OSError as exc:
                raise RuntimeError(f'Failed to start Codex app-server: {exc}') from exc

            self._stdout_thread = threading.Thread(target=self._stdout_loop, daemon=True)
            self._stderr_thread = threading.Thread(target=self._stderr_loop, daemon=True)
            self._stdout_thread.start()
            self._stderr_thread.start()

            started = True
        if not started:
            return

        self._send_request(
            'initialize',
            {
                'clientInfo': {
                    'name': 'claw_django_bridge',
                    'title': 'Claw Django Bridge',
                    'version': '0.3.0',
                },
                'capabilities': {'experimentalApi': True},
            },
            timeout_ms=max(self.config.startup_timeout_ms, 5_000),
        )
        self._send_notification('initialized', {})
        self._refresh_account_state()

    def _build_launch_command(self, command_path: str) -> tuple[list[str] | str, bool]:
        if os.name == 'nt':
            return f'{self.config.command} app-server', True
        return [command_path, 'app-server'], False

    def _refresh_account_state(self) -> None:
        try:
            result = self._send_request('account/read', {'refreshToken': False}, timeout_ms=10_000)
        except RuntimeError as exc:
            self._last_error = str(exc)
            return
        self._last_account = result.get('account') if isinstance(result, dict) and isinstance(result.get('account'), dict) else result

    def _stdout_loop(self) -> None:
        assert self._process is not None and self._process.stdout is not None
        while True:
            raw_line = self._process.stdout.readline()
            if not raw_line:
                break
            line = raw_line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                self._last_error = f'Invalid JSON from Codex app-server: {line}'
                continue
            if isinstance(message, dict):
                self._handle_message(message)

    def _stderr_loop(self) -> None:
        assert self._process is not None and self._process.stderr is not None
        while True:
            raw_line = self._process.stderr.readline()
            if not raw_line:
                break
            text = raw_line.strip()
            if text:
                self._last_error = text

    def _handle_message(self, message: dict[str, Any]) -> None:
        if 'method' in message and 'id' in message:
            self._handle_server_request(message)
            return

        if 'method' in message:
            if message.get('method') == 'account/updated' and isinstance(message.get('params'), dict):
                self._last_account = message['params']
            self._emit({'kind': 'notification', 'method': message.get('method', ''), 'params': message.get('params', {})})
            return

        if 'id' not in message:
            return

        response_id = int(message['id'])
        with self._lock:
            pending = self._pending.pop(response_id, None)
        if pending is None:
            return
        if message.get('error'):
            error_payload = message['error']
            pending.holder['error'] = error_payload.get('message', f'Codex app-server request failed: {response_id}') if isinstance(error_payload, dict) else str(error_payload)
        else:
            pending.holder['result'] = message.get('result', {})
        pending.event.set()

    def _handle_server_request(self, message: dict[str, Any]) -> None:
        request_id = int(message['id'])
        method = str(message.get('method', ''))
        params = message.get('params', {}) if isinstance(message.get('params'), dict) else {}

        if method == 'tool/requestUserInput':
            self._send_response(request_id, self._build_server_request_response(method, 'cancel'))
            return

        if method == 'mcpServer/elicitation/request':
            self._send_response(request_id, self._build_server_request_response(method, 'cancel'))
            return

        with self._lock:
            self._pending_server_requests[request_id] = {'method': method, 'params': params}
        self._emit({'kind': 'server_request', 'method': method, 'params': params, 'id': request_id})

    def _send_request(self, method: str, params: dict[str, Any] | None = None, timeout_ms: int = 20_000) -> dict[str, Any]:
        self._ensure_started()
        assert self._process is not None
        with self._lock:
            request_id = self._next_id
            self._next_id += 1
            pending = _PendingResponse(event=threading.Event(), holder={})
            self._pending[request_id] = pending
        self._write({'id': request_id, 'method': method, 'params': params or {}})
        deadline = time.monotonic() + (timeout_ms / 1000)
        while 'result' not in pending.holder and 'error' not in pending.holder:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            pending.event.wait(min(remaining, 0.05))
        if 'result' not in pending.holder and 'error' not in pending.holder:
            with self._lock:
                self._pending.pop(request_id, None)
            raise RuntimeError(f'Codex app-server request timed out: {method}')
        if 'error' in pending.holder:
            raise RuntimeError(str(pending.holder['error']))
        result = pending.holder.get('result', {})
        return result if isinstance(result, dict) else {'value': result}

    def _send_notification(self, method: str, params: dict[str, Any] | None = None) -> None:
        self._ensure_started()
        self._write({'method': method, 'params': params or {}})

    def _send_response(self, request_id: int, result: Any) -> None:
        self._write({'id': request_id, 'result': result})

    def _build_server_request_response(self, method: str, decision: str) -> dict[str, Any]:
        if method in {'item/commandExecution/requestApproval', 'item/fileChange/requestApproval'}:
            return {'decision': decision}
        if method == 'item/permissions/requestApproval':
            raise RuntimeError('Permissions approval requests are not yet supported by the Django bridge')
        if method == 'tool/requestUserInput':
            return {'answers': {}}
        if method == 'mcpServer/elicitation/request':
            return {'action': decision, 'content': None, '_meta': None}
        return {'decision': decision}

    def _write(self, payload: dict[str, Any]) -> None:
        assert self._process is not None and self._process.stdin is not None
        with self._write_lock:
            try:
                self._process.stdin.write(f'{json.dumps(payload)}\n')
                self._process.stdin.flush()
            except OSError as exc:
                raise RuntimeError(f'Failed to write to Codex app-server: {exc}') from exc

    def _emit(self, message: dict[str, Any]) -> None:
        for subscriber in list(self._subscribers):
            subscriber(message)

    def _subscribe(self, subscriber: Callable[[dict[str, Any]], None]) -> None:
        self._subscribers.append(subscriber)

    def _unsubscribe(self, subscriber: Callable[[dict[str, Any]], None]) -> None:
        self._subscribers = [item for item in self._subscribers if item is not subscriber]

    def _matches_stream(self, message: dict[str, Any], state: dict[str, Any]) -> bool:
        if message.get('kind') == 'server_request':
            params = message.get('params', {}) if isinstance(message.get('params'), dict) else {}
            message_thread_id = self._pick_string(params.get('threadId'), params.get('thread_id'))
            return not message_thread_id or message_thread_id == state['threadId']

        if message.get('kind') != 'notification':
            return False

        method = str(message.get('method', ''))
        params = message.get('params', {}) if isinstance(message.get('params'), dict) else {}
        message_thread_id = self._pick_string(params.get('threadId'), params.get('thread_id'))
        turn_value = params.get('turn')
        turn: dict[str, Any] = turn_value if isinstance(turn_value, dict) else {}
        message_turn_id = self._pick_string(params.get('turnId'), params.get('turn_id'), turn.get('id'))

        if method == 'turn/started':
            return True
        if not message_thread_id and not message_turn_id:
            return True
        if message_thread_id and message_thread_id != state['threadId']:
            return False
        if state['turnId'] and message_turn_id and message_turn_id != state['turnId']:
            return False
        return True

    def _map_app_server_message(self, message: dict[str, Any], state: dict[str, Any]) -> list[dict[str, object]]:
        if message.get('kind') == 'server_request':
            method = str(message.get('method', ''))
            params = message.get('params', {}) if isinstance(message.get('params'), dict) else {}
            if method in {'item/commandExecution/requestApproval', 'item/fileChange/requestApproval'}:
                return [
                    {
                        'event': 'approval_requested',
                        'data': {
                            'request_id': str(message.get('id', '')),
                            'item_id': self._pick_string(params.get('itemId'), params.get('item_id')),
                            'thread_id': self._pick_string(params.get('threadId'), params.get('thread_id')),
                            'turn_id': self._pick_string(params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                            'approval_type': 'command' if 'commandExecution' in method else 'file_change',
                            'reason': self._pick_string(params.get('reason')),
                            'available_decisions': params.get('availableDecisions', []) if isinstance(params.get('availableDecisions'), list) else [],
                            'auto_decision': '',
                        },
                    }
                ]
            return []

        params = message.get('params', {}) if isinstance(message.get('params'), dict) else {}
        method = str(message.get('method', ''))
        turn_value = params.get('turn')
        turn: dict[str, Any] = turn_value if isinstance(turn_value, dict) else {}

        if method == 'turn/started':
            state['turnStarted'] = True
            state['turnId'] = self._pick_string(turn.get('id'), params.get('turnId'), params.get('turn_id'))
            return [{'event': 'turn_started', 'data': {'turn': turn or {'id': state['turnId'], 'status': 'inProgress'}}}]

        if method == 'turn/plan/updated':
            return [
                {
                    'event': 'plan_update',
                    'data': {
                        'turn_id': self._pick_string(params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                        'explanation': self._pick_string(params.get('explanation')),
                        'plan': params.get('plan', []) if isinstance(params.get('plan'), list) else [],
                    },
                }
            ]

        if method == 'error':
            error_value = params.get('error')
            error = error_value if isinstance(error_value, dict) else {}
            state['latestError'] = error if isinstance(error, dict) else {}
            return [
                {
                    'event': 'error',
                    'data': {
                        'turn_id': self._pick_string(params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                        'thread_id': self._pick_string(params.get('threadId'), params.get('thread_id'), state.get('threadId')),
                        'message': self._pick_string(error.get('message')),
                        'additional_details': self._pick_string(error.get('additionalDetails')),
                        'will_retry': bool(error.get('willRetry')),
                        'codex_error_info': error.get('codexErrorInfo', {}) if isinstance(error.get('codexErrorInfo'), dict) else error.get('codexErrorInfo'),
                    },
                }
            ]

        if method == 'thread/tokenUsage/updated':
            state['usage'] = params.get('usage', params) if isinstance(params, dict) else {}
            return []

        if method == 'item/agentMessage/delta':
            item_id = self._pick_string(params.get('itemId'), params.get('item_id'))
            delta = self._pick_string(params.get('delta'), params.get('textDelta'), params.get('text'))
            state['assistantItemId'] = item_id or state['assistantItemId']
            state['assistantText'] = f"{state['assistantText']}{delta}"
            return [
                {
                    'event': 'assistant_delta',
                    'data': {
                        'turn_id': self._pick_string(params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                        'item_id': item_id,
                        'delta': delta,
                    },
                }
            ] if delta else []

        if method == 'item/commandExecution/outputDelta':
            return [
                {
                    'event': 'command_delta',
                    'data': {
                        'turn_id': self._pick_string(params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                        'item_id': self._pick_string(params.get('itemId'), params.get('item_id')),
                        'stream': self._pick_string(params.get('stream'), params.get('channel'), 'stdout'),
                        'delta': self._pick_string(params.get('delta'), params.get('textDelta'), params.get('text')),
                    },
                }
            ]

        if method == 'item/started':
            item_value = params.get('item')
            item: dict[str, Any] = item_value if isinstance(item_value, dict) else {}
            if item.get('type') == 'commandExecution':
                return [
                    {
                        'event': 'command_started',
                        'data': {
                            'turn_id': self._pick_string(params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                            'item_id': self._pick_string(item.get('id')),
                            'command': item.get('command', []) if isinstance(item.get('command'), list) else [],
                            'cwd': self._pick_string(item.get('cwd')),
                            'status': self._pick_string(item.get('status'), 'inProgress'),
                            'command_actions': item.get('commandActions', []) if isinstance(item.get('commandActions'), list) else [],
                        },
                    }
                ]
            if item.get('type') == 'fileChange':
                return [
                    {
                        'event': 'file_change_started',
                        'data': {
                            'turn_id': self._pick_string(params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                            'item_id': self._pick_string(item.get('id')),
                            'status': self._pick_string(item.get('status'), 'inProgress'),
                            'changes': item.get('changes', []) if isinstance(item.get('changes'), list) else [],
                        },
                    }
                ]
            return []

        if method == 'item/completed':
            item_value = params.get('item')
            item: dict[str, Any] = item_value if isinstance(item_value, dict) else {}
            if item.get('type') == 'agentMessage':
                state['assistantItemId'] = self._pick_string(item.get('id'), state.get('assistantItemId'))
                state['assistantText'] = self._pick_string(item.get('text'), state.get('assistantText'))
                return []
            if item.get('type') == 'commandExecution':
                return [
                    {
                        'event': 'command_completed',
                        'data': {
                            'turn_id': self._pick_string(params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                            'item_id': self._pick_string(item.get('id')),
                            'status': self._pick_string(item.get('status'), 'completed'),
                            'exit_code': item.get('exitCode'),
                            'duration_ms': item.get('durationMs'),
                            'aggregated_output': self._pick_string(item.get('aggregatedOutput')),
                        },
                    }
                ]
            if item.get('type') == 'fileChange':
                return [
                    {
                        'event': 'file_change_completed',
                        'data': {
                            'turn_id': self._pick_string(params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                            'item_id': self._pick_string(item.get('id')),
                            'status': self._pick_string(item.get('status'), 'completed'),
                            'changes': item.get('changes', []) if isinstance(item.get('changes'), list) else [],
                        },
                    }
                ]
            return []

        if method == 'turn/completed':
            events: list[dict[str, object]] = []
            turn_error_value = turn.get('error')
            turn_error: dict[str, Any] = turn_error_value if isinstance(turn_error_value, dict) else {}
            events.append(
                {
                    'event': 'assistant_done',
                    'data': {
                        'turn_id': self._pick_string(turn.get('id'), params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                        'content': str(state.get('assistantText', '') or ''),
                        'provider_message_id': state.get('assistantItemId', ''),
                        'usage': state.get('usage', {}) if isinstance(state.get('usage', {}), dict) else {},
                    },
                }
            )
            if turn_error:
                events.append(
                    {
                        'event': 'error',
                        'data': {
                            'turn_id': self._pick_string(turn.get('id'), params.get('turnId'), params.get('turn_id'), state.get('turnId')),
                            'thread_id': self._pick_string(params.get('threadId'), params.get('thread_id'), state.get('threadId')),
                            'message': self._pick_string(turn_error.get('message')),
                            'additional_details': self._pick_string(turn_error.get('additionalDetails')),
                            'will_retry': False,
                            'codex_error_info': turn_error.get('codexErrorInfo', {}) if isinstance(turn_error.get('codexErrorInfo'), dict) else turn_error.get('codexErrorInfo'),
                        },
                    }
                )
            events.append({'event': 'turn_completed', 'data': {'turn': turn or {'id': state.get('turnId', ''), 'status': 'completed'}}})
            return events

        return []

    @staticmethod
    def _build_sandbox_policy(mode_value: str, cwd: str) -> dict[str, object]:
        mode = str(mode_value or 'workspace-write').strip().lower().replace('_', '-').replace(' ', '-')
        if mode in {'readonly', 'read-only'}:
            return {'type': 'readOnly', 'access': {'type': 'fullAccess'}, 'networkAccess': False}
        if mode in {'dangerfullaccess', 'danger-full-access'}:
            return {'type': 'dangerFullAccess'}
        writable_roots = [cwd] if cwd else []
        return {
            'type': 'workspaceWrite',
            'writableRoots': writable_roots,
            'readOnlyAccess': {'type': 'fullAccess'},
            'networkAccess': False,
            'excludeTmpdirEnvVar': False,
            'excludeSlashTmp': False,
        }

    @staticmethod
    def _build_thread_sandbox_mode(mode_value: str) -> str:
        mode = str(mode_value or 'workspace-write').strip().lower().replace('_', '-').replace(' ', '-')
        if mode in {'readonly', 'read-only'}:
            return 'read-only'
        if mode in {'dangerfullaccess', 'danger-full-access'}:
            return 'danger-full-access'
        return 'workspace-write'

    @staticmethod
    def _pick_string(*values: object) -> str:
        for value in values:
            if isinstance(value, str) and value.strip():
                return value
        return ''

    @staticmethod
    def _readable_provider_name(provider_id: str) -> str:
        normalized = provider_id.strip()
        if not normalized:
            return 'OpenAI'
        if normalized.lower() == 'openai':
            return 'OpenAI'
        return ' '.join(part[:1].upper() + part[1:] for part in normalized.replace('-', '_').split('_') if part)
