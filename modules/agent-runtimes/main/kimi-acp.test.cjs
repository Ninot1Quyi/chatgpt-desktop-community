const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const {
  choosePermissionOption,
  kimiMode,
  parseJsonRpcLine,
  runKimiAcp,
  truncateTail,
} = require("./kimi-acp.cjs");

function writeRpc(stream, message) {
  stream.write(`${JSON.stringify(message)}\n`, "utf8");
}

function fakeAcpSpawn(handler) {
  const calls = [];
  const spawnImpl = (binary, args, options) => {
    calls.push({ binary, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    child.killed = false;
    child.kill = () => {
      if (child.killed) return false;
      child.killed = true;
      child.signalCode = "SIGTERM";
      child.emit("exit", null, "SIGTERM");
      return true;
    };

    let buffer = "";
    child.stdin = new Writable({
      write(chunk, encoding, callback) {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          handler({
            child,
            message: JSON.parse(line),
            respond: (id, result) => writeRpc(child.stdout, { jsonrpc: "2.0", id, result }),
            reject: (id, error) => writeRpc(child.stdout, { jsonrpc: "2.0", id, error }),
            notify: (method, params) => writeRpc(child.stdout, { jsonrpc: "2.0", method, params }),
          });
        }
        callback();
      },
      final(callback) {
        child.exitCode = 0;
        child.emit("exit", 0, null);
        callback();
      },
    });
    child.stdin.setDefaultEncoding("utf8");
    return child;
  };
  spawnImpl.calls = calls;
  return spawnImpl;
}

test("parses JSON-RPC lines and truncates stderr from the tail", () => {
  assert.deepEqual(parseJsonRpcLine("  {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}  "), {
    jsonrpc: "2.0",
    id: 1,
    result: {},
  });
  assert.equal(parseJsonRpcLine(""), null);
  assert.equal(truncateTail("abcdef", 3), "def");
});

test("runKimiAcp initializes, creates a session, configures it, and streams updates before prompt resolves", async () => {
  const seen = [];
  let promptResolved = false;
  const spawnImpl = fakeAcpSpawn(({ message, respond, notify }) => {
    seen.push(message);
    if (message.method === "initialize") {
      respond(message.id, {
        protocolVersion: 1,
        agentCapabilities: { sessionCapabilities: { resume: {}, list: {} } },
      });
    } else if (message.method === "session/new") {
      respond(message.id, {
        sessionId: "session_11111111-1111-1111-1111-111111111111",
        configOptions: [{ id: "thinking", category: "thought_level", type: "select" }],
      });
    } else if (message.method === "session/set_config_option") {
      respond(message.id, { configOptions: [] });
    } else if (message.method === "session/prompt") {
      notify("session/update", {
        sessionId: message.params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "hi" },
        },
      });
      notify("session/update", {
        sessionId: message.params.sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tool-1",
          title: "Read file",
        },
      });
      assert.equal(promptResolved, false);
      respond(message.id, { stopReason: "end_turn" });
      promptResolved = true;
    }
  });
  const updates = [];

  const result = await runKimiAcp({
    model: "kimi-code/k3",
    effort: "high",
    permission: "full",
    planMode: false,
    prompt: "hello",
    mcpServers: [{ name: "untrusted", command: "false" }],
    additionalDirectories: ["/private"],
  }, {
    binary: "/bin/kimi",
    cwd: "/tmp/project",
    env: { TEST_ONLY: "1" },
    spawnImpl,
    onUpdate: (update) => {
      assert.equal(promptResolved, false);
      updates.push(update);
    },
  });

  assert.deepEqual(result, {
    sessionId: "session_11111111-1111-1111-1111-111111111111",
    stopReason: "end_turn",
  });
  assert.deepEqual(spawnImpl.calls[0].args, ["acp"]);
  assert.equal(spawnImpl.calls[0].options.cwd, "/tmp/project");
  assert.equal(spawnImpl.calls[0].options.env.TEST_ONLY, "1");
  assert.deepEqual(seen.map((message) => message.method), [
    "initialize",
    "session/new",
    "session/set_config_option",
    "session/set_config_option",
    "session/set_config_option",
    "session/prompt",
  ]);
  assert.deepEqual(seen[0].params.clientCapabilities.fs, {
    readTextFile: false,
    writeTextFile: false,
  });
  assert.equal(typeof seen[0].params.clientInfo.version, "string");
  assert.notEqual(seen[0].params.clientInfo.version, "");
  assert.equal(seen[1].params.cwd, "/tmp/project");
  assert.deepEqual(seen[1].params.mcpServers, []);
  assert.equal(Object.hasOwn(seen[1].params, "additionalDirectories"), false);
  assert.deepEqual(seen.slice(2, 5).map((message) => [message.params.configId, message.params.value]), [
    ["model", "kimi-code/k3"],
    ["mode", "yolo"],
    ["thinking", "on"],
  ]);
  assert.deepEqual(seen[5].params.prompt, [{ type: "text", text: "hello" }]);
  assert.deepEqual(updates.map((entry) => entry.update.sessionUpdate), ["agent_message_chunk", "tool_call"]);
});

