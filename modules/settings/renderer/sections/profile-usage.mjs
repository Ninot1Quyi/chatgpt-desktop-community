const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function toDateOnly(value) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function normalizeUsageBuckets(usage) {
  const buckets = Array.isArray(usage?.dailyUsageBuckets) ? usage.dailyUsageBuckets : [];
  return buckets
    .map((bucket) => {
      const date = toDateOnly(bucket.startDate || bucket.date || bucket.day);
      const tokens = Number(bucket.tokens ?? bucket.totalTokens ?? 0);
      return date && Number.isFinite(tokens)
        ? {
            key: dateKey(date),
            date,
            tokens,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

export function buildTokenSeries(usage, mode, now = new Date()) {
  const normalized = normalizeUsageBuckets(usage);
  const byDay = new Map(normalized.map((bucket) => [bucket.key, bucket.tokens]));
  const today = toDateOnly(now) || toDateOnly(new Date());
  const days = [];
  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const key = dateKey(date);
    days.push({
      key,
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      tokens: byDay.get(key) || 0,
    });
  }

  if (mode === "weekly") {
    const weeks = [];
    for (let i = 11; i >= 0; i -= 1) {
      const end = new Date(today.getTime() - i * 7 * DAY_MS);
      const start = new Date(end.getTime() - 6 * DAY_MS);
      let tokens = 0;
      for (const bucket of normalized) {
        if (bucket.date >= start && bucket.date <= end) tokens += bucket.tokens;
      }
      weeks.push({
        key: `${dateKey(start)}:${dateKey(end)}`,
        label: end.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        tokens,
        value: tokens,
      });
    }
    return weeks;
  }

  let cumulative = 0;
  return days.map((day) => {
    cumulative += day.tokens;
    return {
      ...day,
      value: mode === "cumulative" ? cumulative : day.tokens,
    };
  });
}

export function recentUsageRows(usage, limit = 6) {
  return normalizeUsageBuckets(usage)
    .filter((bucket) => bucket.tokens > 0)
    .slice(-limit)
    .reverse()
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      tokens: bucket.tokens,
    }));
}
