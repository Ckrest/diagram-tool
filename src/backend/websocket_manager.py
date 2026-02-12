"""
WebSocket Manager - Handles real-time connections and broadcasts.

This module manages WebSocket connections and broadcasts diagram updates
to all connected clients (frontend and potentially AI agents).
"""
from fastapi import WebSocket
from typing import Set
import json
import asyncio


class WebSocketManager:
    """
    Manages WebSocket connections and broadcasts.

    All connected clients receive diagram_updated events when
    the diagram state changes, enabling real-time sync.
    """

    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)
        print(f"WebSocket connected. Total connections: {len(self._connections)}")

    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        async with self._lock:
            self._connections.discard(websocket)
        print(f"WebSocket disconnected. Total connections: {len(self._connections)}")

    async def broadcast(self, message: dict):
        """
        Broadcast a message to all connected clients.

        Failed sends (disconnected clients) are handled gracefully.
        """
        if not self._connections:
            return

        # Serialize once for all clients
        message_text = json.dumps(message)

        # Track failed connections for cleanup
        failed: Set[WebSocket] = set()

        async with self._lock:
            for websocket in self._connections:
                try:
                    await websocket.send_text(message_text)
                except Exception:
                    failed.add(websocket)

            # Remove failed connections
            self._connections -= failed

    async def notify_diagram_updated(self, diagram_id: str | None = None):
        """
        Notify all clients that the diagram has been updated.

        Clients should fetch the latest state via GET /api/diagram.
        """
        await self.broadcast({
            "type": "diagram_updated",
            "diagram_id": diagram_id
        })

    async def notify_diagram_closed(self):
        """Notify all clients that the diagram has been closed."""
        await self.broadcast({
            "type": "diagram_closed"
        })

    @property
    def connection_count(self) -> int:
        """Get the number of active connections."""
        return len(self._connections)


# Global instance
ws_manager = WebSocketManager()
