import type { User } from "../lib/types.ts";
export interface UserReader {
  findById(id: string): Promise<User | null>;
}
