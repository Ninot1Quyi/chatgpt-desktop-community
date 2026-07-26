const assert = require("node:assert/strict");
const test = require("node:test");
const { extractCommand, parseRolloutActivity } = require("./rollout-activity");

test("finds the latest unfinished rollout command", () => {
  const open = {
    type: "response_item",
    payload: {
      type: "custom_tool_call",
      call_id: "open",
      name: "exec",
      input: 'const r = await tools.exec_command({"cmd":"rg -n \\"needle\\" renderer"});',
    },
  };
  const closed = {
    type: "response_item",
    payload: { type: "custom_tool_call_output", call_id: "closed" },
  };
  const text = [
    JSON.stringify({ ...open, payload: { ...open.payload, call_id: "closed" } }),
    JSON.stringify(closed),
    JSON.stringify(open),
  ].join("\n");

  assert.equal(extractCommand(open.payload.input), 'rg -n "needle" renderer');
  assert.deepEqual(parseRolloutActivity(text), {
    id: "rollout-open",
    type: "commandExecution",
    command: 'rg -n "needle" renderer',
    status: "inProgress",
  });
  assert.equal(extractCommand('tools.exec_command({cmd:"rg --files renderer"})'), "rg --files renderer");
  assert.equal(extractCommand("tools.exec_command({cmd:'rg --files renderer'})"), "rg --files renderer");
  assert.equal(extractCommand("tools.exec_command({cmd:`rg -n \"needle\" renderer`})"), 'rg -n "needle" renderer');
  assert.deepEqual(parseRolloutActivity(`${text}\n${JSON.stringify({
    type: "response_item",
    payload: { type: "custom_tool_call", call_id: "latest", name: "exec", input: '{"cmd":"pwd"}' },
  })}\n${JSON.stringify({
    type: "response_item",
    payload: { type: "custom_tool_call_output", call_id: "latest" },
  })}`), {
    id: "rollout-open",
    type: "commandExecution",
    command: 'rg -n "needle" renderer',
    status: "inProgress",
  });
});
