type Level = "info" | "warn" | "error";

const counters = new Map<string, number>();
const durations = new Map<string, { count: number; total_ms: number; max_ms: number }>();

export function logEvent(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export function incrementMetric(name: string, value = 1) {
  counters.set(name, (counters.get(name) ?? 0) + value);
}

export function metricsSnapshot() {
  return {
    counters: Object.fromEntries(counters),
    durations: Object.fromEntries(durations),
  };
}

function prometheusName(value: string) {
  return `qarar_${value.replace(/[^a-zA-Z0-9_:]/g, "_")}`;
}

export function metricsSnapshotPrometheus() {
  const lines: string[] = [];
  for (const [name, value] of counters) {
    lines.push(`# TYPE ${prometheusName(name)} counter`, `${prometheusName(name)} ${value}`);
  }
  for (const [name, value] of durations) {
    const metric = prometheusName(name);
    lines.push(
      `# TYPE ${metric}_duration_ms summary`,
      `${metric}_duration_ms_count ${value.count}`,
      `${metric}_duration_ms_sum ${value.total_ms}`,
      `${metric}_duration_ms_max ${value.max_ms}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function measure<T>(event: string, operation: () => Promise<T>) {
  const started = performance.now();
  return operation().finally(() => {
    const duration_ms = Math.round(performance.now() - started);
    const current = durations.get(event) ?? { count: 0, total_ms: 0, max_ms: 0 };
    durations.set(event, { count: current.count + 1, total_ms: current.total_ms + duration_ms, max_ms: Math.max(current.max_ms, duration_ms) });
    incrementMetric(`${event}.completed`);
    logEvent("info", event, { duration_ms });
  });
}
