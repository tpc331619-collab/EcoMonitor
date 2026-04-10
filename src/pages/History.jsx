import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { Download, Calendar, Zap, Droplet, CloudRain, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import EditRecordModal from '../components/EditRecordModal';

const HistoryPage = () => {
  const { role } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editRecordData, setEditRecordData] = useState(null);
  const [expandedMonths, setExpandedMonths] = useState([]);

  const years = ['2024', '2025', '2026', '2027', '2028', '2029', '2030'];

  useEffect(() => {
    fetchYearlyRecords();
  }, [selectedYear]);

  const fetchYearlyRecords = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, `usage_records_${selectedYear}`), orderBy('date', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setRecords(data);
    } catch (error) {
      console.error("Error fetching yearly records:", error);
      setRecords([]);
    }
    setLoading(false);
  };

  const handleDelete = async (monthStr, id) => {
    if (window.confirm('確定要刪除這筆歷史紀錄嗎？')) {
      try {
        const year = monthStr.substring(0, 4);
        await deleteDoc(doc(db, `usage_records_${year}`, id));
        fetchYearlyRecords();
      } catch (err) {
        console.error(err);
        alert('刪除失敗');
      }
    }
  };

  // 按月份分組資料
  const getGroupedRecords = () => {
    const grouped = {};
    records.forEach(record => {
      const month = record.month || format(new Date(record.date), 'yyyy-MM');
      if (!grouped[month]) grouped[month] = [];
      grouped[month].push(record);
    });
    return Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(month => ({
      month,
      list: grouped[month]
    }));
  };

  const toggleMonth = (month) => {
    setExpandedMonths(prev => 
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
    );
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const electricList = records.filter(r => r.type === 'electric');
    const waterList = records.filter(r => r.type === 'water');
    const rainList = records.filter(r => r.type === 'rain');

    if (electricList.length > 0) {
      const electricData = electricList.map(r => ({
        "日期": format(new Date(r.date), 'yyyy/MM/dd'),
        "辦公大樓": r.readings?.ml ?? 0,
        "倉儲大樓": r.readings?.mp1 ?? 0,
        "低壓用電": r.readings?.mp ?? 0,
        "1-1": r.readings?.kwh11 ?? 0,
        "1-2": r.readings?.kwh12 ?? 0,
        "1-3": r.readings?.kwh13 ?? 0,
        "2-1": r.readings?.kwh21 ?? 0,
        "AGV": r.readings?.agv ?? 0
      }));
      const ws = XLSX.utils.json_to_sheet(electricData);
      XLSX.utils.book_append_sheet(wb, ws, "用電年報表");
    }

    if (waterList.length > 0) {
      const waterData = waterList.map(r => ({
        "日期": format(new Date(r.date), 'yyyy/MM/dd'),
        "總水表(早)": r.readings?.total ?? 0,
        "總水表(夜)": r.readings?.drink ?? 0
      }));
      const ws = XLSX.utils.json_to_sheet(waterData);
      XLSX.utils.book_append_sheet(wb, ws, "用水年報表");
    }

    if (rainList.length > 0) {
      const rainData = rainList.map(r => ({
        "日期": format(new Date(r.date), 'yyyy/MM/dd'),
        "雨水回收(自設水表)": r.readings?.rain ?? 0
      }));
      const ws = XLSX.utils.json_to_sheet(rainData);
      XLSX.utils.book_append_sheet(wb, ws, "雨水年報表");
    }

    XLSX.writeFile(wb, `${selectedYear}年度_資源使用總表.xlsx`);
  };

  const groupedData = getGroupedRecords();

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>歷史紀錄查詢</h1>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0 1rem' }}>
            <Calendar size={18} style={{ marginRight: '0.5rem', color: 'var(--text-muted)' }} />
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{ background: 'none', border: 'none', color: 'var(--text-main)', padding: '0.5rem 0', outline: 'none', cursor: 'pointer', fontSize: '1rem', appearance: 'none', paddingRight: '1.5rem' }}
            >
              {years.map(y => <option key={y} value={y} style={{ background: '#1e293b' }}>{y} 年度</option>)}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: 'var(--text-muted)' }} />
          </div>

          <button onClick={handleExportExcel} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={18} /> 匯出年度 Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loader-container"><div className="spinner"></div></div>
      ) : groupedData.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>{selectedYear} 年度尚無任何紀錄資料</div>
        </div>
      ) : (
        <div className="history-accordion-container">
          {groupedData.map(({ month, list }) => {
            const isExpanded = expandedMonths.includes(month);
            const electrics = list.filter(r => r.type === 'electric');
            const waters = list.filter(r => r.type === 'water');
            const rains = list.filter(r => r.type === 'rain');

            return (
              <div key={month} className="glass-panel" style={{ marginBottom: '1.5rem', padding: 0, overflow: 'hidden' }}>
                <div 
                  onClick={() => toggleMonth(month)}
                  style={{ padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.05)' : 'transparent' }}
                >
                  <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                    {month} 紀錄明細
                  </h2>
                  <span style={{ color: 'var(--text-muted)' }}>共 {list.length} 筆筆數</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 2rem 2rem 2rem' }} className="fade-in">
                    {/* 用電表格 */}
                    {electrics.length > 0 && (
                      <div style={{ marginTop: '1.5rem' }}>
                        <h3 style={{ color: 'var(--color-electric)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Zap size={18} /> 用電紀錄
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                                <th style={{ padding: '0.8rem' }}>日期</th>
                                <th style={{ padding: '0.8rem' }}>辦公大樓</th>
                                <th style={{ padding: '0.8rem' }}>倉儲大樓</th>
                                <th style={{ padding: '0.8rem' }}>低壓用電</th>
                                <th style={{ padding: '0.8rem' }}>1-1</th>
                                <th style={{ padding: '0.8rem' }}>1-2</th>
                                <th style={{ padding: '0.8rem' }}>1-3</th>
                                <th style={{ padding: '0.8rem' }}>2-1</th>
                                <th style={{ padding: '0.8rem' }}>AGV</th>
                                {role === 'admin' && <th style={{ padding: '0.8rem', textAlign: 'right' }}>操作</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {electrics.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <td style={{ padding: '0.8rem' }}>{format(new Date(r.date), 'MM/dd')}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.ml?.toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.mp1?.toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.mp?.toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.kwh11?.toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.kwh12?.toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.kwh13?.toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.kwh21?.toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.agv?.toLocaleString()}</td>
                                  {role === 'admin' && (
                                    <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                      <button onClick={() => setEditRecordData(r)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', marginRight: '0.8rem' }}><Edit2 size={14} /></button>
                                      <button onClick={() => handleDelete(r.month, r.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* 自來水表格 */}
                    {waters.length > 0 && (
                      <div style={{ marginTop: '2rem' }}>
                        <h3 style={{ color: 'var(--color-water)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Droplet size={18} /> 自來水紀錄
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                                <th style={{ padding: '0.8rem' }}>日期</th>
                                <th style={{ padding: '0.8rem' }}>總水表(早)</th>
                                <th style={{ padding: '0.8rem' }}>總水表(夜)</th>
                                {role === 'admin' && <th style={{ padding: '0.8rem', textAlign: 'right' }}>操作</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {waters.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <td style={{ padding: '0.8rem' }}>{format(new Date(r.date), 'MM/dd')}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.total?.toLocaleString()}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.drink?.toLocaleString()}</td>
                                  {role === 'admin' && (
                                    <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                      <button onClick={() => setEditRecordData(r)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', marginRight: '0.8rem' }}><Edit2 size={14} /></button>
                                      <button onClick={() => handleDelete(r.month, r.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* 雨水表格 */}
                    {rains.length > 0 && (
                      <div style={{ marginTop: '2rem' }}>
                        <h3 style={{ color: 'var(--color-rain)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CloudRain size={18} /> 雨水回收紀錄
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                                <th style={{ padding: '0.8rem' }}>日期</th>
                                <th style={{ padding: '0.8rem' }}>雨水回收(自設水表)</th>
                                {role === 'admin' && <th style={{ padding: '0.8rem', textAlign: 'right' }}>操作</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {rains.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <td style={{ padding: '0.8rem' }}>{format(new Date(r.date), 'MM/dd')}</td>
                                  <td style={{ padding: '0.8rem' }}>{r.readings?.rain?.toLocaleString()}</td>
                                  {role === 'admin' && (
                                    <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                      <button onClick={() => setEditRecordData(r)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', marginRight: '0.8rem' }}><Edit2 size={14} /></button>
                                      <button onClick={() => handleDelete(r.month, r.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 編輯彈窗 */}
      <EditRecordModal 
        isOpen={!!editRecordData} 
        onClose={() => setEditRecordData(null)}
        record={editRecordData}
        fetchDashboardData={fetchYearlyRecords}
      />
    </div>
  );
};

export default HistoryPage;
