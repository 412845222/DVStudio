/**
 * Tool Image Processor
 *
 * 职责：
 * - 检测工具返回结果中的image类型content parts
 * - 将base64图片解码保存到本地临时目录
 * - 返回清理后的工具结果（移除base64，保留文本提示）
 * - 返回收集到的图片元信息（本地路径、mimeType等）
 * - 提供临时文件清理能力
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import logger from '../../../core/logger.mjs';

const TEMP_DIR_NAME = 'dweb-blender-screenshots';
const FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getTempDir() {
	return path.join(os.tmpdir(), TEMP_DIR_NAME);
}

function ensureDir(dirPath) {
	try {
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true });
		}
	} catch (err) {
		logger.warn(`ToolImageProcessor: Failed to create temp dir ${dirPath}: ${err.message}`);
	}
}

function cleanupOldFiles(dirPath) {
	try {
		if (!fs.existsSync(dirPath)) return;
		const now = Date.now();
		const files = fs.readdirSync(dirPath);
		for (const file of files) {
			try {
				const filePath = path.join(dirPath, file);
				const stat = fs.statSync(filePath);
				if (stat.isFile() && (now - stat.mtimeMs) > FILE_MAX_AGE_MS) {
					fs.unlinkSync(filePath);
				}
			} catch {}
		}
	} catch (err) {
		logger.warn(`ToolImageProcessor: Failed to cleanup old files: ${err.message}`);
	}
}

function generateFileName() {
	const ts = Date.now();
	const rand = Math.random().toString(36).slice(2, 8);
	return `blender-shot-${ts}-${rand}.png`;
}

function decodeBase64ToBuffer(b64Data) {
	const clean = b64Data.replace(/^data:image\/\w+;base64,/, '');
	return Buffer.from(clean, 'base64');
}

function saveBase64Image(b64Data, mimeType) {
	const tempDir = getTempDir();
	ensureDir(tempDir);

	const fileName = generateFileName();
	const filePath = path.join(tempDir, fileName);
	const mime = mimeType || 'image/png';

	try {
		const cleanB64 = b64Data.replace(/^data:image\/\w+;base64,/, '');
		const buffer = Buffer.from(cleanB64, 'base64');
		fs.writeFileSync(filePath, buffer);
		const dataUrl = `data:${mime};base64,${cleanB64}`;
		return {
			localPath: filePath,
			fileUrl: pathToFileURL(filePath).href,
			dataUrl: dataUrl,
			mimeType: mime,
			fileName,
		};
	} catch (err) {
		logger.warn(`ToolImageProcessor: Failed to save screenshot ${fileName}: ${err.message}`);
		return null;
	}
}

function extractImagesFromContent(content) {
	if (!Array.isArray(content)) return { images: [], sanitizedParts: content };

	const images = [];
	const sanitizedParts = [];

	for (const part of content) {
		if (!part || typeof part !== 'object') {
			sanitizedParts.push(part);
			continue;
		}

		if (part.type === 'image' && typeof part.data === 'string' && part.data) {
			const saved = saveBase64Image(part.data, part.mimeType);
			if (saved) {
				images.push(saved);
				sanitizedParts.push({
					type: 'text',
					text: `[截图已保存: ${saved.fileName}]`
				});
			} else {
				const approxKB = Math.round(part.data.length * 3 / 4 / 1024);
				sanitizedParts.push({
					type: 'text',
					text: `[截图生成成功 (~${approxKB}KB)，但无法保存为文件]`
				});
			}
		} else {
			sanitizedParts.push(part);
		}
	}

	return { images, sanitizedParts };
}

export class ToolImageProcessor {
	constructor(ctx) {
		this.ctx = ctx;
		this.tempDir = getTempDir();
		ensureDir(this.tempDir);
		cleanupOldFiles(this.tempDir);
		this.sessionFiles = new Set();
	}

	processToolResult(toolResult) {
		const images = [];

		if (toolResult === null || toolResult === undefined) {
			return { sanitizedResult: toolResult, images };
		}

		if (typeof toolResult !== 'object') {
			return { sanitizedResult: toolResult, images };
		}

		try {
			if (Array.isArray(toolResult.content)) {
				const { images: extractedImages, sanitizedParts } = extractImagesFromContent(toolResult.content);
				images.push(...extractedImages);
				for (const img of images) {
					this.sessionFiles.add(img.localPath);
				}
				return {
					sanitizedResult: {
						...toolResult,
						content: sanitizedParts,
					},
					images,
				};
			}

			if (toolResult.content && typeof toolResult.content === 'object' && !Array.isArray(toolResult.content)) {
				return { sanitizedResult: toolResult, images };
			}

			return { sanitizedResult: toolResult, images };
		} catch (err) {
			logger.warn(`ToolImageProcessor: Error processing tool result: ${err.message}`);
			return { sanitizedResult: toolResult, images: [] };
		}
	}

	async readAsDataUrl(localPath) {
		try {
			const data = fs.readFileSync(localPath);
			const ext = path.extname(localPath).toLowerCase().slice(1) || 'png';
			const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
			return `data:${mime};base64,${data.toString('base64')}`;
		} catch (err) {
			logger.warn(`ToolImageProcessor: Failed to read image ${localPath}: ${err.message}`);
			return null;
		}
	}

	cleanupFiles(localPaths) {
		if (!Array.isArray(localPaths)) return;
		for (const p of localPaths) {
			try {
				if (fs.existsSync(p)) {
					fs.unlinkSync(p);
				}
				this.sessionFiles.delete(p);
			} catch {}
		}
	}

	cleanupSessionFiles() {
		const paths = Array.from(this.sessionFiles);
		this.cleanupFiles(paths);
	}

	cleanupAll() {
		try {
			cleanupOldFiles(this.tempDir);
			if (fs.existsSync(this.tempDir)) {
				const files = fs.readdirSync(this.tempDir);
				for (const file of files) {
					try {
						fs.unlinkSync(path.join(this.tempDir, file));
					} catch {}
				}
			}
		} catch (err) {
			logger.warn(`ToolImageProcessor: Failed to cleanup all files: ${err.message}`);
		}
	}
}

export function getToolImageProcessorTempDir() {
	return getTempDir();
}

export function cleanupAllScreenshotFiles() {
	const tempDir = getTempDir();
	try {
		if (fs.existsSync(tempDir)) {
			const files = fs.readdirSync(tempDir);
			for (const file of files) {
				try {
					fs.unlinkSync(path.join(tempDir, file));
				} catch {}
			}
		}
	} catch (err) {
		logger.warn(`ToolImageProcessor: Failed to cleanup all screenshots: ${err.message}`);
	}
}
