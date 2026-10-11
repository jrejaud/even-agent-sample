// Claude Code as the assistant: runs `claude -p` once per request, so the answer comes
// from a real agent with your skills and tools.   BACKEND=claude node server.mjs
// Extra flags go in CLAUDE_ARGS, e.g. CLAUDE_ARGS="--model haiku" for faster answers.
import { execFile } from 'node:child_process';

export default function claude(text, { systemPrompt }) {
  return new Promise((resolve, reject) => {
    execFile(
      process.env.CLAUDE_BIN ?? 'claude',
      [...(process.env.CLAUDE_ARGS ?? '').split(' ').filter(Boolean), '-p', `${systemPrompt}\n\nThe user said: ${text}`],
      { timeout: 120000, maxBuffer: 1 << 20 },
      (err, stdout) => (err ? reject(err) : resolve(stdout.trim())),
    );
  });
}
