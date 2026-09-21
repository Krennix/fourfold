import type { Countdown } from '../state/CountdownsContext';
import type { Friend } from '../state/FriendsContext';

/** Names of every friend linked to this countdown — via birthday auto-sync (`friendId`) or a
 * manual link (`linkedCountdowns`) added from the friend detail dialog. */
export function linkedFriendNames(countdown: Pick<Countdown, 'id' | 'friendId'>, friends: Friend[]): string[] {
  const names = new Set<string>();
  for (const f of friends) {
    if (f.id === countdown.friendId || (f.linkedCountdowns ?? []).includes(countdown.id)) names.add(f.name);
  }
  return [...names];
}
