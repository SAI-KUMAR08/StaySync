import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

/**
 * ESLint flat config for the React client.
 *
 * `react-hooks/exhaustive-deps` is reported as a warning so the rule surfaces
 * missing deps without blocking builds/commits.
 */
export default [
  { ignores: ["dist", "node_modules"] },
  {
    // Node-run config files (vite.config.js, eslint.config.js).
    files: ["*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules },
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2022 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Classic hooks rules. exhaustive-deps stays a warning so it surfaces
      // missing deps without blocking builds/commits.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Context files legitimately export providers + hooks together; fast-refresh
      // warning is noise here.
      "react-refresh/only-export-components": "off",
      // Auto-removable unused imports/vars (L-1).
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
    },
  },
];
