from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("comfyui_bridge", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="MeshyTaskMirror",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("task_id", models.CharField(max_length=128, unique=True)),
                ("mode", models.CharField(default="text-to-3d", max_length=48)),
                ("task_target", models.CharField(default="3d", max_length=24)),
                ("task_family", models.CharField(default="text-to-3d", max_length=48)),
                ("status", models.CharField(default="idle", max_length=32)),
                ("progress", models.PositiveSmallIntegerField(default=0)),
                ("prompt", models.TextField(blank=True, default="")),
                ("negative_prompt", models.TextField(blank=True, default="")),
                ("image_count", models.PositiveIntegerField(default=0)),
                ("thumbnail_url", models.TextField(blank=True, default="")),
                ("preferred_model_url", models.TextField(blank=True, default="")),
                ("local_asset_url", models.TextField(blank=True, default="")),
                ("local_asset_path", models.TextField(blank=True, default="")),
                ("source_model_url", models.TextField(blank=True, default="")),
                ("error_message", models.TextField(blank=True, default="")),
                ("status_text", models.TextField(blank=True, default="")),
                ("request_payload", models.JSONField(blank=True, default=dict)),
                ("response_payload", models.JSONField(blank=True, default=dict)),
                ("last_node_id", models.CharField(blank=True, default="", max_length=128)),
                ("remote_created_at", models.CharField(blank=True, default="", max_length=64)),
                ("remote_finished_at", models.CharField(blank=True, default="", max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("project", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="meshy_tasks", to="comfyui_bridge.blueprintproject")),
            ],
            options={
                "ordering": ["-updated_at", "-id"],
            },
        ),
    ]