import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  // Ignore generated / vendor output
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "next-env.d.ts",
      "coverage/**",
      "python-engine/**",
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Project conventions
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // TODO(D12): React Compiler rule — forbids calling state setters
      // synchronously inside effects. All NEW code must comply (hooks in
      // src/lib/hooks use subscription / derived-state patterns instead).
      // Legacy pages still use the classic "fetch-in-effect" pattern; they
      // will be migrated to a data-fetching library (SWR / TanStack Query),
      // after which this rule should be restored to "error".
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
