# AGENTS.md

- Never add or use `isRecord`; inline the object check or use a more specific guard.
- Do not use inline `typeof value === "object"` / `typeof value !== "object"` guards unless explicitly requested.
- Prefer concrete domain types over loose raw bags; keep `unknown` only at JSON decode boundaries.
- A decoder should return a complete valid object or `null`; do not partially coerce invalid shapes.
- Avoid reusable generic object helpers like `asObject`; use specific parsers or guards for each shape.
- Prefer one strict decoder boundary per file, then work with concrete typed values after decode.
