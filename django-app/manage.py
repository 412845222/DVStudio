#!/usr/bin/env python
"""Entry point for the bundled Django template."""
import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "dwebsite.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Django is required to run this template. Install it with "
            "`python -m pip install -r requirements.txt`."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
