import { createHash } from 'node:crypto';

export const isPlainObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const trimmedString = value =>
  typeof value === 'string' ? value.trim() : '';

export const sha256 = value =>
  createHash('sha256').update(value).digest('hex');

export const stableStringify = value =>
  JSON.stringify(value, (_, item) =>
    isPlainObject(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

export const stableRevision = (value, fallback = 'undefined') =>
  sha256(stableStringify(value) ?? fallback);
