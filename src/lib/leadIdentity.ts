export type LeadIdentityField = {
  id: string;
  label?: string | null;
  is_name_field?: boolean;
  is_phone_field?: boolean;
};

const NAME_REGEX = /(^|\b)(nome|cliente|paciente)(\b|$)/i;
const PHONE_REGEX = /(telefone|celular|whatsapp|fone)/i;
const AGE_REGEX = /\bidade\b/i;

function toText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join(", ");
  }

  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstNonEmpty(values: unknown[]): string {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return "";
}

function getFieldValue(data: Record<string, any>, fieldId?: string) {
  if (!fieldId) return "";
  return toText(data[`field_${fieldId}`]);
}

function getFieldMatch(
  data: Record<string, any>,
  fields: LeadIdentityField[],
  predicate: (field: LeadIdentityField) => boolean,
) {
  for (const field of fields) {
    if (!predicate(field)) continue;
    const value = getFieldValue(data, field.id);
    if (value) return value;
  }
  return "";
}

function getKeyMatch(data: Record<string, any>, regex: RegExp) {
  for (const [key, value] of Object.entries(data)) {
    if (!regex.test(key)) continue;
    const text = toText(value);
    if (text) return text;
  }
  return "";
}

export function resolveLeadIdentity(
  data: Record<string, any>,
  fields: LeadIdentityField[] = [],
) {
  const safeData = typeof data === "object" && data ? data : {};

  const nome = firstNonEmpty([
    safeData.nome_lead,
    safeData.nome,
    safeData.nome_cliente,
    safeData.cliente_nome,
    getFieldMatch(safeData, fields, (field) => !!field.is_name_field),
    getFieldMatch(safeData, fields, (field) => NAME_REGEX.test(field.label || "")),
    getKeyMatch(safeData, NAME_REGEX),
  ]);

  const telefone = firstNonEmpty([
    safeData.telefone,
    safeData.whatsapp,
    safeData.celular,
    getFieldMatch(safeData, fields, (field) => !!field.is_phone_field),
    getFieldMatch(safeData, fields, (field) => PHONE_REGEX.test(field.label || "")),
    getKeyMatch(safeData, PHONE_REGEX),
  ]);

  const idade = firstNonEmpty([
    safeData.idade,
    safeData.idade_cliente,
    getFieldMatch(safeData, fields, (field) => AGE_REGEX.test(field.label || "")),
    getKeyMatch(safeData, AGE_REGEX),
  ]);

  return { nome, telefone, idade };
}

export function normalizeLeadData(
  data: Record<string, any>,
  fields: LeadIdentityField[] = [],
) {
  const safeData = typeof data === "object" && data ? data : {};
  const identity = resolveLeadIdentity(safeData, fields);

  return {
    ...safeData,
    ...(identity.nome ? { nome_lead: identity.nome } : {}),
    ...(identity.telefone ? { telefone: identity.telefone } : {}),
    ...(identity.idade ? { idade: identity.idade } : {}),
  };
}