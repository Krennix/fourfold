import { useEffect, useRef, useState } from 'react';
import { searchAddress, type AddressSuggestion } from '../lib/addressAutocomplete';
import { formatPhoneNumber } from '../lib/phoneFormat';
import type { Friend, FriendInput } from '../state/FriendsContext';

const AVATAR_SIZE = 192;

async function fileToAvatarDataUrl(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not read image'));
    el.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  const scale = Math.max(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function FriendDialog({
  friend,
  onSave,
  onClose,
}: {
  friend?: Friend | null;
  onSave: (input: FriendInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(friend?.name ?? '');
  const [nickname, setNickname] = useState(friend?.nickname ?? '');
  const [avatarDataUrl, setAvatarDataUrl] = useState(friend?.avatarDataUrl ?? '');
  const [notes, setNotes] = useState(friend?.notes ?? '');
  const [month, setMonth] = useState(friend?.birthday ? String(friend.birthday.month) : '');
  const [day, setDay] = useState(friend?.birthday ? String(friend.birthday.day) : '');
  const [address, setAddress] = useState(friend?.address ?? '');
  const [phone, setPhone] = useState(friend?.phone ?? '');

  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    abortRef.current?.abort();
  }, []);

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setShowSuggestions(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    abortRef.current?.abort();
    searchTimer.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      searchAddress(value, controller.signal).then((results) => setAddressSuggestions(results));
    }, 300);
  };

  const pickSuggestion = (s: AddressSuggestion) => {
    setAddress(s.label);
    setAddressSuggestions([]);
    setShowSuggestions(false);
  };

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setAvatarDataUrl(await fileToAvatarDataUrl(file));
    } catch {
      // ignore unreadable images
    }
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const monthNum = Number(month);
    const dayNum = Number(day);
    const birthday = monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 ? { month: monthNum, day: dayNum } : undefined;
    onSave({
      name: trimmed,
      nickname: nickname.trim() || undefined,
      avatarDataUrl: avatarDataUrl || undefined,
      notes: notes.trim() || undefined,
      birthday,
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{friend ? 'Edit friend' : 'Add friend'}</div>

        <div className="friend-form-identity">
          <label className="friend-avatar-upload" title="Upload photo">
            {avatarDataUrl ? (
              <img src={avatarDataUrl} alt="" className="friend-avatar friend-avatar-xl" />
            ) : (
              <span className="friend-avatar friend-avatar-xl friend-avatar-placeholder">{name ? initials(name) : '?'}</span>
            )}
            <span className="friend-avatar-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8a2 2 0 0 1 2-2h1.2a2 2 0 0 0 1.66-.89l.28-.42A2 2 0 0 1 10.8 4h2.4a2 2 0 0 1 1.66.89l.28.42A2 2 0 0 0 16.8 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleAvatarFile(e.target.files?.[0])}
            />
          </label>
          <div className="friend-form-identity-fields">
            <div className="field" style={{ margin: 0 }}>
              <label>Name</label>
              <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Nickname (optional)</label>
              <input className="input" type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="What you call them" />
            </div>
          </div>
        </div>

        <hr className="hr" style={{ margin: 0 }} />

        <div className="field">
          <label className="friend-field-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 0c-1.5 0-3 .8-3 2.5V17h6v-.5c0-1.7-1.5-2.5-3-2.5Z" /></svg>
            Birthday
          </label>
          <div className="friend-birthday-group">
            <input className="input" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} placeholder="Month" />
            <span className="friend-birthday-sep">/</span>
            <input className="input" type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} placeholder="Day" />
          </div>
        </div>

        <div className="field" style={{ position: 'relative' }}>
          <label className="friend-field-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
            Address
          </label>
          <input
            className="input"
            type="text"
            value={address}
            onChange={(e) => handleAddressChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Start typing an address…"
          />
          {showSuggestions && addressSuggestions.length > 0 && (
            <div className="friend-address-suggestions">
              {addressSuggestions.map((s, i) => (
                <button
                  type="button"
                  key={i}
                  className="friend-address-suggestion"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(s)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label className="friend-field-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.8 2.2Z" /></svg>
            Phone
          </label>
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(formatPhoneNumber(e.target.value))} placeholder="(555) 123-4567" />
        </div>

        <div className="field">
          <label className="friend-field-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></svg>
            Notes
          </label>
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" rows={3} />
        </div>

        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
