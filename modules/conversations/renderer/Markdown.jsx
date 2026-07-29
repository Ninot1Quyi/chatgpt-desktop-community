// Markdown rendering (react-markdown + GFM) with code-block copy button,
// file chips for inline paths, and external-link routing through the shell.
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openExternal, openPath } from "@app/api.js";
import { useStore } from "@app/store.js";
import { IconCheck, IconCopy, IconFile, IconGlobe } from "@app/components/icons.jsx";

// Inline code: styled by .md code CSS; file-looking ones become openable
// chips (like the reference client). react-markdown v10 no longer passes
// `inline` — block handling lives in the `pre` component instead.
function InlineCode({ className, children, ...props }) {
  const text = String(children ?? "").replace(/\n$/, "");
  if (looksLikePath(text)) return <FileChip name={text} />;
  return <code className={className} {...props}>{children}</code>;
}

// Fenced code block with hover copy button.
function PreBlock({ children }) {
  const [copied, setCopied] = useState(false);
  // children is the <code> element; pull text + language from it
  const codeEl = Array.isArray(children) ? children[0] : children;
  const codeProps = codeEl?.props || {};
  const text = String(codeProps.children ?? "").replace(/\n$/, "");
  const lang = /language-(\w+)/.exec(codeProps.className || "")?.[1];
  return (
    <div className="group/code relative my-2">
      <pre className="!m-0">{children}</pre>
      <button
        className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-md border border-(--border) bg-(--surface-raised) px-1.5 py-0.5 text-[11px] text-(--fg-tertiary) opacity-0 transition-opacity group-hover/code:opacity-100 hover:text-(--fg)"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <IconCheck size={11} /> : <IconCopy size={11} />}
        {copied ? "Copied" : lang || "Copy"}
      </button>
    </div>
  );
}

const PATH_RE = /^(?:[~./]|[A-Za-z]:\\)?[\w.@+\-/\\ ()\u4e00-\u9fff]*\.[A-Za-z0-9]{1,10}$/;
function looksLikePath(s) {
  if (!s || s.length > 120) return false;
  if (!PATH_RE.test(s)) return false;
  return s.includes("/") || s.startsWith(".") || /\.(md|txt|py|js|ts|tsx|jsx|java|json|ya?ml|toml|pdf|docx?|pptx?|png|jpe?g|gif|svg|html?|css|sh|sql|log|csv)$/i.test(s);
}

function FileChip({ name }) {
  return (
    <button
      className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-md border border-(--border-light) bg-(--surface-hover) px-1.5 py-px align-baseline font-mono text-xs text-(--fg-secondary) hover:bg-(--surface-active) hover:text-(--fg)"
      title={`Open ${name}`}
      onClick={() => openPath(resolveMaybePath(name))}
    >
      <IconFile size={11} className="shrink-0 text-(--fg-tertiary)" />
      {name}
    </button>
  );
}

// Best-effort absolute path: ~ expansion + cwd prefix for relative paths.
function resolveMaybePath(p) {
  const home = useStore.getState().appInfo?.home || "";
  const cwd = useStore.getState().activeConversation?.()?.thread?.cwd || useStore.getState().cwd || "";
  if (p.startsWith("~/")) return home + p.slice(1);
  if (!p.startsWith("/") && cwd) return `${cwd.replace(/\/+$/, "")}/${p}`;
  return p;
}

export default function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: InlineCode,
          pre: PreBlock,
          a: ({ href, children }) => {
            if (href && looksLikePath(href) && !/^https?:\/\//.test(href)) {
              return <FileChip name={href} />;
            }
            // External links carry a small globe glyph (reference rendering).
            return (
              <a
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  if (href) openExternal(href);
                }}
              >
                {/^https?:\/\//.test(href || "") && (
                  <IconGlobe size={11} className="mr-0.5 inline-block align-[-1px] text-(--fg-tertiary)" />
                )}
                {children}
              </a>
            );
          },
        }}
      >
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
