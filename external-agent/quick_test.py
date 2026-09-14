import asyncio

import httpx
from a2a.client import A2ACardResolver, ClientConfig, create_client
from a2a.helpers import new_text_message
from a2a.types import Role, SendMessageRequest


async def main():
    async with httpx.AsyncClient() as httpx_client:
        resolver = A2ACardResolver(httpx_client=httpx_client, base_url="http://127.0.0.1:9999")
        card = await resolver.get_agent_card()

        config = ClientConfig(streaming=False)
        client = await create_client(agent=card, client_config=config)

        message = new_text_message(
            "What is the total authorized spend for the European Product Launch?",
            role=Role.ROLE_USER,
        )
        request = SendMessageRequest(message=message)
        async for chunk in client.send_message(request):
            print(chunk)
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
