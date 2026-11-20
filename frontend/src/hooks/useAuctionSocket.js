import { useEffect, useRef, useState } from 'react';
import { WS_BASE_URL } from '../services/api';
import { supabase } from '../services/supabase';

export function useAuctionSocket(rfqId, onEvent) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!rfqId) return undefined;
    let socket = null;
    let cancelled = false;
    let reconnectTimer = null;

    const connect = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token || cancelled) return;

      const url = `${WS_BASE_URL}/ws/auctions/${rfqId}?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          onEventRef.current?.(parsed);
        } catch {
          // Ignore malformed message
        }
      };

      socket.onclose = () => {
        if (!cancelled) {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [rfqId]);

  return { connected };
}
