import { useRef, useCallback } from 'react';
import type * as Monaco from 'monaco-editor';
import { Operation } from '../lib/ot';

interface UseEditorOptions {
  revision: number;
  userId: string;
  roomId: string;
  onOperation: (op: Operation) => void;
}

export function useEditor({ revision, userId, roomId, onOperation }: UseEditorOptions) {
  const revisionRef = useRef(revision);
  revisionRef.current = revision;

  // Called by Monaco's onDidChangeModelContent
  const handleChange = useCallback(
    (event: Monaco.editor.IModelContentChangedEvent) => {
      for (const change of event.changes) {
        const op: Operation =
          change.text.length > 0
            ? {
                type: 'insert',
                position: change.rangeOffset,
                content: change.text,
                revision: revisionRef.current,
                userId,
                roomId,
              }
            : {
                type: 'delete',
                position: change.rangeOffset,
                length: change.rangeLength,
                revision: revisionRef.current,
                userId,
                roomId,
              };

        onOperation(op);
      }
    },
    [userId, roomId, onOperation],
  );

  // Apply a remote operation to the Monaco model without triggering another emit
  const applyRemoteOperation = useCallback(
    (op: Operation, editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!model) return;

      const startPos = model.getPositionAt(op.position);

      if (op.type === 'insert' && op.content) {
        const endPos = startPos;
        model.applyEdits([{
          range: { startLineNumber: startPos.lineNumber, startColumn: startPos.column, endLineNumber: endPos.lineNumber, endColumn: endPos.column },
          text: op.content,
          forceMoveMarkers: true,
        }]);
      } else if (op.type === 'delete' && op.length) {
        const endPos = model.getPositionAt(op.position + op.length);
        model.applyEdits([{
          range: { startLineNumber: startPos.lineNumber, startColumn: startPos.column, endLineNumber: endPos.lineNumber, endColumn: endPos.column },
          text: '',
          forceMoveMarkers: true,
        }]);
      }
    },
    [],
  );

  return { handleChange, applyRemoteOperation };
}
