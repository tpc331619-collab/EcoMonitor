import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Admin from './pages/Admin';
import Sidebar from './components/Sidebar';

// 保護路由組件
const ProtectedRoute = ({ children, requireRole }) => {
  const { user, role, loading, logout } = useAuth();

  if (loading) return <div className="loader-container"><div className="spinner"></div></div>;
  if (!user) return <Navigate to="/login" />;

  // role = 'pending' 或 'error' 的用戶不允許訪問，顯示提示或強迫去某個 pending 畫面
  if (role === 'pending' || role === 'error') {
    return (
      <div className="auth-page">
        <div className="glass-panel auth-card fade-in">
          <h2 className={role === 'error' ? 'text-error' : 'text-water'}>
            {role === 'error' ? '系統權限錯誤' : '帳號審核中'}
          </h2>
          <p className="text-muted">
            {role === 'error' ? '存取遭拒。如果您剛開通資料庫，請稍後再試。' : '您的管理員尚未開通您的權限，請稍後再試。'}
          </p>
          <button onClick={logout} className="btn btn-secondary" style={{ marginTop: '2rem', width: '100%' }}>
            登出 / 回到登入畫面
          </button>
        </div>
      </div>
    );
  }

  // 若路由要求特定權限
  if (requireRole && role !== requireRole) {
    return <Navigate to="/" />;
  }

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loader-container"><div className="spinner"></div></div>;

  return (
    <Router>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        

        <Route 
          path="/history" 
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute requireRole="admin">
              <Admin />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
