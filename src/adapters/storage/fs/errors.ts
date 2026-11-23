// Maps Node file system failures to an ErrorKind by their `code`.
// Bad keys never reach the file system (the adapter rejects them first), so a missing path that the adapter
// did not expect is a real failure. Missing objects on `get` and `delete` are handled in the adapter and are not errors.

import { createErrorMap } from "../../../lib/error-map.ts";

const hasCode =
  (...codes: string[]) =>
  (thrown: unknown): boolean =>
    typeof thrown === "object" &&
    thrown !== null &&
    typeof (thrown as { code?: unknown }).code === "string" &&
    codes.includes((thrown as { code: string }).code);

export const errorMap = createErrorMap(
  [
    { name: "fs permission denied", when: hasCode("EACCES", "EPERM", "EROFS"), kind: "forbidden" },
    { name: "fs path missing", when: hasCode("ENOENT"), kind: "not_found" },
    {
      name: "fs path is a file where a directory is needed, or the reverse",
      when: hasCode("ENOTDIR", "EISDIR", "EEXIST", "ENOTEMPTY"),
      kind: "conflict",
    },
    { name: "fs name too long for this file system", when: hasCode("ENAMETOOLONG"), kind: "validation" },
    { name: "fs disk full or I/O error", when: hasCode("ENOSPC", "EIO", "EMFILE", "ENFILE"), kind: "unexpected" },
  ],
  "unexpected",
);
