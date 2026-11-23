export function text(): string {
  try {
    return "x";
  } catch (e) {
    return String(e);
  }
}
