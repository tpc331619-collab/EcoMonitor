import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { X, Save, Calculator } from 'lucide-react';

const FactorSettingModal = ({ isOpen, onClose, currentFactor, currentEmissionFactor, emissionHistory, currentMonthStr, carbonGoals, fetchDashboardData }) => {
  const [meterFactor, setMeterFactor] = useState(currentFactor);
  const [eFactor, setEFactor] = useState(currentEmissionFactor);
  const [baseYearAvg, setBaseYearAvg] = useState(carbonGoals?.baseYearAvg || 1000);
  const [reductionTarget, setReductionTarget] = useState(carbonGoals?.reductionTarget || 5);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setMeterFactor(currentFactor);
    setEFactor(currentEmissionFactor);
    setBaseYearAvg(carbonGoals?.baseYearAvg || 1000);
    setReductionTarget(carbonGoals?.reductionTarget || 5);
  }, [currentFactor, currentEmissionFactor, carbonGoals, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setMsg('儲存中...');
    const currentYear = currentMonthStr.substring(0, 4);
    try {
      // 1. 更新電力計算係數 (全域)
      const newHistory = { ...(emissionHistory || {}) };
      newHistory[currentMonthStr] = Number(eFactor);

      await setDoc(doc(db, 'settings', 'electric_factor'), {
        meter_factor: Number(meterFactor),
        emission_history: newHistory,
        value: Number(meterFactor)
      });

      // 2. 更新 ESG 規劃參數 (年度限定)
      await setDoc(doc(db, `settings_${currentYear}`, 'carbon_goals'), {
        baseYearAvg: Number(baseYearAvg),
        reductionTarget: Number(reductionTarget)
      });

      setMsg(`✅ 儲存成功！係數與 ESG 設定已更新`);
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

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-panel fade-in" style={{ width: '90%', maxWidth: '420px', padding: '2rem', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={24} />
        </button>

        <h2 style={{ marginBottom: '1.5rem', color: 'var(--color-electric)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Calculator size={24} /> 設定計算係數
        </h2>

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', marginBottom: '1.2rem' }}>基礎計算係數</h3>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">用電變數</label>
              <input
                type="number"
                className="form-control"
                value={meterFactor}
                onChange={e => setMeterFactor(e.target.value)}
                required
                step="any"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
              <label className="form-label">碳係數</label>
              <input
                type="number"
                className="form-control"
                value={eFactor}
                onChange={e => setEFactor(e.target.value)}
                required
                step="any"
              />
              <p style={{ fontSize: '0.7rem', color: 'var(--color-warning)', marginTop: '4px' }}>
                ℹ️ 係數自 {currentMonthStr} 起生效
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', marginBottom: '1.2rem' }}>ESG 碳資產管理設定</h3>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">基準年平均月用電 (度)</label>
              <input
                type="number"
                className="form-control"
                value={baseYearAvg}
                onChange={e => setBaseYearAvg(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: '0' }}>
              <label className="form-label">年度減碳目標 (%)</label>
              <input
                type="number"
                className="form-control"
                value={reductionTarget}
                onChange={e => setReductionTarget(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none', height: '48px', fontWeight: 'bold' }}>
            <Save size={18} /> 儲存設定
          </button>
        </form>

        {msg && <div style={{ marginTop: '1.2rem', color: msg.includes('✅') ? 'var(--color-success)' : 'var(--color-error)', textAlign: 'center', fontWeight: 'bold' }}>{msg}</div>}
      </div>
    </div>
  );
};

export default FactorSettingModal;
