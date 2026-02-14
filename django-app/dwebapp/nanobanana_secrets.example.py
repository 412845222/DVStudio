"""NanoBanana (Gemini) secrets template.

Copy this file to `nanobanana_secrets.py` and fill in values.
The real `nanobanana_secrets.py` should be git-ignored.

Env vars override these values at runtime.

API key: https://aistudio.google.com/apikey
"""

# Required: Gemini API key.
NANOBANANA_API_KEY = ""

# Optional: model name.
# - gemini-2.5-flash-image (default)
# - gemini-3-pro-image-preview
NANOBANANA_MODEL = "gemini-2.5-flash-image"

# Optional: API base.
NANOBANANA_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

# Optional: override full URLs (usually not needed).
NANOBANANA_GENERATE_URL = ""  # https://.../models/<model>:generateContent
NANOBANANA_STREAM_URL = ""  # https://.../models/<model>:streamGenerateContent

# Request timeout (seconds).
NANOBANANA_TIMEOUT_SEC = 120
