// Markdown rendering (react-markdown + GFM) with code-block copy button,
// file chips for inline paths, and external-link routing through the shell.
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openExternal, openPath } from "@app/api.js";
import { useStore } from "@app/store.js";
import { IconCheck, IconCopy, IconGlobe } from "@app/components/icons.jsx";
import { FileIcon } from "../../workspace-panels/renderer/panel/FileIcon.jsx";

// Inline code: styled by .md code CSS; file-looking ones become openable
// chips (like the reference client). react-markdown v10 no longer passes
// `inline` — block handling lives in the `pre` component instead.
function InlineCode({ className, children, ...props }) {
  const text = String(children ?? "").replace(/\n$/, "");
  if (looksLikePath(text)) {
    return <FileReference path={text} label={fileReferenceLabel(text)} />;
  }
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
const SOURCE_LOCATION_RE = /:(\d+)(?::\d+)?$/;

function pathWithoutLocation(path) {
  return String(path || "").replace(SOURCE_LOCATION_RE, "");
}

function looksLikePath(s) {
  if (!s || s.length > 2048) return false;
  const path = pathWithoutLocation(s);
  if (!PATH_RE.test(path)) return false;
  return path.includes("/") || path.startsWith(".") || /\.(md|txt|py|js|ts|tsx|jsx|java|json|ya?ml|toml|pdf|docx?|pptx?|png|jpe?g|gif|svg|html?|css|sh|sql|log|csv)$/i.test(path);
}

function fileReferenceLabel(path) {
  const normalized = pathWithoutLocation(path).replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || normalized;
}

function inlineIconName(path) {
  const cleanPath = pathWithoutLocation(path);
  if (/\.(md|mdx|txt|rtf|docx?|pdf)$/i.test(cleanPath)) return "document";
  return cleanPath;
}

function textFromChildren(children) {
  return React.Children.toArray(children)
    .map((child) => typeof child === "string" || typeof child === "number"
      ? String(child)
      : textFromChildren(child?.props?.children))
    .join("");
}

function FileReference({ path, label }) {
  const displayLabel = textFromChildren(label) || fileReferenceLabel(path);
  const activate = () => openPath(resolveMaybePath(pathWithoutLocation(path)));
  return (
    <span
      data-file-reference="true"
      data-prompt-link-href={path}
      data-prompt-link-label={displayLabel}
      role="button"
      tabIndex={0}
      className="group/inline-mention cursor-pointer"
      title={`Open ${pathWithoutLocation(path)}`}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activate();
      }}
    >
      <span className="inline-mention-file whitespace-nowrap px-0.5 font-medium">
        <span className="relative mr-[3px] inline-block h-[1lh] w-4 align-bottom">
          <FileIcon
            name={inlineIconName(path)}
            size={16}
            className="absolute top-1/2 -translate-y-1/2"
            style={{ color: "currentColor" }}
          />
        </span>
        <span className="min-w-0 break-words whitespace-normal">{displayLabel}</span>
      </span>
    </span>
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
              return <FileReference path={href} label={children} />;
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
