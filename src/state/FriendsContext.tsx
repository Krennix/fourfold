import { createContext, useContext, type ReactNode } from 'react';
import { useRemoteState } from '../lib/remoteStore';
import { useAuth } from './AuthContext';
import { useCountdowns } from './CountdownsContext';

export type FriendFieldType = 'text' | 'date' | 'url' | 'phone';

/** A global, reusable field definition — managed via "Manage fields" on the Friends page. */
export interface FriendFieldDef {
  id: string;
  label: string;
  type: FriendFieldType;
}

/** One value on a friend. `defId` set = an instance of a global FriendFieldDef (label/type are
 * resolved from fieldDefs at render time); `defId` unset = a one-off ad-hoc field, carrying its
 * own label/type inline since there's no shared definition to look them up from. */
export interface FriendFieldValue {
  id: string;
  defId?: string;
  label?: string;
  type?: FriendFieldType;
  value: string;
}

/** Reference to an existing CalEvent — identity fields mirror eventKey() in CalendarContext. */
export interface FriendLinkedEvent {
  id: string;
  accountEmail?: string;
  calendarId?: string;
}

export interface Friend {
  id: string;
  name: string;
  nickname?: string;
  avatarDataUrl?: string;
  notes?: string;
  birthday?: { month: number; day: number };
  /** Linked Countdown row id; undefined = no birthday, or a birthday that isn't synced yet. */
  birthdayCountdownId?: string;
  address?: string;
  phone?: string;
  linkedEvents: FriendLinkedEvent[];
  fields: FriendFieldValue[];
}

export interface FriendInput {
  name: string;
  nickname?: string;
  avatarDataUrl?: string;
  notes?: string;
  birthday?: { month: number; day: number };
  address?: string;
  phone?: string;
}

export type FriendPatch = Partial<FriendInput> & {
  linkedEvents?: FriendLinkedEvent[];
  fields?: FriendFieldValue[];
};

interface FriendsData {
  friends: Friend[];
  fieldDefs: FriendFieldDef[];
}

interface FriendsContextValue {
  friends: Friend[];
  fieldDefs: FriendFieldDef[];
  loaded: boolean;
  addFriend: (input: FriendInput) => void;
  updateFriend: (id: string, patch: FriendPatch) => void;
  removeFriend: (id: string) => void;
  addFieldDef: (label: string, type: FriendFieldType) => void;
  updateFieldDef: (id: string, label: string, type: FriendFieldType) => void;
  removeFieldDef: (id: string) => void;
}

const FriendsContext = createContext<FriendsContextValue | null>(null);

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const { countdowns, addCountdown, updateCountdown, removeCountdown } = useCountdowns();
  const [data, setData, loaded] = useRemoteState<FriendsData>('friends', { friends: [], fieldDefs: [] }, handleSessionExpired);
  const { friends, fieldDefs } = data;

  /** Creates/updates/removes the birthday-synced Countdown for a friend, tolerating a stale
   * `birthdayCountdownId` (e.g. the countdown was deleted directly from the Countdowns UI) by
   * treating it the same as "not yet synced" rather than erroring. Returns the id to store. */
  const syncBirthday = (friend: Friend, name: string, birthday: { month: number; day: number } | undefined): string | undefined => {
    const hasValidLink = !!friend.birthdayCountdownId && countdowns.some((c) => c.id === friend.birthdayCountdownId);
    if (birthday) {
      if (hasValidLink) {
        updateCountdown(friend.birthdayCountdownId!, name, birthday.month, birthday.day, 'birthday', friend.id);
        return friend.birthdayCountdownId;
      }
      return addCountdown(name, birthday.month, birthday.day, 'birthday', friend.id).id;
    }
    if (hasValidLink) removeCountdown(friend.birthdayCountdownId!);
    return undefined;
  };

  const addFriend: FriendsContextValue['addFriend'] = (input) => {
    const id = `friend-${Date.now()}`;
    const stub: Friend = { id, linkedEvents: [], fields: [], ...input };
    const birthdayCountdownId = input.birthday ? syncBirthday(stub, input.name, input.birthday) : undefined;
    const friend: Friend = { ...stub, birthdayCountdownId };
    setData((prev) => ({ ...prev, friends: [...prev.friends, friend] }));
  };

  const updateFriend: FriendsContextValue['updateFriend'] = (id, patch) => {
    const friend = friends.find((f) => f.id === id);
    if (!friend) return;
    const birthdayCountdownId = 'birthday' in patch
      ? syncBirthday(friend, patch.name ?? friend.name, patch.birthday)
      : friend.birthdayCountdownId;
    setData((prev) => ({
      ...prev,
      friends: prev.friends.map((f) => (f.id === id ? { ...f, ...patch, birthdayCountdownId } : f)),
    }));
  };

  const removeFriend: FriendsContextValue['removeFriend'] = (id) => {
    const friend = friends.find((f) => f.id === id);
    if (friend?.birthdayCountdownId && countdowns.some((c) => c.id === friend.birthdayCountdownId)) {
      removeCountdown(friend.birthdayCountdownId);
    }
    setData((prev) => ({ ...prev, friends: prev.friends.filter((f) => f.id !== id) }));
  };

  const addFieldDef: FriendsContextValue['addFieldDef'] = (label, type) => {
    setData((prev) => ({ ...prev, fieldDefs: [...prev.fieldDefs, { id: `fielddef-${Date.now()}`, label, type }] }));
  };

  const updateFieldDef: FriendsContextValue['updateFieldDef'] = (id, label, type) => {
    setData((prev) => ({ ...prev, fieldDefs: prev.fieldDefs.map((d) => (d.id === id ? { ...d, label, type } : d)) }));
  };

  const removeFieldDef: FriendsContextValue['removeFieldDef'] = (id) => {
    setData((prev) => ({ ...prev, fieldDefs: prev.fieldDefs.filter((d) => d.id !== id) }));
  };

  return (
    <FriendsContext.Provider
      value={{ friends, fieldDefs, loaded, addFriend, updateFriend, removeFriend, addFieldDef, updateFieldDef, removeFieldDef }}
    >
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error('useFriends must be used within a FriendsProvider');
  return ctx;
}
