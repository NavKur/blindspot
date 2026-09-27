import tseslint from "typescript-eslint";
import js from "@eslint/js";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "*.vsix"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "no-console": "off",
    },
  },
  {
    files: ["scripts/**/*.js", "*.mjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        require: "readonly",
        module: "writable",
        __dirname: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
);
