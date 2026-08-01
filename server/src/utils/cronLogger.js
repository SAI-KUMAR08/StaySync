/**
 * Minimal structured logging + monitoring for cron jobs.
 *
 * - Logs single-line JSON so cloud log aggregators can index them.
 * - Keeps a bounded in-memory run history (exposed via getCronRunHistory()).
 * - If CRON_ALERT_WEBHOOK is configured, failed runs are POSTed to it
 *   (fire-and-forget) so ops gets alerted without any extra infra.
 */

const MAX_HISTORY = 100;
const runHistory = [];

function emit(job, level, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    service: "cron",
    job,
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  if (level === "error" && process.env.CRON_ALERT_WEBHOOK) {
    // Fire-and-forget — never let alerting break the cron run.
    fetch(process.env.CRON_ALERT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: line,
    }).catch(() => {});
  }
}

export function logCron(job, level, message, meta = {}) {
  emit(job, level, message, meta);
}

export function recordCronRun(job, outcome, meta = {}) {
  runHistory.push({ job, outcome, ts: Date.now(), ...meta });
  if (runHistory.length > MAX_HISTORY) runHistory.shift();
}

export function getCronRunHistory() {
  return runHistory.slice();
}
