/**
 * WebSocket hook for real-time diagram updates.
 *
 * Uses a singleton WebSocket connection to prevent React StrictMode
 * double-mounting issues. The connection persists across component
 * re-renders and only reconnects when actually disconnected.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { WebSocketMessage } from '../types/diagram';

// Use relative URL to go through Vite proxy (same origin)
const WS_URL = `ws://${window.location.host}/ws`;
const RECONNECT_DELAY = 2000;
const PING_INTERVAL = 30000;

// --- Singleton WebSocket Manager ---

type MessageHandler = (message: WebSocketMessage) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private connectionListeners = new Set<() => void>();
  private reconnectTimeout: number | null = null;
  private pingInterval: number | null = null;
  private _isConnected = false;

  get isConnected() {
    return this._isConnected;
  }

  connect() {
    // Already connected or connecting
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Clean up old socket if exists
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect loop
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this._isConnected = true;
        this.notifyConnectionChange();

        // Start ping interval
        this.pingInterval = window.setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send('ping');
          }
        }, PING_INTERVAL);
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.messageHandlers.forEach(handler => handler(message));
        } catch (e) {
          console.error('[WebSocket] Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this._isConnected = false;
        this.notifyConnectionChange();
        this.cleanup();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error);
      };
    } catch (e) {
      console.error('[WebSocket] Create error:', e);
      this.scheduleReconnect();
    }
  }

  private cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, RECONNECT_DELAY);
  }

  private notifyConnectionChange() {
    this.connectionListeners.forEach(listener => listener());
  }

  subscribe(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    // Ensure connected when first subscriber
    if (this.messageHandlers.size === 1) {
      this.connect();
    }
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  subscribeToConnection(listener: () => void): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  getSnapshot(): boolean {
    return this._isConnected;
  }
}

// Single global instance
const wsManager = new WebSocketManager();

// --- React Hook ---

interface UseWebSocketOptions {
  onDiagramUpdated?: (diagramId: string | undefined) => void;
  onDiagramClosed?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { onDiagramUpdated, onDiagramClosed, onConnectionChange } = options;

  // Store callbacks in refs to avoid re-subscribing on every render
  const callbacksRef = useRef({ onDiagramUpdated, onDiagramClosed, onConnectionChange });
  callbacksRef.current = { onDiagramUpdated, onDiagramClosed, onConnectionChange };

  // Use useSyncExternalStore for connection state (React 18 recommended pattern)
  const isConnected = useSyncExternalStore(
    (callback) => wsManager.subscribeToConnection(callback),
    () => wsManager.getSnapshot()
  );

  // Track previous connection state for onConnectionChange callback
  const prevConnectedRef = useRef(isConnected);
  useEffect(() => {
    if (prevConnectedRef.current !== isConnected) {
      prevConnectedRef.current = isConnected;
      callbacksRef.current.onConnectionChange?.(isConnected);
    }
  }, [isConnected]);

  // Subscribe to messages
  useEffect(() => {
    const handler: MessageHandler = (message) => {
      switch (message.type) {
        case 'diagram_updated':
          callbacksRef.current.onDiagramUpdated?.(message.diagram_id);
          break;
        case 'diagram_closed':
          callbacksRef.current.onDiagramClosed?.();
          break;
      }
    };

    return wsManager.subscribe(handler);
  }, []); // Empty deps - callbacks accessed via ref

  return { isConnected };
}
