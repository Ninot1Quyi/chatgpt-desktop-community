function leaf(path) {
  return String(path || "").split(/[\\/]/).filter(Boolean).at(-1) || "";
}

export function displayCommand(command) {
  const value = String(command || "").trim();
  const wrapped = value.match(/^(?:\/bin\/)?(?:zsh|bash|sh)\s+-lc\s+(['"])([\s\S]*)\1$/);
  return wrapped ? wrapped[2] : value;
}

function fallbackAction(command) {
  if (!command || /(?:[;&|]|\$\()/.test(command)) return null;
  const args = command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((part) => part.replace(/^(['"])(.*)\1$/, "$2")) || [];
  const program = leaf(args[0]);
  const target = leaf(args.at(-1));
  if (/^(?:sed|cat|head|tail)$/.test(program) && target) return { type: "read", path: target };
  if ((program === "rg" && args.includes("--files")) || /^(?:find|fd|ls)$/.test(program)) {
    return { type: "listFiles", path: program === "find" ? args[1] : args.at(-1) };
  }
  if (/^(?:rg|grep)$/.test(program) || (program === "git" && args[1] === "grep")) {
    const start = program === "git" ? 2 : 1;
    const values = args.slice(start).filter((part) => !part.startsWith("-"));
    return values.length > 1
      ? { type: "search", query: values[0], path: values.at(-1) }
      : { type: "search", query: values[0] || "" };
  }
  return null;
}

export function commandActivity(item) {
  const actions = Array.isArray(item?.commandActions) ? item.commandActions : [];
  const action = actions.find(({ type }) => type === "read" || type === "search" || type === "listFiles")
    || actions[0]
    || fallbackAction(displayCommand(item?.command));
  const running = item?.status === "inProgress";

  if (action?.type === "read") {
    const target = leaf(action.path || action.name) || "file";
    return { kind: "read-files", category: "exploration", label: `${running ? "Reading" : "Read"} ${target}` };
  }
  if (action?.type === "search") {
    const detail = action.query
      ? `for ${action.query}`
      : action.path ? `files in ${leaf(action.path)} folder` : "files";
    return { kind: "code-searching", category: "exploration", label: `${running ? "Searching" : "Searched"} ${detail}` };
  }
  if (action?.type === "listFiles") {
    const detail = action.path ? `files in ${leaf(action.path)} folder` : "files";
    return { kind: "list-files", category: "exploration", label: `${running ? "Listing" : "Listed"} ${detail}` };
  }

  const command = displayCommand(action?.command || item?.command);
  return {
    kind: "run-command",
    category: "command",
    label: command ? `${running ? "Running" : "Ran"} ${command}` : running ? "Running command" : "Ran command",
  };
}
