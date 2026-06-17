from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("dwebapp", "0003_alter_api_key_secret_provider"),
    ]

    operations = [
        migrations.AlterField(
            model_name="apikeysecret",
            name="provider",
            field=models.CharField(
                choices=[
                    ("deepseek", "DeepSeek"),
                    ("gemini", "Gemini"),
                    ("bytedance", "字节跳动(方舟)"),
                    ("meshy", "Meshy"),
                    ("jimeng_access_key_id", "即梦 AccessKey ID"),
                    ("jimeng_secret_key", "即梦 SecretAccessKey"),
                ],
                max_length=32,
                unique=True,
            ),
        ),
    ]