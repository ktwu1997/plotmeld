import type { ToolTrace } from "../lib/contracts";

export function Trace({ trace }: { trace: ToolTrace[] }) {
  return <div className="trace"><h4>ToolTrace</h4><p>Request inputs and timings reported by the agent.</p><ol>{trace.map((call) => <li key={call.id}>
    <div className="trace-heading"><strong>{call.tool === "llm.mock" ? "Synthetic writer (mock)" : call.tool}</strong><span>{call.ok ? "Completed" : "Failed"} · {call.ms} ms</span></div>
    <code>{call.id}</code><pre>{JSON.stringify(call.input, null, 2)}</pre>{call.error && <p>{call.error}</p>}
  </li>)}</ol></div>;
}

