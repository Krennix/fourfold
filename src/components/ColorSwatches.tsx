import { useEffect, useState } from 'react';

/** Fixed palette for color-tagging events, calendars, and feeds. */
export const EVENT_COLORS = [
  '#e0575b', '#e2984a', '#dbb349', '#6fae63',
  '#4a9d8f', '#5980a6', '#7c6ecb', '#c25fa8',
];

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Reusable swatch picker: an empty `value` selects the "Default" (no override) swatch. Also
 * accepts a custom color via a native color picker or a typed hex code, for colors outside the
 * fixed palette.
 */
export function ColorSwatchPicker({
  value,
  onChange,
  palette = EVENT_COLORS,
}: {
  value: string;
  onChange: (color: string) => void;
  palette?: string[];
}) {
  const [hexDraft, setHexDraft] = useState(value);
  useEffect(() => setHexDraft(value), [value]);

  const isCustom = value !== '' && !palette.includes(value);

  const commitHex = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      onChange('');
      return;
    }
    const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (HEX_RE.test(normalized)) onChange(normalized);
  };

  return (
    <div className="color-swatches">
      <button
        type="button"
        className={`color-swatch color-swatch-none${value === '' ? ' selected' : ''}`}
        title="Default"
        onClick={() => onChange('')}
      />
      {palette.map((c) => (
        <button
          key={c}
          type="button"
          className={`color-swatch${value === c ? ' selected' : ''}`}
          style={{ background: c }}
          title={c}
          onClick={() => onChange(c)}
        />
      ))}
      <label className={`color-swatch color-swatch-custom${isCustom ? ' selected' : ''}`} title="Custom color" style={isCustom ? { background: value } : undefined}>
        <input
          type="color"
          className="color-swatch-custom-input"
          value={isCustom ? value : '#888888'}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <input
        className="input color-hex-input"
        type="text"
        placeholder="#hex"
        value={hexDraft}
        onChange={(e) => setHexDraft(e.target.value)}
        onBlur={() => commitHex(hexDraft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitHex(hexDraft);
        }}
      />
    </div>
  );
}
