import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const toPosix = (p) => String(p || '').replace(/\\/g, '/')

const shouldIgnoreRel = (relPosix) => {
	const rel = toPosix(relPosix)
	if (!rel) return false
	const base = rel.split('/').pop() || rel
	if (rel.includes('/__pycache__/') || rel.endsWith('/__pycache__')) return true
	if (rel.endsWith('.pyc') || rel.endsWith('.pyo')) return true
	// Runtime artifacts / local state
	if (rel.endsWith('.sqlite3')) return true
	if (base === 'django_secret_key.txt') return true
	// Secrets: never copy into runtime project
	if (rel.endsWith('_secrets.py')) return true
	if (base.startsWith('.env')) return true
	if (rel.startsWith('.venv/')) return true
	if (rel.startsWith('media/')) return true
	if (rel.startsWith('static/')) return true
	return false
}

export function copyDjangoTemplateToRuntime({ templateDir, runtimeDir, log = () => {} }) {
	if (!templateDir || !runtimeDir) throw new Error('copyDjangoTemplateToRuntime: missing dir')
	if (!fs.existsSync(templateDir)) throw new Error(`Django template dir not found: ${templateDir}`)

	fs.mkdirSync(runtimeDir, { recursive: true })
	log(`[django-project] template=${templateDir}`)
	log(`[django-project] runtime=${runtimeDir}`)

	// Always sync-copy so app updates can refresh backend code.
	fs.cpSync(templateDir, runtimeDir, {
		recursive: true,
		force: true,
		errorOnExist: false,
		filter: (src) => {
			const rel = toPosix(path.relative(templateDir, src))
			return !shouldIgnoreRel(rel)
		},
	})

	log('[django-project] template synced.')
	return { copied: true }
}

/**
 * Dev-mode incremental sync: only copy files that are missing or newer in the template.
 * Preserves any files already in runtimeDir that are not in templateDir (e.g. manually added).
 */
export function syncDjangoTemplateToRuntime({ templateDir, runtimeDir, log = () => {} }) {
	if (!templateDir || !runtimeDir) throw new Error('syncDjangoTemplateToRuntime: missing dir')
	if (!fs.existsSync(templateDir)) throw new Error(`Django template dir not found: ${templateDir}`)

	fs.mkdirSync(runtimeDir, { recursive: true })
	log(`[django-project] dev-sync template=${templateDir}`)
	log(`[django-project] dev-sync runtime=${runtimeDir}`)

	let copied = 0
	let skipped = 0

	_walkFiles(templateDir, (srcFull) => {
		const rel = path.relative(templateDir, srcFull)
		const relPosix = toPosix(rel)
		if (shouldIgnoreRel(relPosix)) return

		const dstFull = path.resolve(runtimeDir, rel)
		let needsCopy = true

		if (fs.existsSync(dstFull)) {
			try {
				const srcStat = fs.statSync(srcFull)
				const dstStat = fs.statSync(dstFull)
				// Skip if destination is same size and not older than source
				if (srcStat.size === dstStat.size && srcStat.mtimeMs <= dstStat.mtimeMs) {
					needsCopy = false
				}
			} catch {
				// stat failed — fall through to copy
			}
		}

		if (needsCopy) {
			fs.mkdirSync(path.dirname(dstFull), { recursive: true })
			fs.copyFileSync(srcFull, dstFull)
			copied++
		} else {
			skipped++
		}
	})

	log(`[django-project] dev-sync complete: copied=${copied}, skipped=${skipped}.`)
	return { copied, skipped }
}

function _walkFiles(rootDir, onFile) {
	const stack = [rootDir]
	while (stack.length > 0) {
		const dir = stack.pop()
		let entries = []
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true })
		} catch {
			continue
		}
		for (const ent of entries) {
			const full = path.resolve(dir, ent.name)
			if (ent.isDirectory()) {
				if (ent.name === '__pycache__') continue
				stack.push(full)
				continue
			}
			if (ent.isFile()) onFile(full)
		}
	}
}

export function sanitizeRuntimeDjangoDir({ runtimeDir, log = () => {} }) {
	if (!runtimeDir || !fs.existsSync(runtimeDir)) return { removed: [] }

	const removed = []
	_walkFiles(runtimeDir, (full) => {
		const name = path.basename(full)
		if (name.endsWith('.sqlite3')) {
			try {
				fs.unlinkSync(full)
				removed.push(full)
			} catch {}
			return
		}
		if (name === 'django_secret_key.txt') {
			try {
				fs.unlinkSync(full)
				removed.push(full)
			} catch {}
			return
		}
		// Remove real secrets files, but keep examples
		if (name.endsWith('_secrets.py') && !name.endsWith('.example.py')) {
			try {
				fs.unlinkSync(full)
				removed.push(full)
			} catch {}
		}
	})

	if (removed.length > 0) {
		log(`[django-project] sanitized runtime dir; removed ${removed.length} file(s).`)
		for (const f of removed.slice(0, 20)) log(`[django-project] removed: ${f}`)
		if (removed.length > 20) log(`[django-project] removed: ... (+${removed.length - 20})`)
	}

	return { removed }
}

