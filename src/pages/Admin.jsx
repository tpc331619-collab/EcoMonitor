import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Users, Shield, UserCheck, ShieldAlert, Mail, User, Search, Filter, Trash2 } from 'lucide-react';

const Admin = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'));
      const querySnapshot = await getDocs(q);
      const fetchedUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching admin data:", error);
    }
    setLoading(false);
  };

  const updateUserRole = async (userId, newRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (error) {
      console.error("Error updating role:", error);
      alert('權限更新失敗');
    }
  };

  const deleteUser = async (userId) => {
    if (window.confirm('確定要刪除這位用戶嗎？此操作無法恢復。')) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        setUsers(users.filter(u => u.id !== userId));
      } catch (error) {
        console.error("Error deleting user:", error);
        alert('刪除失敗');
      }
    }
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    pending: users.filter(u => u.role === 'pending').length
  };

  if (loading) return <div className="loader-container"><div className="spinner"></div></div>;

  return (
    <div className="fade-in admin-page" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>系統管理</h1>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="搜尋用戶名稱或 Email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '0.6rem 1rem 0.6rem 2.5rem',
                borderRadius: '12px',
                border: '1px solid var(--panel-border)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                width: '300px',
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--color-water)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--panel-border)'}
            />
          </div>
        </div>
      </div>
      
      {/* 統計資訊卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '10px', borderRadius: '12px' }}>
            <Users size={24} className="text-water" />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>總註冊用戶</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total}</div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(34, 197, 94, 0.15)', padding: '10px', borderRadius: '12px' }}>
            <Shield size={24} style={{ color: 'var(--color-success)' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>管理員人數</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.admins}</div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '10px', borderRadius: '12px' }}>
            <ShieldAlert size={24} style={{ color: 'var(--color-error)' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>待審核權限</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.pending}</div>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
           <UserCheck size={22} className="text-water" />
           <h2 style={{ margin: 0, fontSize: '1.25rem' }}>權限審核與管理</h2>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <th style={{ padding: '1.2rem 2rem' }}>用戶資訊</th>
                <th style={{ padding: '1.2rem 2rem' }}>當前權限</th>
                <th style={{ padding: '1.2rem 2rem', textAlign: 'right' }}>操作管理</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="3" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>沒有找到符合條件的用戶資料</td>
                </tr>
              ) : filteredUsers.map(u => (
                <tr key={u.id} className="admin-table-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'all 0.2s' }}>
                  <td style={{ padding: '1.2rem 2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ 
                        width: '40px', 
                        height: '40px', 
                        borderRadius: '50%', 
                        background: u.role === 'admin' ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)' : 'rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: u.role === 'admin' ? '#fff' : 'var(--text-muted)',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        {u.role === 'admin' ? <Shield size={20} /> : <User size={20} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: '#fff' }}>{u.displayName || '未設定名稱'}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Mail size={12} /> {u.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1.2rem 2rem' }}>
                    <span 
                      className={`badge ${u.role === 'admin' ? 'badge-info' : u.role === 'user' ? 'badge-success' : 'badge-danger'}`}
                      style={{ 
                        padding: '0.4rem 0.8rem', 
                        borderRadius: '8px', 
                        fontSize: '0.75rem', 
                        letterSpacing: '1px',
                        fontWeight: 'bold',
                        boxShadow: `0 0 10px ${u.role === 'admin' ? 'rgba(56, 189, 248, 0.2)' : u.role === 'user' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                      }}
                    >
                      {u.role === 'pending' ? '待審核' : u.role.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '1.2rem 2rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                      {u.role !== 'admin' && (
                         <button 
                           onClick={() => updateUserRole(u.id, 'admin')} 
                           className="btn btn-secondary" 
                           style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '10px' }}
                         >
                           設為 Admin
                         </button>
                      )}
                      {u.role !== 'user' && (
                        <button 
                          onClick={() => updateUserRole(u.id, 'user')} 
                          className="btn btn-primary" 
                          style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '10px' }}
                        >
                          {u.role === 'pending' ? '核准准入' : '核准為 User'}
                        </button>
                      )}
                      <button 
                        onClick={() => deleteUser(u.id)} 
                        className="btn btn-secondary" 
                        style={{ 
                          padding: '0.5rem', 
                          borderRadius: '10px', 
                          background: 'rgba(239, 68, 68, 0.1)', 
                          color: 'var(--color-error)',
                          border: '1px solid rgba(239, 68, 68, 0.2)'
                        }}
                        title="刪除用戶"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <style>{`
        .admin-table-row:hover {
          background: rgba(255, 255, 255, 0.02) !important;
        }
        @media (max-width: 768px) {
          .admin-page h1 { font-size: 1.5rem !important; }
          input { width: 100% !important; }
        }
      `}</style>
    </div>
  );
};

export default Admin;

