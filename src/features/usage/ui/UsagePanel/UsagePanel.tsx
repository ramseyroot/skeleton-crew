import type { UsageMonth } from "../../domain.ts";
import { Toast } from "../../../../shared/ui/Toast/Toast.tsx";
import type { ViewState } from "../../../../shared/ui/view-state.ts";

export type UsagePanelProps = {
  /** This month's usage by endpoint: from the usage.month strip. */
  usage: ViewState<UsageMonth>;
};

/** Receives Result-shaped props only. It does not import or call a strip. */
export function UsagePanel({ usage }: UsagePanelProps) {
  if (usage.status === "loading") return <p aria-busy="true">Loading usage...</p>;
  if (usage.status === "empty") return <p>No requests yet this month.</p>;
  if (usage.status === "error") {
    return (
      <div>
        <Toast display={usage.display} />
        <a href="/login">Log in</a>
      </div>
    );
  }
  const { month, total, byEndpoint } = usage.value;
  return (
    <section style={{ display: "grid", gap: 12, maxWidth: 640 }}>
      <h2>
        {month}: {total} requests
      </h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Endpoint</th>
            <th align="right">Succeeded</th>
            <th align="right">Client errors</th>
            <th align="right">Server errors</th>
            <th align="right">Total</th>
          </tr>
        </thead>
        <tbody>
          {byEndpoint.map((e) => (
            <tr key={e.endpoint}>
              <td>{e.endpoint}</td>
              <td align="right">{e.ok}</td>
              <td align="right">{e.clientError}</td>
              <td align="right">{e.serverError}</td>
              <td align="right">{e.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
