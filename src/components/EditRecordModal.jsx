import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { X, Save } from 'lucide-react';
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
  const [amount, setAmount] = useState('');
  const [electricReadings, setElectricReadings] = useState({});
  const [waterReadings, setWaterReadings] = useState({});
  const [rainReadings, setRainReadings] = useState({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (record) {
      setDate(format(new Date(record.date), 'yyyy-MM-dd'));
      if (record.type === 'electric') {
        setElectricReadings(record.readings || {});
      } else if (record.type === 'water') {
        setWaterReadings(record.readings || {});
      } else if (record.type === 'rain') {
        setRainReadings(record.readings || {});
      } else {
        setAmount(record.amount || '');
      }
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const recordMonth = date.substring(0, 7); 
      let payload = {
        date: new Date(date).toISOString(),
        month: recordMonth
      };

      if (record.type === 'electric') {
        payload.readings = {};
        for (let k in electricReadings) {
          payload.readings[k] = Number(electricReadings[k]);
        }
      } else if (record.type === 'water') {
        payload.readings = {};
        for (let k in waterReadings) {
          payload.readings[k] = Number(waterReadings[k]);
        }
      } else if (record.type === 'rain') {
        payload.readings = {};
        for (let k in rainReadings) {
          payload.readings[k] = Number(rainReadings[k]);
        }
      }

      const originalYear = record.month ? record.month.substring(0, 4) : record.date.substring(0, 4);
      const newYear = recordMonth.substring(0, 4);

      if (originalYear === newYear) {
        await updateDoc(doc(db, `usage_records_${newYear}`, record.id), payload);
      } else {
        // 如果跨年修改日期，需要把舊資料刪除，移到新的年份集合
        const { deleteDoc, setDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, `usage_records_${originalYear}`, record.id));
        await setDoc(doc(db, `usage_records_${newYear}`, record.id), payload);
      }

      setMsg('更新成功！');
      fetchDashboardData();
      setTimeout(() => { setMsg(''); onClose(); }, 1000);
    } catch (err) {
      console.error(err);
      setMsg('更新失敗');
    }
  };

  const handleElectricChange = (key, value) => setElectricReadings(prev => ({ ...prev, [key]: value }));
  const handleWaterChange = (key, value) => setWaterReadings(prev => ({ ...prev, [key]: value }));
  const handleRainChange = (key, value) => setRainReadings(prev => ({ ...prev, [key]: value }));

  const typeLabels = { electric: '用電讀數(8項)', water: '水表讀數(2項)', rain: '雨水標(1項)' };

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
        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>目前修改項目：{typeLabels[record.type]}</p>
        
        <form onSubmit={handleUpdate}>
          <div className="form-group">
            <label className="form-label">日期</label>
            <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
          </div>

          {record.type === 'electric' ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: '1 / -1', color: 'var(--color-electric)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem' }}>修改電表累積讀數：</div>
              {electricityFields.map(f => (
                <div className="form-group" style={{ marginBottom: 0 }} key={f.key}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>{f.label}</label>
                  <input type="number" className="form-control" value={electricReadings[f.key] || ''} onChange={e => handleElectricChange(f.key, e.target.value)} required min="0" step="any" />
                </div>
              ))}
            </div>
          ) : record.type === 'water' ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{ color: 'var(--color-water)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem' }}>修改水表累積讀數：</div>
              {waterFields.map(f => (
                <div className="form-group" style={{ marginBottom: 0 }} key={f.key}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>{f.label}</label>
                  <input type="number" className="form-control" value={waterReadings[f.key] || ''} onChange={e => handleWaterChange(f.key, e.target.value)} required min="0" step="any" />
                </div>
              ))}
            </div>
          ) : record.type === 'rain' ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{ color: 'var(--color-rain)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem' }}>修改雨水累積讀數：</div>
              {rainFields.map(f => (
                <div className="form-group" style={{ marginBottom: 0 }} key={f.key}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>{f.label}</label>
                  <input type="number" className="form-control" value={rainReadings[f.key] || ''} onChange={e => handleRainChange(f.key, e.target.value)} required min="0" step="any" />
                </div>
              ))}
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">數量/度數</label>
              <input type="number" className="form-control" value={amount} onChange={e => setAmount(e.target.value)} required min="0" step="0.1" />
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}><Save size={18} /> 儲存變更</button>
        </form>
        {msg && <div style={{ marginTop: '1rem', color: msg.includes('成功') ? 'var(--color-success)' : 'var(--color-error)' }}>{msg}</div>}
      </div>
    </div>
  );
};

export default EditRecordModal;
