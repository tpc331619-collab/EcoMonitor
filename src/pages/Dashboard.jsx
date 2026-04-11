import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Zap, Droplet, CloudRain, Edit2, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, PenTool, Settings, Calculator, Download, Sparkles, Camera, Cloud, CloudDrizzle, Sun, CloudRain as RainIcon, WifiOff, CloudOff, TrendingDown, Calendar, Globe, Leaf, Target } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { format, addMonths, subMonths, startOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import { toBlob, toPng } from 'html-to-image';
import DataInputModal from '../components/DataInputModal';
import EditRecordModal from '../components/EditRecordModal';
import LimitSettingModal from '../components/LimitSettingModal';
import FactorSettingModal from '../components/FactorSettingModal';

const Dashboard = () => {
  const { role } = useAuth();
  const isOnline = useNetworkStatus();
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const currentMonthStr = format(currentMonthDate, 'yyyy-MM');

  const [limits, setLimits] = useState({ electric: 1000, water: 500 });
  const [currentUsage, setCurrentUsage] = useState({ electric: 0, water: 0, rain: 0 });
  const [carbonGoals, setCarbonGoals] = useState({ reductionTarget: 5, baseYearAvg: 1000 });
  const [records, setRecords] = useState([]);
  const [electricFactor, setElectricFactor] = useState(4.233);
  const [emissionFactor, setEmissionFactor] = useState(0.495);
  const [emissionHistory, setEmissionHistory] = useState({ '2000-01': 0.495 });

  const [loading, setLoading] = useState(true);

  const [isInputModalOpen, setInputModalOpen] = useState(false);
  const [isLimitModalOpen, setLimitModalOpen] = useState(false);
  const [isFactorModalOpen, setFactorModalOpen] = useState(false);
  const [inputType, setInputType] = useState('electric');
  const [editRecordData, setEditRecordData] = useState(null);
  const [expandedTables, setExpandedTables] = useState({ electric: false, water: false, rain: false });
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [weather, setWeather] = useState({ temp: '--', pop: '--', desc: '載入中...', icon: 'sun', location: '--' });

  const electricCardRef = useRef(null);
  const waterCardRef = useRef(null);
  const rainCardRef = useRef(null);

  useEffect(() => {
    fetchDashboardData();
    fetchWeatherData();
  }, [currentMonthDate]);

  const fetchWeatherData = async () => {
    if (!isOnline) {
      setWeather(prev => ({ ...prev, desc: '離線模式' }));
      return;
    }
    const apiKey = import.meta.env.VITE_CWA_API_KEY;
    const district = import.meta.env.VITE_PLANT_DISTRICT || '觀音區';

    if (!apiKey || apiKey.includes('XXXX')) return;

    try {
      const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-005?Authorization=${apiKey}&elementName=PoP12h,T,Wx`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success === true || data.success === "true") {
        const locationsWrapper = data.records?.Locations || data.records?.locations || [];
        const locations = locationsWrapper[0]?.Location || locationsWrapper[0]?.location || [];

        let searchDistrict = (district && !district.includes('?')) ? district : '觀音';
        const searchKey = searchDistrict.replace('區', '');

        const location = locations.find(loc => {
          const name = loc.LocationName || loc.locationName || '';
          return name.includes(searchKey);
        }) || locations.find(loc => (loc.LocationName || loc.locationName || '').includes('觀音')) || locations[0];

        if (location) {
          const elements = location.WeatherElement || location.weatherElement || [];
          const wxElem = elements.find(e => {
            const name = e.ElementName || e.elementName || '';
            return name === "Wx" || name === "天氣現象";
          });
          const popElem = elements.find(e => {
            const name = e.ElementName || e.elementName || '';
            return name === "PoP12h" || name === "3小時降雨機率";
          });
          const tElem = elements.find(e => {
            const name = e.ElementName || e.elementName || '';
            return name === "T" || name === "溫度";
          });

          const wxValueObj = wxElem?.Time?.[0]?.ElementValue?.[0] || wxElem?.time?.[0]?.elementValue?.[0];
          const tValueObj = tElem?.Time?.[0]?.ElementValue?.[0] || tElem?.time?.[0]?.elementValue?.[0];

          const wx = wxValueObj?.Weather || wxValueObj?.value || wxValueObj?.Value || '未知';
          const temp = tValueObj?.Temperature || tValueObj?.value || tValueObj?.Value || '--';

          let icon = 'sun';
          if (wx.includes('雨')) icon = 'rain';
          else if (wx.includes('陰') || wx.includes('多雲')) icon = 'cloud';

          setWeather({ temp, desc: wx, icon, location: location.LocationName || location.locationName || searchKey });
        }
      }
    } catch (err) {
      console.error("Weather fetch failed:", err);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const currentYear = currentMonthStr.substring(0, 4);
      const currentMonthNum = currentMonthStr.substring(5, 7);

      const limitsRef = doc(db, `settings_${currentYear}`, `limits_${currentMonthNum}`);
      const factorSnap = await getDoc(doc(db, "settings", "electric_factor"));
      let loadedMeterFactor = 4.233;

      if (factorSnap.exists()) {
        const fdata = factorSnap.data();
        loadedMeterFactor = Number(fdata.meter_factor || fdata.value) || 4.233;
        let rawHistory = fdata.emission_history || {};
        if (Array.isArray(rawHistory)) {
          const migratedMap = {};
          rawHistory.forEach(h => { if (h.startMonth) migratedMap[h.startMonth] = h.value; });
          rawHistory = migratedMap;
        }
        setElectricFactor(loadedMeterFactor);
        setEmissionHistory(rawHistory);
        const sortedMonths = Object.keys(rawHistory).sort((a, b) => b.localeCompare(a));
        const activeMonth = sortedMonths.find(m => m <= currentMonthStr) || sortedMonths[sortedMonths.length - 1];
        setEmissionFactor(rawHistory[activeMonth] || 0.495);
      }

      const carbonSnap = await getDoc(doc(db, `settings_${currentYear}`, "carbon_goals"));
      if (carbonSnap.exists()) setCarbonGoals(carbonSnap.data());

      const setSnap = await getDoc(limitsRef);
      if (setSnap.exists()) setLimits(setSnap.data());
      else setLimits({ electric: 1000, water: 500 });

      const q = query(collection(db, `usage_records_${currentYear}`), where('month', '==', currentMonthStr));
      const querySnapshot = await getDocs(q);

      let recs = [];
      let electricRecords = [];
      let waterRecords = [];
      let rainRecords = [];

      querySnapshot.forEach((docSnap) => {
        const d = docSnap.data();
        recs.push({ id: docSnap.id, ...d });
        if (d.type === 'electric') electricRecords.push(d);
        if (d.type === 'water') waterRecords.push(d);
        if (d.type === 'rain') rainRecords.push(d);
      });

      recs.sort((a, b) => new Date(b.date) - new Date(a.date));
      electricRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
      waterRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
      rainRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

      let e = 0;
      const electricBaseRecord = electricRecords.find(r => format(new Date(r.date), 'dd') === '01');
      if (electricBaseRecord && electricRecords.length >= 1) {
        const base = electricBaseRecord.readings;
        const latest = electricRecords[electricRecords.length - 1].readings;
        const totalBase = (base.ml || 0)*1000 + (base.mp1 || 0)*1000 + (base.mp || 0)*1000 + (base.kwh11 || 0) + (base.kwh12 || 0) + (base.kwh13 || 0) + (base.kwh21 || 0) + (base.agv || 0);
        const totalLatest = (latest.ml || 0)*1000 + (latest.mp1 || 0)*1000 + (latest.mp || 0)*1000 + (latest.kwh11 || 0) + (latest.kwh12 || 0) + (latest.kwh13 || 0) + (latest.kwh21 || 0) + (latest.agv || 0);
        e = (totalLatest - totalBase) * loadedMeterFactor;
        if (electricRecords.length === 1) e = totalBase * loadedMeterFactor;
      }

      let w = 0;
      const waterBaseRecord = waterRecords.find(r => format(new Date(r.date), 'dd') === '01');
      if (waterBaseRecord && waterRecords.length >= 1) {
        const base = waterBaseRecord.readings;
        const latest = waterRecords[waterRecords.length - 1].readings;
        w = (latest.total || 0) - (base.total || 0);
        if (waterRecords.length === 1) w = 0; // 同一天無累積
      }

      let rUsage = 0;
      const rain01 = rainRecords.find(r => format(new Date(r.date), 'dd') === '01');
      const latestRain = rainRecords[rainRecords.length - 1];
      if (latestRain && rain01) rUsage = (latestRain.readings?.rain || 0) - (rain01.readings?.rain || 0);

      setCurrentUsage({ electric: e, water: w, rain: rUsage });
      setRecords(recs);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (offset) => setCurrentMonthDate(prev => offset > 0 ? addMonths(prev, offset) : subMonths(prev, Math.abs(offset)));

  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getDaysPassed = (date) => {
    const now = new Date();
    if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) return getDaysInMonth(date);
    return Math.max(1, now.getDate());
  };

  const daysTotal = getDaysInMonth(currentMonthDate);
  const daysPassed = getDaysPassed(currentMonthDate);
  const currentWeek = Math.ceil(daysPassed / 7);
  const benchDays = Math.min(daysTotal, currentWeek * 7);

  const eLimit = limits.electric || 1;
  const wLimit = limits.water || 1;
  const eBench = (eLimit / daysTotal) * benchDays;
  const wBench = (wLimit / daysTotal) * benchDays;
  const ePace = currentUsage.electric / (eBench || 1);
  const wPace = currentUsage.water / (wBench || 1);

  const electricPct = Math.min(100, (currentUsage.electric / eLimit) * 100);
  const waterPct = Math.min(100, (currentUsage.water / wLimit) * 100);

  const eProjected = (currentUsage.electric / daysPassed) * daysTotal;
  const carbonBudget = Math.round(carbonGoals.baseYearAvg * (1 - carbonGoals.reductionTarget / 100) * emissionFactor);
  const carbonProjected = Math.round(eProjected * emissionFactor);
  const isCarbonExceeded = carbonProjected > carbonBudget;

  const getAITip = (type, used, limit) => {
    if (used === 0) return '⚡ 系統待命中...';
    const pace = type === 'electric' ? ePace : wPace;
    if (pace > 1.2) return <span className="text-error">🚨 異常超標</span>;
    if (pace > 1.05) return <span className="text-warning">⚠️ 些微超過</span>;
    return <span className="text-success">✅ 狀態正常</span>;
  };

  const getDetailedAnalysis = (type, used, limit) => {
    if (used === 0) return '請輸入第一筆數據以啟動分析。';
    if (type === 'electric') {
      const remaining = limit - used;
      if (remaining > 0) return `🔵 空間：目前節約表現優異，尚有 ${Math.round(remaining).toLocaleString()} 度預算空間。`;
      return `🔴 警告：目前累積用量已超過月度預算上限。`;
    }
    if (type === 'water') {
      const pct = (used / limit) * 100;
      if (pct < 30) return `🔵 備載：目前用水極度節省，餘額非常充裕。`;
      if (pct < 80) return `🔵 狀況：目前用水量控制在預期範圍內。`;
      return `🟡 注意：用水進度較快，建議檢查是否有滲漏。`;
    }
    return '';
  };

  const handleDelete = async (monthStr, id) => {
    if (window.confirm('確定要刪除這筆紀錄嗎？')) {
      const year = monthStr.substring(0, 4);
      await deleteDoc(doc(db, `usage_records_${year}`, id));
      fetchDashboardData();
    }
  };

  const handleCopyCardImage = async (ref, title) => {
    if (!ref.current) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        // Safari / iOS 支援以 Promise 方式寫入剪貼簿
        const clipboardPromise = toBlob(ref.current, { 
          backgroundColor: '#14161a', 
          style: { borderRadius: '16px' } 
        });

        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': clipboardPromise })
        ]);
        alert(`${title} 圖片已複製到剪貼簿！`);
      } else {
        const dataUrl = await toPng(ref.current, { backgroundColor: '#14161a', style: { borderRadius: '16px' } });
        const link = document.createElement('a');
        link.download = `${title}_${format(new Date(), 'MMdd')}.png`;
        link.href = dataUrl;
        link.click();
        alert('已下載監測快照點 (您的瀏覽器不支援直接複製圖片)。');
      }
    } catch (err) { console.error(err); }
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const exportData = records.map(r => ({ "日期": format(new Date(r.date), 'yyyy/MM/dd'), "類型": r.type, ...r.readings }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "資源明細");
    XLSX.writeFile(wb, `${currentMonthStr}_資源明細.xlsx`);
  };

  const WeatherIcon = () => {
    if (weather.icon === 'rain') return <RainIcon className="text-water" size={18} />;
    if (weather.icon === 'cloud') return <Cloud className="text-main" size={18} />;
    return <Sun className="text-warning" size={18} />;
  };

  const getDisplayList = (list) => isHistoryExpanded ? list : list.slice(0, 2);

  if (loading) return <div className="loader-container"><div className="spinner"></div></div>;

  return (
    <>
      <div className="fade-in">
        <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5rem', flexWrap: 'wrap' }}>
            <h1 style={{ 
              margin: 0, 
              fontSize: 'clamp(1.2rem, 5vw, 1.8rem)', 
              fontWeight: 800,
              letterSpacing: '-0.5px',
              whiteSpace: 'nowrap'
            }}>
              Eco Utility Pulse AI 智慧資源監控
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <WeatherIcon />
                <span style={{ fontWeight: 600, color: 'var(--color-electric)' }}>{weather.location} | {weather.desc} {weather.temp}°C</span>
              </div>
              <span style={{ opacity: 0.5 }}>|</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={14} /><span>{format(new Date(), 'yyyy/MM/dd')}</span></div>
            </div>
          </div>

          <div className="capsule-nav">
            <button className="nav-btn" onClick={() => handleMonthChange(-1)}><ChevronLeft size={16} /></button>
            <div className="nav-current">
              <Calendar size={16} />
              <span>{format(currentMonthDate, 'yyyy年MM月')}</span>
            </div>
            <button className="nav-btn" onClick={() => handleMonthChange(1)}><ChevronRight size={16} /></button>
            <button className="nav-btn-today" onClick={() => setCurrentMonthDate(startOfMonth(new Date()))}>本月</button>
          </div>
        </div>

        <div className="metric-grid">
          <div className="glass-panel metric-card" ref={electricCardRef}>
            <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="metric-title"><Zap size={18} className="text-electric" /> 用電量標竿</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleCopyCardImage(electricCardRef, '用電')} className="card-action"><Camera size={16} /></button>
                <button onClick={() => setFactorModalOpen(true)} className="card-action"><Calculator size={16} /></button>
                {role !== 'guest' && <button onClick={() => { setInputType('electric'); setInputModalOpen(true); }} className="card-action text-electric"><PenTool size={16} /></button>}
                <button onClick={() => { setInputType('electric'); setLimitModalOpen(true); }} className="card-action"><Target size={16} /></button>
              </div>
            </div>
            <div className="metric-value text-electric" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
              <div>
                <span>{Math.round(currentUsage.electric).toLocaleString()}</span><span className="metric-unit">/{eLimit.toLocaleString()} 度</span>
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 500, maxWidth: '180px', lineHeight: '1.4', marginBottom: '8px' }}>
                {getAITip('electric', currentUsage.electric, eLimit)}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ padding: '4px 8px', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '4px', color: 'var(--color-electric)', fontWeight: 'bold' }}>
                本週建議上限 (第 {currentWeek} 週): {Math.round(eBench).toLocaleString()} 度
              </span>
            </div>
            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
              {getDetailedAnalysis('electric', currentUsage.electric, eLimit)}
            </div>
            <div className="progress-container"><div className="progress-bar" style={{ width: `${electricPct}%`, backgroundColor: electricPct >= 90 ? 'var(--color-error)' : 'var(--color-electric)' }} /></div>
          </div>

          <div className="glass-panel metric-card" ref={waterCardRef}>
            <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="metric-title"><Droplet size={18} className="text-water" /> 用水量標竿</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleCopyCardImage(waterCardRef, '用水')} className="card-action"><Camera size={16} /></button>
                {role !== 'guest' && <button onClick={() => { setInputType('water'); setInputModalOpen(true); }} className="card-action text-water"><PenTool size={16} /></button>}
                <button onClick={() => { setInputType('water'); setLimitModalOpen(true); }} className="card-action"><Target size={16} /></button>
              </div>
            </div>
            <div className="metric-value text-water" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
              <div>
                <span>{Math.round(currentUsage.water).toLocaleString()}</span><span className="metric-unit">/{wLimit.toLocaleString()} 度</span>
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 500, maxWidth: '180px', lineHeight: '1.4', marginBottom: '8px' }}>
                {getAITip('water', currentUsage.water, wLimit)}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ padding: '4px 8px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '4px', color: 'var(--color-water)', fontWeight: 'bold' }}>
                本週建議上限 (第 {currentWeek} 週): {Math.round(wBench).toLocaleString()} 度
              </span>
            </div>
            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
              {getDetailedAnalysis('water', currentUsage.water, wLimit)}
            </div>
            <div className="progress-container"><div className="progress-bar" style={{ width: `${waterPct}%`, backgroundColor: waterPct >= 90 ? 'var(--color-error)' : 'var(--color-water)' }} /></div>
          </div>

          <div className="glass-panel metric-card" ref={rainCardRef}>
            <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="metric-title"><CloudRain size={18} className="text-rain" /> 雨水回收</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleCopyCardImage(rainCardRef, '雨水')} className="card-action"><Camera size={16} /></button>
                {role !== 'guest' && <button onClick={() => { setInputType('rain'); setInputModalOpen(true); }} className="card-action text-rain"><PenTool size={16} /></button>}
              </div>
            </div>
            <div className="metric-value text-rain"><span>{Math.round(currentUsage.rain).toLocaleString()}</span><span className="metric-unit">度</span></div>
            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 'auto' }}>本日降雨機率適中，系統持續回收。</div>
          </div>

          <div className="glass-panel metric-card carbon-card-full" style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(26, 28, 35, 0.85) 100%)', borderColor: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)', display: 'flex', boxShadow: `0 0 20px ${isCarbonExceeded ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.05)'}`, padding: '2rem' }}>
            <div className="carbon-main-info" style={{ flex: '0 0 300px' }}>
              <h3 style={{ margin: 0, color: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '10px' }}><Globe size={20} /> 碳排量餘額</h3>
              <div className="metric-value" style={{ color: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)', margin: '1rem 0' }}>
                <span style={{ fontSize: '3.5rem', fontWeight: 800 }}>{Math.abs(carbonBudget - carbonProjected).toLocaleString()}</span>
                <span className="metric-unit" style={{ marginLeft: '10px' }}>kg CO2e</span>
              </div>
            </div>
            <div style={{ flex: '1', paddingLeft: '2rem', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.9rem' }}>
                <span>目標: {carbonBudget.toLocaleString()} kg</span>
                <span style={{ color: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)' }}>預計達成: {Math.round((carbonProjected/carbonBudget)*100)}%</span>
              </div>
              <div className="progress-container" style={{ height: '12px' }}><div className="progress-bar" style={{ width: `${Math.min(100, (carbonProjected/carbonBudget)*100)}%`, backgroundColor: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)' }} /></div>
              <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '6px 12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '20px', fontSize: '0.85rem', color: 'var(--color-success)', border: '1px solid rgba(34, 197, 94, 0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Leaf size={14} /> 換算救了 {Math.max(0, Math.round((carbonBudget - carbonProjected) / 1.0))} 棵樹
                </div>
                <div style={{ fontSize: '0.9rem', color: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 'bold' }}>
                  {isCarbonExceeded ? '🚨 碳預算超額' : '✅ 減碳表現優異'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {role !== 'guest' && (
          <div className="glass-panel" style={{ marginTop: '2rem', padding: 0 }}>
            <div onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} style={{ padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: isHistoryExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>{isHistoryExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />} {currentMonthStr} 歷史紀錄</h2>
              <button onClick={(e) => { e.stopPropagation(); handleExportExcel(); }} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}><Download size={16} /> 導出 Excel</button>
            </div>
            {isHistoryExpanded && (
              <div style={{ padding: '0 2rem 2rem' }} className="fade-in">
                {records.length === 0 ? <p className="text-muted">本月尚無紀錄。</p> : (
                  <div style={{ marginTop: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead><tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}><th style={{ padding: '0.8rem', textAlign: 'left' }}>日期</th><th style={{ padding: '0.8rem' }}>類型</th><th style={{ padding: '0.8rem', textAlign: 'right' }}>操作</th></tr></thead>
                      <tbody>
                        {getDisplayList(records).map(r => (
                          <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.8rem' }}>{format(new Date(r.date), 'MM/dd')}</td>
                            <td style={{ padding: '0.8rem', textAlign: 'center' }}><span className={`badge badge-${r.type}`}>{r.type === 'electric' ? '用電' : r.type === 'water' ? '用水' : '雨水'}</span></td>
                            <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                              <button onClick={() => setEditRecordData(r)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginRight: '10px' }}><Edit2 size={14} /></button>
                              <button onClick={() => handleDelete(r.month, r.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <DataInputModal isOpen={isInputModalOpen} onClose={() => setInputModalOpen(false)} fetchDashboardData={fetchDashboardData} defaultType={inputType} />
      <LimitSettingModal isOpen={isLimitModalOpen} onClose={() => setLimitModalOpen(false)} year={currentMonthStr.substring(0, 4)} type={inputType} fetchDashboardData={fetchDashboardData} />
      <FactorSettingModal isOpen={isFactorModalOpen} onClose={() => setFactorModalOpen(false)} currentFactor={electricFactor} currentEmissionFactor={emissionFactor} emissionHistory={emissionHistory} currentMonthStr={currentMonthStr} carbonGoals={carbonGoals} fetchDashboardData={fetchDashboardData} />
      <EditRecordModal isOpen={!!editRecordData} onClose={() => setEditRecordData(null)} record={editRecordData} fetchDashboardData={fetchDashboardData} />
    </>
  );
};

export default Dashboard;
