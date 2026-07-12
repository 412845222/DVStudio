/**
 * Blender节点工作空间管理器
 * 
 * 为每个Blender节点在项目Content/agent/{nodeId}/目录下管理：
 * - scripts/: Python脚本持久化
 * - screenshots/: 截图PNG文件
 * - sessions/: 会话归档
 * - cache/: 上下文缓存
 */

import fs from 'fs';
import path from 'path';
import logger from '../../core/logger.mjs';

const WORKSPACE_ROOT = 'Content/agent';
const SUBDIRS = ['scripts', 'screenshots', 'sessions', 'cache', 'references'];
const MAX_SCRIPT_SIZE = 1024 * 1024;
const MAX_WORKSPACE_SIZE = 500 * 1024 * 1024;

function sanitizeNodeId(nodeId) {
  if (!nodeId || typeof nodeId !== 'string') return null;
  const safe = nodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!safe || safe.length > 200) return null;
  return safe;
}

function ensureDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (err) {
    logger.warn(`[BlenderWorkspace] Failed to create dir ${dirPath}: ${err.message}`);
    return false;
  }
}

function getTimestampSlug() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function slugify(text) {
  if (!text) return 'script';
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'script';
}

function readWorkspaceMetadata(workspacePath) {
  const metaPath = path.join(workspacePath, 'workspace.json');
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    }
  } catch (err) {
    logger.debug(`[BlenderWorkspace] Failed to read metadata: ${err.message}`);
  }
  return {
    nodeId: '',
    createdAt: new Date().toISOString(),
    scripts: [],
    screenshots: [],
    sessions: [],
    lastUpdatedAt: new Date().toISOString()
  };
}

function writeWorkspaceMetadata(workspacePath, metadata) {
  const metaPath = path.join(workspacePath, 'workspace.json');
  try {
    metadata.lastUpdatedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
    return true;
  } catch (err) {
    logger.warn(`[BlenderWorkspace] Failed to write metadata: ${err.message}`);
    return false;
  }
}

function getWorkspacePath(projectRoot, nodeId) {
  const safeNodeId = sanitizeNodeId(nodeId);
  if (!safeNodeId || !projectRoot) return null;
  const resolvedProjectRoot = path.resolve(projectRoot);
  const workspacePath = path.resolve(resolvedProjectRoot, WORKSPACE_ROOT, safeNodeId);
  const normalizedWorkspace = path.normalize(workspacePath);
  const normalizedProject = path.normalize(resolvedProjectRoot);
  if (!normalizedWorkspace.startsWith(normalizedProject)) {
    logger.warn(`[BlenderWorkspace] Path traversal attempt detected for nodeId: ${nodeId}`);
    return null;
  }
  return workspacePath;
}

class BlenderNodeWorkspace {
  constructor() {
    this.initializedNodes = new Set();
  }

