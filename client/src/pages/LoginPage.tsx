import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'register') {
        const res = await api.post<{ accessToken: string; refreshToken: string; userId: string }>(
          '/auth/register', form,
        );
        localStorage.setItem('accessToken', res.accessToken);
        localStorage.setItem('refreshToken', res.refreshToken);
        localStorage.setItem('userId', res.userId);
        localStorage.setItem('username', form.username);
      } else {
        const res = await api.post<{ accessToken: string; refreshToken: string; userId: string; username: string }>(
          '/auth/login', { email: form.email, password: form.password },
        );
        localStorage.setItem('accessToken', res.accessToken);
        localStorage.setItem('refreshToken', res.refreshToken);
        localStorage.setItem('userId', res.userId);
        localStorage.setItem('username', res.username);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message);
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
        <button style={styles.button} type="submit">
          {mode === 'login' ? 'Log in' : 'Register'}
        </button>
        <button
          style={styles.link}
          type="button"
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
  button: { padding: '10px 12px', borderRadius: 4, border: 'none', background: '#0e639c', color: '#fff', fontSize: 14, cursor: 'pointer' },
  link: { background: 'none', border: 'none', color: '#569cd6', cursor: 'pointer', fontSize: 13, textAlign: 'center' },
  error: { color: '#f44747', fontSize: 13 },
};
