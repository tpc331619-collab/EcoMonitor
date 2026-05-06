import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { X, Save, Info, RefreshCw } from 'lucide-react';
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

const EditRecordModal = ({ isOpen, onClose, record, fetchDashboardData }) => {
  const [date, setDate] = useState('');
  const [electricReadings, setElectricReadings] = useState({});
  const [waterReadings, setWaterReadings] = useState({});
  const [rainReadings, setRainReadings] = useState({});
  
  const [lastRecord, setLastRecord] = useState(null);
  const [nextRecord, setNextRecord] = useState(null);
  const [lastFieldUsages, setLastFieldUsages] = useState({});
  const [isFetchingRef, setIsFetchingRef] = useState(false);
  const [msg, setMsg] = useState('');

  // 當選擇的紀錄或日期改變時，抓取「當月」參考資料
  useEffect(() => {
    const fetchRef = async () => {
      if (!isOpen || !record || !date) return;
      setIsFetchingRef(true);
      try {
        const currentYear = date.substring(0, 4);
        const currentMonth = date.substring(0, 7).replace(/\//g, '-');
        const currentDate = new Date(date).toISOString();
        
        const q = query(
          collection(db, `usage_records_${currentYear}`),
          where('type', '==', record.type)
        );
        const snap = await getDocs(q);
        let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        results.sort((a, b) => a.date.localeCompare(b.date));

        const monthRecords = results.filter(r => (r.month || '').replace(/\//g, '-') === currentMonth);
        const otherRecords = monthRecords.filter(r => r.id !== record.id);
        
        let prev = null;
        let next = null;

        for (let i = 0; i < otherRecords.length; i++) {
          if (otherRecords[i].date <= currentDate) {
            prev = otherRecords[i];
          } else {
            next = otherRecords[i];
            break;
          }
        }

        setLastRecord(prev);
        setNextRecord(next);
        
        if (prev) {
          const prevIdx = otherRecords.indexOf(prev);
          const pOfP = otherRecords[prevIdx - 1]; 
          if (pOfP) {
            const r1 = prev.readings;
            const r2 = pOfP.readings;
            const fDiffs = {};
            for(let k in r1) {
              const d = (Number(r1[k]) || 0) - (Number(r2[k]) || 0);
              if (d > 0) fDiffs[k] = d;
            }
            setLastFieldUsages(fDiffs);
          } else {
            setLastFieldUsages({});
          }
        } else {
          setLastFieldUsages({});
        }
      } catch (err) {
        console.error("[Edit] FetchRef Error:", err);
      }
      setIsFetchingRef(false);
    };
    fetchRef();
  }, [isOpen, record, date]);

  useEffect(() => {
    if (record) {
      setDate(format(new Date(record.date), 'yyyy-MM-dd'));
      if (record.type === 'electric') setElectricReadings(record.readings || {});
      else if (record.type === 'water') setWaterReadings(record.readings || {});
      else if (record.type === 'rain') setRainReadings(record.readings || {});
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const handleUpdate = async (e) => {
    e.preventDefault();
    setMsg('儲存中...');
    try {
      const recordMonth = date.substring(0, 7); 
      let readings = record.type === 'electric' ? electricReadings : record.type === 'water' ? waterReadings : rainReadings;
      
      let payload = {
        date: new Date(date).toISOString(),
        month: recordMonth,
        readings: {}
      };

      for (let k in readings) {
        payload.readings[k] = Number(readings[k]);
      }

      const originalYear = record.month ? record.month.substring(0, 4) : record.date.substring(0, 4);
      const newYear = recordMonth.substring(0, 4);

      if (originalYear === newYear) {
        await updateDoc(doc(db, `usage_records_${newYear}`, record.id), payload);
      } else {
        const { deleteDoc, setDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, `usage_records_${originalYear}`, record.id));
        await setDoc(doc(db, `usage_records_${newYear}`, record.id), payload);
      }

      setMsg('✅ 修改成功！');
      fetchDashboardData();
      setTimeout(() => { setMsg(''); onClose(); }, 800);
    } catch (err) {
      console.error(err);
      setMsg('❌ 修改失敗');
    }
  };

  const handleChange = (key, value) => {
    if (record.type === 'electric') setElectricReadings(prev => ({ ...prev, [key]: value }));
    else if (record.type === 'water') setWaterReadings(prev => ({ ...prev, [key]: value }));
    else setRainReadings(prev => ({ ...prev, [key]: value }));
  };

  const getIsAnyInvalid = () => {
    let readings = record.type === 'electric' ? electricReadings : record.type === 'water' ? waterReadings : rainReadings;
    for (let k in readings) {
      if (readings[k] === '') continue;
      const val = Number(readings[k]);
      if (lastRecord && val < (lastRecord.readings?.[k] || 0)) return { key: k, type: 'lower' };
      if (nextRecord && val > (nextRecord.readings?.[k] || 0)) return { key: k, type: 'upper' };
    }
    return null;
  };
  const invalidInfo = getIsAnyInvalid();
  const isAnyInvalid = !!invalidInfo;

  const renderField = (f, readings) => {
    const prevReading = lastRecord?.readings?.[f.key] || 0;
    const nextReading = nextRecord?.readings?.[f.key] || Infinity;
    const currentInput = readings[f.key];
    const currentVal = Number(currentInput);
    
    const isLowerInvalid = currentInput !== '' && currentVal < prevReading;
    const isUpperInvalid = currentInput !== '' && currentVal > nextReading;
    const isInvalid = isLowerInvalid || isUpperInvalid;
    
    // 即時異常偵測
    const lastUsage = lastFieldUsages[f.key] || 0;
    const currentUsage = currentVal - prevReading;
    const minThreshold = record.type === 'electric' ? 0.05 : 0.5;
    const isAnomaly = !isInvalid && currentInput !== '' && currentUsage > (lastUsage * 1.5) && currentUsage > minThreshold;

    return (
      <div className="form-group" style={{ marginBottom: 0 }} key={f.key}>
        <label className="form-label" style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{f.label}</span>
            {currentInput !== '' && !isInvalid && (
              <span className={isAnomaly ? 'text-warning' : 'text-success'} style={{ fontSize: '0.75rem', fontWeight: 'bold', background: isAnomaly ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)', padding: '1px 6px', borderRadius: '4px' }}>
                +{currentUsage.toFixed(3)}
              </span>
            )}
          </div>
          {(lastRecord || nextRecord) && (
            <span style={{ color: '#fbbf24', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(251, 191, 36, 0.1)', padding: '1px 6px', borderRadius: '4px' }}>
              {lastRecord && `(前: ${prevReading})`}
              {lastRecord && nextRecord && ' ~ '}
              {nextRecord && `(後: ${nextReading})`}
            </span>
          )}
          {isFetchingRef && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>🔍 正在同步...</span>}
        </label>
        <input 
          type="number" 
          className={`form-control ${isInvalid ? 'border-error' : ''}`} 
          value={currentInput || ''} 
          onChange={e => handleChange(f.key, e.target.value)}
          required 
          min="0" 
          step="any" 
          style={isInvalid ? { borderColor: 'var(--color-error)', background: 'rgba(239, 68, 68, 0.05)' } : isAnomaly ? { borderColor: 'var(--color-warning)', background: 'rgba(245, 158, 11, 0.05)' } : {}}
        />
        {isLowerInvalid && <div style={{ color: 'var(--color-error)', fontSize: '0.65rem', marginTop: '4px' }}>⚠️ 不可低於前次紀錄 ({prevReading})</div>}
        {isUpperInvalid && <div style={{ color: 'var(--color-error)', fontSize: '0.65rem', marginTop: '4px' }}>⚠️ 不可高於後續紀錄 ({nextReading})</div>}
        {isAnomaly && <div style={{ color: 'var(--color-warning)', fontSize: '0.65rem', marginTop: '4px' }}>⚠️ 修正後增量異常，請確認</div>}
      </div>
    );
  };

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
        
        <h2 style={{ marginBottom: '1.5rem' }}>修改資料</h2>
        <p className="text-muted" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={16} /> 目前修改項目：{record.type === 'electric' ? '用電讀數(8項)' : record.type === 'water' ? '水表讀數(2項)' : '雨水標(1項)'}
        </p>
        
        <form onSubmit={handleUpdate}>
          <div className="form-group">
            <label className="form-label">日期</label>
            <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
          </div>

          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.2rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: record.type === 'electric' ? '1fr 1fr' : '1fr', gap: '1rem' }}>
            <div style={{ gridColumn: '1 / -1', color: 'var(--text-accent)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem' }}>修改電表累積讀數：</div>
            
            {record.type === 'electric' && electricityFields.map(f => renderField(f, electricReadings))}
            {record.type === 'water' && waterFields.map(f => renderField(f, waterReadings))}
            {record.type === 'rain' && rainFields.map(f => renderField(f, rainReadings))}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
            disabled={isFetchingRef || isAnyInvalid}
          >
            {isFetchingRef ? <RefreshCw className="spinner" size={18} /> : <Save size={18} />} 
            {isFetchingRef ? '正在比對歷史數據...' : invalidInfo?.type === 'lower' ? '數據不可低於前次' : invalidInfo?.type === 'upper' ? '數據不可高於後續' : '儲存變更'}
          </button>
        </form>
        {msg && <div style={{ marginTop: '1rem', color: msg.includes('成功') ? 'var(--color-success)' : 'var(--color-error)', textAlign: 'center', fontWeight: 'bold' }}>{msg}</div>}
      </div>
    </div>
  );
};

export default EditRecordModal;