  /**
   * 初始化节点工作空间
   */
  async initWorkspace(projectRoot, nodeId) {
    try {
      const workspacePath = getWorkspacePath(projectRoot, nodeId);
      if (!workspacePath) {
        return { ok: false, error: 'Invalid nodeId or projectRoot' };
      }

      if (!ensureDir(workspacePath)) {
        return { ok: false, error: 'Failed to create workspace directory' };
      }

      for (const subdir of SUBDIRS) {
        ensureDir(path.join(workspacePath, subdir));
      }

      const metadata = readWorkspaceMetadata(workspacePath);
      metadata.nodeId = sanitizeNodeId(nodeId);
      writeWorkspaceMetadata(workspacePath, metadata);

      this.initializedNodes.add(nodeId);

      return {
        ok: true,
        workspacePath,
        relativePath: path.join(WORKSPACE_ROOT, sanitizeNodeId(nodeId))
      };
    } catch (err) {
      logger.error(`[BlenderWorkspace] initWorkspace error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  /**
   * 保存Python脚本
   */
  async saveScript(projectRoot, nodeId, code, summary) {
    try {
      const workspacePath = getWorkspacePath(projectRoot, nodeId);
      if (!workspacePath) return { ok: false, error: 'Invalid workspace' };

      await this.initWorkspace(projectRoot, nodeId);

      if (!code || typeof code !== 'string') {
        return { ok: false, error: 'Invalid code' };
      }

      if (code.length > MAX_SCRIPT_SIZE) {
        return { ok: false, error: 'Script too large' };
      }

      const timestamp = getTimestampSlug();
      const slug = slugify(summary || code.slice(0, 50));
      const fileName = `${timestamp}_${slug}.py`;
      const scriptsDir = path.join(workspacePath, 'scripts');
      const filePath = path.join(scriptsDir, fileName);

      ensureDir(scriptsDir);
      fs.writeFileSync(filePath, code, 'utf-8');

      const metadata = readWorkspaceMetadata(workspacePath);
      const scriptEntry = {
        fileName,
        relativePath: path.join(WORKSPACE_ROOT, sanitizeNodeId(nodeId), 'scripts', fileName),
        timestamp: Date.now(),
        summary: (summary || '').slice(0, 200),
        size: Buffer.byteLength(code, 'utf-8')
      };
      metadata.scripts = metadata.scripts || [];
      metadata.scripts.unshift(scriptEntry);
      if (metadata.scripts.length > 100) {
        const old = metadata.scripts.pop();
        try {
          const oldPath = path.join(scriptsDir, old.fileName);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch {}
      }
      writeWorkspaceMetadata(workspacePath, metadata);

      return {
        ok: true,
        fileName,
        relativePath: scriptEntry.relativePath,
        absolutePath: filePath
      };
    } catch (err) {
      logger.error(`[BlenderWorkspace] saveScript error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  /**
   * 保存截图
   */
  async saveScreenshot(projectRoot, nodeId, base64Data, mimeType) {
    try {
      const workspacePath = getWorkspacePath(projectRoot, nodeId);
      if (!workspacePath) return { ok: false, error: 'Invalid workspace' };

      await this.initWorkspace(projectRoot, nodeId);

      if (!base64Data || typeof base64Data !== 'string') {
        return { ok: false, error: 'Invalid image data' };
      }

      let cleanBase64 = base64Data;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }

      const imageBuffer = Buffer.from(cleanBase64, 'base64');
      const timestamp = getTimestampSlug();
      const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const fileName = `${timestamp}.${ext}`;
      const screenshotsDir = path.join(workspacePath, 'screenshots');
      const filePath = path.join(screenshotsDir, fileName);

      ensureDir(screenshotsDir);
      fs.writeFileSync(filePath, imageBuffer);

      const metadata = readWorkspaceMetadata(workspacePath);
      const shotEntry = {
        fileName,
        relativePath: path.join(WORKSPACE_ROOT, sanitizeNodeId(nodeId), 'screenshots', fileName),
        timestamp: Date.now(),
        size: imageBuffer.length,
        mimeType: mimeType || 'image/png'
      };
      metadata.screenshots = metadata.screenshots || [];
      metadata.screenshots.unshift(shotEntry);
      if (metadata.screenshots.length > 50) {
        const old = metadata.screenshots.pop();
        try {
          const oldPath = path.join(screenshotsDir, old.fileName);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch {}
      }
      writeWorkspaceMetadata(workspacePath, metadata);

      return {
        ok: true,
        fileName,
        relativePath: shotEntry.relativePath,
        absolutePath: filePath,
        url: `dweb://${shotEntry.relativePath.replace(/\\/g, '/')}`
      };
    } catch (err) {
      logger.error(`[BlenderWorkspace] saveScreenshot error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async saveReferenceImage(projectRoot, nodeId, base64Data, fileName, mimeType) {
    try {
      const workspacePath = getWorkspacePath(projectRoot, nodeId);
      if (!workspacePath) return { ok: false, error: 'Invalid workspace' };

      await this.initWorkspace(projectRoot, nodeId);

      if (!base64Data || typeof base64Data !== 'string') {
        return { ok: false, error: 'Invalid image data' };
      }

      let cleanBase64 = base64Data;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }

      const imageBuffer = Buffer.from(cleanBase64, 'base64');
      const safeName = String(fileName || 'reference').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80);
      const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const finalName = safeName.endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`;
      const refsDir = path.join(workspacePath, 'references');
      const filePath = path.join(refsDir, finalName);

      ensureDir(refsDir);
      fs.writeFileSync(filePath, imageBuffer);

      return {
        ok: true,
        fileName: finalName,
        absolutePath: filePath,
        size: imageBuffer.length,
        mimeType: mimeType || 'image/png'
      };
    } catch (err) {
      logger.error(`[BlenderWorkspace] saveReferenceImage error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  readWorkspaceImage(projectRoot, nodeId, imagePath) {
    try {
      const workspacePath = getWorkspacePath(projectRoot, nodeId);
      if (!workspacePath) return { ok: false, error: 'Invalid workspace' };

      const normalizedInput = path.normalize(String(imagePath || ''));
      const resolved = path.resolve(workspacePath, normalizedInput);
      const normalizedResolved = path.normalize(resolved);
      const normalizedWorkspace = path.normalize(workspacePath);
      if (!normalizedResolved.startsWith(normalizedWorkspace + path.sep) && normalizedResolved !== normalizedWorkspace) {
        return { ok: false, error: 'Path traversal detected' };
      }

      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        return { ok: false, error: `File not found: ${imagePath}` };
      }

      const ext = path.extname(resolved).toLowerCase();
      const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp' };
      const mimeType = mimeMap[ext] || 'image/png';
      const buffer = fs.readFileSync(resolved);

      return {
        ok: true,
        absolutePath: resolved,
        base64: buffer.toString('base64'),
        mimeType,
        size: buffer.length
      };
    } catch (err) {
      logger.error(`[BlenderWorkspace] readWorkspaceImage error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  listWorkspaceImages(projectRoot, nodeId) {
    try {
      const workspacePath = getWorkspacePath(projectRoot, nodeId);
      if (!workspacePath) return { ok: false, error: 'Invalid workspace', images: [] };

      const images = [];
      const categories = ['screenshots', 'references'];
      for (const cat of categories) {
        const dir = path.join(workspacePath, cat);
        if (!fs.existsSync(dir)) continue;
        try {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            const fp = path.join(dir, f);
            try {
              if (fs.statSync(fp).isFile() && /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(f)) {
                images.push({
                  category: cat,
                  fileName: f,
                  relativePath: path.relative(workspacePath, fp),
                  absolutePath: fp,
                  size: fs.statSync(fp).size
                });
              }
            } catch {}
          }
        } catch {}
      }

      images.sort((a, b) => {
        try { return fs.statSync(b.absolutePath).mtimeMs - fs.statSync(a.absolutePath).mtimeMs; } catch { return 0; }
      });

      return { ok: true, images, workspacePath };
    } catch (err) {
      logger.error(`[BlenderWorkspace] listWorkspaceImages error: ${err.message}`);
      return { ok: false, error: err.message, images: [] };
    }
  }

  /**
   * 归档会话
   */
  async archiveSession(projectRoot, nodeId, sessionData) {
    try {
      const workspacePath = getWorkspacePath(projectRoot, nodeId);
      if (!workspacePath) return { ok: false, error: 'Invalid workspace' };

      await this.initWorkspace(projectRoot, nodeId);

      const timestamp = getTimestampSlug();
      const sessionId = sessionData?.sessionId || `session_${timestamp}`;
      const fileName = `${timestamp}_${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)}.json`;
      const sessionsDir = path.join(workspacePath, 'sessions');
      const filePath = path.join(sessionsDir, fileName);

      ensureDir(sessionsDir);
      fs.writeFileSync(filePath, JSON.stringify({
        sessionId,
        archivedAt: new Date().toISOString(),
        ...sessionData
      }, null, 2), 'utf-8');

      return { ok: true, fileName, absolutePath: filePath };
    } catch (err) {
      logger.error(`[BlenderWorkspace] archiveSession error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  /**
   * 清空工作空间
   */
  async clearWorkspace(projectRoot, nodeId) {
    try {
      const workspacePath = getWorkspacePath(projectRoot, nodeId);
      if (!workspacePath) return { ok: false, error: 'Invalid workspace' };

      if (!fs.existsSync(workspacePath)) {
        return { ok: true, cleared: true };
      }

      for (const subdir of ['scripts', 'screenshots', 'sessions']) {
        const dirPath = path.join(workspacePath, subdir);
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath);
          for (const file of files) {
            try {
              const filePath = path.join(dirPath, file);
              const stat = fs.statSync(filePath);
              if (stat.isFile()) {
                fs.unlinkSync(filePath);
              }
            } catch {}
          }
        }
      }

      const metadata = readWorkspaceMetadata(workspacePath);
      metadata.scripts = [];
      metadata.screenshots = [];
      metadata.sessions = metadata.sessions || [];
      metadata.clearedAt = new Date().toISOString();
      writeWorkspaceMetadata(workspacePath, metadata);

      return { ok: true, cleared: true };
    } catch (err) {
      logger.error(`[BlenderWorkspace] clearWorkspace error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  /**
   * 列出已保存的脚本
   */
  async listScripts(projectRoot, nodeId) {
    try {
      const workspacePath = getWorkspacePath(projectRoot, nodeId);
      if (!workspacePath) return { ok: false, error: 'Invalid workspace', scripts: [] };

      const metadata = readWorkspaceMetadata(workspacePath);
      return {
        ok: true,
        scripts: metadata.scripts || []
      };
    } catch (err) {
      return { ok: false, error: err.message, scripts: [] };
    }
  }

  /**
   * 获取工作空间统计
   */
  async getStats(projectRoot, nodeId) {
    try {
      const workspacePath = getWorkspacePath(projectRoot, nodeId);
      if (!workspacePath) return { ok: false, error: 'Invalid workspace' };

      const metadata = readWorkspaceMetadata(workspacePath);
      return {
        ok: true,
        scriptCount: (metadata.scripts || []).length,
        screenshotCount: (metadata.screenshots || []).length,
        sessionCount: (metadata.sessions || []).length
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

const globalSymbol = Symbol.for('dvstudio.blenderWorkspace');
if (!globalThis[globalSymbol]) {
  globalThis[globalSymbol] = new BlenderNodeWorkspace();
}

export function getBlenderWorkspace() {
  return globalThis[globalSymbol];
}

export default getBlenderWorkspace;