function ensureFile(filePath, content) {
	if (fs.existsSync(filePath)) return false
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content, 'utf-8')
	return true
}

function genSecretKey() {
	// Similar strength to Django startproject defaults.
	return crypto.randomBytes(48).toString('base64url')
}

export function ensureRuntimeDjangoProjectScaffold({ runtimeDir, log = () => {} }) {
	if (!runtimeDir) throw new Error('ensureRuntimeDjangoProjectScaffold: missing runtimeDir')
	fs.mkdirSync(runtimeDir, { recursive: true })

	const managePyPath = path.resolve(runtimeDir, 'manage.py')
	const projectDir = path.resolve(runtimeDir, 'dwebsite')
	const initPy = path.resolve(projectDir, '__init__.py')
	const settingsPy = path.resolve(projectDir, 'settings.py')
	const urlsPy = path.resolve(projectDir, 'urls.py')
	const wsgiPy = path.resolve(projectDir, 'wsgi.py')
	const asgiPy = path.resolve(projectDir, 'asgi.py')

	const manageCreated = ensureFile(
		managePyPath,
		`#!/usr/bin/env python\n"""Entry point for the bundled Django template."""\nimport os\nimport sys\n\n\ndef main() -> None:\n    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "dwebsite.settings")\n    try:\n        from django.core.management import execute_from_command_line\n    except ImportError as exc:\n        raise ImportError(\n            "Django is required to run this template. Install it with "\n            "python -m pip install -r requirements.txt."\n        ) from exc\n    execute_from_command_line(sys.argv)\n\n\nif __name__ == "__main__":\n    main()\n`,
	)

	const initCreated = ensureFile(initPy, '')

	const settingsCreated = ensureFile(
		settingsPy,
		`"""Minimal Django settings for the Dweb Studio backend template.\n\nIn packaged distributions, sensitive values like SECRET_KEY are generated at first run\nand stored under DWEB_DATA_DIR (provided by Electron).\n"""\nfrom __future__ import annotations\n\nimport os\nimport secrets\nfrom pathlib import Path\n\nBASE_DIR = Path(__file__).resolve().parent.parent\n\n_DWEB_DATA_DIR = Path(os.getenv("DWEB_DATA_DIR", str(BASE_DIR))).resolve()\n_DWEB_DATA_DIR.mkdir(parents=True, exist_ok=True)\n\n_SECRET_FILE = _DWEB_DATA_DIR / "django_secret_key.txt"\nif _SECRET_FILE.exists():\n    SECRET_KEY = _SECRET_FILE.read_text(encoding="utf-8").strip() or ""\nelse:\n    SECRET_KEY = ""\n\nif not SECRET_KEY:\n    SECRET_KEY = secrets.token_urlsafe(48)\n    try:\n        _SECRET_FILE.write_text(SECRET_KEY, encoding="utf-8")\n    except Exception:\n        pass\n\nDEBUG = True\nALLOWED_HOSTS = ["*", "127.0.0.1", "localhost"]\n\nINSTALLED_APPS = [\n    "django.contrib.admin",\n    "django.contrib.auth",\n    "django.contrib.contenttypes",\n    "django.contrib.sessions",\n    "django.contrib.messages",\n    "django.contrib.staticfiles",\n    "rest_framework",\n    "dwebapp",\n    "dvs_editor",\n    "comfyui_bridge",\n    "corsheaders",\n]\n\nMIDDLEWARE = [\n    "corsheaders.middleware.CorsMiddleware",\n    "django.middleware.security.SecurityMiddleware",\n    "django.contrib.sessions.middleware.SessionMiddleware",\n    "django.middleware.common.CommonMiddleware",\n    "django.middleware.csrf.CsrfViewMiddleware",\n    "django.contrib.auth.middleware.AuthenticationMiddleware",\n    "django.contrib.messages.middleware.MessageMiddleware",\n    "django.middleware.clickjacking.XFrameOptionsMiddleware",\n]\n\nROOT_URLCONF = "dwebsite.urls"\n\nTEMPLATES = [\n    {\n        "BACKEND": "django.template.backends.django.DjangoTemplates",\n        "DIRS": [],\n        "APP_DIRS": True,\n        "OPTIONS": {\n            "context_processors": [\n                "django.template.context_processors.debug",\n                "django.template.context_processors.request",\n                "django.contrib.auth.context_processors.auth",\n                "django.contrib.messages.context_processors.messages",\n            ],\n        },\n    },\n]\n\nWSGI_APPLICATION = "dwebsite.wsgi.application"\n\nDATABASES = {\n    "default": {\n        "ENGINE": "django.db.backends.sqlite3",\n        "NAME": _DWEB_DATA_DIR / "db.sqlite3",\n    }\n}\n\nLANGUAGE_CODE = "zh-hans"\nTIME_ZONE = "Asia/Shanghai"\nUSE_I18N = True\nUSE_TZ = True\n\nSTATIC_URL = "static/"\nSTATIC_ROOT = _DWEB_DATA_DIR / "static"\nMEDIA_URL = "/media/"\nMEDIA_ROOT = _DWEB_DATA_DIR / "media"\nDEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"\n\nREST_FRAMEWORK = {\n    "DEFAULT_RENDERER_CLASSES": [\n        "rest_framework.renderers.JSONRenderer",\n        "rest_framework.renderers.BrowsableAPIRenderer",\n    ],\n    "DEFAULT_PARSER_CLASSES": [\n        "rest_framework.parsers.JSONParser",\n        "rest_framework.parsers.FormParser",\n        "rest_framework.parsers.MultiPartParser",\n    ],\n}\n\nCORS_ALLOW_ALL_ORIGINS = True\nCORS_ALLOW_CREDENTIALS = True\nAPPEND_SLASH = False\n\n_DEFAULT_UPLOAD_LIMIT_MB = 256\n_UPLOAD_LIMIT_BYTES = int(os.getenv("DWEB_UPLOAD_LIMIT_BYTES", str(_DEFAULT_UPLOAD_LIMIT_MB * 1024 * 1024)))\nDATA_UPLOAD_MAX_MEMORY_SIZE = _UPLOAD_LIMIT_BYTES\nFILE_UPLOAD_MAX_MEMORY_SIZE = _UPLOAD_LIMIT_BYTES\n`,
	)

	const urlsCreated = ensureFile(
		urlsPy,
		`"""dwebsite URL configuration."""\nfrom __future__ import annotations\n\nfrom django.conf import settings\nfrom django.conf.urls.static import static\nfrom django.contrib import admin\nfrom django.urls import include, path\n\nurlpatterns = [\n    path("admin/", admin.site.urls),\n    path("api/", include("dwebapp.urls")),\n    path("api/editor/", include("dvs_editor.urls")),\n    path("api/workflow/", include("comfyui_bridge.urls")),\n]\n\nif settings.DEBUG:\n    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)\n`,
	)

	const wsgiCreated = ensureFile(
		wsgiPy,
		`"""WSGI config for dwebsite project."""\nfrom __future__ import annotations\n\nimport os\n\nfrom django.core.wsgi import get_wsgi_application\n\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "dwebsite.settings")\n\napplication = get_wsgi_application()\n`,
	)

	const asgiCreated = ensureFile(
		asgiPy,
		`"""ASGI config for dwebsite project."""\nfrom __future__ import annotations\n\nimport os\n\nfrom django.core.asgi import get_asgi_application\n\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "dwebsite.settings")\n\napplication = get_asgi_application()\n`,
	)

	const created = [
		manageCreated ? 'manage.py' : null,
		initCreated ? 'dwebsite/__init__.py' : null,
		settingsCreated ? 'dwebsite/settings.py' : null,
		urlsCreated ? 'dwebsite/urls.py' : null,
		wsgiCreated ? 'dwebsite/wsgi.py' : null,
		asgiCreated ? 'dwebsite/asgi.py' : null,
	].filter(Boolean)

	if (created.length > 0) log(`[django-project] generated: ${created.join(', ')}`)
	return { created }
}

export function ensureRuntimeRequirements({ templateDir, runtimeDir, log = () => {} }) {
	const src = path.resolve(templateDir, 'requirements.txt')
	const dst = path.resolve(runtimeDir, 'requirements.txt')
	if (fs.existsSync(dst)) return { ok: true, created: false }
	if (fs.existsSync(src)) {
		fs.copyFileSync(src, dst)
		log('[django-project] requirements.txt copied.')
		return { ok: true, created: true }
	}
	// Fallback: write minimal requirements if template does not contain it.
	const content = 'Django==4.2.11\n' + 'djangorestframework==3.14.0\n' + 'django-cors-headers==4.4.0\n' + 'cryptography==42.0.8\n'
	fs.writeFileSync(dst, content, 'utf-8')
	log('[django-project] requirements.txt generated (fallback).')
	return { ok: true, created: true, fallback: true }
}
