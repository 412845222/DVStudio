from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("comfyui_bridge", "0006_meshytaskmirror_relation_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="VideoGenerationTaskMirror",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("remote_task_id", models.CharField(db_index=True, max_length=128, unique=True)),
                ("provider", models.CharField(blank=True, db_index=True, default="seedance", max_length=32)),
                ("model", models.CharField(blank=True, db_index=True, default="", max_length=128)),
                ("task_type", models.CharField(blank=True, default="", max_length=32)),
                ("source", models.CharField(blank=True, default="bottom-chat", max_length=32)),
                ("status", models.CharField(blank=True, db_index=True, default="queued", max_length=32)),
                ("prompt", models.TextField(blank=True, default="")),
                ("ratio", models.CharField(blank=True, default="", max_length=32)),
                ("resolution", models.CharField(blank=True, default="", max_length=32)),
                ("duration", models.PositiveIntegerField(default=0)),
                ("seed", models.BigIntegerField(blank=True, null=True)),
                ("generate_audio", models.BooleanField(default=False)),
                ("watermark", models.BooleanField(default=False)),
                ("camera_fixed", models.BooleanField(default=False)),
                ("service_tier", models.CharField(blank=True, default="", max_length=32)),
                ("tools", models.JSONField(blank=True, default=list)),
                ("usage", models.JSONField(blank=True, default=dict)),
                ("request_payload", models.JSONField(blank=True, default=dict)),
                ("response_payload", models.JSONField(blank=True, default=dict)),
                ("video_url_remote", models.CharField(blank=True, default="", max_length=1000)),
                ("video_url_local", models.CharField(blank=True, default="", max_length=1000)),
                ("last_frame_url_remote", models.CharField(blank=True, default="", max_length=1000)),
                ("last_frame_url_local", models.CharField(blank=True, default="", max_length=1000)),
                ("error_message", models.TextField(blank=True, default="")),
                ("status_text", models.TextField(blank=True, default="")),
                ("remote_created_at", models.BigIntegerField(blank=True, null=True)),
                ("remote_updated_at", models.BigIntegerField(blank=True, null=True)),
                ("synced_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "project",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="video_generation_tasks",
                        to="comfyui_bridge.blueprintproject",
                    ),
                ),
            ],
            options={
                "db_table": "comfyui_video_generation_task_mirror",
                "ordering": ["-updated_at", "-id"],
            },
        ),
    ]