test("runKimiAcp resumes existing sessions and uses plan mode without unavailable thinking config", async () => {
  const seen = [];
  const spawnImpl = fakeAcpSpawn(({ message, respond }) => {
    seen.push(message);
    if (message.method === "initialize") respond(message.id, { protocolVersion: 1 });
    else if (message.method === "session/resume") respond(message.id, { configOptions: [] });
    else if (message.method === "session/set_config_option") respond(message.id, { configOptions: [] });
    else if (message.method === "session/prompt") respond(message.id, { stopReason: "end_turn" });
  });

  const result = await runKimiAcp({
    sessionId: "session_22222222-2222-2222-2222-222222222222",
    model: "kimi-code/k3",
    effort: "high",
    planMode: true,
    prompt: "plan this",
  }, {
    cwd: "/tmp/project",
    spawnImpl,
  });

  assert.equal(result.sessionId, "session_22222222-2222-2222-2222-222222222222");
  assert.equal(seen[1].method, "session/resume");
  assert.equal(seen[1].params.sessionId, "session_22222222-2222-2222-2222-222222222222");
  assert.deepEqual(seen.filter((message) => message.method === "session/set_config_option")
    .map((message) => [message.params.configId, message.params.value]), [
    ["model", "kimi-code/k3"],
    ["mode", "plan"],
  ]);
});

test("onSpawn cancel cancels the current session after it is known", async () => {
  const seen = [];
  let controller;
  const spawnImpl = fakeAcpSpawn(({ message, respond }) => {
    seen.push(message);
    if (message.method === "initialize") respond(message.id, { protocolVersion: 1 });
    else if (message.method === "session/new") respond(message.id, {
      sessionId: "session_33333333-3333-3333-3333-333333333333",
      configOptions: [],
    });
    else if (message.method === "session/set_config_option") respond(message.id, { configOptions: [] });
    else if (message.method === "session/prompt") {
      controller.cancel();
      respond(message.id, { stopReason: "cancelled" });
    }
  });

  const result = await runKimiAcp({
    model: "kimi-code/k3",
    permission: "approve",
    prompt: "stop",
  }, {
    cwd: "/tmp/project",
    spawnImpl,
    onSpawn: (child, spawnedController) => {
      assert.equal(typeof child.kill, "function");
      controller = spawnedController;
    },
  });

  assert.equal(result.stopReason, "cancelled");
  const cancel = seen.find((message) => message.method === "session/cancel");
  assert.equal(cancel.params.sessionId, "session_33333333-3333-3333-3333-333333333333");
});

test("onSpawn cancel kills the process before a session is known", async () => {
  let spawned;
  let controller;
  const spawnImpl = fakeAcpSpawn(() => {});

  await assert.rejects(
    runKimiAcp({
      model: "kimi-code/k3",
      prompt: "hello",
    }, {
      spawnImpl,
      onSpawn: (child, spawnedController) => {
        spawned = child;
        controller = spawnedController;
        controller.cancel();
      },
    }),
    /exited before completing pending requests/,
  );
  assert.equal(spawned.killed, true);
});

