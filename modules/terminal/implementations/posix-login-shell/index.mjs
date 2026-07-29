export const interactiveCommand = Object.freeze(["zsh", "-il"]);

export function oneShotCommand(command) {
  return ["zsh", "-lc", command];
}

export const shellLabel = "Shell";
