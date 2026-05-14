import { useEffect, useRef, useState, useCallback } from "react";

export interface LogEntry {
  timestamp: string;
  type: "stdout" | "stderr" | "system" | "input";
  message: string;
}

interface WSMessage {
  type: string;
  data: any;
}

export function useWebSocket(projectId: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<string>("stopped");
  const [waitingInput, setWaitingInput] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<{ filename: string; size: number }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number>(0);

  useEffect(() => {
    if (!projectId) return;

    const token = localStorage.getItem("noxylity_token");
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/exec/${projectId}?token=${token}`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          switch (msg.type) {
            case "history":
              if (msg.data?.logs) {
                setLogs(msg.data.logs);
              }
              break;
            case "log":
              setLogs((prev) => [...prev, msg.data]);
              break;
            case "status_change":
              setStatus(msg.data.status);
              if (msg.data.status === "stopped" || msg.data.status === "error") {
                setWaitingInput(false);
              }
              break;
            case "input_required":
              setWaitingInput(true);
              break;
            case "file_generated":
              setGeneratedFiles((prev) => [...prev, msg.data]);
              break;
            case "completed":
              setWaitingInput(false);
              break;
            case "cleared":
              setLogs([]);
              break;
            case "input_sent":
              setWaitingInput(false);
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        reconnectRef.current++;
        if (reconnectRef.current < 5) {
          reconnectTimer = setTimeout(connect, 2000 * reconnectRef.current);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws.close();
    };
  }, [projectId]);

  const sendInput = useCallback(
    (input: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "send_input", input }));
        setWaitingInput(false);
      }
    },
    []
  );

  const stop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "clear_logs" }));
    }
  }, []);

  return { logs, status, waitingInput, generatedFiles, sendInput, stop, clearLogs };
}
