import { useRef, useState, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useSocket } from '../../hooks/useSocket';
import { useEditor } from '../../hooks/useEditor';
import { Operation } from '../../lib/ot';
import Presence from '../Presence/Presence';
import Output from '../Output/Output';

interface Props {
  roomId: string;
  language: string;
}

export default function Editor({ roomId, language }: Props) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const userId = localStorage.getItem('userId') || 'anonymous';
  const [revision, setRevision] = useState(0);
  const suppressRef = useRef(false);

  const [cursors, setCursors] = useState<Array<{ userId: string; username: string; position: number }>>([]);
  const [output, setOutput] = useState<string | null>(null);

  const handleRemoteOp = useCallback((op: Operation) => {
    suppressRef.current = true;
    applyRemoteOperation(op, editorRef);
    setRevision(op.revision);
    suppressRef.current = false;
  }, []);

  const { sendOperation, sendCursor } = useSocket({
    roomId,
    onOperation: handleRemoteOp,
    onRoomState: ({ content, revision: rev }) => {
      editorRef.current?.getModel()?.setValue(content);
      setRevision(rev);
    },
    onCursorUpdate: (cursor) => {
      setCursors((prev) => {
        const filtered = prev.filter((c) => c.userId !== cursor.userId);
        return [...filtered, cursor];
      });
    },
    onUserJoined: () => {},
    onUserLeft: ({ userId: uid }) => {
      setCursors((prev) => prev.filter((c) => c.userId !== uid));
    },
  });

  const handleLocalOp = useCallback((op: Operation) => {
    if (suppressRef.current) return;
    sendOperation(op);
    setRevision((r) => r + 1);
  }, [sendOperation]);

  const { handleChange, applyRemoteOperation } = useEditor({
    revision,
    userId,
    roomId,
    onOperation: handleLocalOp,
  });

  function onMount(editor: Monaco.editor.IStandaloneCodeEditor) {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e) => {
      const model = editor.getModel();
      if (!model) return;
      const offset = model.getOffsetAt(e.position);
      sendCursor(offset);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <MonacoEditor
            height="100%"
            language={language}
            theme="vs-dark"
            onMount={onMount}
            onChange={() => {}}
            onValidate={() => {}}
            options={{ fontSize: 14, minimap: { enabled: false }, wordWrap: 'on' }}
            // Use the model's change event instead of the onChange prop
            // to get the raw Monaco event with range offsets
          />
          <Presence cursors={cursors.filter((c) => c.userId !== userId)} editorRef={editorRef} />
        </div>
        {output !== null && <Output output={output} onClose={() => setOutput(null)} />}
      </div>
      <Toolbar language={language} editorRef={editorRef} onOutput={setOutput} />
    </div>
  );
}

function Toolbar({
  language,
  editorRef,
  onOutput,
}: {
  language: string;
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  onOutput: (s: string) => void;
}) {
  const [running, setRunning] = useState(false);

  async function run() {
    const code = editorRef.current?.getModel()?.getValue() || '';
    setRunning(true);
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({ code, language }),
      });
      const data = await res.json() as { stdout: string; stderr: string; status: string };
      onOutput(data.stdout || data.stderr || data.status);
    } catch {
      onOutput('Execution error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={toolbarStyle}>
      <button style={runBtn} onClick={run} disabled={running}>
        {running ? 'Running…' : '▶ Run'}
      </button>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '6px 12px',
  background: '#252526', borderTop: '1px solid #3c3c3c',
};
const runBtn: React.CSSProperties = {
  padding: '4px 14px', borderRadius: 4, border: 'none',
  background: '#0e639c', color: '#fff', fontSize: 13, cursor: 'pointer',
};
