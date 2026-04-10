import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { X, Plus } from 'lucide-react';
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
  
  const [msg, setMsg] = useState('');

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
      let payload = {
        type,
        date: new Date(date).toISOString(),
        month: recordMonth
      };

      if (type === 'electric') {
        payload.readings = {};
        for (let k in electricReadings) {
          payload.readings[k] = Number(electricReadings[k]);
        }
      } else if (type === 'water') {
        payload.readings = {};
        for (let k in waterReadings) {
          payload.readings[k] = Number(waterReadings[k]);
        }
      } else if (type === 'rain') {
        payload.readings = {};
        for (let k in rainReadings) {
          payload.readings[k] = Number(rainReadings[k]);
        }
      }

      const year = recordMonth.substring(0, 4);
      await addDoc(collection(db, `usage_records_${year}`), payload);
      setMsg('新增紀錄成功！');
      
      setElectricReadings(initElectricState);
      setWaterReadings(initWaterState);
      setRainReadings(initRainState);
      fetchDashboardData();
      setTimeout(() => {
        setMsg('');
        onClose();
      }, 800);
    } catch (err) {
      console.error(err);
      setMsg('新增失敗');
    }
  };

  const handleElectricChange = (key, value) => setElectricReadings(prev => ({ ...prev, [key]: value }));
  const handleWaterChange = (key, value) => setWaterReadings(prev => ({ ...prev, [key]: value }));
  const handleRainChange = (key, value) => setRainReadings(prev => ({ ...prev, [key]: value }));

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

          {type === 'electric' ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: '1 / -1', color: 'var(--color-electric)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem' }}>輸入當日電表累積讀數：</div>
              {electricityFields.map(f => (
                <div className="form-group" style={{ marginBottom: 0 }} key={f.key}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>{f.label}</label>
                  <input type="number" className="form-control" value={electricReadings[f.key]} onChange={e => handleElectricChange(f.key, e.target.value)} required min="0" step="any" />
                </div>
              ))}
            </div>
          ) : type === 'water' ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{ color: 'var(--color-water)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem' }}>輸入當日水表累積讀數：</div>
              {waterFields.map(f => (
                <div className="form-group" style={{ marginBottom: 0 }} key={f.key}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>{f.label}</label>
                  <input type="number" className="form-control" value={waterReadings[f.key]} onChange={e => handleWaterChange(f.key, e.target.value)} required min="0" step="any" />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{ color: 'var(--color-rain)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem' }}>輸入當日雨水表累積讀數：</div>
              {rainFields.map(f => (
                <div className="form-group" style={{ marginBottom: 0 }} key={f.key}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>{f.label}</label>
                  <input type="number" className="form-control" value={rainReadings[f.key]} onChange={e => handleRainChange(f.key, e.target.value)} required min="0" step="any" />
                </div>
              ))}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}><Plus size={18} /> 新增存檔</button>
        </form>

        {msg && <div style={{ marginTop: '1rem', color: msg.includes('成功') ? 'var(--color-success)' : 'var(--color-error)' }}>{msg}</div>}
      </div>
    </div>
  );
};

export default DataInputModal;
