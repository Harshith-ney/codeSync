import React from 'react';

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('CodeSync UI error:', error);
  }

  private handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Something went wrong</h1>
          <p style={styles.copy}>
            The editor hit an unexpected error. Reload to recover your session and rejoin the room.
          </p>
          <button style={styles.button} onClick={this.handleReload}>
            Reload CodeSync
          </button>
        </div>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background:
      'radial-gradient(circle at top, rgba(14,99,156,0.24), transparent 45%), #151718',
    color: '#f5f7fa',
  },
  card: {
    width: 'min(480px, 100%)',
    padding: '32px',
    borderRadius: '20px',
    background: 'rgba(31, 35, 39, 0.94)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.35)',
  },
  title: { fontSize: '28px', marginBottom: '12px' },
  copy: { color: '#b9c0c8', lineHeight: 1.6, marginBottom: '20px' },
  button: {
    border: 'none',
    borderRadius: '999px',
    padding: '12px 18px',
    background: '#0e639c',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
};
