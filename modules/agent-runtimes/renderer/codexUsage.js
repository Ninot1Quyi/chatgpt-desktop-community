const KNOWN_LIMIT_NAMES = {
  codex: "General",
  codex_bengalfox: "GPT-5.3-Codex-Spark",
};

function fallbackLimitName(limitId) {
  const raw = String(limitId || "Additional");
  return raw
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function limitName(limitId, snapshot) {
  return snapshot?.limitName || KNOWN_LIMIT_NAMES[limitId] || fallbackLimitName(limitId);
}

export function codexRateLimitSections(data) {
  const sections = [];
  const main = data?.rateLimits;
  const mainId = main?.limitId || "codex";
  if (main) {
    sections.push({
      id: mainId,
      name: "General",
      title: "General usage limits",
      snapshot: main,
    });
  }

  for (const [id, snapshot] of Object.entries(data?.rateLimitsByLimitId || {})) {
    if (!snapshot || (main && id === mainId)) continue;
    const name = limitName(id, snapshot);
    sections.push({
      id,
      name,
      title: `${name} usage limits`,
      snapshot,
    });
  }
  return sections;
}

function durationLabel(durationMins, fallback) {
  const duration = Number(durationMins);
  if (!Number.isFinite(duration) || duration <= 0) return fallback;
  if (duration === 7 * 24 * 60) return "Weekly usage limit";
  if (duration % (7 * 24 * 60) === 0) {
    return `${duration / (7 * 24 * 60)}-week usage limit`;
  }
  if (duration % (24 * 60) === 0) {
    return `${duration / (24 * 60)}-day usage limit`;
  }
  if (duration % 60 === 0) {
    return `${duration / 60}-hour usage limit`;
  }
  return `${duration}-minute usage limit`;
}

export function codexRateLimitWindows(snapshot) {
  return [
    {
      id: "primary",
      window: snapshot?.primary,
      fallback: "Primary usage limit",
    },
    {
      id: "secondary",
      window: snapshot?.secondary,
      fallback: "Secondary usage limit",
    },
  ]
    .filter((entry) => entry.window)
    .map((entry) => ({
      id: entry.id,
      window: entry.window,
      label: durationLabel(entry.window.windowDurationMins, entry.fallback),
    }));
}

export function codexRemainingPercent(window) {
  return Math.max(0, Math.min(100, 100 - Number(window?.usedPercent || 0)));
}

export function codexResetDate(timestamp, includeTime = false) {
  if (!timestamp) return null;
  const date = new Date(Number(timestamp) * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const day = `${date.getMonth() + 1}/${date.getDate()}`;
  if (!includeTime) return day;
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${day} ${time}`;
}
