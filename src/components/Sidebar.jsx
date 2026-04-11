import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, History, Settings, LogOut, Droplet, Zap, CloudRain } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { role, logout, user } = useAuth();
  
  return (
    <aside className="sidebar shadow-lg">
      <div className="logo" style={{ cursor: 'pointer' }}>
        <Zap className="logo-icon" size={28} />
        <span>EMS</span>
      </div>
      
      <nav className="sidebar-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={18} />
          <span>儀表板</span>
        </NavLink>
        
        <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <History size={18} />
          <span>歷史紀錄</span>
        </NavLink>
        
        {role === 'admin' && (
          <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Settings size={18} />
            <span>系統管理</span>
          </NavLink>
        )}
      </nav>

      <div className="sidebar-footer">
        <div style={{ padding: '0 0.5rem', fontSize: '0.85rem', color: 'var(--text-main)', textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ fontWeight: 'bold' }}>{user?.displayName || '使用者'}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{role === 'admin' ? '系統管理員' : '一般用戶'}</div>
        </div>
        <button onClick={logout} className="btn btn-secondary" style={{ padding: '0.5rem', minWidth: 'auto', borderRadius: '50%', width: '36px', height: '36px' }} title="登出系統">
          <LogOut size={16} className="text-error" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
