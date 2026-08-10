import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

process.env.NODE_ENV = "test";

const { createEmailService } = await import("../src/services/emailService.js");

/** Capture log output in memory instead of writing to the console. */
function makeFakeLog() {
  const lines = [];
  return {
    lines,
    log: (msg) => lines.push(msg),
    error: (msg) => lines.push(msg),
    warn: (msg) => lines.push(msg),
  };
}

/** A scriptable stand-in for the Resend SDK class (injectable via `createEmailService`). */
function makeFakeResend(handler) {
  return class FakeResend {
    constructor(key) {
      this.apiKey = key;
    }
    emails = {
      send: async (opts) => handler(opts),
    };
  };
}

const OTP_ARGS = {
  to: "dev.user@example.com",
  otp: "482913",
  purpose: "Tenant Login",
  name: "Dev",
};
const CONFIGURED = {
  resendKey: "re_test",
  fromEmail: "Sri Rama Hostel <noreply@example.com>",
};

test("no provider (development): OTP send fails with a clear config error and the OTP is never logged or rendered", async () => {
  const log = makeFakeLog();
  const svc = createEmailService({ nodeEnv: "development", log });

  await assert.rejects(svc.sendOtpEmail(OTP_ARGS), /RESEND_API_KEY/);
  assert.equal(svc.isResendConfigured(), false);
  const all = log.lines.join("\n");
  assert.ok(!all.includes("[DEV OTP]"), "no dev OTP block may exist");
  assert.ok(!all.includes(OTP_ARGS.otp), "OTP value must never be logged");
  assert.equal(all, "");
});

test("no provider (production): OTP send fails loudly and never writes the OTP to the console", async () => {
  const log = makeFakeLog();
  const svc = createEmailService({ nodeEnv: "production", log });

  await assert.rejects(svc.sendOtpEmail(OTP_ARGS), /RESEND_API_KEY/);
  const all = log.lines.join("\n");
  assert.ok(!all.includes("[DEV OTP]"));
  assert.ok(!all.includes(OTP_ARGS.otp), "OTP value must never be logged in production");
});

test("Resend configured: email is delivered and the OTP is never echoed or dev-logged", async () => {
  const log = makeFakeLog();
  let received = null;
  const FakeResend = makeFakeResend(async (opts) => {
    received = opts;
    return { data: { id: "mail_123" }, error: null };
  });

  const svc = createEmailService({
    ...CONFIGURED,
    nodeEnv: "production",
    ResendClient: FakeResend,
    log,
  });

  const result = await svc.sendOtpEmail({ ...OTP_ARGS, to: "prod@example.com" });

  assert.deepEqual(result, { sent: true });
  assert.ok(received, "Resend client should have been called");
  assert.equal(received.from, CONFIGURED.fromEmail);
  assert.equal(received.to, "prod@example.com");
  assert.match(received.subject, /Tenant Login/);
  assert.equal(typeof received.html, "string");
  assert.match(received.html, /482913/); // the OTP is only inside the email body
  const all = log.lines.join("\n");
  assert.match(all, /Sent to prod@example\.com/);
  assert.ok(!all.includes("[DEV OTP]"), "no dev block when Resend is active");
});

test("Resend failure → generic error surfaced, provider detail and OTP never leaked", async () => {
  const log = makeFakeLog();
  const FakeResend = makeFakeResend(async () => ({
    data: null,
    error: { message: "invalid domain — super-secret-provider-detail-1991" },
  }));

  const svc = createEmailService({
    ...CONFIGURED,
    nodeEnv: "production",
    ResendClient: FakeResend,
    log,
  });

  await assert.rejects(svc.sendOtpEmail(OTP_ARGS), /Unable to send the verification email/);
  const all = log.lines.join("\n");
  // An ops-facing line is written for diagnosis, but never with the OTP:
  assert.match(all, /\[EMAIL\] Resend delivery failed/);
  assert.ok(!all.includes(OTP_ARGS.otp), "OTP must never appear in an error log");
});

test("dev sender fallback: RESEND_FROM_EMAIL unset in development uses Resend's onboarding sender", async () => {
  const sent = [];
  const FakeResend = makeFakeResend(async (opts) => {
    sent.push(opts);
    return { data: { id: "x" }, error: null };
  });

  const devSvc = createEmailService({
    resendKey: "re_test",
    nodeEnv: "development",
    ResendClient: FakeResend,
  });
  await devSvc.sendOtpEmail(OTP_ARGS);
  assert.equal(sent[0].from, "Sri Rama Hostel <onboarding@resend.dev>");
});

test("production always requires RESEND_FROM_EMAIL — Resend is not called without a sender", async () => {
  let called = false;
  const FakeResend = makeFakeResend(async () => {
    called = true;
    return { data: { id: "x" }, error: null };
  });
  const svc = createEmailService({
    resendKey: "re_test",
    nodeEnv: "production",
    ResendClient: FakeResend,
  });

  await assert.rejects(svc.sendOtpEmail(OTP_ARGS), /RESEND_FROM_EMAIL/);
  assert.equal(called, false, "Resend must not be called without a sender address");
});

// ── Fail-closed production boot gate (env.js) ────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envModuleUrl = pathToFileURL(path.resolve(__dirname, "../src/config/env.js")).href;
const STRONG_SECRET = "test-secret-key-1234567890-abcdef";
const STRONG_REFRESH = "test-refresh-key-1234567890-abcdef";

function bootWith(extraEnv) {
  const script = `import("${envModuleUrl}").then(() => console.log("BOOT_OK")).catch((e) => { console.error("BOOT_FAIL:" + e.message); process.exit(1); })`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      JWT_SECRET: STRONG_SECRET,
      REFRESH_TOKEN_SECRET: STRONG_REFRESH,
      RESEND_API_KEY: "",
      RESEND_FROM_EMAIL: "",
      ...extraEnv,
    },
  });
}

test("env: production boot fails closed when RESEND_API_KEY is missing", () => {
  const child = bootWith({});
  assert.notEqual(child.status, 0, "boot must fail");
  const out = `${child.stdout}\n${child.stderr}`;
  assert.match(out, /RESEND_API_KEY must be set in production/);
  assert.ok(!out.includes("BOOT_OK"));
});

test("env: production boot fails closed when RESEND_FROM_EMAIL is missing", () => {
  const child = bootWith({ RESEND_API_KEY: "re_test_123" });
  assert.notEqual(child.status, 0, "boot must fail");
  const out = `${child.stdout}\n${child.stderr}`;
  assert.match(out, /RESEND_FROM_EMAIL must be set in production/);
  assert.ok(!out.includes("BOOT_OK"));
});

test("env: production boot succeeds when both Resend vars are configured", () => {
  const child = bootWith({
    RESEND_API_KEY: "re_test_123",
    RESEND_FROM_EMAIL: "noreply@example.com",
  });
  const out = `${child.stdout}\n${child.stderr}`;
  assert.equal(child.status, 0, `boot should succeed; child output: ${out}`);
  assert.match(out, /BOOT_OK/);
});
