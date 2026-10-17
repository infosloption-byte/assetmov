import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "src/generated/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Underscore-prefixed parameters are intentionally unused (e.g. Express's error-handler next argument).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Express Request is extended through standard ambient declaration merging.
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
    },
  },
);
