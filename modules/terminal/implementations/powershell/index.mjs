export const interactiveCommand = Object.freeze([
  "powershell.exe",
  "-NoLogo",
  "-NoProfile",
  "-NoExit",
]);

export function oneShotCommand(command) {
  return ["powershell.exe", "-NoLogo", "-NoProfile", "-Command", command];
}

export const shellTitleCommand = Object.freeze(oneShotCommand(
  "[Environment]::UserName + '@' + [Environment]::MachineName",
));

export const shellLabel = "PowerShell";
