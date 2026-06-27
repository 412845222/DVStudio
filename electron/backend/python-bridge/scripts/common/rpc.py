# JSON-RPC over stdio protocol utilities
# Supports both regular functions and generator functions (streaming)

import json
import sys
import inspect
import traceback
from typing import Any, Callable, Dict, Optional, Generator, AsyncGenerator

class JsonRpcError(Exception):
    """JSON-RPC structured error"""
    def __init__(self, code: int, message: str, data: Optional[Any] = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        result = {"code": self.code, "message": self.message}
        if self.data is not None:
            result["data"] = self.data
        return result


# Standard JSON-RPC error codes
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603
CANCELLED = -32000


class JsonRpcDispatcher:
    """JSON-RPC dispatcher that reads requests from stdin and writes responses to stdout"""

    def __init__(self):
        self.handlers: Dict[str, Callable] = {}
        self._pending_requests: Dict[str, bool] = {}  # request_id -> cancelled flag

    def register(self, method: str, handler: Callable) -> None:
        """Register a handler for a method"""
        self.handlers[method] = handler

    def is_cancelled(self, request_id: str) -> bool:
        """Check if a request has been cancelled"""
        return self._pending_requests.get(request_id) == True

    def cancel(self, request_id: str) -> bool:
        """Mark a request as cancelled"""
        if request_id in self._pending_requests:
            self._pending_requests[request_id] = True
            return True
        return False

    def _write_response(self, response: Dict[str, Any]) -> None:
        """Write a response to stdout as a single JSON line"""
        try:
            line = json.dumps(response, ensure_ascii=False)
            sys.stdout.write(line + "\n")
            sys.stdout.flush()
        except Exception as e:
            # Fallback error response
            error_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": INTERNAL_ERROR, "message": f"Failed to serialize response: {e}"}
            }
            sys.stdout.write(json.dumps(error_resp) + "\n")
            sys.stdout.flush()

    def _write_error(self, request_id: Optional[str], code: int, message: str, data: Optional[Any] = None) -> None:
        """Write an error response"""
        response = {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": JsonRpcError(code, message, data).to_dict()
        }
        self._write_response(response)

    def _handle_request(self, request: Dict[str, Any]) -> None:
        """Handle a single JSON-RPC request"""
        # Validate request structure
        if not isinstance(request, dict):
            self._write_error(None, INVALID_REQUEST, "Request must be a JSON object")
            return

        jsonrpc = request.get("jsonrpc")
        if jsonrpc != "2.0":
            self._write_error(request.get("id"), INVALID_REQUEST, "Invalid jsonrpc version, must be '2.0'")
            return

        request_id = request.get("id")
        method = request.get("method")
        if not method:
            self._write_error(request_id, INVALID_REQUEST, "Missing 'method' field")
            return

        params = request.get("params", {})
        is_stream = request.get("stream", False)

        # Handle internal methods
        if method == "$/cancel":
            target_id = params.get("id") if isinstance(params, dict) else None
            if target_id:
                self.cancel(target_id)
                self._write_response({"jsonrpc": "2.0", "id": request_id, "result": {"cancelled": True}})
            else:
                self._write_error(request_id, INVALID_PARAMS, "Missing 'id' in cancel params")
            return

        # Find handler
        handler = self.handlers.get(method)
        if handler is None:
            self._write_error(request_id, METHOD_NOT_FOUND, f"Method '{method}' not found")
            return

        # Track pending request
        if request_id:
            self._pending_requests[request_id] = False

        try:
            # Check if handler is a generator function (streaming)
            if inspect.isgeneratorfunction(handler) or inspect.isasyncgenfunction(handler):
                # Streaming handler - yield multiple chunks
                if not is_stream:
                    # Caller didn't request stream, collect all chunks and return as single result
                    chunks = []
                    for chunk in handler(params):
                        if self.is_cancelled(request_id):
                            self._write_error(request_id, CANCELLED, "Request cancelled")
                            return
                        chunks.append(chunk)
                    self._write_response({"jsonrpc": "2.0", "id": request_id, "result": chunks})
                else:
                    # Stream mode - yield each chunk as a separate response
                    for chunk in handler(params):
                        if self.is_cancelled(request_id):
                            self._write_response({"jsonrpc": "2.0", "id": request_id, "result": {"type": "cancelled"}})
                            return
                        self._write_response({"jsonrpc": "2.0", "id": request_id, "result": chunk})
                    # Send done marker
                    self._write_response({"jsonrpc": "2.0", "id": request_id, "result": {"type": "done"}})
            else:
                # Regular function - single result
                if self.is_cancelled(request_id):
                    self._write_error(request_id, CANCELLED, "Request cancelled")
                    return
                result = handler(params)
                self._write_response({"jsonrpc": "2.0", "id": request_id, "result": result})

        except JsonRpcError as e:
            self._write_error(request_id, e.code, e.message, e.data)
        except Exception as e:
            tb = traceback.format_exc()
            self._write_error(request_id, INTERNAL_ERROR, str(e), {"traceback": tb})
        finally:
            # Clean up pending request
            if request_id:
                self._pending_requests.pop(request_id, None)

    def run(self) -> None:
        """Main loop: read requests from stdin, dispatch to handlers"""
        try:
            for line in sys.stdin:
                line = line.strip()
                if not line:
                    continue
                try:
                    request = json.loads(line)
                    self._handle_request(request)
                except json.JSONDecodeError as e:
                    self._write_error(None, PARSE_ERROR, f"JSON parse error: {e}")
        except KeyboardInterrupt:
            pass
        except Exception as e:
            # Unexpected error in the main loop
            self._write_error(None, INTERNAL_ERROR, f"Dispatcher error: {e}")


def rpc_handler(method: str) -> Callable:
    """Decorator to register a function as a JSON-RPC handler"""
    def decorator(func: Callable) -> Callable:
        # Store the method name as an attribute
        func._rpc_method = method
        return func
    return decorator


def register_handlers(dispatcher: JsonRpcDispatcher, module: Any) -> None:
    """Register all functions decorated with @rpc_handler from a module"""
    for name in dir(module):
        obj = getattr(module, name)
        if callable(obj) and hasattr(obj, "_rpc_method"):
            dispatcher.register(obj._rpc_method, obj)