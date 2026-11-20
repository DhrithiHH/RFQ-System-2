import { useEffect, useRef, useState } from 'react';
import { getStoredToken } from '../services/api';
import type { AuctionWsEvent } from '../types';

export function useAuctionSocket(
  rfqId: string | undefined,
  userId: string | undefined,
  onEvent: (event: AuctionWsEvent) => void
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!rfqId || !userId) return;
    const token = getStoredToken();
    if (!token) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws/auctions/${encodeURIComponent(
        rfqId
      )}?token=${encodeURIComponent(token)}`;

      socket = new WebSocket(url);
      socket.onopen = () => {
        if (!disposed) setConnected(true);
      };
      socket.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as AuctionWsEvent;
          onEventRef.current(parsed);
        } catch {
          // Ignore malformed WS message
        }
      };
      socket.onclose = () => {
        if (!disposed) {
          setConnected(false);
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [rfqId, userId]);

  return { connected };
}
