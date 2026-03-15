import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface Room {
  id: string;
  name: string;
  language: string;
  owner_name: string;
  created_at: string;
}

export default function RoomsPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newName, setNewName] = useState('');
  const [language, setLanguage] = useState('javascript');

  useEffect(() => {
    api.get<Room[]>('/rooms').then(setRooms).catch(console.error);
  }, []);

  async function createRoom(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const room = await api.post<Room>('/rooms', { name: newName, language });
    setNewName('');
    navigate(`/room/${room.id}`);
  }

  function logout() {
    localStorage.clear();
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
          {['javascript', 'typescript', 'python', 'java', 'cpp', 'go', 'rust'].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <button style={styles.button} type="submit">Create room</button>
      </form>

      <div style={styles.list}>
        {rooms.length === 0 && <p style={styles.empty}>No rooms yet. Create one above.</p>}
        {rooms.map((room) => (
          <div key={room.id} style={styles.card} onClick={() => navigate(`/room/${room.id}`)}>
            <div style={styles.roomName}>{room.name}</div>
            <div style={styles.meta}>{room.language} · {room.owner_name}</div>
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
  form: { display: 'flex', gap: 8, marginBottom: 24 },
  input: { flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid #3c3c3c', background: '#252526', color: '#d4d4d4', fontSize: 14 },
  select: { padding: '8px 12px', borderRadius: 4, border: '1px solid #3c3c3c', background: '#252526', color: '#d4d4d4', fontSize: 14 },
  button: { padding: '8px 16px', borderRadius: 4, border: 'none', background: '#0e639c', color: '#fff', fontSize: 14, cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: { padding: 16, background: '#252526', borderRadius: 6, cursor: 'pointer', border: '1px solid #3c3c3c' },
  roomName: { fontSize: 16, fontWeight: 600, color: '#d4d4d4', marginBottom: 4 },
  meta: { fontSize: 12, color: '#858585' },
  empty: { color: '#858585', fontSize: 14 },
};
