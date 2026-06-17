# macOS bootstrap script

Files:
- install.sh: checks whether python3 and ffmpeg are available, then prints Homebrew-based install hints.

Current behavior:
- Does not auto-install packages.
- Safe to run repeatedly.
- Output can be consumed by Electron Welcome command panel via [bootstrap] logs.

Recommended commands shown by script:
- brew install python@3.11
- brew install ffmpeg
