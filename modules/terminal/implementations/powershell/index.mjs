export const interactiveCommand = Object.freeze([
  "powershell.exe",
  "-NoLogo",
  "-NoProfile",
  "-NoExit",
]);

export function oneShotCommand(command) {
  return ["powershell.exe", "-NoLogo", "-NoProfile", "-Command", command];
}

export const shellLabel = "PowerShell";
