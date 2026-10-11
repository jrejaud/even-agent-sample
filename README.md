# even-agent-sample

Use your own AI agent as the assistant on Even Realities G2 glasses.

Say "Hey Even", and instead of Even's built-in assistant answering, your words go to a URL you control and your agent's reply shows up on the lens. This is a small server you can point the Even app at. No dependencies, one file, about 150 lines.

## Requirements

- Even Realities G2 glasses paired to the Even app
- An approved EvenHub developer account. Per [Even's tutorial](https://support.evenrealities.com/hc/en-us/articles/16280926743695-Tutorial-Bridging-G2-to-OpenClaw-Bring-Your-Own-Agent), the Agent Configuration menu is only visible to EvenHub developers
- Node 18 or newer
- A URL your phone can reach (same Wi-Fi, a tunnel, or Tailscale)

## Run it

```bash
TOKEN=pick-a-long-secret BACKEND=echo node server.mjs
```

`echo` repeats what you said, which is the quickest way to check the glasses, the app and your URL are wired up. Check the server yourself first:

```bash
curl -s -X POST http://127.0.0.1:3458/v1/chat/completions \
  -H 'Authorization: Bearer pick-a-long-secret' \
  -d '{"model":"openclaw","messages":[{"role":"user","content":"hello"}]}'
```

## Add it in the Even app

Settings > Even AI > Agent Configuration > Add agent:

| Field | Value |
|---|---|
| Name | anything |
| URL | `http://<your-host>:3458/v1/chat/completions` (the app calls exactly what you type, so include the full path) |
| Token | the same value as `TOKEN` |

Then tap the agent in the list so it is selected. Saving alone does not select it.

## Backends

Pick one with `BACKEND`:

| Backend | What it does | Settings |
|---|---|---|
| `echo` | repeats your words | none |
| `openai` | any OpenAI-compatible API: OpenAI, Ollama, LM Studio, vLLM, OpenRouter | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` |
| `claude` | runs `claude -p` (Claude Code) per request | `CLAUDE_ARGS` (for example `--model haiku`), `CLAUDE_BIN` |

A backend is one function: `(text, { systemPrompt }) => reply`. Copy `backends/echo.mjs` to add your own.

Other settings: `PORT` (3458), `BIND` (127.0.0.1; set `0.0.0.0` to reach it from your phone), `MAX_CHARS` (350).

## What the app sends and expects

Request, as captured from the app:

```
POST /v1/chat/completions
Authorization: Bearer <token>
{"model":"openclaw","messages":[{"role":"user","content":"What's on my calendar for today?"}]}
```

Reply: a plain, non-streaming chat-completions JSON with the answer in `choices[0].message.content`.

What the server does for you:

- **Answers each request once.** The app sends every request twice about 5 ms apart, so identical requests share one answer.
- **Keeps replies lens-sized.** Markdown is stripped and the text is cut on a sentence boundary at `MAX_CHARS`. The lens renders roughly 400 to 500 characters (reported by the community; 350 leaves margin).
- **Never hangs up on the app.** If your agent takes longer than 25 seconds, the app gets "Still working on it", and asking the same thing again returns the finished answer.

## Test

```bash
npm test
```

## Security

The server checks a bearer token and nothing else. Anything that can reach it with the token can talk to your agent. Keep it on your LAN or tailnet, or put TLS in front of it, and do not give a coding-agent backend more access than you would give the person holding the phone.

## Credits

Even's own OpenClaw tutorial describes the same feature. [kucau0901/even-g2-agent-adapter](https://github.com/kucau0901/even-g2-agent-adapter) is a similar proxy that documents more of the app's quirks.

MIT licensed.
