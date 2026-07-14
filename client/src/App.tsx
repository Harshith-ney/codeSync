import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RoomsPage from './pages/RoomsPage';
import EditorPage from './pages/EditorPage';
import { hasSession, subscribeToAuthChanges } from './lib/auth';

function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(hasSession());

  useEffect(() => subscribeToAuthChanges(() => setIsAuthenticated(hasSession())), []);

  return isAuthenticated;
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
