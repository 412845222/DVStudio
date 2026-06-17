from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("comfyui_bridge", "0007_videogenerationtaskmirror"),
    ]

    operations = [
        migrations.AddField(
            model_name="videogenerationtaskmirror",
            name="video_source_path_local",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
        migrations.AddField(
            model_name="videogenerationtaskmirror",
            name="last_frame_source_path_local",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
        migrations.AddField(
            model_name="videogenerationtaskmirror",
            name="download_status",
            field=models.CharField(blank=True, db_index=True, default="idle", max_length=32),
        ),
        migrations.AddField(
            model_name="videogenerationtaskmirror",
            name="download_progress",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="videogenerationtaskmirror",
            name="download_error",
            field=models.TextField(blank=True, default=""),
        ),
    ]