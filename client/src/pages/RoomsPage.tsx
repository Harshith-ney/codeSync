import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { clearSession } from '../lib/auth';

interface Room {
  id: string;
  name: string;
  language: string;
  owner_name: string;
  access_mode: 'public' | 'invite';
  default_role: 'editor' | 'viewer';
  current_user_role: 'owner' | 'editor' | 'viewer';
  created_at: string;
}

export default function RoomsPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newName, setNewName] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [accessMode, setAccessMode] = useState<'public' | 'invite'>('public');
  const [defaultRole, setDefaultRole] = useState<'editor' | 'viewer'>('editor');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api.get<Room[]>('/rooms')
      .then((data) => {
        if (cancelled) return;
        setRooms(data);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load rooms.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function createRoom(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const room = await api.post<Room>('/rooms', { name: newName, language, accessMode, defaultRole });
      setNewName('');
      navigate(`/room/${room.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create room.');
    } finally {
      setCreating(false);
    }
  }

  function logout() {
    clearSession();
    navigate('/login');
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>CodeSync</h1>
        <button style={styles.logout} onClick={logout}>Log out</button>
      </header>

      <form style={styles.form} onSubmit={createRoom}>
        <input
          style={styles.input}
          placeholder="New room name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
        />
        <select style={styles.select} value={language} onChange={(e) => setLanguage(e.target.value)}>
          {['javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'go', 'rust'].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select style={styles.select} value={accessMode} onChange={(e) => setAccessMode(e.target.value as 'public' | 'invite')}>
          <option value="public">Public link</option>
          <option value="invite">Invite only</option>
        </select>
        <select style={styles.select} value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as 'editor' | 'viewer')}>
          <option value="editor">Editors</option>
          <option value="viewer">Viewers</option>
        </select>
        <button style={styles.button} type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create room'}
        </button>
      </form>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.list}>
        {loading && <p style={styles.empty}>Loading rooms…</p>}
        {!loading && rooms.length === 0 && <p style={styles.empty}>No rooms yet. Create one above.</p>}
        {rooms.map((room) => (
          <div key={room.id} style={styles.card} onClick={() => navigate(`/room/${room.id}`)}>
            <div style={styles.roomName}>{room.name}</div>
            <div style={styles.meta}>
              {room.language} · {room.owner_name} · {room.access_mode === 'invite' ? 'invite-only' : 'public'} · {room.current_user_role}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#1e1e1e', padding: 24 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { color: '#569cd6', fontSize: 24, fontWeight: 700 },
  logout: { background: 'none', border: '1px solid #3c3c3c', color: '#d4d4d4', padding: '6px 12px', borderRadius: 4, cursor: 'pointer' },
  form: { display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  input: { flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid #3c3c3c', background: '#252526', color: '#d4d4d4', fontSize: 14 },
  select: { padding: '8px 12px', borderRadius: 4, border: '1px solid #3c3c3c', background: '#252526', color: '#d4d4d4', fontSize: 14 },
  button: { padding: '8px 16px', borderRadius: 4, border: 'none', background: '#0e639c', color: '#fff', fontSize: 14, cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: { padding: 16, background: '#252526', borderRadius: 6, cursor: 'pointer', border: '1px solid #3c3c3c' },
  roomName: { fontSize: 16, fontWeight: 600, color: '#d4d4d4', marginBottom: 4 },
  meta: { fontSize: 12, color: '#858585' },
  empty: { color: '#858585', fontSize: 14 },
  error: { color: '#f44747', fontSize: 13, marginBottom: 12 },
};
