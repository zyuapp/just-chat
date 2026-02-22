import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      complexity: ["error", 8],
      "max-lines": [
        "error",
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true
        }
      ],
      "max-lines-per-function": [
        "error",
        {
          max: 80,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true
        }
      ]
    }
  }
);
