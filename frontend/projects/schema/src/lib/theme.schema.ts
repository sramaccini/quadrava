// GENERATO da tools/sync-schema.mjs a partire da schemas/theme.schema.json: non modificare a mano.
// Dopo ogni modifica allo schema: npm run schema:sync
export const THEME_SCHEMA: Record<string, unknown> = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://lowcode.example/schemas/theme.schema.json",
  "title": "Tema dell'applicazione LowCode",
  "description": "Design token di un tema. Il runtime li applica come CSS custom properties (--lc-*). I valori ammessi sono volutamente ristretti: un tema non può iniettare CSS arbitrario.",
  "type": "object",
  "required": [
    "schemaVersion",
    "theme",
    "tokens"
  ],
  "properties": {
    "schemaVersion": {
      "const": "1.0"
    },
    "theme": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]{1,63}$",
      "description": "Identificativo del tema."
    },
    "label": {
      "type": "string",
      "maxLength": 80
    },
    "mode": {
      "enum": [
        "light",
        "dark"
      ],
      "description": "Aiuta il runtime a impostare color-scheme."
    },
    "tokens": {
      "$ref": "#/$defs/tokens"
    }
  },
  "additionalProperties": false,
  "$defs": {
    "color": {
      "type": "string",
      "pattern": "^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\\([0-9.,%\\s/]+\\))$"
    },
    "tokens": {
      "type": "object",
      "required": [
        "colors"
      ],
      "properties": {
        "colors": {
          "type": "object",
          "required": [
            "primary",
            "onPrimary",
            "background",
            "surface",
            "onSurface",
            "border"
          ],
          "properties": {
            "primary": {
              "$ref": "#/$defs/color"
            },
            "onPrimary": {
              "$ref": "#/$defs/color"
            },
            "background": {
              "$ref": "#/$defs/color"
            },
            "surface": {
              "$ref": "#/$defs/color"
            },
            "onSurface": {
              "$ref": "#/$defs/color"
            },
            "mutedText": {
              "$ref": "#/$defs/color"
            },
            "border": {
              "$ref": "#/$defs/color"
            },
            "danger": {
              "$ref": "#/$defs/color"
            },
            "success": {
              "$ref": "#/$defs/color"
            }
          },
          "additionalProperties": false
        },
        "typography": {
          "type": "object",
          "properties": {
            "fontFamily": {
              "type": "string",
              "pattern": "^[A-Za-z0-9 ,'\"-]{1,200}$"
            },
            "baseSize": {
              "type": "number",
              "minimum": 12,
              "maximum": 20,
              "description": "Dimensione base in px."
            }
          },
          "additionalProperties": false
        },
        "shape": {
          "type": "object",
          "properties": {
            "radius": {
              "type": "number",
              "minimum": 0,
              "maximum": 24,
              "description": "Raggio degli angoli in px."
            }
          },
          "additionalProperties": false
        },
        "density": {
          "enum": [
            "compact",
            "comfortable"
          ]
        }
      },
      "additionalProperties": false
    }
  }
};
