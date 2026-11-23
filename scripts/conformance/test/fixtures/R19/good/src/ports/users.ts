export type User = { id: string };
export interface UserReader {
  findById(id: string): Promise<User | null>;
}
