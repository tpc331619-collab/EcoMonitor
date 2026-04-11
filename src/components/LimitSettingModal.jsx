import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { X, Save, Sparkles, RefreshCw } from 'lucide-react';

const LimitSettingModal = ({ isOpen, onClose, year, type, fetchDashboardData }) => {
  const [limits, setLimits] = useState(Array(12).fill(''));
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (isOpen && year && type) {
      const loadData = async () => {
        setLoading(true);
        try {
          const promises = [];
          for (let i = 1; i <= 12; i++) {
            const m = i < 10 ? `0${i}` : `${i}`;
            promises.push(getDoc(doc(db, `settings_${year}`, `limits_${m}`)));
          }
          const snaps = await Promise.all(promises);
          const loaded = snaps.map(snap => {
            if (snap.exists() && snap.data()[type] !== undefined) {
              return snap.data()[type];
            }
            return '';
          });
          setLimits(loaded);
        } catch (err) {
          console.error(err);
        }
        setLoading(false);
      };
      loadData();
    }
  }, [isOpen, year, type]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setMsg('儲存中...');
    try {
      const promises = [];
      for (let i = 1; i <= 12; i++) {
        const m = i < 10 ? `0${i}` : `${i}`;
        promises.push(getDoc(doc(db, `settings_${year}`, `limits_${m}`)));
      }

      const snaps = await Promise.all(promises);
      const batch = writeBatch(db);

      for (let i = 1; i <= 12; i++) {
        const m = i < 10 ? `0${i}` : `${i}`;
        const ref = doc(db, `settings_${year}`, `limits_${m}`);
        const snap = snaps[i - 1];
        let data = snap.exists() ? snap.data() : {};
        data[type] = Number(limits[i - 1]);
        batch.set(ref, data);
      }

      await batch.commit();

      setMsg('✅ 年度上限儲存成功！');
      fetchDashboardData();
      setTimeout(() => {
        setMsg('');
        onClose();
      }, 1500);
    } catch (err) {
      console.error(err);
      setMsg('❌ 儲存失敗');
    }
  };

  const handleCopyLastYearLimits = async () => {
    setMsg('複製上年度設定中...');
    const prevYear = Number(year) - 1;
    try {
      const promises = [];
      for (let i = 1; i <= 12; i++) {
        const m = i < 10 ? `0${i}` : `${i}`;
        promises.push(getDoc(doc(db, `settings_${prevYear}`, `limits_${m}`)));
      }
      const snaps = await Promise.all(promises);
      const loaded = snaps.map(snap => {
        if (snap.exists() && snap.data()[type] !== undefined) {
          return snap.data()[type];
        }
        return '';
      });
      
      if (loaded.every(v => v === '')) {
        setMsg(`找不到 ${prevYear} 年度的限額設定`);
        return;
      }

      setLimits(loaded);
      setMsg(`已成功複製 ${prevYear} 年度的限額設定！`);
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      console.error(err);
      setMsg('複製失敗');
    }
  };

  const handleImportPreviousYear = async () => {
    setMsg('計算上年度實際用量中...');
    const prevYear = Number(year) - 1;
    try {
      const factorRef = doc(db, 'settings', 'electric_factor');
      const factorSnap = await getDoc(factorRef);
      const ctFactor = factorSnap.exists() ? (Number(factorSnap.data().meter_factor || factorSnap.data().value) || 4.233) : 4.233;

      const q = query(collection(db, `usage_records_${prevYear}`), where('type', '==', type));
      const querySnapshot = await getDocs(q);
      const allRecords = querySnapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      
      if (allRecords.length === 0) {
        setMsg(`找不到 ${prevYear} 年度的實際抄表記錄`);
        return;
      }

      const newLimits = [...limits];
      const sorted = allRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

      for (let i = 1; i <= 12; i++) {
        const mStr = i < 10 ? `0${i}` : `${i}`;
        const monthYearStr = `${prevYear}-${mStr}`;
        const monthRecords = sorted.filter(r => r.month === monthYearStr);
        if (monthRecords.length === 0) continue;

        const currentLast = monthRecords[monthRecords.length - 1].readings;
        let diffValue = 0;

        if (monthRecords.length >= 2) {
          const first = monthRecords[0].readings;
          if (type === 'electric') {
            const A = ((currentLast.ml || 0) - (first.ml || 0)) * 1000;
            const B = ((currentLast.mp1 || 0) - (first.mp1 || 0)) * 1000;
            const C = ((currentLast.mp || 0) - (first.mp || 0)) * 1000;
            const D = (currentLast.kwh11 || 0) - (first.kwh11 || 0);
            const E = (currentLast.kwh12 || 0) - (first.kwh12 || 0);
            const F = (currentLast.kwh13 || 0) - (first.kwh13 || 0);
            const G = (currentLast.kwh21 || 0) - (first.kwh21 || 0);
            const H = (currentLast.agv || 0) - (first.agv || 0);
            diffValue = (A + B + C + D + E + F + G + H) * ctFactor;
          } else {
            diffValue = (currentLast.drink || 0) - (first.total || 0);
          }
        } else {
          const currentIndex = sorted.indexOf(monthRecords[0]);
          if (currentIndex > 0) {
            const prevLast = sorted[currentIndex - 1].readings;
            if (type === 'electric') {
              const A = ((currentLast.ml || 0) - (prevLast.ml || 0)) * 1000;
              const B = ((currentLast.mp1 || 0) - (prevLast.mp1 || 0)) * 1000;
              const C = ((currentLast.mp || 0) - (prevLast.mp || 0)) * 1000;
              const D = (currentLast.kwh11 || 0) - (prevLast.kwh11 || 0);
              const E = (currentLast.kwh12 || 0) - (prevLast.kwh12 || 0);
              const F = (currentLast.kwh13 || 0) - (prevLast.kwh13 || 0);
              const G = (currentLast.kwh21 || 0) - (prevLast.kwh21 || 0);
              const H = (currentLast.agv || 0) - (prevLast.agv || 0);
              diffValue = (A + B + C + D + E + F + G + H) * ctFactor;
            } else {
              diffValue = (currentLast.drink || 0) - (prevLast.total || 0);
            }
          }
        }
        if (diffValue > 0) newLimits[i - 1] = diffValue.toFixed(0);
      }
      setLimits(newLimits);
      setMsg(`已根據 ${prevYear} 實際用量導入新標竿！`);
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setMsg('導入失敗');
    }
  };

  const titleStr = type === 'electric' ? '用電上限' : '用水上限';
  const colorVar = type === 'electric' ? 'var(--color-electric)' : 'var(--color-water)';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-panel fade-in" style={{ width: '95%', maxWidth: '950px', padding: '1.5rem 2rem', position: 'relative' }}>
        <button 
          onClick={onClose} 
          style={{ 
            position: 'absolute', top: '20px', right: '20px', 
            background: 'transparent', border: 'none', color: 'var(--text-muted)', 
            cursor: 'pointer', zIndex: 100, padding: '5px'
          }}
          className="hover-bright"
        >
          <X size={24} />
        </button>
        
        <div className="modal-header-responsive" style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          marginBottom: '1.7rem', flexWrap: 'wrap', gap: '1rem', 
          paddingRight: '80px' // 強力保證不遮擋
        }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>設定 {year} 年度 {titleStr}</h2>
          <div className="modal-header-btns" style={{ display: 'flex', gap: '0.8rem' }}>
            <button
              type="button" onClick={handleCopyLastYearLimits} disabled={loading} className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem', flex: 1, justifyContent: 'center', whiteSpace: 'nowrap' }}
            >
              <RefreshCw size={14} /> 複製去年設定
            </button>
            <button
              type="button" onClick={handleImportPreviousYear} disabled={loading} className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem', backgroundImage: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none', color: 'white', flex: 1, justifyContent: 'center', whiteSpace: 'nowrap' }}
            >
              <Sparkles size={14} /> 帶入去年實際值
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '5rem', textAlign: 'center' }}>
            <RefreshCw size={40} className="spinner" style={{ color: colorVar, marginBottom: '1rem' }} />
            <div style={{ color: 'var(--text-muted)' }}>讀取中...</div>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <div className="limit-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.2rem', marginBottom: '2rem' }}>
              {limits.map((val, idx) => (
                <div key={idx} className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <label style={{ minWidth: '40px', marginBottom: 0, color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '0.85rem' }}>{idx + 1}月</label>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="number" className="form-control" value={val}
                      onChange={(e) => {
                        const newLimits = [...limits];
                        newLimits[idx] = e.target.value;
                        setLimits(newLimits);
                      }}
                      placeholder="未設"
                      style={{ borderLeft: `4px solid ${val ? colorVar : 'transparent'}`, height: '38px', padding: '0 8px', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button 
              type="submit" disabled={loading} className="btn btn-primary" 
              style={{ width: '100%', height: '52px', fontSize: '1.1rem', fontWeight: 'bold', background: 'var(--color-warning)', border: 'none', color: '#000' }}
            >
              <Save size={20} /> 儲存年度設定
            </button>
          </form>
        )}
        {msg && (
          <div style={{ marginTop: '1.2rem', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', textAlign: 'center', color: msg.includes('✅') ? 'var(--color-success)' : 'var(--text-main)', fontWeight: 'bold' }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
};

export default LimitSettingModal;
