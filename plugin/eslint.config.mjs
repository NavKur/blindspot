import tseslint from "typescript-eslint";
import js from "@eslint/js";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "*.vsix", ".tmp/**"] },
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
    files: ["scripts/**/*.js", "scripts/**/*.mjs", "*.mjs"],
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
  {
    // The web demo's page script runs in a browser, not in Node.
    files: ["scripts/web-demo/app.js"],
    languageOptions: {
      globals: { window: "readonly", document: "readonly", navigator: "readonly", setTimeout: "readonly", clearTimeout: "readonly" },
    },
  },
);
