import { useRef, useState, useCallback, useEffect } from 'react';
import MonacoEditor, { useMonaco } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { useSocket } from '../../hooks/useSocket';
import { api } from '../../lib/api';
import { getUserId, getUsername } from '../../lib/auth';
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
  const ydocRef = useRef(new Y.Doc());
  const ytextRef = useRef<Y.Text>(ydocRef.current.getText('monaco'));
  const bindingRef = useRef<MonacoBinding | null>(null);
  const initialYjsSyncRef = useRef(false);
  const sendYjsUpdateRef = useRef<(update: number[]) => void>(() => {});
  const typingTimerRef = useRef<number | null>(null);
  const remoteTypingTimersRef = useRef<Record<string, number>>({});
  const localTypingRef = useRef(false);
  const userId = getUserId() || 'anonymous';
  const username = getUsername() || 'You';
  const [revision, setRevision] = useState(0);

  const [cursors, setCursors] = useState<Array<{ userId: string; username: string; position: number; selection?: { start: number; end: number }; typing?: boolean }>>([]);
  const [output, setOutput] = useState<{ title: string; body: string } | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<EditorPreferences>(() => loadEditorPreferences());

  const bindMonacoToYjs = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !initialYjsSyncRef.current || bindingRef.current) return;

    bindingRef.current = new MonacoBinding(
      ytextRef.current,
      model,
      new Set([editor]),
    );
  }, []);

  const upsertLocalCursor = useCallback((
    position: number,
    selection?: { start: number; end: number },
    typing = localTypingRef.current,
  ) => {
    setCursors((prev) => {
      const filtered = prev.filter((cursor) => cursor.userId !== userId);
      return [...filtered, { userId, username, position, selection, typing }];
    });
  }, [userId, username]);

  const { sendCursor, sendYjsUpdate } = useSocket({
    roomId,
    onRoomState: ({ revision: rev }) => {
      setRevision(rev);
      setConnectionError(null);
    },
    onCursors: setCursors,
    onYjsSync: (update) => {
      Y.applyUpdate(ydocRef.current, new Uint8Array(update), 'remote-sync');
      initialYjsSyncRef.current = true;
      bindMonacoToYjs();
    },
    onYjsUpdate: (update) => {
      Y.applyUpdate(ydocRef.current, new Uint8Array(update), 'remote-update');
      setRevision((rev) => rev + 1);
    },
    onCursorUpdate: (cursor) => {
      setCursors((prev) => {
        const filtered = prev.filter((c) => c.userId !== cursor.userId);
        const existing = prev.find((c) => c.userId === cursor.userId);
        return [...filtered, { ...cursor, typing: cursor.typing ?? existing?.typing }];
      });
    },
    onTypingUpdate: ({ userId: typingUserId, username, typing }) => {
      setCursors((prev) => {
        const existing = prev.find((c) => c.userId === typingUserId);
        if (!existing) {
          return [...prev, { userId: typingUserId, username, position: 0, typing }];
        }
        return prev.map((cursor) => (
          cursor.userId === typingUserId
            ? { ...cursor, username: username || cursor.username, typing }
            : cursor
        ));
      });

      if (remoteTypingTimersRef.current[typingUserId]) {
        window.clearTimeout(remoteTypingTimersRef.current[typingUserId]);
      }
      if (typing) {
        remoteTypingTimersRef.current[typingUserId] = window.setTimeout(() => {
          setCursors((prev) => prev.map((cursor) => (
            cursor.userId === typingUserId ? { ...cursor, typing: false } : cursor
          )));
          delete remoteTypingTimersRef.current[typingUserId];
        }, 1500);
      }
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
    bindMonacoToYjs();

    editor.onDidChangeCursorPosition((e) => {
      const model = editor.getModel();
      if (!model) return;
      const offset = model.getOffsetAt(e.position);
      sendCursor(offset, undefined, localTypingRef.current);
      upsertLocalCursor(offset, undefined, localTypingRef.current);
    });

    editor.onDidChangeCursorSelection((e) => {
      const model = editor.getModel();
      if (!model) return;
      const position = model.getOffsetAt(e.selection.getPosition());
      const start = model.getOffsetAt(e.selection.getStartPosition());
      const end = model.getOffsetAt(e.selection.getEndPosition());
      const cursorSelection = start === end ? undefined : { start, end };
      sendCursor(position, cursorSelection, localTypingRef.current);
      upsertLocalCursor(position, cursorSelection, localTypingRef.current);
    });

    editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (!model || readOnly) return;
      localTypingRef.current = true;
      const offset = model.getOffsetAt(editor.getPosition() || model.getFullModelRange().getEndPosition());
      const selection = editor.getSelection();
      const start = selection ? model.getOffsetAt(selection.getStartPosition()) : offset;
      const end = selection ? model.getOffsetAt(selection.getEndPosition()) : offset;
      const cursorSelection = start === end ? undefined : { start, end };
      sendCursor(offset, cursorSelection, true);
      upsertLocalCursor(offset, cursorSelection, true);

      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => {
        const latestModel = editor.getModel();
        if (!latestModel) return;
        localTypingRef.current = false;
        const latestOffset = latestModel.getOffsetAt(editor.getPosition() || latestModel.getFullModelRange().getEndPosition());
        sendCursor(latestOffset, undefined, false);
        upsertLocalCursor(latestOffset, undefined, false);
      }, 1200);
    });
  }

  useEffect(() => {
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote-sync' || origin === 'remote-update') return;
      sendYjsUpdateRef.current(Array.from(update));
      setRevision((rev) => rev + 1);
    };

    ydocRef.current.on('update', updateHandler);

    return () => {
      ydocRef.current.off('update', updateHandler);
    };
  }, []);

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
    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      Object.values(remoteTypingTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      remoteTypingTimersRef.current = {};
    };
  }, []);

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
          <Presence cursors={cursors} editorRef={editorRef} monaco={monaco} />
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
