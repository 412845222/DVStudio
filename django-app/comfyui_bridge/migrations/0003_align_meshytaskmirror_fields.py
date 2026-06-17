from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("comfyui_bridge", "0002_meshytaskmirror"),
    ]

    operations = [
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="task_id",
            field=models.CharField(db_index=True, max_length=128, unique=True),
        ),
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="mode",
            field=models.CharField(blank=True, default="", max_length=48),
        ),
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="task_target",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="status",
            field=models.CharField(blank=True, db_index=True, default="idle", max_length=32),
        ),
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="progress",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="thumbnail_url",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="preferred_model_url",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="local_asset_url",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="local_asset_path",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="source_model_url",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
    ]