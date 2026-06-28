#!/usr/bin/env python3
"""
Python Worker Entry Point for DVStudio Backend Bridge

This worker reads JSON-RPC requests from stdin (one per line),
dispatches them to registered handlers, and writes responses to stdout.

stderr is reserved for logging output.

Usage:
    python worker.py [--log-level LEVEL]

Environment variables:
    DVSTUDIO_PYTHONPATH - Additional paths to add to sys.path (colon-separated)
"""

import sys
import os
import argparse
from pathlib import Path

# Add scripts directory to sys.path for imports
scripts_dir = Path(__file__).parent.resolve()
if scripts_dir not in sys.path:
    sys.path.insert(0, str(scripts_dir))

# Add common directory
common_dir = scripts_dir / "common"
if common_dir not in sys.path:
    sys.path.insert(0, str(common_dir))

# Add DVSTUDIO_PYTHONPATH from environment (for development mode)
extra_paths = os.environ.get("DVSTUDIO_PYTHONPATH", "")
if extra_paths:
    for p in extra_paths.split(":"):
        p = p.strip()
        if p and Path(p).exists() and p not in sys.path:
            sys.path.insert(0, p)

from common.rpc import JsonRpcDispatcher, register_handlers
from common.worker_logging import setup_logging, get_logger, log_info

# Import handler registration from feature modules
# These will be created in subsequent migration phases
try:
    import subtitle.handlers as subtitle_handlers
    HAS_SUBTITLE = True
except ImportError:
    HAS_SUBTITLE = False

try:
    import skills.handlers as skills_handlers
    HAS_SKILLS = True
except ImportError:
    HAS_SKILLS = False


def register_builtin_handlers(dispatcher: JsonRpcDispatcher) -> None:
    """Register built-in handlers for testing and diagnostics"""
    
    def echo(params):
        """Simple echo handler for testing"""
        return {"echo": params, "timestamp": int(os.times()[4] * 1000) if hasattr(os, 'times') else 0}
    
    def ping(params):
        """Ping handler to check worker is alive"""
        return {"status": "ok", "pid": os.getpid()}
    
    def test_stream(params):
        """Streaming test handler that yields multiple chunks"""
        count = params.get("count", 3)
        prefix = params.get("prefix", "chunk")
        for i in range(count):
            yield {"type": "delta", "index": i, "text": f"{prefix}_{i}"}
    
    dispatcher.register("echo", echo)
    dispatcher.register("ping", ping)
    dispatcher.register("test.stream", test_stream)


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="DVStudio Python Worker")
    parser.add_argument("--log-level", default="INFO", help="Log level (DEBUG, INFO, WARN, ERROR)")
    args = parser.parse_args()
    
    # Set up logging to stderr
    setup_logging(args.log_level)
    log_info(f"Python worker starting (pid={os.getpid()})")
    log_info(f"Scripts directory: {scripts_dir}")
    
    # Create dispatcher
    dispatcher = JsonRpcDispatcher()
    
    # Register built-in handlers
    register_builtin_handlers(dispatcher)
    log_info("Registered built-in handlers: echo, ping, test.stream")
    
    # Register feature module handlers
    if HAS_SUBTITLE:
        # Subtitle handlers have their own register_handlers function
        subtitle_handlers.register_handlers(dispatcher)
        log_info("Registered subtitle handlers")
    else:
        log_info("Subtitle handlers not available (module not loaded)")
    
    if HAS_SKILLS:
        register_handlers(dispatcher, skills_handlers)
        log_info("Registered skills handlers")
    else:
        log_info("Skills handlers not available (module not loaded)")
    
    log_info("Worker ready, waiting for requests...")
    
    # Run the main loop
    dispatcher.run()
    
    log_info("Worker shutting down")


if __name__ == "__main__":
    main()