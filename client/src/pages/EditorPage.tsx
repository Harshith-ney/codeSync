import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Editor from '../components/Editor/Editor';

interface Room {
  id: string;
  name: string;
  language: string;
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<Room>(`/rooms/${id}`).then(setRoom).catch(() => navigate('/'));
  }, [id]);

  if (!room) return <div style={{ padding: 24, color: '#858585' }}>Loading room…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={styles.header}>
        <button style={styles.back} onClick={() => navigate('/')}>← Rooms</button>
        <span style={styles.name}>{room.name}</span>
        <span style={styles.lang}>{room.language}</span>
        <button
          style={styles.share}
          onClick={() => { navigator.clipboard.writeText(window.location.href); }}
        >
          Copy invite link
        </button>
      </header>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Editor roomId={room.id} language={room.language} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#252526', borderBottom: '1px solid #3c3c3c' },
  back: { background: 'none', border: 'none', color: '#569cd6', cursor: 'pointer', fontSize: 13 },
  name: { fontWeight: 600, fontSize: 15 },
  lang: { fontSize: 12, color: '#858585', background: '#1e1e1e', padding: '2px 8px', borderRadius: 10 },
  share: { marginLeft: 'auto', padding: '4px 12px', borderRadius: 4, border: '1px solid #3c3c3c', background: 'none', color: '#d4d4d4', fontSize: 12, cursor: 'pointer' },
};
