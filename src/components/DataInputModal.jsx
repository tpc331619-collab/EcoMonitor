import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { X, Plus, Info, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

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

const waterFields = [
  { key: 'total', label: '1. 總水表(早)' },
  { key: 'drink', label: '2. 總水表(夜)' },
];

const rainFields = [
  { key: 'rain', label: '3. 雨水回收(自設水表)' },
];

const DataInputModal = ({ isOpen, onClose, fetchDashboardData, defaultType }) => {
  const initElectricState = electricityFields.reduce((acc, field) => ({ ...acc, [field.key]: '' }), {});
  const initWaterState = waterFields.reduce((acc, field) => ({ ...acc, [field.key]: '' }), {});
  const initRainState = rainFields.reduce((acc, field) => ({ ...acc, [field.key]: '' }), {});
  
  const [type, setType] = useState(defaultType || 'electric');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const [electricReadings, setElectricReadings] = useState(initElectricState);
  const [waterReadings, setWaterReadings] = useState(initWaterState);
  const [rainReadings, setRainReadings] = useState(initRainState);
  
  const [lastRecord, setLastRecord] = useState(null);
  const [lastFieldUsages, setLastFieldUsages] = useState({}); // 儲存上一筆的增量 (R1 - R2)
  const [lastTotalUsage, setLastTotalUsage] = useState(0);    // 儲存上一筆的總增量
  const [isFetchingRef, setIsFetchingRef] = useState(false);
  const [msg, setMsg] = useState('');

  // 輔助計算總量
  const calcTotal = (rd) => {
    if (!rd) return 0;
    if (type === 'electric') {
      return (rd.ml || 0)*1000 + (rd.mp1 || 0)*1000 + (rd.mp || 0)*1000 + (rd.kwh11 || 0) + (rd.kwh12 || 0) + (rd.kwh13 || 0) + (rd.kwh21 || 0) + (rd.agv || 0);
    }
    return rd.total || rd.rain || 0;
  };

  // 判斷是否任何欄位無效 (小於上次)
  const getIsAnyInvalid = () => {
    if (!lastRecord) return false;
    const readings = type === 'electric' ? electricReadings : type === 'water' ? waterReadings : rainReadings;
    for (let k in readings) {
      if (readings[k] !== '' && Number(readings[k]) < (lastRecord.readings?.[k] || 0)) return true;
    }
    return false;
  };
  const isAnyInvalid = getIsAnyInvalid();

  // 獲取參考資料 (尋找最近的紀錄，包含同日)
  useEffect(() => {
    const fetchRef = async () => {
      if (!isOpen) return;
      setIsFetchingRef(true);
      try {
        const currentDate = new Date(date).toISOString();
        const currentYear = date.substring(0, 4);
        let results = [];

        // 1. 抓取當前日期及之前的紀錄 (抓 5 筆以便在 JS 做排序)
        const q1 = query(
          collection(db, `usage_records_${currentYear}`),
          where('type', '==', type),
          where('date', '<=', currentDate),
          orderBy('date', 'desc'),
          limit(5)
        );
        const snap1 = await getDocs(q1);
        results = snap1.docs.map(d => ({ id: d.id, ...d.data() }));

        // 2. 如果不足，往上一年抓
        if (results.length < 5) {
          const prevYear = parseInt(currentYear) - 1;
          const q2 = query(
            collection(db, `usage_records_${prevYear}`),
            where('type', '==', type),
            orderBy('date', 'desc'),
            limit(5 - results.length)
          );
          const snap2 = await getDocs(q2);
          const prevYearRecs = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
          results = [...results, ...prevYearRecs];
        }

        if (results.length > 0) {
          // 在 JS 中進行精準排序：日期 desc > 存檔時間 (createdAt) desc > ID desc
          results.sort((a, b) => {
             const dateCompare = b.date.localeCompare(a.date);
             if (dateCompare !== 0) return dateCompare;
             return (b.createdAt || '').localeCompare(a.createdAt || '');
          });

          setLastRecord(results[0]);
          
          if (results.length >= 2) {
            const r1 = results[0].readings;
            const r2 = results[1].readings;
            setLastTotalUsage(calcTotal(r1) - calcTotal(r2));
            const fDiffs = {};
            for(let k in r1) {
              const d = (r1[k] || 0) - (r2[k] || 0);
              if (d > 0) fDiffs[k] = d;
            }
            setLastFieldUsages(fDiffs);
          } else {
            setLastTotalUsage(0);
            setLastFieldUsages({});
          }
        } else {
          setLastRecord(null);
          setLastTotalUsage(0);
          setLastFieldUsages({});
        }
      } catch (err) {
        console.error("[FetchRef] Error:", err);
      }
      setIsFetchingRef(false);
    };
    fetchRef();
  }, [isOpen, date, type]);

  useEffect(() => {
    if (isOpen && defaultType) {
      setType(defaultType);
    }
  }, [isOpen, defaultType]);

  if (!isOpen) return null;

  const handleAddDaily = async (e) => {
    e.preventDefault();
    setMsg('儲存中...');
    try {
      const recordMonth = date.substring(0, 7); 
      const year = recordMonth.substring(0, 4);
      let currentReadings = type === 'electric' ? electricReadings : type === 'water' ? waterReadings : rainReadings;

      // 1.5 倍異常確認視窗
      if (lastRecord && lastTotalUsage > 0) {
        const lastTotal = calcTotal(lastRecord.readings);
        const currentTotal = calcTotal(currentReadings);
        const currentUsage = currentTotal - lastTotal;
        if (currentUsage > lastTotalUsage * 1.5) {
          const proceed = window.confirm(`🚨 偵測到耗用量明顯高於上次：\n本次用量 (${Math.round(currentUsage).toLocaleString()} 度) 高於上次用量 (${Math.round(lastTotalUsage).toLocaleString()} 度) 的 1.5 倍。\n\n您確定數據正確無誤要儲存嗎？`);
          if (!proceed) { setMsg(''); return; }
        }
      }

      let payload = {
        type,
        date: new Date(date).toISOString(),
        createdAt: new Date().toISOString(), 
        month: recordMonth,
        readings: {}
      };

      for (let k in currentReadings) {
        payload.readings[k] = Number(currentReadings[k]);
      }

      await addDoc(collection(db, `usage_records_${year}`), payload);
      setMsg('✅ 新增紀錄成功！');
      
      setElectricReadings(initElectricState);
      setWaterReadings(initWaterState);
      setRainReadings(initRainState);
      fetchDashboardData();
      setTimeout(() => { setMsg(''); onClose(); }, 800);
    } catch (err) {
      console.error(err);
      setMsg('❌ 新增失敗');
    }
  };

  const handleElectricChange = (key, value) => setElectricReadings(prev => ({ ...prev, [key]: value }));
  const handleWaterChange = (key, value) => setWaterReadings(prev => ({ ...prev, [key]: value }));
  const handleRainChange = (key, value) => setRainReadings(prev => ({ ...prev, [key]: value }));

  const renderField = (f, readings) => {
    const prevReading = lastRecord?.readings?.[f.key] || 0;
    const currentInput = readings[f.key];
    const currentVal = Number(currentInput);
    const isInvalid = currentInput !== '' && currentVal < prevReading;
    
    // 即時異常偵測
    const lastFieldUsage = lastFieldUsages[f.key] || 0;
    const currentFieldUsage = currentVal - prevReading;
    const minThreshold = type === 'electric' ? 0.05 : 0.5;
    const isAnomaly = !isInvalid && currentInput !== '' && currentFieldUsage > (lastFieldUsage * 1.5) && currentFieldUsage > minThreshold;
    
    return (
      <div className="form-group" style={{ marginBottom: 0 }} key={f.key}>
        <label className="form-label" style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
          {f.label} 
          {lastRecord && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}> (上次: {prevReading})</span>}
        </label>
        <input 
          type="number" 
          className={`form-control ${isInvalid ? 'border-error' : ''}`} 
          value={currentInput} 
          onChange={e => {
            if (type === 'electric') handleElectricChange(f.key, e.target.value);
            else if (type === 'water') handleWaterChange(f.key, e.target.value);
            else handleRainChange(f.key, e.target.value);
          }}
          required 
          min="0" 
          step="any" 
          style={isInvalid ? { borderColor: 'var(--color-error)', background: 'rgba(239, 68, 68, 0.05)' } : isAnomaly ? { borderColor: 'var(--color-warning)', background: 'rgba(245, 158, 11, 0.05)' } : {}}
        />
        {isInvalid && <div style={{ color: 'var(--color-error)', fontSize: '0.65rem', marginTop: '4px' }}>⚠️ 不可低於上次紀錄</div>}
        {isAnomaly && <div style={{ color: 'var(--color-warning)', fontSize: '0.65rem', marginTop: '4px' }}>⚠️ 本次增量較高，請確認</div>}
      </div>
    );
  };

  const headerTitle = type === 'electric' ? '每日用電讀數' : type === 'water' ? '每日用水讀數' : '每日雨水讀數';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-panel fade-in" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={24} />
        </button>
        
        <h2 style={{ marginBottom: '1.5rem', color: type === 'electric' ? 'var(--color-electric)' : type==='water' ? 'var(--color-water)' : 'var(--color-rain)' }}>
          填寫{headerTitle}
        </h2>
        
        <form onSubmit={handleAddDaily}>
          <div className="form-group">
            <label className="form-label">選擇日期</label>
            <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
          </div>

          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.2rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: type === 'electric' ? '1fr 1fr' : '1fr', gap: '1rem' }}>
            <div style={{ gridColumn: '1 / -1', color: type === 'electric' ? 'var(--color-electric)' : type === 'water' ? 'var(--color-water)' : 'var(--color-rain)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={16} /> 請輸入當日表累積讀數：
            </div>
            {type === 'electric' && electricityFields.map(f => renderField(f, electricReadings))}
            {type === 'water' && waterFields.map(f => renderField(f, waterReadings))}
            {type === 'rain' && rainFields.map(f => renderField(f, rainReadings))}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
            disabled={isFetchingRef || isAnyInvalid}
          >
            {isFetchingRef ? <RefreshCw className="spinner" size={18} /> : <Plus size={18} />} 
            {isFetchingRef ? '正在檢查歷史數據...' : isAnyInvalid ? '數據輸入有誤 (不可低於上次)' : '確認新增存檔'}
          </button>
        </form>

        {msg && <div style={{ marginTop: '1rem', color: msg.includes('成功') ? 'var(--color-success)' : 'var(--color-error)', textAlign: 'center', fontWeight: 'bold' }}>{msg}</div>}
      </div>
    </div>
  );
};

export default DataInputModal;
