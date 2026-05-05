import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { X, Save, Calculator, Sparkles, RefreshCw, RotateCcw } from 'lucide-react';

const electricityFields = [
  { key: 'ml', label: '1. 辦公大樓(ML Mwh)' },
  { key: 'mp1', label: '2. 倉儲大樓(MP-1 Mwh)' },
  { key: 'mp', label: '3. 低壓用電(MP Mwh)' },
  { key: 'kwh11', label: '4. 1-1(Kwh)' },
  { key: 'kwh12', label: '5. 1-2(Kwh)' },
  { key: 'kwh13', label: '6. 1-3(Kwh)' },
  { key: 'kwh21', label: '7. 2-1(Kwh)' },
  { key: 'agv', label: '8. AGV(Kwh)' },
];

const FactorSettingModal = ({ isOpen, onClose, currentFactor, currentBaseOffset, currentEmissionFactor, emissionHistory, currentMonthStr, carbonGoals, fieldFactors, fetchDashboardData }) => {
  const [meterFactor, setMeterFactor] = useState(currentFactor);
  const [baseOffset, setBaseOffset] = useState(currentBaseOffset || 0);
  const [eFactor, setEFactor] = useState(currentEmissionFactor);
  const [baseYearAvg, setBaseYearAvg] = useState(carbonGoals?.baseYearAvg || 1000);
  const [reductionTarget, setReductionTarget] = useState(carbonGoals?.reductionTarget || 5);
  const [msg, setMsg] = useState('');
  
  // 校準助理摺疊狀態
  const [showCalib, setShowCalib] = useState(false);
  
  // 各分表獨立倍率
  const [factors, setFactors] = useState(fieldFactors || {});

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
    setFactors(fieldFactors || {});
  }, [currentFactor, currentBaseOffset, currentEmissionFactor, carbonGoals, fieldFactors, isOpen, currentMonthStr]);

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
        field_factors: factors,
        value: Number(meterFactor)
      });

      await setDoc(doc(db, `settings_${currentYear}`, 'carbon_goals'), {
        baseYearAvg: Number(baseYearAvg),
        reductionTarget: Number(reductionTarget)
      });

      setMsg(`✅ 儲存成功！`);
      fetchDashboardData();
      onClose();
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

      // 校準計算時暫時先用原本邏輯，或可以提示不包含倍率設定
      const calcTotalRaw = (rd) => {
        // 強制只計算三個總電表的讀值變化
        const mainFields = ['ml', 'mp1', 'mp'];
        const getFieldRaw = (key) => {
          if (factors[key] === '0' || factors[key] === 0) return 0;
          const val = Number(rd[key]) || 0;
          const unitMultiplier = (key === 'ml' || key === 'mp1' || key === 'mp') ? 1000 : 1;
          return val * unitMultiplier;
        };
        return mainFields.reduce((sum, key) => sum + getFieldRaw(key), 0);
      };
      
      const totalFirst = calcTotalRaw(first);
      const totalLast = calcTotalRaw(last);
      const delta = totalLast - totalFirst;

      if (delta <= 0) {
        setMsg(`❌ 無效數據：該期間原始讀值差為 ${delta.toLocaleString()}，無法計算`);
      } else {
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
      <div className="glass-panel fade-in" style={{ width: '95%', maxWidth: '850px', maxHeight: '95vh', overflowY: 'auto', padding: '2rem', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 10 }}>
          <X size={24} />
        </button>

        <h2 style={{ marginBottom: '1rem', color: 'var(--color-electric)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Calculator size={22} /> 數據校準與參數設定</div>
          <button 
            type="button" 
            onClick={() => setShowCalib(!showCalib)}
            style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '4px 12px', borderRadius: '20px', cursor: 'pointer' }}
          >
            {showCalib ? '收起校準助手' : '使用校準助手'}
          </button>
        </h2>

        {/* 區間校準助理 (摺疊式) */}
        {showCalib && (
          <div className="calibration-assistant" style={{ 
            background: 'rgba(99, 102, 241, 0.05)', 
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <h3 style={{ fontSize: '0.9rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0, marginBottom: '0.6rem' }}>
              <Sparkles size={16} /> 台電帳單校準助手 (多月區間)
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.8rem', lineHeight: 1.4 }}>
              選取連續月份並輸入其帳單總度數。系統會扣除固定補償值後計算建議變數。
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.8rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.65rem' }}>起始月份</label>
                <input type="month" className="form-control" value={calibStartMonth} onChange={e => setCalibStartMonth(e.target.value)} style={{ height: '30px', fontSize: '0.75rem' }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.65rem' }}>結束月份</label>
                <input type="month" className="form-control" value={calibEndMonth} onChange={e => setCalibEndMonth(e.target.value)} style={{ height: '30px', fontSize: '0.75rem' }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.65rem' }}>帳單總度數 (kWh)</label>
                <input type="number" className="form-control" value={billKwh} onChange={e => setBillKwh(e.target.value)} style={{ height: '30px', fontSize: '0.75rem' }} />
              </div>
            </div>

            <button 
              type="button" 
              onClick={calculateCalibration}
              disabled={calibLoading}
              className="btn btn-secondary" 
              style={{ width: '100%', border: '1px solid #818cf8', color: '#818cf8', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.8rem', height: '34px' }}
            >
              {calibLoading ? <RefreshCw size={14} className="spinner" /> : <Calculator size={14} />} 
              計算建議變數
            </button>

            {suggestedFactor && (
              <div style={{ marginTop: '0.8rem', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: '3px solid #818cf8' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>建議變數: <span style={{ color: 'var(--color-success)' }}>{suggestedFactor}</span></span>
                  <button type="button" onClick={() => { setMeterFactor(suggestedFactor); setFactors(prev => ({ ...prev, ml: suggestedFactor, mp1: suggestedFactor, mp: suggestedFactor })); }} style={{ background: 'var(--color-success)', color: 'white', border: 'none', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}>套用</button>
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: '0.8rem' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px', marginBottom: '1rem' }}>目前的參數設定</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', marginBottom: '1.2rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>預設電費變數 (CT)</label>
                <input
                  type="number"
                  className="form-control"
                  value={meterFactor}
                  onChange={e => setMeterFactor(e.target.value)}
                  required
                  step="any"
                  style={{ height: '42px', fontSize: '1.1rem' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>每月固定補償 (kWh)</label>
                <input
                  type="number"
                  className="form-control"
                  value={baseOffset}
                  onChange={e => setBaseOffset(e.target.value)}
                  required
                  step="any"
                  style={{ height: '42px', fontSize: '1.1rem' }}
                />
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.2rem' }}>
              <h4 style={{ fontSize: '0.95rem', color: '#818cf8', marginTop: 0, marginBottom: '1rem' }}>⚡ 各分表獨立倍率 (填 0 則不計入，空白則套用預設)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                {electricityFields.map(f => (
                  <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.85rem', opacity: 0.9, whiteSpace: 'nowrap' }}>{f.label}</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="number"
                        className="form-control"
                        value={factors[f.key] !== undefined ? factors[f.key] : meterFactor}
                        onChange={e => setFactors(prev => ({ ...prev, [f.key]: e.target.value }))}
                        step="any"
                        style={{ height: '38px', fontSize: '1rem', padding: '0 10px' }}
                        placeholder={meterFactor}
                      />
                      <button 
                        type="button"
                        onClick={() => {
                          const newFactors = { ...factors };
                          delete newFactors[f.key];
                          setFactors(newFactors);
                        }}
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-muted)', borderRadius: '6px', padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="還原為預設變數"
                      >
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>碳排放係數 (kg CO2e)</label>
              <input
                type="number"
                className="form-control"
                value={eFactor}
                onChange={e => setEFactor(e.target.value)}
                required
                step="any"
                style={{ height: '40px', fontSize: '1.1rem' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px', marginBottom: '1rem' }}>ESG 碳資產管理設定</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>基準月平均 (度)</label>
                <input
                  type="number"
                  className="form-control"
                  value={baseYearAvg}
                  onChange={e => setBaseYearAvg(e.target.value)}
                  required
                  style={{ height: '40px', fontSize: '1.1rem' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>年度減碳目標 (%)</label>
                <input
                  type="number"
                  className="form-control"
                  value={reductionTarget}
                  onChange={e => setReductionTarget(e.target.value)}
                  required
                  style={{ height: '40px', fontSize: '1.1rem' }}
                />
              </div>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none', height: '52px', fontSize: '1.1rem', fontWeight: 'bold' }}>
            <Save size={20} /> 儲存目前所有設定並退出
          </button>
        </form>

        {msg && <div style={{ marginTop: '1rem', color: msg.includes('✅') ? 'var(--color-success)' : 'var(--color-error)', textAlign: 'center', fontWeight: 'bold', fontSize: '1rem' }}>{msg}</div>}
      </div>
    </div>
  );
};

export default FactorSettingModal;
