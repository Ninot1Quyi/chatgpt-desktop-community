function leaf(path) {
  return String(path || "").split(/[\\/]/).filter(Boolean).at(-1) || "";
}

export function displayCommand(command) {
  const value = String(command || "").trim();
  const unwrap = (candidate) => {
    const quote = candidate[0];
    return (quote === "\"" || quote === "'") && candidate.at(-1) === quote
      ? candidate.slice(1, -1)
      : candidate;
  };
  const powershell = value.match(/^(?:"?[^"\r\n]*[\\/])?(?:powershell|pwsh)(?:\.exe)?"?\s+([\s\S]+)$/i);
  const powershellCommand = powershell?.[1].match(/(?:^|\s)-(?:Command|C)\s+([\s\S]+)$/i);
  if (powershellCommand) return unwrap(powershellCommand[1].trim());
  const commandPrompt = value.match(/^(?:"?[^"\r\n]*[\\/])?cmd(?:\.exe)?"?\s+[\s\S]*?\/c\s+([\s\S]+)$/i);
  return commandPrompt ? unwrap(commandPrompt[1].trim()) : value;
}

function fallbackAction(command) {
  if (!command || /(?:[;&|]|\$\()/.test(command)) return null;
  const args = command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((part) => part.replace(/^(['"])(.*)\1$/, "$2")) || [];
  const program = leaf(args[0]).toLowerCase();
  const target = leaf(args.at(-1));
  if (/^(?:get-content|gc|type)$/.test(program) && target && target.toLowerCase() !== program) {
    return { type: "read", path: target };
  }
  if ((program === "rg" && args.includes("--files"))
    || /^(?:get-childitem|gci|dir|fd)$/.test(program)
    || (program === "git" && args[1] === "ls-files")) {
    const path = args.length > 1 ? args.at(-1) : undefined;
    return { type: "listFiles", path };
  }
  if (/^(?:rg|select-string|sls|findstr)$/.test(program) || (program === "git" && args[1] === "grep")) {
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
