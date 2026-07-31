import React from "react";

function errorDetails(value) {
  if (value instanceof Error) {
    return {
      message: value.message || "Unknown renderer error",
      stack: value.stack || "",
    };
  }
  return {
    message: typeof value === "string" ? value : "Unknown renderer error",
    stack: "",
  };
}

export function reportDiagnostic(event, context = {}, level = "info") {
  try {
    window.codexBridge?.diagnosticsReport({
      level,
      event,
      context,
    });
  } catch {}
}

export function installRendererDiagnostics(windowKind) {
  window.addEventListener("error", (event) => {
    const error = errorDetails(event.error || event.message);
    window.codexBridge?.diagnosticsReport({
      level: "error",
      event: "window_error",
      message: error.message,
      stack: error.stack,
      context: {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        windowKind,
      },
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const error = errorDetails(event.reason);
    window.codexBridge?.diagnosticsReport({
      level: "error",
      event: "unhandled_rejection",
      message: error.message,
      stack: error.stack,
      context: { windowKind },
    });
  });
  reportDiagnostic("renderer_boot", {
    href: `${window.location.origin}${window.location.pathname}`,
    windowKind,
  });
}

export class DiagnosticsBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const details = errorDetails(error);
    window.codexBridge?.diagnosticsReport({
      level: "error",
      event: "react_error_boundary",
      message: details.message,
      stack: details.stack,
      context: { componentStack: info.componentStack },
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full w-full items-center justify-center bg-(--surface) px-6 text-(--fg)">
        <div className="w-full max-w-[560px] rounded-2xl border border-(--border) bg-(--surface-raised) p-6 text-center">
          <h1 className="text-lg font-semibold">ChatGPT Desktop Community could not render</h1>
          <p className="mt-2 text-sm text-(--fg-tertiary)">
            The error was written to the diagnostic log. Open the logs folder and
            send the latest <span className="font-mono">main-YYYY-MM-DD.log</span> file
            when reporting this problem.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              className="rounded-lg border border-(--border) px-4 py-2 text-sm hover:bg-(--surface-hover)"
              onClick={() => window.codexBridge?.diagnosticsOpenLogs()}
            >
              Open logs folder
            </button>
            <button
              className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-(--accent-fg)"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