test("permission requests forward ask decisions and map automatic modes", async () => {
  assert.equal(kimiMode("ask", false), "default");
  assert.equal(kimiMode("approve", false), "auto");
  assert.equal(kimiMode("full", false), "yolo");
  assert.equal(kimiMode("full", true), "plan");
  assert.equal(choosePermissionOption("full", [
    { optionId: "reject_once", kind: "reject_once" },
    { optionId: "allow_always", kind: "allow_always" },
  ]).optionId, "allow_always");
  assert.equal(choosePermissionOption("approve", [
    { optionId: "allow_always", kind: "allow_always" },
    { optionId: "allow_once", kind: "allow_once" },
  ]).optionId, "allow_once");

  const seen = [];
  const requests = [];
  let promptRequestId;
  const spawnImpl = fakeAcpSpawn(({ child, message, respond }) => {
    seen.push(message);
    if (message.method === "initialize") respond(message.id, { protocolVersion: 1 });
    else if (message.method === "session/new") respond(message.id, {
      sessionId: "session_44444444-4444-4444-4444-444444444444",
      configOptions: [],
    });
    else if (message.method === "session/set_config_option") respond(message.id, { configOptions: [] });
    else if (message.method === "session/prompt") {
      promptRequestId = message.id;
      writeRpc(child.stdout, {
        jsonrpc: "2.0",
        id: 101,
        method: "session/request_permission",
        params: {
          sessionId: message.params.sessionId,
          options: [
            { optionId: "allow_once", kind: "allow_once" },
            { optionId: "reject_once", kind: "reject_once" },
          ],
        },
      });
    } else if (message.id === 101 && hasOwn(message, "result")) {
      respond(promptRequestId, { stopReason: "end_turn" });
    }
  });

  await runKimiAcp({
    model: "kimi-code/k3",
    permission: "ask",
    prompt: "needs tool",
  }, {
    spawnImpl,
    onPermissionRequest: async (params) => {
      requests.push(params);
      return { outcome: { outcome: "selected", optionId: "allow_once" } };
    },
  });

  const permissionResponse = seen.find((message) => hasOwn(message, "result"));
  assert.equal(requests.length, 1);
  assert.deepEqual(permissionResponse.result, { outcome: { outcome: "selected", optionId: "allow_once" } });
});

test("permission callback failures cancel instead of silently approving", async () => {
  let promptRequestId;
  let permissionResponse;
  const spawnImpl = fakeAcpSpawn(({ child, message, respond }) => {
    if (message.method === "initialize") respond(message.id, { protocolVersion: 1 });
    else if (message.method === "session/new") respond(message.id, {
      sessionId: "session_55555555-5555-5555-5555-555555555555",
      configOptions: [],
    });
    else if (message.method === "session/set_config_option") respond(message.id, { configOptions: [] });
    else if (message.method === "session/prompt") {
      promptRequestId = message.id;
      writeRpc(child.stdout, {
        jsonrpc: "2.0",
        id: 102,
        method: "session/request_permission",
        params: {
          sessionId: message.params.sessionId,
          options: [{ optionId: "allow_once", kind: "allow_once" }],
        },
      });
    } else if (message.id === 102 && hasOwn(message, "result")) {
      permissionResponse = message.result;
      respond(promptRequestId, { stopReason: "cancelled" });
    }
  });

  await runKimiAcp({
    model: "kimi-code/k3",
    permission: "ask",
    prompt: "needs approval",
  }, {
    spawnImpl,
    onPermissionRequest: async () => {
      throw new Error("renderer closed");
    },
  });

  assert.deepEqual(permissionResponse, { outcome: { outcome: "cancelled" } });
});

test("runKimiAcp surfaces JSON-RPC errors with trimmed stderr", async () => {
  const spawnImpl = fakeAcpSpawn(({ child, message, respond, reject }) => {
    if (message.method === "initialize") {
      child.stderr.write("diagnostic\n");
      respond(message.id, { protocolVersion: 1 });
    } else if (message.method === "session/new") {
      reject(message.id, { code: -32000, message: "auth required" });
    }
  });

  await assert.rejects(
    runKimiAcp({
      model: "kimi-code/k3",
      prompt: "hello",
    }, {
      spawnImpl,
    }),
    /session\/new: auth required\n.*diagnostic/s,
  );
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}
