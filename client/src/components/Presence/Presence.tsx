import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor';

interface Cursor {
  userId: string;
  username: string;
  position: number;
  selection?: { start: number; end: number };
  typing?: boolean;
}

interface Props {
  cursors: Cursor[];
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  monaco: typeof Monaco | null;
}

// Simple color palette for collaborators
const COLORS = ['#f97316', '#22c55e', '#a78bfa', '#ec4899', '#14b8a6', '#f59e0b'];

interface CursorOverlay {
  userId: string;
  username: string;
  typing: boolean | undefined;
  color: string;
  top: number;
  left: number;
  height: number;
}

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
  const [overlays, setOverlays] = useState<CursorOverlay[]>([]);

  const updateOverlays = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      setOverlays([]);
      return;
    }

    const next = cursors
      .map((cursor) => {
        const safePosition = Math.max(0, Math.min(cursor.position, model.getValueLength()));
        const position = model.getPositionAt(safePosition);
        const visible = editor.getScrolledVisiblePosition(position);
        if (!visible) return null;

        return {
          userId: cursor.userId,
          username: cursor.username || 'Collaborator',
          typing: cursor.typing,
          color: colorFor(cursor.userId),
          top: visible.top,
          left: visible.left,
          height: visible.height,
        };
      })
      .filter((overlay): overlay is CursorOverlay => overlay !== null);

    setOverlays(next);
  }, [cursors, editorRef]);

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
          className: `remote-cursor-position remote-cursor-border-${colorIndex}`,
          hoverMessage: { value: cursor.typing ? `${userLabel} is typing` : `${userLabel}'s cursor` },
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

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    updateOverlays();
    const disposables = [
      editor.onDidScrollChange(updateOverlays),
      editor.onDidLayoutChange(updateOverlays),
      editor.onDidChangeModelContent(updateOverlays),
      editor.onDidChangeCursorPosition(updateOverlays),
    ];

    return () => {
      disposables.forEach((disposable) => disposable.dispose());
    };
  }, [editorRef, updateOverlays]);

  if (!cursors.length) return null;

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20, overflow: 'hidden' }}>
        {overlays.map((cursor) => (
          <div
            key={cursor.userId}
            style={{
              position: 'absolute',
              top: cursor.top,
              left: cursor.left,
              height: cursor.height,
              borderLeft: `2px solid ${cursor.color}`,
              transform: 'translateX(-1px)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -22,
                left: 0,
                background: cursor.color,
                color: '#fff',
                padding: '2px 7px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                lineHeight: '16px',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,.3)',
              }}
            >
              {cursor.typing ? `${cursor.username} typing` : cursor.username}
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, pointerEvents: 'none', zIndex: 21 }}>
        {cursors.map((c) => (
          <div
            key={c.userId}
            style={{
              background: colorFor(c.userId),
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              boxShadow: c.typing ? '0 0 0 2px rgba(255,255,255,.18)' : undefined,
            }}
          >
            {c.typing ? `${c.username} typing` : c.username}
          </div>
        ))}
      </div>
    </>
  );
}
