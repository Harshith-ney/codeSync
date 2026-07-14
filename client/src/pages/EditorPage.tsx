import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Editor from '../components/Editor/Editor';
import { applyHistoryOperation } from '../lib/history';

interface Room {
  id: string;
  name: string;
  language: string;
  access_mode: 'public' | 'invite';
  default_role: 'editor' | 'viewer';
  current_user_role: 'owner' | 'editor' | 'viewer';
  invite_token?: string;
}

interface HistoryOperation {
  id: number;
  type: 'insert' | 'delete';
  position: number;
  content?: string | null;
  length?: number | null;
  revision: number;
  created_at: string;
  username: string;
}

interface RoomNotes {
  content: string;
  updated_at: string | null;
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const [shareUrl, setShareUrl] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryOperation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previewRevision, setPreviewRevision] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesUpdatedAt, setNotesUpdatedAt] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesStatus, setNotesStatus] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    const inviteToken = new URLSearchParams(window.location.search).get('invite');
    const joinPromise = inviteToken
      ? api.post<{ role: string }>(`/rooms/${id}/join`, { inviteToken }).catch((err: Error) => {
          throw new Error(err.message || 'Invalid invite link.');
        })
      : Promise.resolve();

    joinPromise
      .then(() => api.get<Room>(`/rooms/${id}`))
      .then((data) => {
        if (cancelled) return;
        setRoom(data);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load room.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (copied === 'idle') return;
    const timer = window.setTimeout(() => setCopied('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopyInvite() {
    if (!room) return;
    const url = new URL(window.location.href);
    if (room.invite_token) url.searchParams.set('invite', room.invite_token);
    const text = url.toString();
    setShareUrl(text);

    try {
      await copyText(text);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  }

  async function updateRoomSettings(patch: Partial<Pick<Room, 'language' | 'access_mode' | 'default_role'>>) {
    if (!room) return;
    try {
      const updated = await api.patch<Room>(`/rooms/${room.id}`, {
        language: patch.language,
        accessMode: patch.access_mode,
        defaultRole: patch.default_role,
      });
      setRoom(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to update room settings.');
    }
  }

  async function loadHistory() {
    if (!room) return;
    setHistoryOpen((open) => !open);
    setNotesOpen(false);
    if (history.length > 0) return;
    setHistoryLoading(true);
    try {
      setHistory(await api.get<HistoryOperation[]>(`/rooms/${room.id}/history`));
    } catch (err: any) {
      setError(err.message || 'Failed to load history.');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadNotes() {
    if (!room) return;
    setNotesOpen((open) => !open);
    setHistoryOpen(false);
    if (notes || notesUpdatedAt || notesLoading) return;
    setNotesLoading(true);
    setNotesStatus('');
    try {
      const data = await api.get<RoomNotes>(`/rooms/${room.id}/notes`);
      setNotes(data.content || '');
      setNotesUpdatedAt(data.updated_at);
    } catch (err: any) {
      setNotesStatus(err.message || 'Failed to load notes.');
    } finally {
      setNotesLoading(false);
    }
  }

  async function saveNotes() {
    if (!room || readOnly) return;
    setNotesSaving(true);
    setNotesStatus('');
    try {
      const data = await api.patch<RoomNotes>(`/rooms/${room.id}/notes`, { content: notes });
      setNotesUpdatedAt(data.updated_at);
      setNotesStatus('Saved');
    } catch (err: any) {
      setNotesStatus(err.message || 'Failed to save notes.');
    } finally {
      setNotesSaving(false);
    }
  }

  const historyPreview = buildHistoryPreview(history, previewRevision);
  const isOwner = room?.current_user_role === 'owner';
  const readOnly = room?.current_user_role === 'viewer';

  if (loading) return <div style={{ padding: 24, color: '#858585' }}>Loading room…</div>;

  if (error || !room) {
    return (
      <div style={styles.statusPage}>
        <div style={styles.statusCard}>
          <h2 style={{ marginBottom: 10 }}>Room unavailable</h2>
          <p style={styles.statusCopy}>{error || 'This room could not be loaded.'}</p>
          <button style={styles.retry} onClick={() => navigate('/')}>Back to rooms</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' }}>
      <header style={styles.header}>
        <button style={styles.back} onClick={() => navigate('/')}>← Rooms</button>
        <span style={styles.name}>{room.name}</span>
        <span style={styles.lang}>{room.language}</span>
        <span style={styles.role}>{room.current_user_role}</span>
        <button style={styles.headerBtn} onClick={loadNotes}>Notes</button>
        <button style={styles.headerBtn} onClick={loadHistory}>History</button>
        {isOwner && <button style={styles.headerBtn} onClick={() => setSettingsOpen((open) => !open)}>Sharing</button>}
        <button
          style={styles.share}
          onClick={handleCopyInvite}
        >
          {copied === 'done' ? 'Invite copied' : copied === 'failed' ? 'Link shown below' : 'Copy invite link'}
        </button>
      </header>
      {copied === 'failed' && shareUrl && (
        <div style={styles.copyFallback}>
          <input
            style={styles.copyInput}
            value={shareUrl}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </div>
      )}
      {settingsOpen && isOwner && (
        <div style={styles.settingsBar}>
          <label style={styles.label}>
            Language
            <select style={styles.select} value={room.language} onChange={(e) => updateRoomSettings({ language: e.target.value })}>
              {['javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'go', 'rust'].map((language) => (
                <option key={language} value={language}>{language}</option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Access
            <select style={styles.select} value={room.access_mode} onChange={(e) => updateRoomSettings({ access_mode: e.target.value as 'public' | 'invite' })}>
              <option value="public">Public link</option>
              <option value="invite">Invite only</option>
            </select>
          </label>
          <label style={styles.label}>
            Default role
            <select style={styles.select} value={room.default_role} onChange={(e) => updateRoomSettings({ default_role: e.target.value as 'editor' | 'viewer' })}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Editor roomId={room.id} language={room.language} readOnly={readOnly} />
      </div>
      {historyOpen && (
        <aside style={styles.historyPanel}>
          <div style={styles.historyHeader}>
            <strong>Version history</strong>
            <button style={styles.back} onClick={() => setHistoryOpen(false)}>Close</button>
          </div>
          {historyLoading && <p style={styles.statusCopy}>Loading history…</p>}
          {!historyLoading && history.length === 0 && <p style={styles.statusCopy}>No persisted edits yet.</p>}
          {!historyLoading && history.length > 0 && (
            <div style={styles.historyBody}>
              <div style={styles.historyList}>
                {history.map((op) => (
                  <button
                    key={op.id}
                    style={previewRevision === op.revision ? styles.historyItemActive : styles.historyItem}
                    onClick={() => setPreviewRevision(op.revision)}
                  >
                    r{op.revision} · {op.username} · {op.type}
                  </button>
                ))}
              </div>
              <pre style={styles.historyPreview}>{historyPreview}</pre>
            </div>
          )}
        </aside>
      )}
      {notesOpen && (
        <aside style={styles.notesPanel}>
          <div style={styles.historyHeader}>
            <strong>Room notes</strong>
            <button style={styles.back} onClick={() => setNotesOpen(false)}>Close</button>
          </div>
          <div style={styles.notesToolbar}>
            <span style={styles.noteMeta}>
              {notesUpdatedAt ? `Updated ${new Date(notesUpdatedAt).toLocaleString()}` : 'No notes saved yet'}
            </span>
            {!readOnly && (
              <button style={styles.headerBtn} onClick={saveNotes} disabled={notesSaving}>
                {notesSaving ? 'Saving...' : 'Save notes'}
              </button>
            )}
          </div>
          {notesLoading ? (
            <p style={styles.statusCopy}>Loading notes...</p>
          ) : (
            <textarea
              style={styles.notesArea}
              value={notes}
              readOnly={readOnly}
              placeholder="Capture room goals, ideas, TODOs, interview notes, or problem-solving context here."
              onChange={(event) => setNotes(event.target.value)}
            />
          )}
          {notesStatus && <div style={styles.notesStatus}>{notesStatus}</div>}
        </aside>
      )}
    </div>
  );
}

function buildHistoryPreview(history: HistoryOperation[], revision: number | null) {
  const maxRevision = revision ?? history[history.length - 1]?.revision ?? 0;
  return history
    .filter((op) => op.revision <= maxRevision)
    .reduce((content, op) => applyHistoryOperation(content, {
      type: op.type,
      position: op.position,
      content: op.content || undefined,
      length: op.length || undefined,
    }), '');
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy copy path below.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) throw new Error('Legacy copy failed');
  } finally {
    document.body.removeChild(textarea);
  }
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#252526', borderBottom: '1px solid #3c3c3c' },
  back: { background: 'none', border: 'none', color: '#569cd6', cursor: 'pointer', fontSize: 13 },
  name: { fontWeight: 600, fontSize: 15 },
  lang: { fontSize: 12, color: '#858585', background: '#1e1e1e', padding: '2px 8px', borderRadius: 10 },
  role: { fontSize: 12, color: '#dbeafe', background: '#1b3a57', padding: '2px 8px', borderRadius: 10 },
  headerBtn: { padding: '4px 10px', borderRadius: 4, border: '1px solid #3c3c3c', background: '#1e1e1e', color: '#d4d4d4', fontSize: 12, cursor: 'pointer' },
  share: { marginLeft: 'auto', padding: '4px 12px', borderRadius: 4, border: '1px solid #3c3c3c', background: 'none', color: '#d4d4d4', fontSize: 12, cursor: 'pointer' },
  copyFallback: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#4b3714', borderBottom: '1px solid #7c5c20', color: '#fff4cf', fontSize: 12 },
  copyInput: { flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 4, border: '1px solid #7c5c20', background: '#1e1e1e', color: '#fff4cf', fontSize: 12 },
  settingsBar: { display: 'flex', gap: 14, alignItems: 'center', padding: '10px 16px', background: '#1f2937', borderBottom: '1px solid #374151' },
  label: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#cbd5e1' },
  select: { padding: '5px 8px', borderRadius: 4, border: '1px solid #3c3c3c', background: '#111827', color: '#d4d4d4', fontSize: 12 },
  historyPanel: { position: 'absolute', right: 0, top: 49, bottom: 0, width: 'min(520px, 48vw)', background: '#111827', borderLeft: '1px solid #334155', boxShadow: '-10px 0 24px rgba(0,0,0,.3)', zIndex: 5, display: 'flex', flexDirection: 'column' },
  notesPanel: { position: 'absolute', right: 0, top: 49, bottom: 0, width: 'min(560px, 50vw)', background: '#111827', borderLeft: '1px solid #334155', boxShadow: '-10px 0 24px rgba(0,0,0,.3)', zIndex: 6, display: 'flex', flexDirection: 'column' },
  historyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottom: '1px solid #334155' },
  historyBody: { display: 'grid', gridTemplateColumns: '170px 1fr', minHeight: 0, flex: 1 },
  historyList: { overflowY: 'auto', borderRight: '1px solid #334155', padding: 8 },
  historyItem: { display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, padding: '7px 8px', borderRadius: 4, border: '1px solid #334155', background: '#172033', color: '#cbd5e1', cursor: 'pointer', fontSize: 12 },
  historyItemActive: { display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, padding: '7px 8px', borderRadius: 4, border: '1px solid #0e639c', background: '#1b3a57', color: '#fff', cursor: 'pointer', fontSize: 12 },
  historyPreview: { margin: 0, padding: 14, overflow: 'auto', color: '#d4d4d4', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  notesToolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #334155' },
  noteMeta: { fontSize: 12, color: '#94a3b8' },
  notesArea: { flex: 1, minHeight: 0, resize: 'none', border: 'none', outline: 'none', padding: 16, background: '#0f172a', color: '#d4d4d4', fontSize: 14, lineHeight: 1.6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  notesStatus: { padding: '8px 14px', borderTop: '1px solid #334155', color: '#cbd5e1', fontSize: 12 },
  statusPage: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#1e1e1e' },
  statusCard: { width: 'min(440px, 100%)', padding: 24, borderRadius: 12, background: '#252526', border: '1px solid #3c3c3c' },
  statusCopy: { color: '#b9c0c8', marginBottom: 16, lineHeight: 1.5 },
  retry: { padding: '8px 16px', borderRadius: 999, border: 'none', background: '#0e639c', color: '#fff', cursor: 'pointer' },
};
