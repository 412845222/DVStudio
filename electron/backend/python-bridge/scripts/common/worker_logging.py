# Worker logging utilities - renamed to avoid conflict with Python stdlib logging module
# All logs go to stderr (stdout is reserved for JSON-RPC protocol)

import sys
import logging as stdlib_logging
from datetime import datetime

def setup_logging(level: str = "INFO") -> stdlib_logging.Logger:
    """Set up logging to stderr with prefix format"""
    logger = stdlib_logging.getLogger("worker")
    logger.setLevel(getattr(stdlib_logging, level.upper(), stdlib_logging.INFO))
    
    # Remove any existing handlers
    logger.handlers.clear()
    
    # Create stderr handler
    handler = stdlib_logging.StreamHandler(sys.stderr)
    handler.setFormatter(PrefixFormatter())
    logger.addHandler(handler)
    
    return logger


class PrefixFormatter(stdlib_logging.Formatter):
    """Custom formatter that adds level prefix to each line"""
    
    LEVEL_PREFIXES = {
        stdlib_logging.DEBUG: "[DEBUG]",
        stdlib_logging.INFO: "[INFO]",
        stdlib_logging.WARNING: "[WARN]",
        stdlib_logging.ERROR: "[ERROR]",
        stdlib_logging.CRITICAL: "[CRITICAL]",
    }
    
    def format(self, record: stdlib_logging.LogRecord) -> str:
        prefix = self.LEVEL_PREFIXES.get(record.levelno, "[LOG]")
        timestamp = datetime.now().strftime("%H:%M:%S")
        message = record.getMessage()
        return f"{timestamp} {prefix} {message}"


# Global logger instance
_logger: stdlib_logging.Logger = None

def get_logger() -> stdlib_logging.Logger:
    """Get the global worker logger"""
    global _logger
    if _logger is None:
        _logger = setup_logging()
    return _logger


def log_info(message: str) -> None:
    get_logger().info(message)

def log_debug(message: str) -> None:
    get_logger().debug(message)

def log_warning(message: str) -> None:
    get_logger().warning(message)

def log_error(message: str) -> None:
    get_logger().error(message)