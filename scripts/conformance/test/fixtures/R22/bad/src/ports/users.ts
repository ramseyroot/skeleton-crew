import type { RecordModel } from "pocketbase";
export interface UserReader {
  findById(id: string): Promise<RecordModel | null>;
}
