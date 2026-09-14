import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import uvicorn

from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import (
    create_agent_card_routes,
    create_jsonrpc_routes,
)
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentInterface,
    AgentSkill,
)
from agent_executor import MemoAgentExecutor
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

SYDNEY = ZoneInfo("Australia/Sydney")


async def timestamp_logging_middleware(request, call_next):
    response = await call_next(request)
    ts = datetime.now(SYDNEY).strftime("%Y-%m-%d %H:%M:%S %Z")
    print(f"[{ts}] {request.method} {request.url.path} -> {response.status_code}")
    return response


async def response_messages_middleware(request, call_next):
    """ServiceNow's A2A subflow reads `result.response_messages[].content`
    to get the chat-displayable answer text, rather than `result.artifacts`.
    Inject that field (same text as artifacts[0].parts[0].text) into
    non-streaming JSON-RPC responses so ServiceNow can surface the answer."""
    response = await call_next(request)

    content_type = response.headers.get("content-type", "")
    if "application/json" not in content_type:
        return response

    body = b""
    async for chunk in response.body_iterator:
        body += chunk

    try:
        data = json.loads(body)
        result = data.get("result")
        artifacts = result.get("artifacts") if isinstance(result, dict) else None
        if artifacts:
            text = artifacts[0]["parts"][0]["text"]
            result["response_messages"] = [{"content": text}]
            body = json.dumps(data).encode("utf-8")
    except (ValueError, KeyError, TypeError, AttributeError):
        pass

    # Let JSONResponse recompute content-length/content-type for the
    # (possibly modified) body; keep any other original headers.
    passthrough_headers = {
        k: v
        for k, v in response.headers.items()
        if k.lower() not in ("content-length", "content-type")
    }
    return JSONResponse(
        content=json.loads(body),
        status_code=response.status_code,
        headers=passthrough_headers,
    )


if __name__ == "__main__":
    public_url = os.environ.get("PUBLIC_AGENT_URL", "http://127.0.0.1:9999")

    skill = AgentSkill(
        id="memo_qa",
        name="Memo Q&A",
        description=(
            "Answers questions about three strategic memos: European Product "
            "Launch, India Talent Initiative, and International Sales Expansion "
            "(budgets, dates, approvals, milestones)."
        ),
        input_modes=["text/plain"],
        output_modes=["text/plain"],
        tags=["a2a", "rag", "memo-qa"],
        examples=[
            "What is the total authorized spend for the European Product Launch?",
            "When was the India Talent Initiative approved?",
            "What is the TAM for the International Sales Expansion?",
        ],
    )

    public_agent_card = AgentCard(
        name="Memo Agent",
        description="Answers questions from three strategic memo documents.",
        version="0.1.0",
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True, extended_agent_card=False),
        supported_interfaces=[
            AgentInterface(
                protocol_binding="JSONRPC",
                url=public_url,
                protocol_version="0.3",
            )
        ],
        skills=[skill],
    )

    request_handler = DefaultRequestHandler(
        agent_executor=MemoAgentExecutor(),
        task_store=InMemoryTaskStore(),
        agent_card=public_agent_card,
    )

    routes = []
    routes.extend(create_agent_card_routes(public_agent_card))
    # ServiceNow's A2A client sends v0.3-style JSON-RPC method names
    # (e.g. "message/send") rather than this SDK's current PascalCase
    # methods ("SendMessage"). enable_v0_3_compat=True makes the dispatcher
    # accept both.
    routes.extend(
        create_jsonrpc_routes(request_handler, "/", enable_v0_3_compat=True)
    )
    # ServiceNow's default A2A subflow also POSTs JSON-RPC execution requests
    # to the same URL configured as "Agent card URL" (the well-known discovery
    # path), rather than to the AgentCard's `url` field. Mount JSON-RPC there
    # too so both GET (card) and POST (execution) work at that path.
    routes.extend(
        create_jsonrpc_routes(
            request_handler, "/.well-known/agent-card.json", enable_v0_3_compat=True
        )
    )

    app = Starlette(
        routes=routes,
        middleware=[
            Middleware(BaseHTTPMiddleware, dispatch=timestamp_logging_middleware),
            Middleware(BaseHTTPMiddleware, dispatch=response_messages_middleware),
        ],
    )

    uvicorn.run(app, host="0.0.0.0", port=9999)
