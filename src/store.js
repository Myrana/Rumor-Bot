const fs = require("node:fs");
const path = require("node:path");

const dataDir = path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "store.json");

const defaultState = {
  guilds: {},
  confessions: {}
};

function ensureStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(defaultState, null, 2));
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(storePath, "utf8");

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse store file at ${storePath}: ${error.message}`);
  }
}

function listGuildConfigs() {
  const state = readStore();
  return Object.entries(state.guilds).map(([guildId, config]) => ({
    guildId,
    ...config
  }));
}

function listConfessions() {
  const state = readStore();
  return Object.values(state.confessions).sort((left, right) =>
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function writeStore(state) {
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(state, null, 2));
}

function getGuildConfig(guildId) {
  const state = readStore();
  return state.guilds[guildId] || {};
}

function upsertGuildConfig(guildId, partialConfig) {
  const state = readStore();
  const current = state.guilds[guildId] || {};

  state.guilds[guildId] = {
    ...current,
    ...partialConfig
  };

  writeStore(state);
  return state.guilds[guildId];
}

function saveConfession(confession) {
  const state = readStore();
  state.confessions[confession.messageId] = confession;
  writeStore(state);
  return confession;
}

function getConfession(messageId) {
  const state = readStore();
  return state.confessions[messageId] || null;
}

function updateConfession(messageId, partialConfession) {
  const state = readStore();
  const current = state.confessions[messageId];

  if (!current) {
    return null;
  }

  state.confessions[messageId] = {
    ...current,
    ...partialConfession
  };

  writeStore(state);
  return state.confessions[messageId];
}

module.exports = {
  getGuildConfig,
  getConfession,
  listConfessions,
  listGuildConfigs,
  readStore,
  saveConfession,
  updateConfession,
  upsertGuildConfig
};
