import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const WSCtx = createContext(null);

export function WSProvider({ children }) {
  const [connected, setConnected]   = useState(false);
  const [lastEvent, setLastEvent]   = useState(null);
  const wsRef          = useRef(null);
  const listenersRef   = useRef(new Map());
  const reconnectTimer = useRef(null);
  const cancelledRef   = useRef(false);

  const on = useCallback((type, fn) => {
    const map = listenersRef.current;
    if (!map.has(type)) map.set(type, []);
    map.get(type).push(fn);
    return () => {
      const list = map.get(type) || [];
      map.set(type, list.filter((f) => f !== fn));
    };
  }, []);

  useEffect(() => {
    cancelledRef.current = false;

    function connect() {
      if (cancelledRef.current) return;
      // Don't open a second connection if one is already live
      const existing = wsRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host  = window.location.hostname;
      const port  = import.meta.env.DEV ? '3000' : window.location.port;
      const url   = `${proto}://${host}:${port}/ws`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelledRef.current) { ws.close(); return; }
        setConnected(true);
        try { ws.send(JSON.stringify({ type: 'HELLO', role: 'admin' })); } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        if (!cancelledRef.current) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent(data);
          (listenersRef.current.get(data.type) || []).forEach((fn) => fn(data));
          (listenersRef.current.get('*') || []).forEach((fn) => fn(data));
        } catch {}
      };
    }

    connect();

    return () => {
      cancelledRef.current = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []); // empty deps — run once

  return (
    <WSCtx.Provider value={{ connected, lastEvent, on }}>
      {children}
    </WSCtx.Provider>
  );
}

export function useWS() { return useContext(WSCtx); }
