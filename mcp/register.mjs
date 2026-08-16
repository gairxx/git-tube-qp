#!/usr/bin/env node
// Registers the GitTube MCP server with AI agent config files.
//
// Usage:
//   node register.mjs <mcp-server-path> [agent1,agent2,...]
//
// Agents: claude-desktop, claude-code, cursor, opencode, continue

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const serverPath = path.resolve(
  process.argv[2] || process.env.GITTUBE_MCP_SERVER || path.join(os.homedir(), ".gittube", "mcp", "server.mjs")
);
const requested = (process.argv[3] || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const node = process.execPath;

const AGENTS = {
  "claude-desktop": {
    label: "Claude Desktop",
    file: path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    key: ["mcpServers", "gittube"],
    value: { command: node, args: [serverPath] },
  },
  "claude-code": {
    label: "Claude Code",
    file: path.join(os.homedir(), ".claude.json"),
    key: ["mcpServers", "gittube"],
    value: { type: "stdio", command: node, args: [serverPath] },
  },
  cursor: {
    label: "Cursor",
    file: path.join(os.homedir(), ".cursor", "mcp.json"),
    key: ["mcpServers", "gittube"],
    value: { command: node, args: [serverPath] },
  },
  opencode: {
    label: "opencode",
    file: path.join(os.homedir(), ".config", "opencode", "opencode.json"),
    key: ["mcp", "gittube"],
    value: { type: "local", command: [node, serverPath], enabled: true },
  },
  continue: {
    label: "Continue.dev",
    file: path.join(os.homedir(), ".continue", "config.json"),
    key: ["mcpServers", "gittube"],
    value: { command: node, args: [serverPath] },
  },
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function setDeep(obj, keys, value) {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

const agents = requested.length ? requested : Object.keys(AGENTS);

let done = false;
for (const name of agents) {
  const agent = AGENTS[name];
  if (!agent) {
    console.error(`Unknown agent: ${name}`);
    continue;
  }
  const data = readJson(agent.file);
  setDeep(data, agent.key, agent.value);
  writeJson(agent.file, data);
  console.log(`Configured ${agent.label} → ${agent.file}`);
  done = true;
}

if (!done) {
  console.error("No agents configured.");
  process.exit(1);
}
