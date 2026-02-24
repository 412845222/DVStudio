from __future__ import annotations

import sqlite3
from pathlib import Path


def main() -> None:
	base_dir = Path(__file__).resolve().parent.parent
	db_path = base_dir / "db.sqlite3"
	if not db_path.exists():
		print(f"db.sqlite3 not found: {db_path}")
		return

	conn = sqlite3.connect(str(db_path))
	try:
		rows = list(conn.execute("select name from sqlite_master where type='table'"))
		names = [r[0] for r in rows]
		print(f"tables={len(names)}")
		print(f"has_comfyui_blueprint_project={'comfyui_blueprint_project' in names}")
	finally:
		conn.close()


if __name__ == "__main__":
	main()
