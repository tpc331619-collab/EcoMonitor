import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { X, Save, Calculator, Sparkles, RefreshCw } from 'lucide-react';

const FactorSettingModal = ({ isOpen, onClose, currentFactor, currentBaseOffset, currentEmissionFactor, emissionHistory, currentMonthStr, carbonGoals, fetchDashboardData }) => {
  const [meterFactor, setMeterFactor] = useState(currentFactor);
  const [baseOffset, setBaseOffset] = useState(currentBaseOffset || 0);
  const [eFactor, setEFactor] = useState(currentEmissionFactor);
  const [baseYearAvg, setBaseYearAvg] = useState(carbonGoals?.baseYearAvg || 1000);
  const [reductionTarget, setReductionTarget] = useState(carbonGoals?.reductionTarget || 5);
  const [msg, setMsg] = useState('');
  
  // 校準助理狀態 (支援區間模式)
  const [calibStartMonth, setCalibStartMonth] = useState(currentMonthStr);
  const [calibEndMonth, setCalibEndMonth] = useState(currentMonthStr);
  const [billKwh, setBillKwh] = useState('');
  const [calibLoading, setCalibLoading] = useState(false);
  const [suggestedFactor, setSuggestedFactor] = useState(null);
  const [rawDelta, setRawDelta] = useState(null);

  useEffect(() => {
    setMeterFactor(currentFactor);
    setBaseOffset(currentBaseOffset || 0);
    setEFactor(currentEmissionFactor);
    setBaseYearAvg(carbonGoals?.baseYearAvg || 1000);
    setReductionTarget(carbonGoals?.reductionTarget || 5);
    setCalibStartMonth(currentMonthStr);
    setCalibEndMonth(currentMonthStr);
  }, [currentFactor, currentBaseOffset, currentEmissionFactor, carbonGoals, isOpen, currentMonthStr]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setMsg('儲存中...');
    const currentYear = currentMonthStr.substring(0, 4);
    try {
      const newHistory = { ...(emissionHistory || {}) };
      newHistory[currentMonthStr] = Number(eFactor);

      await setDoc(doc(db, 'settings', 'electric_factor'), {
        meter_factor: Number(meterFactor),
        base_offset: Number(baseOffset),
        emission_history: newHistory,
        value: Number(meterFactor)
      });

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

  const calculateCalibration = async () => {
    if (!billKwh || isNaN(billKwh)) {
      setMsg('請輸入正確的帳單總度數加總');
      return;
    }
    if (calibStartMonth > calibEndMonth) {
      setMsg('起始月份不可大於結束月份');
      return;
    }

    setCalibLoading(true);
    setSuggestedFactor(null);
    
    try {
      const [startYear] = calibStartMonth.split('-');
      const [endYear] = calibEndMonth.split('-');
      
      let allRecords = [];
      const yearsToFetch = [];
      for (let y = Number(startYear); y <= Number(endYear); y++) {
        yearsToFetch.push(y);
      }

      for (const year of yearsToFetch) {
        const q = query(collection(db, `usage_records_${year}`), where('type', '==', 'electric'));
        const snap = await getDocs(q);
        const yearRecs = snap.docs.map(d => d.data());
        // 篩選區間內紀錄
        const filtered = yearRecs.filter(r => r.month >= calibStartMonth && r.month <= calibEndMonth);
        allRecords = [...allRecords, ...filtered];
      }
      
      if (allRecords.length < 2) {
        setMsg(`❌ 數據不足：所選區間內至少需要兩筆紀錄才能計算差值`);
        setCalibLoading(false);
        return;
      }

      // 按日期排序
      allRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      const first = allRecords[0].readings;
      const last = allRecords[allRecords.length - 1].readings;

      const calcTotal = (r) => (
        Number(r.ml || 0)*1000 + Number(r.mp1 || 0)*1000 + Number(r.mp || 0)*1000 + 
        Number(r.kwh11 || 0) + Number(r.kwh12 || 0) + Number(r.kwh13 || 0) + 
        Number(r.kwh21 || 0) + Number(r.agv || 0)
      );
      
      const totalFirst = calcTotal(first);
      const totalLast = calcTotal(last);
      const delta = totalLast - totalFirst;

      if (delta <= 0) {
        setMsg(`❌ 無效數據：該期間原始讀值差為 ${delta.toLocaleString()}，無法計算`);
      } else {
        // 計算建議變數時，先扣除固定的底數補償
        // 如果是多月份校準，補償也要按月份數加倍扣除
        const monthCount = yearsToFetch.length * 12; // Simplified logic or actual diff? 
        // More precise:
        const start = new Date(calibStartMonth + "-01");
        const end = new Date(calibEndMonth + "-01");
        const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
        
        const totalOffset = baseOffset * diffMonths;
        const adjustedBill = Number(billKwh) - totalOffset;

        if (adjustedBill <= 0) {
            setMsg('❌ 帳單度數低於底數補償總額，無法計算變數');
        } else {
            const factor = adjustedBill / delta;
            setRawDelta(delta);
            setSuggestedFactor(factor.toFixed(6));
            setMsg(`✅ 區間校準運算完成！(已扣除 ${totalOffset} 總補償)`);
        }
      }
    } catch (err) {
      console.error(err);
      setMsg('❌ 校準運算錯誤，請確認紀錄格式');
    }
    setCalibLoading(false);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-panel fade-in" style={{ width: '95%', maxWidth: '480px', maxHeight: '95vh', overflowY: 'auto', padding: '1.5rem 2rem', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 10 }}>
          <X size={24} />
        </button>

        <h2 style={{ marginBottom: '1.5rem', color: 'var(--color-electric)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.25rem' }}>
          <Calculator size={24} /> 數據校準與參數設定
        </h2>

        {/* 升級版：區間校準助理 */}
        <div className="calibration-assistant" style={{ 
          background: 'rgba(99, 102, 241, 0.05)', 
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: '12px',
          padding: '1.2rem',
          marginBottom: '1.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0, marginBottom: '0.8rem' }}>
            <Sparkles size={18} /> 台電帳單校準助手 (多月區間)
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
            選取連續月份並輸入其<strong>帳單總度數加總</strong>。系統會先扣除下方的固定補償值後再計算建議變數。
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem' }}>起始月份</label>
              <input 
                type="month" 
                className="form-control" 
                value={calibStartMonth} 
                onChange={e => setCalibStartMonth(e.target.value)}
                style={{ height: '34px', fontSize: '0.8rem', padding: '0 8px' }} 
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem' }}>結束月份</label>
              <input 
                type="month" 
                className="form-control" 
                value={calibEndMonth} 
                onChange={e => setCalibEndMonth(e.target.value)}
                style={{ height: '34px', fontSize: '0.8rem', padding: '0 8px' }} 
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" style={{ fontSize: '0.7rem' }}>期間帳單度數總和 (kWh)</label>
            <input 
              type="number" 
              className="form-control" 
              placeholder="例如 1+2+3 月之總度數"
              value={billKwh}
              onChange={e => setBillKwh(e.target.value)}
              style={{ height: '38px', fontSize: '0.9rem' }} 
            />
          </div>

          <button 
            type="button" 
            onClick={calculateCalibration}
            disabled={calibLoading}
            className="btn btn-secondary" 
            style={{ width: '100%', border: '1px solid #818cf8', color: '#818cf8', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem', height: '40px' }}
          >
            {calibLoading ? <RefreshCw size={16} className="spinner" /> : <Calculator size={16} />} 
            計算區間平均變數
          </button>

          {suggestedFactor && (
            <div style={{ marginTop: '1rem', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: '3px solid #818cf8' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>區間總原始讀值差: {rawDelta?.toLocaleString()}</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>建議平均變數: <span style={{ color: 'var(--color-success)' }}>{suggestedFactor}</span></span>
                <button 
                  type="button" 
                  onClick={() => setMeterFactor(suggestedFactor)}
                  style={{ background: 'var(--color-success)', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  套用此變數
                </button>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: '1.2rem' }}>
            <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px', marginBottom: '1rem' }}>目前的參數設定</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.8rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>用電變數 (CT)</label>
                <input
                  type="number"
                  className="form-control"
                  value={meterFactor}
                  onChange={e => setMeterFactor(e.target.value)}
                  required
                  step="any"
                  style={{ height: '38px' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>每月固定補償 (kWh)</label>
                <input
                  type="number"
                  className="form-control"
                  value={baseOffset}
                  onChange={e => setBaseOffset(e.target.value)}
                  required
                  step="any"
                  placeholder="例如 1000"
                  style={{ height: '38px' }}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ fontSize: '0.85rem' }}>碳排放係數 (kg CO2e)</label>
              <input
                type="number"
                className="form-control"
                value={eFactor}
                onChange={e => setEFactor(e.target.value)}
                required
                step="any"
                style={{ height: '38px' }}
              />
              <p style={{ fontSize: '0.7rem', color: 'var(--color-warning)', marginTop: '4px' }}>
                ℹ️ 碳係數自 {currentMonthStr} 起生效
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px', marginBottom: '1rem' }}>ESG 碳資產管理儀表板設定</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>基準月平均 (度)</label>
                <input
                  type="number"
                  className="form-control"
                  value={baseYearAvg}
                  onChange={e => setBaseYearAvg(e.target.value)}
                  required
                  style={{ height: '38px' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>年度減碳目標 (%)</label>
                <input
                  type="number"
                  className="form-control"
                  value={reductionTarget}
                  onChange={e => setReductionTarget(e.target.value)}
                  required
                  style={{ height: '38px' }}
                />
              </div>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none', height: '48px', fontWeight: 'bold' }}>
            <Save size={18} /> 儲存目前所有設定並退出
          </button>
        </form>

        {msg && <div style={{ marginTop: '1rem', color: msg.includes('✅') ? 'var(--color-success)' : 'var(--color-error)', textAlign: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>{msg}</div>}
      </div>
    </div>
  );
};

export default FactorSettingModal;
