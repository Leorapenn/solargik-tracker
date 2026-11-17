// intake-mcp.js: a small LOCAL tool server (MCP over stdio) for the "revalue-email-proposals" task.
// It exists so the task can call a few NAMED tools instead of typing PowerShell: the app can approve a tool once by
// name, whatever data goes into it, which it cannot do for commands whose text changes every run.
//
// What it can do (and nothing else):
//   - call Solargik 360's intake endpoints: GET import-run / customers / projects / suggestions,
//     POST suggestions / import-run, only on https://solargik-tracker.vercel.app/api/intake/;
//   - run save-attachment.ps1 (next to this file), which only reads Outlook and saves one PDF into a project's
//     contract folders and never overwrites or deletes anything.
// It reads INTAKE_TOKEN itself (process copy, else the Windows user-level variable) and never returns, prints
// or logs it. It has no dependencies; it talks newline-delimited JSON-RPC on stdin/stdout.
"use strict";
const { execFile } = require("node:child_process");
const path = require("node:path");

const BASE = "https://solargik-tracker.vercel.app/api/intake/";
const SAVE_SCRIPT = path.join(__dirname, "save-attachment.ps1");
const SUBFOLDERS = ["Contracts + Legal", "Contracts + Legal\\Invoices", "Contracts + Legal\\Proof of payment"];
const MAX_BODY = 1_000_000;

function readToken() {
  return new Promise((resolve) => {
    // The user-level value is current; the process copy may predate it.
    execFile("reg", ["query", "HKCU\\Environment", "/v", "INTAKE_TOKEN"], { windowsHide: true }, (error, stdout) => {
      if (!error) {
        const match = /INTAKE_TOKEN\s+REG_(?:EXPAND_)?SZ\s+(\S+)/i.exec(String(stdout));
        if (match) return resolve(match[1]);
      }
      resolve(process.env.INTAKE_TOKEN || "");
    });
  });
}

async function callIntake(method, endpoint, body) {
  const token = await readToken();
  if (!token) return { isError: true, text: "INTAKE_TOKEN is not set" };
  const init = { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120_000) };
  if (method === "POST") {
    const json = JSON.stringify(body);
    if (json.length > MAX_BODY) return { isError: true, text: "FAILED: body is larger than 1 MB" };
    init.headers["Content-Type"] = "application/json; charset=utf-8";
    init.body = Buffer.from(json, "utf8");
  }
  try {
    const response = await fetch(BASE + endpoint, init);
    const text = await response.text();
    if (!response.ok) return { isError: true, text: `FAILED: ${method} ${endpoint} -> HTTP ${response.status} ${text.slice(0, 500)}` };
    return { isError: false, text };
  } catch (error) {
    return { isError: true, text: `FAILED: ${method} ${endpoint} -> ${error && error.name === "TimeoutError" ? "timeout" : "no response"}` };
  }
}

function saveAttachment(args) {
  return new Promise((resolve) => {
    // This PC's default policy blocks every script ("running scripts is disabled"). -ExecutionPolicy Bypass applies to
    // THIS one process only (nothing on the machine is changed) and only for the fixed script path below.
    const argv = [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SAVE_SCRIPT,
      "-InternetMessageId", String(args.internetMessageId ?? ""),
      "-AttachmentName", String(args.attachmentName ?? ""),
      "-ProjectFolder", String(args.projectFolder ?? ""),
      "-Subfolder", String(args.subfolder ?? ""),
      "-ReceivedDate", String(args.receivedDate ?? ""),
    ];
    // no shell: every value is one argument, so quotes and spaces in them are safe
    execFile("powershell.exe", argv, { windowsHide: true, timeout: 120_000, maxBuffer: 1_000_000, encoding: "utf8" }, (error, stdout, stderr) => {
      const out = String(stdout || "").trim();
      if (out) return resolve({ isError: false, text: out });
      resolve({ isError: true, text: JSON.stringify({ status: "failed", reason: "the save script gave no answer: " + String(stderr || (error && error.message) || "").trim().slice(0, 300) }) });
    });
  });
}

