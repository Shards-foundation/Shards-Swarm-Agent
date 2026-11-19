import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import test from "node:test";

for (const mode of ["development", "production"]) {
  test(`client fallbacks and API routing in ${mode}`, { timeout: 45000 }, async t => {
    const args = mode === "development"
      ? ["--import", "tsx", "server/_core/index.ts"]
      : ["dist/index.js"];
    const server = spawn(process.execPath, args, {
      env: { ...process.env, NODE_ENV: mode, PORT: "18475" },
      stdio: ["ignore", "pipe", "inherit"],
      signal: t.signal,
    });
    const stopped = once(server, "exit");
    t.after(async () => {
      if (server.exitCode === null && server.signalCode === null) server.kill();
      await stopped;
    });

    let origin;
    for await (const line of createInterface({ input: server.stdout })) {
      const match = /Server running on http:\/\/localhost:(\d+)\//.exec(line);
      if (match) {
        origin = `http://127.0.0.1:${match[1]}`;
        break;
      }
    }
    assert.ok(origin, "application exited before it started listening");
    for (const route of ["/", "/dashboard/activity"]) {
      const response = await fetch(origin + route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      assert.match(await response.text(), /<div id="root"><\/div>/);
    }
    const me = await fetch(origin + "/api/trpc/auth.me");
    assert.equal(me.status, 200);
    assert.deepEqual((await me.json()).result.data.json, null);
  });
}
