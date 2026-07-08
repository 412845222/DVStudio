import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import logger from '../../core/logger.mjs';

const CONFIG_FILENAME = 'cli-adapters.json';

function getConfigPath() {
  try {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, CONFIG_FILENAME);
  } catch {
    return path.join(process.cwd(), CONFIG_FILENAME);
  }
}

function loadStore() {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    logger.warn(`Failed to load CLI config store: ${err.message}`);
  }
  return { adapters: {} };
}

function saveStore(store) {
  const configPath = getConfigPath();
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(store, null, 2), 'utf8');
    return true;
  } catch (err) {
    logger.error(`Failed to save CLI config store: ${err.message}`);
    return false;
  }
}

class CliConfigStore {
  constructor() {
    this.store = loadStore();
  }

  getAll() {
    return this.store;
  }

  getAdapterConfig(adapterName) {
    const raw = this.store.adapters?.[adapterName] || null;
    return raw ? JSON.parse(JSON.stringify(raw)) : null;
  }

  async updateAdapterConfig(adapterName, updates) {
    if (!this.store.adapters) this.store.adapters = {};

    const current = this.store.adapters[adapterName] || {};
    const merged = {
      ...current,
      ...updates
    };
    this.store.adapters[adapterName] = JSON.parse(JSON.stringify(merged));

    saveStore(this.store);
    return this.store.adapters[adapterName];
  }

  isAdapterEnabled(adapterName) {
    const config = this.getAdapterConfig(adapterName);
    return config?.enabled === true;
  }

  resetAdapterConfig(adapterName) {
    if (this.store.adapters?.[adapterName]) {
      delete this.store.adapters[adapterName];
      saveStore(this.store);
      return true;
    }
    return false;
  }
}

export const cliConfigStore = new CliConfigStore();