const objectSchema = (properties, required) => ({ type: "object", properties, required, additionalProperties: false });
const TOOLS = [
  { name: "get_last_import", description: "GET import-run: when the previous run STARTED (lastImportAt, null if none). The answer also has serverNow: use it as THIS run's start time.", inputSchema: objectSchema({}, []) },
  { name: "get_customers", description: "GET customers: names, aliases, email domains and contacts.", inputSchema: objectSchema({}, []) },
  { name: "get_projects", description: "GET projects: number, name, aliases, customer, lifecycle, phases with their current update, pending proposals, change orders by name and state.", inputSchema: objectSchema({}, []) },
  { name: "get_suggestion_fields", description: "GET suggestions: the proposal kinds, itemNames and the fields of each kind.", inputSchema: objectSchema({}, []) },
  {
    name: "submit_suggestions",
    description: "POST suggestions: submit up to 20 PROPOSALS (a person reviews each in the 360 Inbox before anything changes). Answer: {created, duplicates, rejected:[{index,error}]}.",
    inputSchema: objectSchema({ suggestions: { type: "array", maxItems: 20, items: { type: "object" } } }, ["suggestions"]),
  },
  {
    name: "record_import_run",
    description: "POST import-run: record a finished run. emailsChecked = distinct emails looked at; ranAt = the run's START time (ISO 8601, UTC).",
    inputSchema: objectSchema({ emailsChecked: { type: "integer", minimum: 0, maximum: 100000 }, ranAt: { type: "string" } }, ["emailsChecked", "ranAt"]),
  },
  {
    name: "save_attachment",
    description: "Save ONE PDF attachment of one email into the project's contract folders (reads Outlook only, never overwrites or deletes). Answer: {status:'saved'|'existing'|'failed', link, fileName, reason}.",
    inputSchema: objectSchema(
      {
        internetMessageId: { type: "string" },
        attachmentName: { type: "string" },
        projectFolder: { type: "string" },
        subfolder: { type: "string", enum: SUBFOLDERS },
        receivedDate: { type: "string", description: "yyyy-MM-dd" },
      },
      ["internetMessageId", "attachmentName", "projectFolder", "subfolder", "receivedDate"],
    ),
  },
];

async function runTool(name, args) {
  switch (name) {
    case "get_last_import": {
      const result = await callIntake("GET", "import-run");
      if (result.isError) return result;
      try {
        return { isError: false, text: JSON.stringify({ ...JSON.parse(result.text), serverNow: new Date().toISOString() }) };
      } catch {
        return { isError: true, text: "FAILED: GET import-run -> the answer was not JSON" };
      }
    }
    case "get_customers": return callIntake("GET", "customers");
    case "get_projects": return callIntake("GET", "projects");
    case "get_suggestion_fields": return callIntake("GET", "suggestions");
    case "submit_suggestions":
      if (!Array.isArray(args.suggestions) || args.suggestions.length === 0 || args.suggestions.length > 20) return { isError: true, text: "FAILED: suggestions must be a list of 1 to 20 proposals" };
      return callIntake("POST", "suggestions", { suggestions: args.suggestions });
    case "record_import_run": {
      if (!Number.isInteger(args.emailsChecked) || args.emailsChecked < 0) return { isError: true, text: "FAILED: emailsChecked must be a whole number" };
      if (typeof args.ranAt !== "string" || Number.isNaN(Date.parse(args.ranAt))) return { isError: true, text: "FAILED: ranAt must be an ISO date-time" };
      return callIntake("POST", "import-run", { emailsChecked: args.emailsChecked, ranAt: args.ranAt });
    }
    case "save_attachment":
      if (!SUBFOLDERS.includes(args.subfolder)) return { isError: true, text: JSON.stringify({ status: "failed", reason: "subfolder is not allowed" }) };
      return saveAttachment(args);
    default:
      return { isError: true, text: `unknown tool ${name}` };
  }
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

async function handle(message) {
  const { id, method, params } = message;
  if (id === undefined) return; // a notification (e.g. notifications/initialized): no answer
  try {
    if (method === "initialize") {
      return send({ jsonrpc: "2.0", id, result: { protocolVersion: (params && params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "revalue-intake", version: "1.0.0" } } });
    }
    if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
    if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      const result = await runTool(params.name, params.arguments || {});
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: result.text }], isError: result.isError } });
    }
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
  } catch (error) {
    send({ jsonrpc: "2.0", id, error: { code: -32603, message: "internal error" } });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
