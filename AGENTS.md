# Agent Instructions

- Add JSDoc comment (`/** ... */`) to functions with at least one line describing purpose. Include example usage if helpful.
  ```ts
  /**
   * Calculates the sum of two numbers.
   * @param a - First number
   * @param b - Second number
   * @returns Sum of a and b
   * @example sum(1, 2) // returns 3
   */
  ```
- Prefer concrete domain types over loose raw bags; keep `unknown` only at JSON decode boundaries.
- A decoder should return a complete valid object or `null`; do not partially coerce invalid shapes.
- Prefer one strict decoder boundary per file, then work with concrete typed values after decode.
- Run `./scripts/lint.sh` before committing.
