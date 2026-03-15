import type * as Monaco from 'monaco-editor';

interface Cursor {
  userId: string;
  username: string;
  position: number;
}

interface Props {
  cursors: Cursor[];
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
}

// Simple color palette for collaborators
const COLORS = ['#f97316', '#22c55e', '#a78bfa', '#ec4899', '#14b8a6', '#f59e0b'];

function colorFor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Presence({ cursors, editorRef }: Props) {
  if (!cursors.length) return null;

  return (
    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, pointerEvents: 'none', zIndex: 10 }}>
      {cursors.map((c) => (
        <div
          key={c.userId}
          style={{
            background: colorFor(c.userId),
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {c.username}
        </div>
      ))}
    </div>
  );
}
