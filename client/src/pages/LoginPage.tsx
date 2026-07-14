import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { setSession } from '../lib/auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        const res = await api.post<{ userId: string; username: string }>(
          '/auth/register', form,
        );
        setSession({
          userId: res.userId,
          username: res.username,
        });
      } else {
        const res = await api.post<{ userId: string; username: string }>(
          '/auth/login', { email: form.email, password: form.password },
        );
        setSession({
          userId: res.userId,
          username: res.username,
        });
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoLogin() {
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post<{ userId: string; username: string }>(
        '/auth/demo',
        {},
      );
      setSession({
        userId: res.userId,
        username: res.username,
      });
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.page}>
      <form style={styles.form} onSubmit={handleSubmit}>
        <h1 style={styles.title}>CodeSync</h1>
        {mode === 'register' && (
          <input
            style={styles.input}
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        )}
        <input
          style={styles.input}
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} type="submit" disabled={submitting}>
          {submitting ? 'Working…' : mode === 'login' ? 'Log in' : 'Register'}
        </button>
        <button style={styles.secondaryButton} type="button" disabled={submitting} onClick={handleDemoLogin}>
          Demo login
        </button>
        <button
          style={styles.link}
          type="button"
          disabled={submitting}
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Create an account' : 'Already have an account?'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1e1e1e' },
  form: { display: 'flex', flexDirection: 'column', gap: 12, width: 320, padding: 32, background: '#252526', borderRadius: 8 },
  title: { color: '#569cd6', fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 8 },
  input: { padding: '10px 12px', borderRadius: 4, border: '1px solid #3c3c3c', background: '#1e1e1e', color: '#d4d4d4', fontSize: 14 },
  button: { padding: '10px 12px', borderRadius: 4, border: 'none', background: '#0e639c', color: '#fff', fontSize: 14, cursor: 'pointer', opacity: 1 },
  secondaryButton: { padding: '10px 12px', borderRadius: 4, border: '1px solid #3c3c3c', background: '#1e1e1e', color: '#d4d4d4', fontSize: 14, cursor: 'pointer' },
  link: { background: 'none', border: 'none', color: '#569cd6', cursor: 'pointer', fontSize: 13, textAlign: 'center' },
  error: { color: '#f44747', fontSize: 13 },
};
