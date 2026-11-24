"use client";

import type { KeyRow } from "../../domain.ts";
import { Toast } from "../../../../shared/ui/Toast/Toast.tsx";
import type { PublicResult, ViewState } from "../../../../shared/ui/view-state.ts";
import type { KeyOutcome } from "../../portal.ts";

export type KeysPortalProps = {
  /** The keys of the signed-in user: from the keys.list strip. */
  keys: ViewState<{ keys: KeyRow[] }>;
  /** The last result of keys.create, keys.rotate or keys.revoke, if a form was submitted. */
  last?: PublicResult<KeyOutcome> | null;
  /** True while a form is being sent. */
  pending?: boolean;
  /** The form action. The shell passes a Server Action. A story passes a no-op. */
  action: (formData: FormData) => void | Promise<void>;
};

/** Receives Result-shaped props only. It does not import or call a strip. */
export function KeysPortal({ keys, last = null, pending = false, action }: KeysPortalProps) {
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      {last && !last.ok ? <Toast display={last.display} /> : null}
      {last?.ok && last.value.kind !== "revoked" ? (
        <section role="status" style={{ border: "1px solid #b54708", padding: 12 }}>
          <strong>{last.value.kind === "rotated" ? "New key (the old one is revoked)" : "New key"}</strong>
          <p>Copy it now. It is shown once and cannot be read again.</p>
          <code style={{ wordBreak: "break-all" }}>{last.value.key.key}</code>
        </section>
      ) : null}
      {last?.ok && last.value.kind === "revoked" ? <p role="status">Key revoked.</p> : null}

      <form action={action} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
        <input type="hidden" name="intent" value="create" />
        <label style={{ display: "grid", gap: 4 }}>
          <span>Name</span>
          <input name="name" maxLength={60} disabled={pending} required />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Expires in (days, optional)</span>
          <input name="expiresInDays" type="number" min={1} max={365} disabled={pending} />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "Working..." : "Create key"}
        </button>
      </form>

      {keys.status === "loading" ? <p aria-busy="true">Loading keys...</p> : null}
      {keys.status === "empty" ? <p>You have no keys yet.</p> : null}
      {keys.status === "error" ? (
        <div>
          <Toast display={keys.display} />
          <a href="/login">Log in</a>
        </div>
      ) : null}
      {keys.status === "ready" ? (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th align="left">Name</th>
              <th align="left">Key</th>
              <th align="left">State</th>
              <th align="left">Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.value.keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td>
                  <code>sk_{k.prefix}_...</code>
                </td>
                <td>{k.state}</td>
                <td>{k.lastUsedAt ?? "never"}</td>
                <td>
                  {k.state === "active" ? (
                    <form action={action} style={{ display: "flex", gap: 4 }}>
                      <input type="hidden" name="keyId" value={k.id} />
                      <button type="submit" name="intent" value="rotate" disabled={pending}>
                        Rotate
                      </button>
                      <button type="submit" name="intent" value="revoke" disabled={pending}>
                        Revoke
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
