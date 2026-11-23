export async function a(): Promise<unknown> {
  try {
    return { ok: true, value: 1 };
  } catch (e) {
    return { ok: true, value: (e as Error).message };
  }
}
export function b(): unknown {
  try {
    return 1;
  } catch (err) {
    return `failed: ${err}`;
  }
}
export function c(): never {
  throw "bad input";
}
