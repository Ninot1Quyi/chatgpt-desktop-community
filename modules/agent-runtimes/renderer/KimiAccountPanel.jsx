import React from "react";
import { cx } from "@app/lib/cx.js";
import { IconRefresh } from "@app/components/icons.jsx";

function prettyValue(value) {
  if (!value) return null;
  const words = String(value)
    .replace(/^(LEVEL|REGION|TYPE|DOMAIN|METHOD|FEATURE|STATUS)_/, "")
    .toLowerCase()
    .split("_")
    .filter(Boolean);
  return words.map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

function remainingPercent(row) {
  const limit = Number(row?.limit || 0);
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, (Number(row?.remaining || 0) / limit) * 100));
}

function formatReset(row) {
  if (row?.resetAt) {
    const date = new Date(row.resetAt);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    }
  }
  const seconds = Number(row?.resetInSeconds || 0);
  if (seconds <= 0) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [hours && `${hours}h`, minutes && `${minutes}m`].filter(Boolean).join(" ") || "<1m";
}

function formatQuotaNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : "—";
}

function formatMoney(money) {
  if (!money || !Number.isFinite(Number(money.cents))) return "—";
  const currency = money.currency || "CNY";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(money.cents) / 100);
  } catch {
    return `${currency} ${(Number(money.cents) / 100).toFixed(2)}`;
  }
}

function quotaDetails(value, prefix = "") {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => quotaDetails(item, `${prefix}${prefix ? " · " : ""}${index + 1}`));
  }
  if (typeof value !== "object") return prefix ? [[prefix, String(value)]] : [];
  return Object.entries(value).flatMap(([key, item]) => {
    const label = prettyValue(key) || key;
    return quotaDetails(item, `${prefix}${prefix ? " · " : ""}${label}`);
  });
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function UsageBar({ row }) {
  const pct = Math.round(remainingPercent(row));
  const reset = formatReset(row);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span>{row.label}</span>
        <span className="text-(--fg-tertiary)">
          {reset && <>Resets {reset} · </>}
          {formatQuotaNumber(row.remaining)} / {formatQuotaNumber(row.limit)} left
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-(--surface-active)">
        <div
          className={cx("h-full rounded-full", pct <= 15 ? "bg-(--danger)" : pct <= 40 ? "bg-(--warning)" : "bg-(--success)")}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px]">
      <span className="min-w-0 truncate text-(--fg-tertiary)" title={label}>{label}</span>
      <span className="shrink-0 text-(--fg-secondary)">{value}</span>
    </div>
  );
}

function UsageUnavailable({ error, onRefresh }) {
  return (
    <div className="rounded-xl border border-(--border-light) bg-(--surface-under) px-3 py-2.5 text-[12px]">
      <div className="text-(--fg-tertiary)">Kimi usage is unavailable{error ? `: ${error}` : "."}</div>
      <button className="mt-2 text-(--accent) hover:underline" onClick={() => onRefresh(true)}>Try again</button>
    </div>
  );
}

