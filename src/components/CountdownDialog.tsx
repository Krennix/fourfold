import { useRef, useState } from 'react';
import { CountdownIcon, COUNTDOWN_TYPES, COUNTDOWN_TYPE_LABELS } from './CountdownIcon';
import type { Countdown, CountdownType } from '../state/CountdownsContext';

export interface HolidayPreset {
  name: string;
  month: number;
  day: number;
}

export const HOLIDAY_PRESETS: HolidayPreset[] = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: "Valentine's Day", month: 2, day: 14 },
  { name: "St. Patrick's Day", month: 3, day: 17 },
  { name: "Independence Day", month: 7, day: 4 },
  { name: 'Halloween', month: 10, day: 31 },
  { name: 'Veterans Day', month: 11, day: 11 },
  { name: 'Christmas Eve', month: 12, day: 24 },
  { name: 'Christmas Day', month: 12, day: 25 },
  { name: "New Year's Eve", month: 12, day: 31 },
];

export function CountdownDialog({
  countdown,
  onSave,
  onClose,
}: {
  countdown?: Countdown | null;
  onSave: (name: string, month: number, day: number, type: CountdownType) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<CountdownType>(countdown?.type ?? 'birthday');

  const nameRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  const applyPreset = (preset: HolidayPreset) => {
    if (nameRef.current) nameRef.current.value = preset.name;
    if (monthRef.current) monthRef.current.value = String(preset.month);
    if (dayRef.current) dayRef.current.value = String(preset.day);
  };

  const handleSave = () => {
    const name = nameRef.current?.value.trim();
    const month = Number(monthRef.current?.value);
    const day = Number(dayRef.current?.value);
    if (name && month >= 1 && month <= 12 && day >= 1 && day <= 31) onSave(name, month, day, type);
    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{countdown ? 'Edit countdown' : 'Add countdown'}</div>
        <div className="field">
          <label>Name</label>
          <input className="input" type="text" ref={nameRef} placeholder="Event name" defaultValue={countdown?.name ?? ''} />
        </div>
        <div className="field">
          <label>Type</label>
          <div className="cd-type-picker">
            {COUNTDOWN_TYPES.map((t) => (
              <button
                type="button"
                key={t}
                className={`cd-type-opt${type === t ? ' active' : ''}`}
                onClick={() => setType(t)}
              >
                <CountdownIcon type={t} />
                {COUNTDOWN_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        {type === 'holiday' && (
          <div className="field">
            <label>Quick pick</label>
            <div className="cd-preset-row">
              {HOLIDAY_PRESETS.map((p) => (
                <button type="button" key={p.name} className="tag tag-outline cd-preset-btn" onClick={() => applyPreset(p)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Month</label>
            <input className="input" type="number" min={1} max={12} ref={monthRef} placeholder="MM" defaultValue={countdown?.month ?? ''} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Day</label>
            <input className="input" type="number" min={1} max={31} ref={dayRef} placeholder="DD" defaultValue={countdown?.day ?? ''} />
          </div>
        </div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
