export const q1 = "SELECT id, name FROM users WHERE id = ?";
export const q2 = sql`select * from users`;
export function q3(t: string): string {
  return `DELETE FROM ${t} WHERE id = 1`;
}
declare function sql(s: TemplateStringsArray): string;
