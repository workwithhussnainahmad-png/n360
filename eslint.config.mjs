import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".codex/**",
    "test-results/**",
    // Dated reports include generated browser bundles and archived fixtures.
    "docs/*-20??-??-??/**",
    // Local, git-ignored repair scratch file; it may contain non-text data.
    "fix.js",
  ]),
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    rules: {
      // This is an established codebase with API/ORM boundaries that still use
      // explicit `any`. Keep surfacing those locations without making unrelated
      // lint work fail until they can be tightened incrementally.
      "@typescript-eslint/no-explicit-any": "warn",
      // Existing effects intentionally initiate client-side data loading and
      // reset derived pagination state. Keep the React 19 guidance visible while
      // avoiding behavior-changing rewrites solely to satisfy the new preset.

    },
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: { "react-hooks/set-state-in-effect": "warn", "react-hooks/immutability": "warn" },
  },
  {
    files: ["**/*.cjs", "*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
