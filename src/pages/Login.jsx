import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Droplet, Zap } from 'lucide-react';

const Login = () => {
  const { loginWithGoogle, loginAsGuest } = useAuth();
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    try {
      setError('');
      await loginWithGoogle();
    } catch (err) {
      setError('登入失敗，請重試。');
    }
  };

  return (
    <div className="auth-page">
      <div className="glass-panel auth-card fade-in">
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <Droplet size={48} className="text-water" />
          <Zap size={48} className="text-electric" />
        </div>
        <h1 style={{ marginBottom: '2rem' }}>
          <span className="text-water">Water</span> & <span className="text-electric">Electricity</span>
        </h1>
        <p className="text-muted" style={{ marginBottom: '2rem' }}>
          智慧水電與雨水回收監控系統
        </p>

        {error && <div className="text-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button onClick={handleGoogleLogin} className="btn btn-primary">
            使用 Google 繼續
          </button>
          
          <div style={{ borderTop: '1px solid var(--panel-border)', margin: '1rem 0' }} />

          <button onClick={loginAsGuest} className="btn btn-secondary">
            以訪客身分進入
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
