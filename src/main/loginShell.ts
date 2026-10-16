import path from "path";

/**
 * A GUI-launched app has no shell PATH, so tools from nvm, Homebrew or the
 * Claude installer are only found through the user's own login shell. The
 * command is passed as a string, not as "$@" arguments, because fish and
 * nushell have no "$@".
 */
export function loginShellCommand(command: string): [string, string[]] {
  const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
  const name = path.basename(shell);
  // csh and tcsh accept -l only as the sole flag.
  const flags = name === "csh" || name === "tcsh" ? ["-i"] : ["-l", "-i"];
  return [shell, [...flags, "-c", command]];
}
