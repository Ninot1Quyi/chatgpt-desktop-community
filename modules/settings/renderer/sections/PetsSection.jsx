// Pets: verified Codex pet picker + custom pets folder. Selection is mirrored
// to localStorage under `pet` and the app-server shared avatar atom.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "@app/api.js";
import { useStore } from "@app/store.js";
import { cx } from "@app/lib/cx.js";
import { Card, Btn, lsGet, lsSet } from "./shared.jsx";
import { LucideIcon } from "@app/components/icons.jsx";
import {
  BUILT_IN_PET_CANDIDATES,
  CUSTOM_PETS_STORAGE_KEY,
  customCandidateFromDirectory,
  dedupePetCandidates,
  joinPath,
  normalizePetManifest,
  petDirectoryForCandidate,
  unavailablePet,
} from "./pets-protocol.mjs";

const PET_STORAGE_KEY = "pet";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function ensureFetchable(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function readPet(candidate, petsDir) {
  const directory = petDirectoryForCandidate(candidate, petsDir);
  try {
    const manifestPath = joinPath(directory, "pet.json");
    const manifest = await fetchJson(api.localFileUrl(manifestPath));
    const pet = normalizePetManifest(manifest, candidate, directory);
    await ensureFetchable(api.localFileUrl(pet.spritesheetPath));
    return { ...pet, source: candidate.source || "candidate", available: true };
  } catch (error) {
    return unavailablePet(candidate, petsDir, error?.message || "Missing pet.json or spritesheet");
  }
}

function PetPreview({ pet }) {
  if (pet.available && pet.spritesheetPath) {
    const rowCount = pet.version === 2 ? 11 : 9;
    return (
      <span
        className="block size-9 rounded-lg bg-(--surface)"
        style={{
          backgroundImage: `url("${api.localFileUrl(pet.spritesheetPath)}")`,
          backgroundPosition: "0% 0%",
          backgroundRepeat: "no-repeat",
          backgroundSize: `800% ${rowCount * 100}%`,
        }}
        aria-hidden="true"
      />
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-(--border-light) bg-(--surface) text-(--fg-tertiary)">
      <LucideIcon name="PawPrint" size={16} />
    </span>
  );
}

function petSubtitle(pet) {
  if (!pet.available) return `Unavailable · ${pet.reason}`;
  const parts = [];
  if (pet.version) parts.push(`Sprite v${pet.version}`);
  parts.push(pet.directory);
  return parts.join(" · ");
}

export default function PetsSection() {
  const appInfo = useStore((s) => s.appInfo);
  const gs = useStore((s) => s.gs);
  const toast = useStore((s) => s.toast);
  const petsDir = useMemo(() => joinPath(appInfo?.home || "~", ".codex", "pets"), [appInfo?.home]);
  const [customPets, setCustomPets] = useState(() => lsGet(CUSTOM_PETS_STORAGE_KEY, []));
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // The reference stores the awake pet's avatar id in the shared state; map
  // it back onto the picker ("custom:claude-icon" → claude-icon).
  const sharedId = (() => {
    const ids = gs?.["electron-persisted-atom-state"]?.["first-awake-pet-notification-avatar-ids"];
    const first = Array.isArray(ids) ? ids[0] : null;
    return first ? String(first).replace(/^custom:/, "") : null;
  })();
  const [pet, setPet] = useState(() => sharedId || lsGet(PET_STORAGE_KEY, "codex"));

  const candidates = useMemo(
    () =>
      dedupePetCandidates([
        ...customPets.filter((entry) => entry?.id && entry?.path).map((entry) => ({ ...entry, source: "custom" })),
        ...BUILT_IN_PET_CANDIDATES,
      ]),
    [customPets],
  );

  const refreshPets = useCallback(async ({ quiet } = {}) => {
    setRefreshing(true);
    const next = await Promise.all(candidates.map((candidate) => readPet(candidate, petsDir)));
    setItems(next);
    setRefreshing(false);
    if (!quiet) {
      const available = next.filter((item) => item.available).length;
      toast(`Refreshed ${available} available pet${available === 1 ? "" : "s"}`, "success");
    }
    return next;
  }, [candidates, petsDir, toast]);

  useEffect(() => {
    let live = true;
    setRefreshing(true);
    Promise.all(candidates.map((candidate) => readPet(candidate, petsDir)))
      .then((next) => live && setItems(next))
      .catch(() => live && setItems([]))
      .finally(() => live && setRefreshing(false));
    return () => { live = false; };
  }, [candidates, petsDir]);

  const selectedItem = useMemo(
    () => (items || []).find((item) => item.available && item.id === pet),
    [items, pet],
  );

  const selectPet = (item) => {
    if (!item.available) {
      toast(`Cannot select ${item.displayName}: ${item.reason}`, "error");
      return;
    }
    setPet(item.id);
    lsSet(PET_STORAGE_KEY, item.id);
  };

  const wakePet = async () => {
    if (!selectedItem) {
      toast("Choose an available pet first. Missing pets need pet.json and spritesheet.webp.", "error");
      return;
    }
    const atomState = gs?.["electron-persisted-atom-state"] || {};
    const ok = await api.gsPatch({
      "electron-persisted-atom-state": {
        ...atomState,
        "first-awake-pet-notification-avatar-ids": [selectedItem.wakeId],
      },
    });
    if (ok) toast(`Waking ${selectedItem.displayName}`, "success");
    else toast("Could not wake pet", "error");
  };

  const importPet = async () => {
    const directory = await api.pickDirectory(petsDir);
    if (!directory) return;
    const candidate = customCandidateFromDirectory(directory);
    if (!candidate) {
      toast("Import failed: choose a pet folder.", "error");
      return;
    }
    const item = await readPet(candidate, petsDir);
    if (!item.available) {
      toast(`Import failed: ${item.reason}. Expected pet.json plus its spritesheet.`, "error");
      return;
    }
    const next = dedupePetCandidates([candidate, ...customPets]);
    setCustomPets(next);
    lsSet(CUSTOM_PETS_STORAGE_KEY, next);
    setPet(item.id);
    lsSet(PET_STORAGE_KEY, item.id);
    toast(`Imported ${item.displayName}`, "success");
  };

  const openCreateFolder = () => {
    api.openPath(petsDir);
    toast("Create or copy a pet folder here, then Refresh. Each pet needs pet.json and a spritesheet.", "success");
  };

  return (
    <>
      <div className="-mt-3 mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[0.8125rem] font-medium">Pick a pet</div>
          <div className="mt-0.5 text-[0.8125rem] text-(--fg-tertiary)">
            Pets manage threads and surface what needs attention. Only pets with a real manifest and spritesheet can be selected.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="flex h-7 items-center gap-1.5 rounded-full border border-(--border) px-3 text-[0.8125rem] hover:bg-(--surface-hover)"
            onClick={openCreateFolder}
          >
            Create
          </button>
          <button
            className="flex h-7 items-center gap-1.5 rounded-full border border-(--border) px-3 text-[0.8125rem] hover:bg-(--surface-hover)"
            onClick={importPet}
          >
            Import
          </button>
          <button
            className={cx(
              "flex h-7 items-center gap-1.5 rounded-full bg-(--fg) px-3 text-[0.8125rem] text-(--surface) hover:opacity-85",
              !selectedItem && "cursor-default opacity-50",
            )}
            onClick={wakePet}
          >
            Wake Pet
          </button>
        </div>
      </div>
      <Card>
        {(items || candidates.map((candidate) => unavailablePet(candidate, petsDir, "Checking resources…"))).map((item) => {
          const selected = item.available && pet === item.id;
          return (
            <div key={`${item.directory}:${item.id}`} className="flex items-center justify-between gap-6 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <PetPreview pet={item} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[0.8125rem]">
                    <span>{item.displayName}</span>
                    {!item.available && (
                      <span className="rounded-full bg-(--surface-active) px-2 py-0.5 text-[0.6875rem] text-(--fg-tertiary)">
                        Missing
                      </span>
                    )}
                    {item.source === "custom" && item.available && (
                      <span className="rounded-full bg-(--accent-soft) px-2 py-0.5 text-[0.6875rem] text-(--accent)">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[0.75rem] leading-5 text-(--fg-tertiary)">
                    {item.description || petSubtitle(item)}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[0.6875rem] text-(--fg-tertiary)" title={petSubtitle(item)}>
                    {petSubtitle(item)}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.available && <Btn onClick={() => api.openPath(item.directory)}>Open</Btn>}
                <button
                  className={cx(
                    "shrink-0 rounded-lg border px-3 py-1.5 text-[0.8125rem]",
                    selected
                      ? "border-(--accent) bg-(--accent-soft) text-(--accent)"
                      : item.available
                        ? "border-(--border) hover:bg-(--surface-hover)"
                        : "cursor-default border-(--border-light) text-(--fg-tertiary) opacity-60",
                  )}
                  onClick={() => selectPet(item)}
                >
                  {selected ? "Selected" : item.available ? "Select" : "Unavailable"}
                </button>
              </div>
            </div>
          );
        })}
      </Card>

      <Card title="Custom pets">
        <div className="flex items-center justify-between gap-6 px-4 py-3.5">
          <div className="min-w-0">
            <div className="truncate font-mono text-[0.75rem] text-(--fg-tertiary)" title={petsDir}>
              {petsDir}
            </div>
            <div className="mt-1 text-[0.75rem] leading-5 text-(--fg-tertiary)">
              Put each pet in its own folder with `pet.json` and the referenced spritesheet. Works with `/Users/...`
              and `C:\Users\...` style paths.
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Btn onClick={() => refreshPets()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</Btn>
            <Btn onClick={() => api.openPath(petsDir)}>Open folder</Btn>
          </div>
        </div>
      </Card>
    </>
  );
}