export function KimiAccountPanel({
  account,
  credentialLabel = "OAuth credentials",
  error,
  fallbackIcon,
  loading,
  onRefresh,
}) {
  const profile = account?.profile;
  const usage = account?.usage;
  const usageError = account?.errors?.usage || error;
  const rows = [usage?.summary, ...(usage?.limits || [])].filter(Boolean);
  const parallel = usage?.parallel;
  const totalQuota = quotaDetails(usage?.totalQuota);
  const wallet = usage?.boosterWallet;
  const metadata = usage?.metadata;
  const balanceRemaining = wallet?.balance?.remainingCents;
  const balanceTotal = wallet?.balance?.totalCents;
  const plan = prettyValue(profile?.membershipLevel);
  const accountLine = profile?.usernameSource === "service"
    ? [plan, prettyValue(profile?.region)].filter(Boolean).join(" · ") || "Kimi Code"
    : profile?.id
      ? `Account ID · ${profile.id}`
      : credentialLabel;

  return (
    <div className="flex max-h-[calc(100vh-190px)] flex-col gap-3 overflow-y-auto pr-1">
      <div className="flex items-center gap-3">
        {profile?.avatar ? (
          <img src={profile.avatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-(--border-light) bg-(--surface-under)">
            {fallbackIcon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{profile?.username || "Kimi Code account"}</div>
          <div className="truncate text-[12px] text-(--fg-tertiary)">{accountLine}</div>
        </div>
        {plan && <span className="ml-auto shrink-0 text-[14px] font-medium">{plan}</span>}
      </div>

      {loading && !usage && (
        <div className="flex justify-center py-3 text-(--fg-tertiary)"><Spinner /></div>
      )}
      {!loading && !usage && <UsageUnavailable error={usageError} onRefresh={onRefresh} />}

      {rows.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-(--border-light) bg-(--surface-under) px-3 py-2.5">
          {rows.map((row, index) => <UsageBar key={`${row.label}-${index}`} row={row} />)}
        </div>
      )}

      {(parallel || totalQuota.length > 0) && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-(--border-light) bg-(--surface-under) px-3 py-2.5">
          <div className="mb-0.5 text-[11px] font-medium text-(--fg-secondary)">Additional quotas</div>
          {parallel && (
            <DetailRow
              label="Parallel requests"
              value={[
                parallel.used != null ? `${formatQuotaNumber(parallel.used)} used` : null,
                parallel.remaining != null ? `${formatQuotaNumber(parallel.remaining)} left` : null,
                parallel.limit != null ? `${formatQuotaNumber(parallel.limit)} limit` : null,
              ].filter(Boolean).join(" · ") || "—"}
            />
          )}
          {totalQuota.map(([label, value], index) => (
            <DetailRow key={`${label}-${index}`} label={`Total quota · ${label}`} value={value} />
          ))}
        </div>
      )}

      {wallet && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-(--border-light) bg-(--surface-under) px-3 py-2.5">
          <div className="mb-0.5 flex items-center justify-between text-[11px] font-medium text-(--fg-secondary)">
            <span>Extra Usage</span>
            <span>{prettyValue(wallet.status) || "Available"}</span>
          </div>
          {(balanceRemaining != null || balanceTotal != null) && (
            <DetailRow
              label="Booster balance"
              value={[
                balanceRemaining != null ? `${formatMoney({ cents: balanceRemaining, currency: wallet.balance?.currency })} left` : null,
                balanceTotal != null ? `${formatMoney({ cents: balanceTotal, currency: wallet.balance?.currency })} total` : null,
              ].filter(Boolean).join(" · ")}
            />
          )}
          <DetailRow label="Monthly used" value={formatMoney(wallet.monthlyUsed)} />
          <DetailRow
            label="Monthly charge limit"
            value={wallet.monthlyChargeLimitEnabled ? formatMoney(wallet.monthlyChargeLimit) : "Disabled"}
          />
          <DetailRow label="Top-up limit" value={formatMoney(wallet.topupLimit)} />
          <DetailRow label="Auto-refill charge" value={formatMoney(wallet.autoRefillCharge)} />
          <DetailRow label="Auto-refill threshold" value={formatMoney(wallet.autoRefillThreshold)} />
          <DetailRow label="Top-up allowed" value={wallet.allowTopup == null ? "—" : wallet.allowTopup ? "Yes" : "No"} />
        </div>
      )}

      {(metadata?.subType || metadata?.domain || metadata?.authenticationScope) && (
        <div className="flex flex-wrap gap-x-2 text-[10px] text-(--fg-faint)">
          {[metadata.subType, metadata.domain, metadata.authenticationMethod, metadata.authenticationScope]
            .map(prettyValue)
            .filter(Boolean)
            .map((value) => <span key={value}>{value}</span>)}
        </div>
      )}
      {account && (
        <button
          className="flex items-center justify-center gap-1.5 self-end rounded-full border border-(--border) px-2.5 py-1 text-[11px] text-(--fg-secondary) hover:bg-(--surface-hover) disabled:opacity-50"
          disabled={loading}
          onClick={() => onRefresh(true)}
        >
          <IconRefresh size={11} className={loading ? "animate-spin" : ""} />
          Refresh all
        </button>
      )}
      {account && error && <div className="text-[11px] text-(--danger)">Last refresh failed: {error}</div>}
    </div>
  );
}
