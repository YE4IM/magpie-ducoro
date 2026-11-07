import { spawn as nodeSpawn } from "node:child_process";

// Shared command lifecycle; secrets stay in the bridge redaction context.
export function createCommandRunner({
  opts,
  dryRun,
  rememberSecret,
  log,
  getGatewaySignal,
  gatewayAbortError,
}) {
  return (args, { stdin, timeoutMs = 90_000, signal } = {}) =>
    new Promise((resolve, reject) => {
      const gatewaySignal =
        args[0] === "connections" ? getGatewaySignal() : null;
      if (gatewaySignal?.aborted) {
        reject(gatewayAbortError());
        return;
      }
      if (signal?.aborted) {
        reject(
          Object.assign(new Error("request cancelled"), { name: "AbortError" }),
        );
        return;
      }
      const abortableRead =
        gatewaySignal && ["catalog", "get", "list"].includes(args[1]);
      const full = [...args, "--json"];
      rememberSecret(stdin);
      for (let i = 0; i < args.length - 1; i++) {
        if (
          ["--env", "--header", "--args", "--url", "--base-url"].includes(
            args[i],
          )
        ) {
          rememberSecret(args[i + 1]);
          for (const pair of ["--env", "--header", "--args"].includes(args[i])
            ? String(args[i + 1]).split(",")
            : []) {
            const eq = pair.indexOf("=");
            rememberSecret(eq >= 0 ? pair.slice(eq + 1) : pair);
          }
        }
      }
      if (dryRun) {
        // Command values can contain secrets even in positional args or URLs.
        // Preview the operation and flag names only, never their values.
        let valueNext = false;
        const preview = full.map((arg, i) => {
          if (i < 2) return arg;
          if (valueNext) {
            valueNext = false;
            return "[redacted]";
          }
          if (/^--[a-z][a-z0-9-]*$/.test(arg)) {
            valueNext = !["--stdin", "--json"].includes(arg);
            return arg;
          }
          return "[redacted]";
        });
        log(
          "dry-run:",
          opts.cli,
          ...preview,
          stdin !== undefined ? "(secret via stdin)" : "",
        );
        resolve({ ok: true, code: 0, stdout: "", stderr: "", json: null });
        return;
      }
      let child;
      try {
        child = nodeSpawn(opts.cli, full, {
          stdio: [stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
        });
      } catch (e) {
        resolve({
          ok: false,
          code: -1,
          stdout: "",
          stderr: String(e?.message ?? e),
          json: null,
        });
        return;
      }
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let aborted = false;
      let done = false;
      const finish = (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (abortableRead) gatewaySignal.removeEventListener("abort", onAbort);
        signal?.removeEventListener("abort", onAbort);
        if (aborted) {
          reject(
            signal?.aborted
              ? Object.assign(new Error("request cancelled"), {
                  name: "AbortError",
                })
              : gatewayAbortError(),
          );
          return;
        }
        let json = null;
        try {
          json = JSON.parse(stdout.trim());
        } catch {}
        resolve({ ok: code === 0, code, stdout, stderr, json });
      };
      const onAbort = () => {
        aborted = true;
        try {
          child.kill("SIGKILL");
        } catch {}
        finish(-1);
      };
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {}
      }, timeoutMs);
      child.stdout?.on("data", (d) => {
        stdout += d;
      });
      child.stderr?.on("data", (d) => {
        stderr += d;
      });
      child.on("error", (e) => {
        stderr = String(e?.message ?? e);
        finish(-1);
      });
      if (abortableRead)
        gatewaySignal.addEventListener("abort", onAbort, { once: true });
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted || (abortableRead && gatewaySignal.aborted))
        onAbort();
      // A CLI that exits before reading stdin must not crash the shared host.
      child.stdin?.on("error", (e) => {
        stderr += `\n${e.message}`;
      });
      if (stdin !== undefined) {
        child.stdin.end(stdin + "\n");
      }
      child.on("close", (code) => {
        if (timedOut) {
          stderr = `timed out after ${timeoutMs} ms\n` + stderr;
          finish(-1);
        } else {
          finish(code ?? -1);
        }
      });
    });
}
