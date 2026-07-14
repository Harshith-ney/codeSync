interface Props {
  title?: string;
  output: string;
  onClose: () => void;
}

export default function Output({ title = 'Output', output, onClose }: Props) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span>{title}</span>
        <button style={styles.close} onClick={onClose}>✕</button>
      </div>
      <pre style={styles.pre}>{output || '(no output)'}</pre>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { width: 'min(46vw, 560px)', minWidth: 380, display: 'flex', flexDirection: 'column', background: '#111827', borderLeft: '2px solid #0e639c', boxShadow: '-10px 0 22px rgba(0, 0, 0, 0.28)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#172033', borderBottom: '1px solid #2f425f', fontSize: 13, fontWeight: 700 },
  close: { background: 'none', border: 'none', color: '#858585', cursor: 'pointer', fontSize: 14 },
  pre: { flex: 1, padding: 14, margin: 0, fontSize: 13, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 },
};
