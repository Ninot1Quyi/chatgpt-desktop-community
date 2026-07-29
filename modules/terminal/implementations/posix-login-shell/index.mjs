export const interactiveCommand = Object.freeze(["zsh", "-il"]);

export function oneShotCommand(command) {
  return ["zsh", "-lc", command];
}

export const shellTitleCommand = Object.freeze(oneShotCommand(
  "printf '%s@%s' \"$(whoami)\" \"$(hostname -s)\"",
));

export const shellLabel = "Shell";
