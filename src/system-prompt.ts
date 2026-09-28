/**
 * Run context sold to the model through one seam: what day it is and where
 * the agent process runs. Tools defer to this instead of re-stating the
 * same facts on the wire.
 */
export function systemPrompt(): string {
  return (
    `The current date is ${new Date()}\n` +
    `You are running in the working directory: ${process.cwd()}. ` +
    "Treat relative file paths as relative to this directory."
  );
}
