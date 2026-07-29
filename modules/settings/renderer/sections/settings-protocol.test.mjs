import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildTokenSeries,
  normalizeUsageBuckets,
  recentUsageRows,
} from "./profile-usage.mjs";
import {
  clientIdOf,
  environmentIdOf,
  formatClientDescription,
  formatClientTitle,
  isRemoteControlEnabled,
  listOfClients,
} from "./connections-protocol.mjs";

const personalizationSource = fs.readFileSync(new URL("./PersonalizationSection.jsx", import.meta.url), "utf8");
const gitSource = fs.readFileSync(new URL("./GitSection.jsx", import.meta.url), "utf8");

test("token activity keeps Daily, Weekly, and Cumulative semantics distinct", () => {
  const usage = {
    dailyUsageBuckets: [
      { startDate: "2026-07-17", tokens: 10 },
      { startDate: "2026-07-29", tokens: 20 },
      { startDate: "2026-07-30", tokens: 30 },
    ],
  };
  const now = new Date("2026-07-30T12:00:00Z");

  const daily = buildTokenSeries(usage, "daily", now);
  assert.equal(daily.length, 14);
  assert.equal(daily.at(-1).tokens, 30);
  assert.equal(daily.at(-1).value, 30);

  const weekly = buildTokenSeries(usage, "weekly", now);
  assert.equal(weekly.length, 12);
  assert.equal(weekly.at(-1).value, 50);

  const cumulative = buildTokenSeries(usage, "cumulative", now);
  assert.equal(cumulative.at(-1).value, 60);
});

test("usage rows expose actual daily records instead of invented monthly totals", () => {
  const usage = {
    dailyUsageBuckets: [
      { startDate: "bad", tokens: 10 },
      { startDate: "2026-07-28", tokens: 0 },
      { startDate: "2026-07-29", tokens: 20 },
      { startDate: "2026-07-30", tokens: 30 },
    ],
  };

  assert.deepEqual(normalizeUsageBuckets(usage).map((b) => [b.key, b.tokens]), [
    ["2026-07-28", 0],
    ["2026-07-29", 20],
    ["2026-07-30", 30],
  ]);
  assert.deepEqual(recentUsageRows(usage).map((row) => [row.key, row.tokens]), [
    ["2026-07-30", 30],
    ["2026-07-29", 20],
  ]);
});

test("remote-control helpers use server environment and protocol client fields", () => {
  const status = { environmentId: "env-real", status: "connected" };
  const client = {
    clientId: "client-1",
    displayName: "Work iPhone",
    deviceModel: "iPhone 15",
    deviceType: "phone",
    osVersion: "iOS 18",
    platform: "darwin",
  };

  assert.equal(environmentIdOf(status, { environmentId: "pair-env" }), "env-real");
  assert.equal(isRemoteControlEnabled(status), true);
  assert.deepEqual(listOfClients({ data: [client] }), [client]);
  assert.equal(clientIdOf(client), "client-1");
  assert.equal(formatClientTitle(client), "Work iPhone");
  assert.equal(formatClientDescription(client), "phone · iPhone 15 · iOS 18");
});

test("settings writes use config/value/write keyPath protocol", () => {
  assert.match(
    personalizationSource,
    /api\.rpc\("config\/value\/write", \{ keyPath: "instructions", value: instructions, mergeStrategy: "replace" \}\)/,
  );
  assert.match(
    gitSource,
    /api\.rpc\("config\/value\/write", \{ keyPath: "git\.branchPrefix", value, mergeStrategy: "replace" \}\)/,
  );
  assert.doesNotMatch(personalizationSource, /\{ key: "instructions"/);
  assert.doesNotMatch(gitSource, /\{ key: "git\.branchPrefix"/);
});
