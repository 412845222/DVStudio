from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("comfyui_bridge", "0005_alter_meshytaskmirror_task_family"),
    ]

    operations = [
        migrations.AddField(
            model_name="meshytaskmirror",
            name="capabilities",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="meshytaskmirror",
            name="parent_task_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=128),
        ),
        migrations.AddField(
            model_name="meshytaskmirror",
            name="relation_kind",
            field=models.CharField(blank=True, db_index=True, default="", max_length=24),
        ),
        migrations.AddField(
            model_name="meshytaskmirror",
            name="root_task_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=128),
        ),
    ]