/**
 * The tenant-defined asset model is the source of truth for custom values.
 * Reject unknown keys, wrong types, invalid choices and missing required fields.
 */
export type CustomValue = string | number | boolean | string[];
export type CustomValues = Record<string, CustomValue>;

type Field = {
  key: string;
  label: string;
  type: "text" | "longText" | "number" | "date" | "boolean" | "singleSelect" | "multiSelect";
  required: boolean;
  options?: string[];
};

export class CustomFieldValidationError extends Error {
  readonly code = "CUSTOM_FIELD_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "CustomFieldValidationError";
  }
}

function definition(value: unknown): Field[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1 || !Array.isArray(obj.fields)) {
    throw new CustomFieldValidationError("This asset model has an unsupported field definition.");
  }
  return obj.fields as Field[];
}

export function validateCustomFieldValues(schema: unknown, input: unknown): CustomValues {
  const fields = definition(schema);
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new CustomFieldValidationError("Custom fields must be a keyed object.");
  }
  const values = input as Record<string, unknown>;
  const allowedKeys = new Set(fields.map(field => field.key));
  for (const key of Object.keys(values)) {
    if (!allowedKeys.has(key)) throw new CustomFieldValidationError("Unknown custom field: " + key);
  }
  const result: CustomValues = {};
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined || value === null || value === "") {
      if (field.required) throw new CustomFieldValidationError(field.label + " is required.");
      continue;
    }
    switch (field.type) {
      case "text":
      case "longText":
        if (typeof value !== "string" || value.length > (field.type === "text" ? 500 : 10000)) {
          throw new CustomFieldValidationError(field.label + " must be valid text.");
        }
        result[field.key] = value;
        break;
      case "date":
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
          throw new CustomFieldValidationError(field.label + " must be a valid ISO date.");
        }
        result[field.key] = value;
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new CustomFieldValidationError(field.label + " must be a finite number.");
        }
        result[field.key] = value;
        break;
      case "boolean":
        if (typeof value !== "boolean") {
          throw new CustomFieldValidationError(field.label + " must be true or false.");
        }
        result[field.key] = value;
        break;
      case "singleSelect":
        if (typeof value !== "string" || !field.options?.includes(value)) {
          throw new CustomFieldValidationError(field.label + " must match an available choice.");
        }
        result[field.key] = value;
        break;
      case "multiSelect":
        if (!Array.isArray(value) || value.some(v => typeof v !== "string" || !field.options?.includes(v)) ||
            new Set(value).size !== value.length || (field.required && value.length === 0)) {
          throw new CustomFieldValidationError(field.label + " must contain unique valid choices.");
        }
        result[field.key] = value as string[];
        break;
    }
  }
  return result;
}
