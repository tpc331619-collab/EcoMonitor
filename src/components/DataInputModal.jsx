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
  { key: 'billUsage', label: '⚡ 台電帳單實收度數 (kWh)', isBill: true },
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
  const [nextRecord, setNextRecord] = useState(null); // 新增：月內下一筆
  const [lastFieldUsages, setLastFieldUsages] = useState({});
  const [lastTotalUsage, setLastTotalUsage] = useState(0);
  const [isFetchingRef, setIsFetchingRef] = useState(false);
  const [msg, setMsg] = useState('');

  // 輔助計算總量
  const [factors, setFactors] = useState({});
  const [globalFactor, setGlobalFactor] = useState(4.233);

  useEffect(() => {
    const fetchFactors = async () => {
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, 'settings', 'electric_factor'));
        if (snap.exists()) {
          const data = snap.data();
          setFactors(data.field_factors || {});
          setGlobalFactor(Number(data.meter_factor || data.value) || 4.233);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchFactors();
  }, []);

  const calcTotal = (rd) => {
    if (!rd) return 0;
    if (type === 'electric') {
      const getFieldVal = (key) => {
        const val = Number(rd[key]) || 0;
        const factor = factors[key] !== undefined ? Number(factors[key]) : globalFactor;
        const unitMultiplier = (key === 'ml' || key === 'mp1' || key === 'mp') ? 1000 : 1;
        return val * unitMultiplier * factor;
      };
      return electricityFields.reduce((sum, f) => sum + getFieldVal(f.key), 0);
    }
    return rd.total || rd.rain || 0;
  };

  // 判斷是否任何欄位無效 (小於當月前一筆 或 大於當月後一筆)
  const getIsAnyInvalid = () => {
    const readings = type === 'electric' ? electricReadings : type === 'water' ? waterReadings : rainReadings;
    for (let k in readings) {
      if (readings[k] === '') continue;
      const val = Number(readings[k]);
      // 下限檢查 (當月前一筆)
      if (lastRecord && val < (lastRecord.readings?.[k] || 0)) return { key: k, type: 'lower' };
      // 上限檢查 (當月後一筆)
      if (nextRecord && val > (nextRecord.readings?.[k] || 0)) return { key: k, type: 'upper' };
    }
    return null;
  };
  const invalidInfo = getIsAnyInvalid();
  const isAnyInvalid = !!invalidInfo;

  // 獲取參考資料 (尋找當月最近的紀錄)
  useEffect(() => {
    const fetchRef = async () => {
      if (!isOpen) return;
      setIsFetchingRef(true);
      try {
        const currentDate = new Date(date).toISOString();
        const currentYear = date.substring(0, 4);
        const currentMonth = date.substring(0, 7);

        // 僅抓取「當月」的紀錄作為上下限參考
        const q = query(
          collection(db, `usage_records_${currentYear}`),
          where('type', '==', type),
          where('month', '==', currentMonth),
          orderBy('date', 'asc')
        );
        
        const snap = await getDocs(q);
        let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 排序：日期 asc > 存檔時間 asc
        results.sort((a, b) => {
           const dateCompare = a.date.localeCompare(b.date);
           if (dateCompare !== 0) return dateCompare;
           return (a.createdAt || '').localeCompare(b.createdAt || '');
        });

        // 找出「前一筆」與「後一筆」
        let prev = null;
        let next = null;
        
        for (let i = 0; i < results.length; i++) {
          if (results[i].date <= currentDate) {
            prev = results[i];
          } else {
            next = results[i];
            break;
          }
        }

        setLastRecord(prev);
        setNextRecord(next);
        
        if (prev) {
          // 為了計算建議增量，我們可能還需要 prev 的 prev
          const prevIdx = results.indexOf(prev);
          if (prevIdx > 0) {
            const r1 = prev.readings;
            const r2 = results[prevIdx - 1].readings;
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
    const isBill = f.isBill;
    const prevReading = isBill ? 0 : (lastRecord?.readings?.[f.key] || 0);
    const nextReading = isBill ? Infinity : (nextRecord?.readings?.[f.key] || Infinity);
    const currentInput = readings[f.key];
    const currentVal = Number(currentInput);
    
    const isLowerInvalid = !isBill && currentInput !== '' && currentVal < prevReading;
    const isUpperInvalid = !isBill && currentInput !== '' && currentVal > nextReading;
    const isInvalid = isLowerInvalid || isUpperInvalid;
    
    // 即時異常偵測
    const lastFieldUsage = lastFieldUsages[f.key] || 0;
    const currentFieldUsage = currentVal - prevReading;
    const minThreshold = type === 'electric' ? 0.05 : 0.5;
    const isAnomaly = !isBill && !isInvalid && currentInput !== '' && currentFieldUsage > (lastFieldUsage * 1.5) && currentFieldUsage > minThreshold;
    
    return (
      <div className="form-group" style={{ 
        marginBottom: 0, 
        gridColumn: isBill ? '1 / -1' : 'auto',
        background: isBill ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
        padding: isBill ? '10px' : '0',
        borderRadius: isBill ? '8px' : '0',
        border: isBill ? '1px dashed rgba(99, 102, 241, 0.3)' : 'none',
        marginTop: isBill ? '10px' : '0'
      }} key={f.key}>
        <label className="form-label" style={{ 
          fontSize: isBill ? '0.9rem' : '0.8rem', 
          display: 'flex', 
          justifyContent: 'space-between', 
          flexWrap: 'wrap', 
          gap: '4px', 
          alignItems: 'flex-end', 
          lineHeight: '1.4',
          color: isBill ? '#818cf8' : 'inherit',
          fontWeight: isBill ? 'bold' : 'normal'
        }}>
          <span>{f.label}</span>
          {!isBill && (lastRecord || nextRecord) && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
              {lastRecord && `(前: ${prevReading})`}
              {lastRecord && nextRecord && ' ~ '}
              {nextRecord && `(後: ${nextReading})`}
            </span>
          )}
        </label>
        <input 
          type="number" 
          className={`form-control ${isInvalid ? 'border-error' : ''}`} 
          value={currentInput} 
          placeholder={isBill ? "選填：若本筆為月底紀錄，可填入帳單度數" : ""}
          onChange={e => {
            if (type === 'electric') handleElectricChange(f.key, e.target.value);
            else if (type === 'water') handleWaterChange(f.key, e.target.value);
            else handleRainChange(f.key, e.target.value);
          }}
          required={!isBill}
          min="0" 
          step="any" 
          style={isInvalid ? { borderColor: 'var(--color-error)', background: 'rgba(239, 68, 68, 0.05)' } : isAnomaly ? { borderColor: 'var(--color-warning)', background: 'rgba(245, 158, 11, 0.05)' } : isBill ? { borderColor: 'rgba(99, 102, 241, 0.5)' } : {}}
        />
        {isLowerInvalid && <div style={{ color: 'var(--color-error)', fontSize: '0.65rem', marginTop: '4px' }}>⚠️ 不可低於前次紀錄 ({prevReading})</div>}
        {isUpperInvalid && <div style={{ color: 'var(--color-error)', fontSize: '0.65rem', marginTop: '4px' }}>⚠️ 不可高於後續紀錄 ({nextReading})</div>}
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

          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.2rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: type === 'electric' ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr', gap: '1rem' }}>
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
            {isFetchingRef ? '正在檢查歷史數據...' : invalidInfo?.type === 'lower' ? '數據不可低於前次' : invalidInfo?.type === 'upper' ? '數據不可高於後續' : '確認新增存檔'}
          </button>
        </form>

        {msg && <div style={{ marginTop: '1rem', color: msg.includes('成功') ? 'var(--color-success)' : 'var(--color-error)', textAlign: 'center', fontWeight: 'bold' }}>{msg}</div>}
      </div>
    </div>
  );
};

export default DataInputModal;
