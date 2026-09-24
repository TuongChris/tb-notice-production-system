// Form fields of the directory pages. Labels are always visible and programmatically associated;
// hints, lock notes and errors are linked through aria-describedby; invalid fields carry
// aria-invalid. Locked identity fields are read-only (still focusable and readable), not hidden.
import type { ReactNode } from 'react';
import type { FieldAttribution, PostalAddress, SourceChannel } from '@tb/contracts';
import { PROVENANCE_LABEL } from './format.js';

interface CommonProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: ReactNode;
  readonly required?: boolean;
  /** Why the field is read-only, shown next to it. */
  readonly locked?: string | null;
  /**
   * The field is read-only for the reason given in one notice shared by a whole section (the id of
   * that notice): the reason is announced with the field but shown only once.
   */
  readonly lockedBy?: string | null;
}

function describedBy(
  id: string,
  parts: { hint: boolean; locked: boolean; lockedBy: string | null; error: boolean },
) {
  const ids = [
    parts.hint ? `${id}-hint` : null,
    parts.locked ? `${id}-locked` : null,
    parts.lockedBy,
    parts.error ? `${id}-error` : null,
  ].filter((value): value is string => value !== null);
  return ids.length === 0 ? undefined : ids.join(' ');
}

function FieldFrame({
  id,
  label,
  error,
  hint,
  required,
  locked,
  lockedBy,
  children,
}: CommonProps & { children: ReactNode }) {
  return (
    <div
      className={`field${error ? ' field-invalid' : ''}${locked || lockedBy ? ' field-locked' : ''}`}
    >
      <label htmlFor={id}>
        {label}
        {required && <span className="required"> (required)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {children}
      {locked && (
        <p id={`${id}-locked`} className="hint hint-locked">
          {locked}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField(
  props: CommonProps & {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly type?: 'text' | 'email' | 'url' | 'tel' | 'date';
    readonly multiline?: boolean;
    readonly autoComplete?: string;
  },
) {
  const {
    id,
    value,
    onChange,
    type = 'text',
    multiline,
    autoComplete,
    error,
    hint,
    locked,
    lockedBy,
  } = props;
  const shared = {
    id,
    name: id,
    value,
    readOnly: Boolean(locked || lockedBy),
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(id, {
      hint: Boolean(hint),
      locked: Boolean(locked),
      lockedBy: lockedBy ?? null,
      error: Boolean(error),
    }),
  } as const;
  return (
    <FieldFrame {...props}>
      {multiline ? (
        <textarea {...shared} rows={4} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          {...shared}
          type={type}
          autoComplete={autoComplete ?? 'off'}
          spellCheck={type === 'text'}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldFrame>
  );
}

export function SelectField(
  props: CommonProps & {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
    readonly placeholder?: string;
  },
) {
  const { id, value, onChange, options, placeholder, error, hint, locked, lockedBy } = props;
  return (
    <FieldFrame {...props}>
      <select
        id={id}
        name={id}
        value={value}
        disabled={Boolean(locked || lockedBy)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, {
          hint: Boolean(hint),
          locked: Boolean(locked),
          lockedBy: lockedBy ?? null,
          error: Boolean(error),
        })}
        onChange={(event) => onChange(event.target.value)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

/** Text of an optional single-line value; `''` means "not recorded". */
export const text = (value: string | null | undefined): string => value ?? '';

/** Create payload value: omitted when empty. Single-line entries are trimmed at data entry. */
export function createText(value: string, multiline = false): string | undefined {
  const next = multiline ? value : value.trim();
  return next.trim() === '' ? undefined : next;
}

/**
 * PATCH value: undefined when the field was not changed (so it is not sent), null when it was
 * cleared, the entered text otherwise (single-line entries trimmed).
 */
export function patchText(
  value: string,
  initial: string | null,
  multiline = false,
): string | null | undefined {
  if (value === (initial ?? '')) return undefined;
  const next = multiline ? value : value.trim();
  const result = next.trim() === '' ? null : next;
  return result === initial ? undefined : result;
}

/** One entry per line; blank lines are ignored and each entry is trimmed. */
export function LinesField({
  id,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  return (
    <TextField
      id={id}
      label={label}
      hint={hint}
      value={value}
      onChange={onChange}
      error={error}
      multiline
    />
  );
}

export function linesOf(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

const ADDRESS_FIELDS = [
  ['line1', 'Address line 1'],
  ['line2', 'Address line 2'],
  ['city', 'City'],
  ['region', 'Region or province'],
  ['postalCode', 'Postal code'],
  ['country', 'Country code (two letters, e.g. VN)'],
] as const;

export type AddressText = Record<(typeof ADDRESS_FIELDS)[number][0], string>;

export function addressText(address: PostalAddress | null | undefined): AddressText {
  return {
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    region: address?.region ?? '',
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? '',
  };
}

/** The address object to send, or null when every part is empty. */
export function addressValue(value: AddressText): PostalAddress | null {
  const entries = Object.entries(value)
    .map(([key, part]) => [key, part.trim()] as const)
    .filter(([, part]) => part !== '');
  return entries.length === 0 ? null : (Object.fromEntries(entries) as PostalAddress);
}

export function PostalAddressFields({
  idPrefix,
  value,
  onChange,
  errorFor,
}: {
  idPrefix: string;
  value: AddressText;
  onChange: (value: AddressText) => void;
  errorFor: (path: string) => string | undefined;
}) {
  return (
    <fieldset className="fieldset">
      <legend>Postal address</legend>
      <div className="field-grid">
        {ADDRESS_FIELDS.map(([key, label]) => (
          <TextField
            key={key}
            id={`${idPrefix}-${key}`}
            label={label}
            value={value[key]}
            error={errorFor(`postalAddress.${key}`)}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        ))}
      </div>
    </fieldset>
  );
}

export interface ChannelRow {
  readonly url: string;
  readonly channelId: string;
  readonly displayName: string;
}

export function channelRows(channels: readonly SourceChannel[] | null | undefined): ChannelRow[] {
  return (channels ?? []).map((channel) => ({
    url: channel.url,
    channelId: channel.channelId ?? '',
    displayName: channel.displayName ?? '',
  }));
}

export function channelsValue(rows: readonly ChannelRow[]): SourceChannel[] {
  return rows
    .filter((row) => row.url.trim() !== '')
    .map((row) => ({
      platform: 'YOUTUBE' as const,
      url: row.url.trim(),
      ...(row.channelId.trim() === '' ? {} : { channelId: row.channelId.trim() }),
      ...(row.displayName.trim() === '' ? {} : { displayName: row.displayName.trim() }),
    }));
}

export function ChannelsField({
  idPrefix,
  rows,
  onChange,
  errorFor,
}: {
  idPrefix: string;
  rows: readonly ChannelRow[];
  onChange: (rows: ChannelRow[]) => void;
  errorFor: (path: string) => string | undefined;
}) {
  return (
    <fieldset className="fieldset">
      <legend>YouTube channels</legend>
      <p className="hint">
        Channels the owner reports. A channel listed here is not proof of ownership of any work.
      </p>
      {rows.length === 0 && <p className="absent">No channels recorded.</p>}
      {rows.map((row, index) => (
        <div key={index} className="repeat-row">
          <TextField
            id={`${idPrefix}-channel-url-${index}`}
            label={`Channel ${index + 1} address`}
            type="url"
            value={row.url}
            error={errorFor(`sourceChannels.${index}.url`)}
            onChange={(url) =>
              onChange(rows.map((item, i) => (i === index ? { ...item, url } : item)))
            }
          />
          <TextField
            id={`${idPrefix}-channel-channelId-${index}`}
            label="Channel id"
            value={row.channelId}
            error={errorFor(`sourceChannels.${index}.channelId`)}
            onChange={(channelId) =>
              onChange(rows.map((item, i) => (i === index ? { ...item, channelId } : item)))
            }
          />
          <TextField
            id={`${idPrefix}-channel-displayName-${index}`}
            label="Channel name"
            value={row.displayName}
            error={errorFor(`sourceChannels.${index}.displayName`)}
            onChange={(displayName) =>
              onChange(rows.map((item, i) => (i === index ? { ...item, displayName } : item)))
            }
          />
          <button
            type="button"
            className="button-quiet"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            Remove channel {index + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { url: '', channelId: '', displayName: '' }])}
      >
        Add channel
      </button>
    </fieldset>
  );
}

export interface AttributionRow {
  readonly field: string;
  readonly provenance: FieldAttribution['provenance'];
  readonly scopeText: string;
  readonly asOf: string;
  readonly limitations: string;
  /** Existing source references are kept; this page does not attach new ones. */
  readonly sourceIds: readonly string[];
}

export function attributionRows(
  attributions: readonly FieldAttribution[] | null | undefined,
): AttributionRow[] {
  return (attributions ?? []).map((attribution) => ({
    field: attribution.field,
    provenance: attribution.provenance,
    scopeText: attribution.scopeText,
    asOf: attribution.asOf ?? '',
    limitations: attribution.limitations ?? '',
    sourceIds: attribution.sourceIds,
  }));
}

export function attributionsValue(rows: readonly AttributionRow[]): FieldAttribution[] {
  return rows.map((row) => ({
    field: row.field,
    provenance: row.provenance,
    sourceIds: [...row.sourceIds],
    scopeText: row.scopeText,
    ...(row.asOf.trim() === '' ? {} : { asOf: row.asOf.trim() }),
    ...(row.limitations.trim() === '' ? {} : { limitations: row.limitations }),
  }));
}

export function AttributionsField({
  idPrefix,
  fields,
  rows,
  onChange,
  errorFor,
}: {
  idPrefix: string;
  fields: ReadonlyArray<{ name: string; label: string }>;
  rows: readonly AttributionRow[];
  onChange: (rows: AttributionRow[]) => void;
  errorFor: (path: string) => string | undefined;
}) {
  const update = (index: number, change: Partial<AttributionRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  return (
    <fieldset className="fieldset">
      <legend>Field attributions</legend>
      <p className="hint">
        Where a value comes from. Provenance is stored exactly as chosen and is never upgraded.
        “Document reviewed” needs a source reference, and this page does not attach sources to
        attributions, so it cannot be chosen here.
      </p>
      {rows.length === 0 && <p className="absent">No attributions recorded.</p>}
      {rows.map((row, index) => (
        <div key={index} className="repeat-row attribution-row">
          <SelectField
            id={`${idPrefix}-attr-field-${index}`}
            label={`Attribution ${index + 1}: field`}
            value={row.field}
            error={errorFor(`fieldAttributions.${index}.field`)}
            options={fields.map((field) => ({ value: field.name, label: field.label }))}
            onChange={(field) => update(index, { field })}
          />
          <SelectField
            id={`${idPrefix}-attr-provenance-${index}`}
            label="Provenance"
            value={row.provenance}
            error={errorFor(`fieldAttributions.${index}.sourceIds`)}
            options={Object.entries(PROVENANCE_LABEL).map(([value, label]) => ({
              value,
              label: value === 'DOCUMENT_REVIEWED' ? `${label} (needs a source reference)` : label,
              disabled: value === 'DOCUMENT_REVIEWED' && row.sourceIds.length === 0,
            }))}
            onChange={(provenance) =>
              update(index, { provenance: provenance as AttributionRow['provenance'] })
            }
          />
          <TextField
            id={`${idPrefix}-attr-scopeText-${index}`}
            label="Scope"
            hint="What this attribution covers."
            value={row.scopeText}
            error={errorFor(`fieldAttributions.${index}.scopeText`)}
            onChange={(scopeText) => update(index, { scopeText })}
          />
          <TextField
            id={`${idPrefix}-attr-asOf-${index}`}
            label="As of (optional)"
            hint="Date and time with offset, e.g. 2026-09-24T10:00:00+07:00."
            value={row.asOf}
            error={errorFor(`fieldAttributions.${index}.asOf`)}
            onChange={(asOf) => update(index, { asOf })}
          />
          <TextField
            id={`${idPrefix}-attr-limitations-${index}`}
            label="Limitations (optional)"
            value={row.limitations}
            error={errorFor(`fieldAttributions.${index}.limitations`)}
            onChange={(limitations) => update(index, { limitations })}
            multiline
          />
          <p className="hint">
            Source references: {row.sourceIds.length === 0 ? 'none' : row.sourceIds.join(', ')}
          </p>
          <button
            type="button"
            className="button-quiet"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            Remove attribution {index + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...rows,
            {
              field: fields[0]?.name ?? '',
              provenance: 'OPERATOR_REPORTED',
              scopeText: '',
              asOf: '',
              limitations: '',
              sourceIds: [],
            },
          ])
        }
      >
        Add attribution
      </button>
    </fieldset>
  );
}

/**
 * The id of the input that an issue path (e.g. `fieldAttributions.2.scopeText`) belongs to, for the
 * validation summary's links; null when no single input matches.
 */
export function fieldIdFor(prefix: string, path: string): string | null {
  const [head, index, sub] = path.split('.');
  if (!head || head === '(body)') return null;
  if (head === 'postalAddress') return index ? `${prefix}-postalAddress-${index}` : null;
  if (head === 'fieldAttributions' && index !== undefined) {
    const part = sub === undefined || sub === 'sourceIds' ? 'provenance' : sub;
    return `${prefix}-attr-${part}-${index}`;
  }
  if (head === 'sourceChannels' && index !== undefined) {
    return `${prefix}-channel-${sub ?? 'url'}-${index}`;
  }
  return `${prefix}-${head}`;
}

export interface TextSpec<K extends string> {
  readonly name: K;
  readonly label: string;
  readonly type?: 'text' | 'email' | 'url' | 'tel';
  readonly hint?: string;
  readonly multiline?: boolean;
}

/** Create payload entries for the non-empty text fields. */
export function createTexts<K extends string>(
  specs: readonly TextSpec<K>[],
  values: Readonly<Record<K, string>>,
): Partial<Record<K, string>> {
  const body: Partial<Record<K, string>> = {};
  for (const spec of specs) {
    const value = createText(values[spec.name], spec.multiline);
    if (value !== undefined) body[spec.name] = value;
  }
  return body;
}

/** PATCH entries for the text fields that changed (locked fields are never sent). */
export function patchTexts<K extends string>(
  specs: readonly TextSpec<K>[],
  values: Readonly<Record<K, string>>,
  initial: Readonly<Record<K, string | null>>,
  isLocked: (name: K) => boolean = () => false,
): Partial<Record<K, string | null>> {
  const body: Partial<Record<K, string | null>> = {};
  for (const spec of specs) {
    if (isLocked(spec.name)) continue;
    const value = patchText(values[spec.name], initial[spec.name], spec.multiline);
    if (value !== undefined) body[spec.name] = value;
  }
  return body;
}

export function initialTexts<K extends string>(
  specs: readonly TextSpec<K>[],
  record: Readonly<Record<K, string | null>> | null,
): Record<K, string> {
  return Object.fromEntries(specs.map((spec) => [spec.name, text(record?.[spec.name])])) as Record<
    K,
    string
  >;
}

/** JSON-equality of two payload values (for arrays/objects the form rebuilds). */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
