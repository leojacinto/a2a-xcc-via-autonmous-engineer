# Memo Agent — external A2A server

The external agent referenced throughout the main README as "Memo Agent (External)". Not part
of the Fluent app — runs standalone (Python), exposed to the ServiceNow instance over a
Cloudflare tunnel. This is the thing on the other end of `sn_aia_external_agent_provider`.

| File | Purpose |
|---|---|
| `memo_agent.py` | Loads `docs/*.md` and answers queries via keyword-scored paragraph retrieval. |
| `agent_executor.py` | `AgentExecutor` wiring `MemoAgent` into the A2A task lifecycle. |
| `__main__.py` | Starlette/Uvicorn server: agent card, JSONRPC routes, ServiceNow compat shims. |
| `quick_test.py` | Sends one test query to a running server via the `a2a-sdk` client. |
| `docs/*.md` | The three memo sources, deliberately edited to disagree with the SharePoint/PDF versions on figures and dates — that's the "known disagreement" the workflow surfaces. |

## Run it

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
PUBLIC_AGENT_URL=<public-https-url> python __main__.py    # listens on 0.0.0.0:9999
```

`PUBLIC_AGENT_URL` is baked into the served agent card's `url` field — must match whatever
tunnel/hostname exposes this publicly, or ServiceNow calls back to `127.0.0.1` and fails.

Expose it:

```bash
brew install cloudflared
cloudflared tunnel --protocol http2 --url http://localhost:9999
```

Free "quick tunnel" — no login, but **the hostname changes on every restart and can also
expire on its own** (Cloudflare-side, independent of the local process staying alive — check
`curl -o /dev/null -w '%{http_code}' <url>/.well-known/agent-card.json` before assuming it's
fine). On networks with strict egress filtering/TLS inspection, `ngrok` may be blocked outright
and `cloudflared`'s default QUIC transport may also be filtered — falling back to
`--protocol http2` resolved connectivity in that case.

For a fixed hostname across restarts, use a named Cloudflare Tunnel bound to a real domain
instead of the quick-tunnel mode.

## Three fixes required for ServiceNow to actually talk to this (all already in `__main__.py`)

1. **`AgentInterface.protocol_version` must be `"0.3"`, not `"1.0"`.** `a2a-sdk`'s
   `agent_card_to_dict()` only injects the legacy compat fields (`url`, `protocolVersion`,
   `preferredTransport`) ServiceNow's discovery client needs when the version is in range
   `0.3 ≤ v < 1.0`. At `"1.0"` those fields silently disappear and discovery reports
   *"No agents discovered for this provider."*
2. **JSON-RPC routes must be mounted at `/.well-known/agent-card.json` too, not just `/`.**
   ServiceNow's default subflow POSTs execution requests back to whatever URL you put in
   "Agent card URL" (the discovery path), not to the card's `url` field.
3. **`enable_v0_3_compat=True` on `create_jsonrpc_routes(...)`.** ServiceNow sends v0.3-style
   method names (`message/send`) — `a2a-sdk`'s dispatcher only accepts its newer PascalCase
   methods (`SendMessage`) unless compat mode is explicitly turned on.

## The `response_messages` requirement

See the main README's "[The A2A response contract](../README.md#the-a2a-response-contract)"
— `sn_aia.ExternalAgentExecutorUtil` reads `result.response_messages[].content`, not
`result.artifacts[].parts[].text`. `response_messages_middleware` in `__main__.py` rewrites
every JSON response to inject that field (same text as the first artifact) so both the A2A
spec shape and ServiceNow's actual parser are satisfied.

## Keep it running

Both this server and `cloudflared` must stay running for ServiceNow to get responses. If
either dies, or the tunnel hostname changes/expires: get the new URL, restart with the new
`PUBLIC_AGENT_URL`, and update `provider.agent_card_url` on the ServiceNow side (see main
README's "Setup issues encountered and their fixes" table).
