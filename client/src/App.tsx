import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RoomsPage from './pages/RoomsPage';
import EditorPage from './pages/EditorPage';

function useAuth() {
  return !!localStorage.getItem('accessToken');
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return useAuth() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PrivateRoute><RoomsPage /></PrivateRoute>} />
      <Route path="/room/:id" element={<PrivateRoute><EditorPage /></PrivateRoute>} />
    </Routes>
  );
}
