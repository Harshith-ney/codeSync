import { useRef, useState, useCallback, useEffect } from 'react';
import MonacoEditor, { useMonaco } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import * as Y from 'yjs';
import { useSocket } from '../../hooks/useSocket';
import { api } from '../../lib/api';
import { LANGUAGE_TEMPLATES } from '../../lib/templates';
import { getUserId } from '../../lib/auth';
import Presence from '../Presence/Presence';
import Output from '../Output/Output';

interface Props {
  roomId: string;
  language: string;
  readOnly?: boolean;
}

type EditorTheme = 'vs-dark' | 'light' | 'hc-black';
type WordWrapMode = 'on' | 'off';

interface EditorPreferences {
  theme: EditorTheme;
  wordWrap: WordWrapMode;
  minimap: boolean;
  fontSize: number;
}

const PREF_KEY = 'codesync:editor-preferences';
const DEFAULT_PREFS: EditorPreferences = {
  theme: 'vs-dark',
  wordWrap: 'on',
  minimap: false,
  fontSize: 14,
};

function loadEditorPreferences(): EditorPreferences {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function Editor({ roomId, language, readOnly = false }: Props) {
  const monaco = useMonaco();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const changeSubscriptionRef = useRef<Monaco.IDisposable | null>(null);
  const ydocRef = useRef(new Y.Doc());
  const ytextRef = useRef<Y.Text>(ydocRef.current.getText('monaco'));
  const sendYjsUpdateRef = useRef<(update: number[]) => void>(() => {});
  const pendingInitialStateRef = useRef<{ content: string; revision: number } | null>(null);
  const userId = getUserId() || 'anonymous';
  const [revision, setRevision] = useState(0);
  const applyingYjsRef = useRef(false);

  const [cursors, setCursors] = useState<Array<{ userId: string; username: string; position: number; selection?: { start: number; end: number } }>>([]);
  const [output, setOutput] = useState<{ title: string; body: string } | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<EditorPreferences>(() => loadEditorPreferences());

  const syncModelFromYjs = useCallback(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    const value = ytextRef.current.toString();
    if (model.getValue() === value) return;
    applyingYjsRef.current = true;
    model.setValue(value);
    applyingYjsRef.current = false;
  }, []);

  const { sendCursor, sendYjsUpdate } = useSocket({
    roomId,
    onOperation: () => {},
    onRoomState: ({ content, revision: rev }) => {
      const value = content ?? LANGUAGE_TEMPLATES[language] ?? '';
      pendingInitialStateRef.current = { content: value, revision: rev };

      const model = editorRef.current?.getModel();
      if (!model) return;

      applyingYjsRef.current = true;
      if (model.getValue() !== value) {
        model.setValue(value);
      }
      setRevision(rev);
      applyingYjsRef.current = false;
      setConnectionError(null);
    },
    onYjsSync: (update) => {
      Y.applyUpdate(ydocRef.current, new Uint8Array(update), 'remote-sync');
      syncModelFromYjs();
    },
    onYjsUpdate: (update) => {
      Y.applyUpdate(ydocRef.current, new Uint8Array(update), 'remote-update');
      syncModelFromYjs();
      setRevision((rev) => rev + 1);
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
    onOperationError: setOperationError,
    onConnectionError: setConnectionError,
  });
  sendYjsUpdateRef.current = sendYjsUpdate;

  function onMount(editor: Monaco.editor.IStandaloneCodeEditor) {
    editorRef.current = editor;

    const pendingState = pendingInitialStateRef.current;
    if (pendingState) {
      const model = editor.getModel();
      if (model && model.getValue() !== pendingState.content) {
        applyingYjsRef.current = true;
        model.setValue(pendingState.content);
        applyingYjsRef.current = false;
      }
      setRevision(pendingState.revision);
      setConnectionError(null);
    }

    editor.onDidChangeCursorPosition((e) => {
      const model = editor.getModel();
      if (!model) return;
      const offset = model.getOffsetAt(e.position);
      sendCursor(offset);
    });

    editor.onDidChangeCursorSelection((e) => {
      const model = editor.getModel();
      if (!model) return;
      const position = model.getOffsetAt(e.selection.getPosition());
      const start = model.getOffsetAt(e.selection.getStartPosition());
      const end = model.getOffsetAt(e.selection.getEndPosition());
      sendCursor(position, start === end ? undefined : { start, end });
    });
  }

  useEffect(() => {
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin !== 'local-monaco') return;
      sendYjsUpdateRef.current(Array.from(update));
      setRevision((rev) => rev + 1);
    };

    ydocRef.current.on('update', updateHandler);

    return () => {
      ydocRef.current.off('update', updateHandler);
    };
  }, []);

  useEffect(() => {
    const observer = () => syncModelFromYjs();
    ytextRef.current.observe(observer);

    return () => {
      ytextRef.current.unobserve(observer);
    };
  }, [syncModelFromYjs]);

  useEffect(() => {
    if (!operationError) return;
    const timer = window.setTimeout(() => setOperationError(null), 2400);
    return () => window.clearTimeout(timer);
  }, [operationError]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco?.editor.setModelLanguage(model, language);
  }, [language, monaco]);

  useEffect(() => {
    localStorage.setItem(PREF_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    changeSubscriptionRef.current?.dispose();
    if (editorRef.current && !readOnly) {
      changeSubscriptionRef.current = editorRef.current.onDidChangeModelContent((event) => {
        if (applyingYjsRef.current) return;
        const changes = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
        ydocRef.current.transact(() => {
          for (const change of changes) {
            if (change.rangeLength > 0) {
              ytextRef.current.delete(change.rangeOffset, change.rangeLength);
            }
            if (change.text.length > 0) {
              ytextRef.current.insert(change.rangeOffset, change.text);
            }
          }
        }, 'local-monaco');
      });
    }

    return () => {
      changeSubscriptionRef.current?.dispose();
    };
  }, [readOnly]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {connectionError && (
        <div style={connectionErrorStyle}>
          {connectionError}
        </div>
      )}
      {readOnly && (
        <div style={readOnlyStyle}>
          Read-only view
        </div>
      )}
      {operationError && (
        <div style={operationErrorStyle}>
          {operationError}
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <MonacoEditor
            height="100%"
            language={language}
            theme={preferences.theme}
            onMount={onMount}
            onChange={() => {}}
            onValidate={() => {}}
            options={{
              fontSize: preferences.fontSize,
              minimap: { enabled: preferences.minimap },
              wordWrap: preferences.wordWrap,
              readOnly,
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
            }}
            // Use the model's change event instead of the onChange prop
            // to get the raw Monaco event with range offsets
          />
          <Presence cursors={cursors.filter((c) => c.userId !== userId)} editorRef={editorRef} monaco={monaco} />
        </div>
        {output !== null && <Output title={output.title} output={output.body} onClose={() => setOutput(null)} />}
      </div>
      <Toolbar
        language={language}
        editorRef={editorRef}
        onOutput={setOutput}
        preferences={preferences}
        onPreferencesChange={setPreferences}
      />
    </div>
  );
}

function Toolbar({
  language,
  editorRef,
  onOutput,
  preferences,
  onPreferencesChange,
}: {
  language: string;
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  onOutput: (result: { title: string; body: string }) => void;
  preferences: EditorPreferences;
  onPreferencesChange: React.Dispatch<React.SetStateAction<EditorPreferences>>;
}) {
  const [running, setRunning] = useState(false);
  const [stdin, setStdin] = useState('');

  async function run() {
    const code = editorRef.current?.getModel()?.getValue() || '';
    onOutput({
      title: 'Running code…',
      body: 'Submitting your code to the execution service. This can take a few seconds.',
    });
    setRunning(true);
    try {
      const data = await api.post<{ stdout: string; stderr: string; status: string }>(
        '/execute',
        { code, language, stdin },
      );
      const outputText = [data.stdout, data.stderr].filter(Boolean).join('\n\n').trim() || '(no output)';
      onOutput({
        title: `Run result: ${data.status}`,
        body: outputText,
      });
    } catch (error: any) {
      onOutput({
        title: 'Execution failed',
        body: error?.message || 'Execution error',
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={toolbarStyle}>
      <div style={toolbarGroupStyle}>
        <button style={runBtn} onClick={run} disabled={running}>
          {running ? 'Running…' : '▶ Run'}
        </button>
        <textarea
          style={stdinStyle}
          placeholder="stdin"
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          rows={1}
        />
        <span style={statusText}>
          {running ? 'Execution in progress…' : 'Run code to open the output panel'}
        </span>
      </div>
      <div style={modeGroupStyle}>
        <label style={modeLabelStyle}>
          Theme
          <select
            style={modeSelectStyle}
            value={preferences.theme}
            onChange={(event) => onPreferencesChange((prev) => ({ ...prev, theme: event.target.value as EditorTheme }))}
          >
            <option value="vs-dark">Dark</option>
            <option value="light">Light</option>
            <option value="hc-black">High contrast</option>
          </select>
        </label>
        <button
          style={preferences.wordWrap === 'on' ? activeModeButtonStyle : modeButtonStyle}
          type="button"
          onClick={() => onPreferencesChange((prev) => ({ ...prev, wordWrap: prev.wordWrap === 'on' ? 'off' : 'on' }))}
        >
          Wrap
        </button>
        <button
          style={preferences.minimap ? activeModeButtonStyle : modeButtonStyle}
          type="button"
          onClick={() => onPreferencesChange((prev) => ({ ...prev, minimap: !prev.minimap }))}
        >
          Minimap
        </button>
        <button
          style={modeButtonStyle}
          type="button"
          onClick={() => onPreferencesChange((prev) => ({ ...prev, fontSize: Math.max(11, prev.fontSize - 1) }))}
        >
          A-
        </button>
        <span style={fontSizeStyle}>{preferences.fontSize}px</span>
        <button
          style={modeButtonStyle}
          type="button"
          onClick={() => onPreferencesChange((prev) => ({ ...prev, fontSize: Math.min(22, prev.fontSize + 1) }))}
        >
          A+
        </button>
      </div>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px',
  background: '#252526', borderTop: '1px solid #3c3c3c',
  gap: 10,
  flexWrap: 'wrap',
};
const toolbarGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 280,
  flex: '1 1 420px',
};
const modeGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flex: '0 1 auto',
  flexWrap: 'wrap',
};
const runBtn: React.CSSProperties = {
  padding: '4px 14px', borderRadius: 4, border: 'none',
  background: '#0e639c', color: '#fff', fontSize: 13, cursor: 'pointer',
};
const statusText: React.CSSProperties = {
  fontSize: 12,
  color: '#9aa4ad',
  whiteSpace: 'nowrap',
};
const stdinStyle: React.CSSProperties = {
  minWidth: 220,
  maxWidth: 420,
  flex: '0 1 32%',
  resize: 'vertical',
  padding: '5px 8px',
  borderRadius: 4,
  border: '1px solid #3c3c3c',
  background: '#1e1e1e',
  color: '#d4d4d4',
  fontSize: 12,
  fontFamily: 'monospace',
};
const modeLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 12,
  color: '#9aa4ad',
};
const modeSelectStyle: React.CSSProperties = {
  padding: '3px 6px',
  borderRadius: 4,
  border: '1px solid #3c3c3c',
  background: '#1e1e1e',
  color: '#d4d4d4',
  fontSize: 12,
};
const modeButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid #3c3c3c',
  background: '#1e1e1e',
  color: '#d4d4d4',
  fontSize: 12,
  cursor: 'pointer',
};
const activeModeButtonStyle: React.CSSProperties = {
  ...modeButtonStyle,
  borderColor: '#0e639c',
  background: '#0e639c',
  color: '#fff',
};
const fontSizeStyle: React.CSSProperties = {
  minWidth: 34,
  textAlign: 'center',
  color: '#b9c0c8',
  fontSize: 12,
};
const connectionErrorStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 13,
  color: '#ffdede',
  background: '#5c1e24',
  borderBottom: '1px solid #7b2b34',
};
const readOnlyStyle: React.CSSProperties = {
  padding: '7px 14px',
  fontSize: 12,
  color: '#dbeafe',
  background: '#1b3a57',
  borderBottom: '1px solid #2e5e88',
};
const operationErrorStyle: React.CSSProperties = {
  padding: '7px 14px',
  fontSize: 12,
  color: '#fff4cf',
  background: '#5a4216',
  borderBottom: '1px solid #856322',
};
