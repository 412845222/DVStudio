from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("comfyui_bridge", "0004_rename_meshy_table"),
    ]

    operations = [
        migrations.AlterField(
            model_name="meshytaskmirror",
            name="task_family",
            field=models.CharField(blank=True, default="", max_length=48),
        ),
    ]