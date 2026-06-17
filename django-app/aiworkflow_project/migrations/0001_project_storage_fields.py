from __future__ import annotations

from django.db import migrations, models


TABLE_NAME = "comfyui_blueprint_project"
FIELD_SQL = [
    ("project_uuid", "varchar(64) NOT NULL DEFAULT ''"),
    ("root_path", "varchar(1000) NOT NULL DEFAULT ''"),
    ("manifest_path", "varchar(1000) NOT NULL DEFAULT ''"),
    ("storage_version", "integer unsigned NOT NULL DEFAULT 1"),
    ("last_opened_at", "datetime NULL"),
]


def _column_names(schema_editor) -> set[str]:
    with schema_editor.connection.cursor() as cursor:
        description = schema_editor.connection.introspection.get_table_description(cursor, TABLE_NAME)
    return {str(item.name) for item in description}


def add_project_storage_fields(apps, schema_editor) -> None:
    existing = _column_names(schema_editor)
    quote = schema_editor.quote_name
    for field_name, ddl in FIELD_SQL:
        if field_name in existing:
            continue
        schema_editor.execute(f"ALTER TABLE {quote(TABLE_NAME)} ADD COLUMN {quote(field_name)} {ddl}")

    if schema_editor.connection.vendor in ("sqlite", "postgresql"):
        schema_editor.execute(
            f"CREATE INDEX IF NOT EXISTS {quote('aiworkflow_project_uuid_idx')} "
            f"ON {quote(TABLE_NAME)} ({quote('project_uuid')})"
        )


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("comfyui_bridge", "0008_videogenerationtaskmirror_download_fields"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(add_project_storage_fields, reverse_code=migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.CreateModel(
                    name="BlueprintProject",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("name", models.CharField(max_length=120)),
                        ("data", models.CharField(blank=True, default="", max_length=500)),
                        ("project_uuid", models.CharField(blank=True, db_index=True, default="", max_length=64)),
                        ("root_path", models.CharField(blank=True, default="", max_length=1000)),
                        ("manifest_path", models.CharField(blank=True, default="", max_length=1000)),
                        ("storage_version", models.PositiveIntegerField(default=1)),
                        ("last_opened_at", models.DateTimeField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                    ],
                    options={
                        "db_table": "comfyui_blueprint_project",
                        "managed": False,
                        "ordering": ["-updated_at", "-id"],
                    },
                ),
            ],
        ),
    ]
