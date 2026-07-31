import React, { useEffect, useMemo } from "react";
import { useStore } from "./store.js";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  translate,
} from "./lib/i18n.mjs";

export {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  translate,
};

export function useLanguage() {
  return useStore((state) => normalizeLanguage(state.ui.language));
}

export function useT() {
  const language = useLanguage();
  return useMemo(
    () => (message, variables) => translate(language, message, variables),
    [language],
  );
}

export function Trans({ children, values }) {
  const t = useT();
  return <>{t(children, values)}</>;
}

export function LanguageDocumentSync() {
  const language = useLanguage();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}
