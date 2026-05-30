// §350 — eslint minimal : garde-fou React #310 (hook après early return).
// Volontairement MINIMAL (react-hooks uniquement) pour ne pas remonter un flot
// d'issues pré-existantes. `rules-of-hooks` = ERREUR (bloque la CI) ;
// `exhaustive-deps` = WARN (des eslint-disable existent déjà, non bloquant).
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "dev-dist/**",
      "node_modules/**",
      "public/**",
      "supabase/**",
      "attached_assets/**",
      "**/*.config.js",
      "**/*.config.ts",
      // Storybook : le `render: () => { useState() }` est un idiome Storybook,
      // pas du code applicatif (non livré) → hors périmètre du garde-fou #310.
      "**/*.stories.tsx",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    // Config minimale (react-hooks seul) → on ne signale PAS les `eslint-disable`
    // « inutilisés » : beaucoup ciblent des règles non chargées ici (ex.
    // `@typescript-eslint/no-explicit-any`, `no-console`) → ce ne serait pas un
    // vrai signal, juste du bruit.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    // Le plugin @typescript-eslint est enregistré (rules CONNUES mais non
    // activées) pour que les `eslint-disable @typescript-eslint/...` existants
    // dans le code ne déclenchent pas « Definition for rule not found ».
    plugins: { "react-hooks": reactHooks, "@typescript-eslint": tseslint.plugin },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
