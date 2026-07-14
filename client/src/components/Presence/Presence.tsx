import { useEffect, useRef } from 'react';
import type * as Monaco from 'monaco-editor';

interface Cursor {
  userId: string;
  username: string;
  position: number;
  selection?: { start: number; end: number };
}

interface Props {
  cursors: Cursor[];
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  monaco: typeof Monaco | null;
}

// Simple color palette for collaborators
const COLORS = ['#f97316', '#22c55e', '#a78bfa', '#ec4899', '#14b8a6', '#f59e0b'];

function colorIndexFor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % COLORS.length;
}

function colorFor(userId: string) {
  return COLORS[colorIndexFor(userId)];
}

export default function Presence({ cursors, editorRef, monaco }: Props) {
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !monaco) return;

    if (!decorationsRef.current) {
      decorationsRef.current = editor.createDecorationsCollection();
    }

    const decorations = cursors.flatMap((cursor): Monaco.editor.IModelDeltaDecoration[] => {
      const colorIndex = colorIndexFor(cursor.userId);
      const safePosition = Math.max(0, Math.min(cursor.position, model.getValueLength()));
      const position = model.getPositionAt(safePosition);
      const userLabel = cursor.username || 'Collaborator';
      const cursorDecoration: Monaco.editor.IModelDeltaDecoration = {
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        options: {
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          after: {
            content: ` ${userLabel}`,
            inlineClassName: `remote-cursor-label remote-cursor-color-${colorIndex}`,
            cursorStops: monaco.editor.InjectedTextCursorStops.None,
          },
        },
      };

      if (!cursor.selection || cursor.selection.start === cursor.selection.end) {
        return [cursorDecoration];
      }

      const start = Math.max(0, Math.min(cursor.selection.start, model.getValueLength()));
      const end = Math.max(0, Math.min(cursor.selection.end, model.getValueLength()));
      const startPosition = model.getPositionAt(Math.min(start, end));
      const endPosition = model.getPositionAt(Math.max(start, end));
      const selectionDecoration: Monaco.editor.IModelDeltaDecoration = {
        range: new monaco.Range(
          startPosition.lineNumber,
          startPosition.column,
          endPosition.lineNumber,
          endPosition.column,
        ),
        options: {
          className: `remote-selection remote-selection-color-${colorIndex}`,
          hoverMessage: { value: `${userLabel}'s selection` },
        },
      };

      return [selectionDecoration, cursorDecoration];
    });

    decorationsRef.current.set(decorations);

    return () => {
      decorationsRef.current?.clear();
    };
  }, [cursors, editorRef, monaco]);

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
