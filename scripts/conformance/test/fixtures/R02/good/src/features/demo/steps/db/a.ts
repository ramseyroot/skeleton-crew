export function a(): unknown {
  try {
    return { ok: true, value: 1 };
  } catch (e) {
    return { ok: false, error: { kind: "unexpected", message: String(e) } };
  }
}
export function b(): unknown {
  try {
    return 1;
  } catch (e) {
    const later = (): string => String(e);
    void later;
    return { ok: false, error: { kind: "unexpected", message: "failed" } };
  }
}
export function c(): never {
  throw new Error("bad input");
}
