interface Props {
  output: string;
  onClose: () => void;
}

export default function Output({ output, onClose }: Props) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span>Output</span>
        <button style={styles.close} onClick={onClose}>✕</button>
      </div>
      <pre style={styles.pre}>{output || '(no output)'}</pre>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { width: 360, display: 'flex', flexDirection: 'column', background: '#1e1e1e', borderLeft: '1px solid #3c3c3c' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#252526', borderBottom: '1px solid #3c3c3c', fontSize: 13, fontWeight: 600 },
  close: { background: 'none', border: 'none', color: '#858585', cursor: 'pointer', fontSize: 14 },
  pre: { flex: 1, padding: 12, margin: 0, fontSize: 13, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
};
