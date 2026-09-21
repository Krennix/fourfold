import { useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { FriendDialog } from '../components/FriendDialog';
import { FriendDetailDialog } from '../components/FriendDetailDialog';
import { useFriends } from '../state/FriendsContext';
import './Friends.css';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function FriendsPage() {
  const { friends, addFriend, updateFriend } = useFriends();
  const [openFriendId, setOpenFriendId] = useState<string | null>(null);
  const [editingFriendId, setEditingFriendId] = useState<string | 'new' | null>(null);

  const openFriend = friends.find((f) => f.id === openFriendId) ?? null;
  const editingFriend = editingFriendId && editingFriendId !== 'new' ? friends.find((f) => f.id === editingFriendId) ?? null : null;

  return (
    <div className="page">
      <PageHeader
        kicker="People"
        title="Friends"
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setEditingFriendId('new')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Add friend
          </button>
        }
      />

      <Widget>
        {friends.length === 0 && <div className="empty-msg">No friends yet — add one to start keeping track.</div>}
        {friends.length > 0 && (
          <div className="friend-grid">
            {friends.map((f) => (
              <div className="friend-card" key={f.id} onClick={() => setOpenFriendId(f.id)}>
                {f.avatarDataUrl ? (
                  <img src={f.avatarDataUrl} alt="" className="friend-avatar" />
                ) : (
                  <span className="friend-avatar friend-avatar-placeholder">{initials(f.name)}</span>
                )}
                <div className="friend-card-name">{f.name}</div>
                {f.nickname && <div className="friend-card-nickname text-muted">{f.nickname}</div>}
              </div>
            ))}
          </div>
        )}
      </Widget>

      {openFriend && (
        <FriendDetailDialog
          friend={openFriend}
          onEdit={() => {
            setEditingFriendId(openFriend.id);
            setOpenFriendId(null);
          }}
          onClose={() => setOpenFriendId(null)}
        />
      )}

      {editingFriendId !== null && (
        <FriendDialog
          friend={editingFriend}
          onSave={(input) => {
            if (editingFriend) updateFriend(editingFriend.id, input);
            else addFriend(input);
          }}
          onClose={() => setEditingFriendId(null)}
        />
      )}
    </div>
  );
}
