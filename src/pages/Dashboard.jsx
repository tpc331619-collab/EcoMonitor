import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Zap, Droplet, CloudRain, Edit2, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, PenTool, Settings, Calculator, Sparkles, Camera, Cloud, CloudDrizzle, Sun, CloudRain as RainIcon, WifiOff, CloudOff, TrendingDown, Calendar, Globe, Leaf, Target, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, endOfWeek } from 'date-fns';
import { toBlob, toPng } from 'html-to-image';
import DataInputModal from '../components/DataInputModal';
import EditRecordModal from '../components/EditRecordModal';
import LimitSettingModal from '../components/LimitSettingModal';
import FactorSettingModal from '../components/FactorSettingModal';

const AmbienceLayer = ({ type }) => {
  if (!type) return null;
  return (
    <div className="ambience-container">
      <div className="atmosphere-wave" />
      <div className="atmosphere-wave wave-slow" />
      {type === 'rain' && (
        <div className="rain-overlay">
          {[...Array(25)].map((_, i) => (
            <div key={`drop-${i}`} className="drop" style={{ left: `${Math.random() * 100}%`, animationDuration: `${0.6 + Math.random() * 0.4}s`, animationDelay: `${Math.random() * 2}s`, opacity: 0.2 + Math.random() * 0.2 }} />
          ))}
          {[...Array(5)].map((_, i) => (
            <div key={`ripple-${i}`} className="ripple" style={{ top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 5}s`, width: `${30 + Math.random() * 40}px`, height: `${20 + Math.random() * 30}px` }} />
          ))}
        </div>
      )}
      {type === 'sun' && <div className="sun-overlay" />}
    </div>
  );
};


const Dashboard = () => {
  const { role } = useAuth();
  const isOnline = useNetworkStatus();
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const currentMonthStr = format(currentMonthDate, 'yyyy-MM');

  const [limits, setLimits] = useState({ electric: 1000, water: 500 });
  const [currentUsage, setCurrentUsage] = useState({ electric: 0, water: 0, rain: 0, rainYearly: 0 });
  const [carbonGoals, setCarbonGoals] = useState({ reductionTarget: 5, baseYearAvg: 1000 });
  const [records, setRecords] = useState([]);
  const [electricFactor, setElectricFactor] = useState(4.233);
  const [electricBaseOffset, setElectricBaseOffset] = useState(0);
  const [emissionFactor, setEmissionFactor] = useState(0.495);
  const [emissionHistory, setEmissionHistory] = useState({ '2000-01': 0.495 });

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [isInputModalOpen, setInputModalOpen] = useState(false);
  const [isLimitModalOpen, setLimitModalOpen] = useState(false);
  const [isFactorModalOpen, setFactorModalOpen] = useState(false);
  const [inputType, setInputType] = useState('electric');
  const [editRecordData, setEditRecordData] = useState(null);
  const [expandedTables, setExpandedTables] = useState({ electric: false, water: false, rain: false });
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [weather, setWeather] = useState({ temp: '--', pop: '--', desc: '載入中...', icon: 'sun', location: '--' });
  const [rainStats, setRainStats] = useState({ days: 0, amount: 0 });

  const electricCardRef = useRef(null);
  const waterCardRef = useRef(null);
  const rainCardRef = useRef(null);
  const dataCache = useRef({});  // in-memory cache: { 'yyyy-MM': { limits, factor, ... } }

  useEffect(() => {
    fetchDashboardData();
    fetchWeatherData();
    fetchRainHistoryData();
  }, [currentMonthDate]);

  useEffect(() => {
    const themeClass = `theme-${weather.icon || 'sun'}`;
    document.body.classList.remove('theme-sun', 'theme-cloud', 'theme-rain');
    document.body.classList.add(themeClass);
    return () => { document.body.classList.remove(themeClass); };
  }, [weather.icon]);

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

  const fetchRainHistoryData = async () => {
    try {
      const start = format(startOfMonth(currentMonthDate), 'yyyy-MM-01');
      const today = new Date();
      const isCurrentMonth = currentMonthDate.getMonth() === today.getMonth() && currentMonthDate.getFullYear() === today.getFullYear();
      const end = format(isCurrentMonth ? today : endOfMonth(currentMonthDate), 'yyyy-MM-dd');
      
      const url = `https://api.open-meteo.com/v1/forecast?latitude=25.03&longitude=121.08&start_date=${start}&end_date=${end}&daily=precipitation_sum&timezone=Asia/Taipei`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.daily && data.daily.precipitation_sum) {
        const precipitation = data.daily.precipitation_sum;
        const days = precipitation.filter(p => p > 0.1).length;
        const amount = precipitation.reduce((sum, p) => sum + (p || 0), 0);
        setRainStats({ days, amount: parseFloat(amount.toFixed(1)) });
      }
    } catch (err) {
      console.error("Rain history fetch failed:", err);
    }
  };

  const fetchDashboardData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const currentYear = currentMonthStr.substring(0, 4);
      const currentMonthNum = currentMonthStr.substring(5, 7);
      const cacheKey = currentMonthStr;

      // 如果有快取且不是強制重整，直接用快取資料
      if (!forceRefresh && dataCache.current[cacheKey]) {
        const cached = dataCache.current[cacheKey];
        setLimits(cached.limits);
        setCarbonGoals(cached.carbonGoals);
        setCurrentUsage(cached.usage);
        setRecords(cached.records);
        setElectricFactor(cached.meterFactor);
        setElectricBaseOffset(cached.baseOffset);
        setEmissionHistory(cached.emissionHistory);
        setEmissionFactor(cached.emissionFactor);
        if (cached.rainStats) setRainStats(cached.rainStats);
        setLoading(false);
        return;
      }

      // 五個請求全部並行
      const [
        factorSnap,
        carbonSnap,
        setSnap,
        querySnapshot,
        rainYearSnap,
      ] = await Promise.all([
        getDoc(doc(db, 'settings', 'electric_factor')),
        getDoc(doc(db, `settings_${currentYear}`, 'carbon_goals')),
        getDoc(doc(db, `settings_${currentYear}`, `limits_${currentMonthNum}`)),
        getDocs(query(collection(db, `usage_records_${currentYear}`), where('month', '==', currentMonthStr))),
        getDocs(query(collection(db, `usage_records_${currentYear}`), where('type', '==', 'rain'))),
      ]);

      // --- 處理 factor ---
      let loadedMeterFactor = 4.233;
      let loadedBaseOffset = 0;
      let rawHistory = { '2000-01': 0.495 };
      let activeEmissionFactor = 0.495;

      if (factorSnap.exists()) {
        const fdata = factorSnap.data();
        loadedMeterFactor = Number(fdata.meter_factor || fdata.value) || 4.233;
        loadedBaseOffset = Number(fdata.base_offset) || 0;
        rawHistory = fdata.emission_history || {};
        if (Array.isArray(rawHistory)) {
          const migratedMap = {};
          rawHistory.forEach(h => { if (h.startMonth) migratedMap[h.startMonth] = h.value; });
          rawHistory = migratedMap;
        }
        const sortedMonths = Object.keys(rawHistory).sort((a, b) => b.localeCompare(a));
        const activeMonth = sortedMonths.find(m => m <= currentMonthStr) || sortedMonths[sortedMonths.length - 1];
        activeEmissionFactor = rawHistory[activeMonth] || 0.495;
      }
      setElectricFactor(loadedMeterFactor);
      setElectricBaseOffset(loadedBaseOffset);
      setEmissionHistory(rawHistory);
      setEmissionFactor(activeEmissionFactor);

      // --- 處理 carbon goals ---
      const loadedCarbonGoals = carbonSnap.exists() ? carbonSnap.data() : { reductionTarget: 5, baseYearAvg: 1000 };
      setCarbonGoals(loadedCarbonGoals);

      // --- 處理 limits ---
      const loadedLimits = setSnap.exists() ? setSnap.data() : { electric: 1000, water: 500 };
      setLimits(loadedLimits);

      // --- 處理使用記錄 ---
      const allRainYearRecords = rainYearSnap.docs.map(d => d.data());
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
      const sortByDateAndCreation = (a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        if (dateDiff !== 0) return dateDiff;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      };
      electricRecords.sort(sortByDateAndCreation);
      waterRecords.sort(sortByDateAndCreation);
      rainRecords.sort(sortByDateAndCreation);

      let e = 0;
      const electricBaseRecord = electricRecords.find(r => format(new Date(r.date), 'dd') === '01');
      if (electricBaseRecord && electricRecords.length >= 1) {
        const base = electricBaseRecord.readings;
        const latest = electricRecords[electricRecords.length - 1].readings;
        const totalBase = (base.ml || 0)*1000 + (base.mp1 || 0)*1000 + (base.mp || 0)*1000 + (base.kwh11 || 0) + (base.kwh12 || 0) + (base.kwh13 || 0) + (base.kwh21 || 0) + (base.agv || 0);
        const totalLatest = (latest.ml || 0)*1000 + (latest.mp1 || 0)*1000 + (latest.mp || 0)*1000 + (latest.kwh11 || 0) + (latest.kwh12 || 0) + (latest.kwh13 || 0) + (latest.kwh21 || 0) + (latest.agv || 0);
        e = (totalLatest - totalBase) * loadedMeterFactor + loadedBaseOffset;
        if (electricRecords.length === 1) e = loadedBaseOffset;
      }

      let w = 0;
      const waterBaseRecord = waterRecords.find(r => format(new Date(r.date), 'dd') === '01');
      if (waterBaseRecord && waterRecords.length >= 1) {
        const base = waterBaseRecord.readings;
        const latest = waterRecords[waterRecords.length - 1].readings;
        const maxLatest = Math.max(...Object.values(latest).map(v => Number(v) || 0));
        const minBase = Math.min(...Object.values(base).filter(v => (Number(v) || 0) > 0).map(v => Number(v) || 0));
        w = maxLatest - minBase;
        if (waterRecords.length === 1) w = 0;
      }

      let rUsage = 0;
      if (rainRecords.length > 0) {
        const firstRain = rainRecords[0];
        const lastRain = rainRecords[rainRecords.length - 1];
        const maxLastRain = Math.max(...Object.values(lastRain.readings || {}).map(v => Number(v) || 0));
        const minFirstRain = Math.min(...Object.values(firstRain.readings || {}).filter(v => (Number(v) || 0) > 0).map(v => Number(v) || 0));
        rUsage = maxLastRain - minFirstRain;
      }

      let rYearlyUsage = 0;
      if (allRainYearRecords.length > 0) {
        const sortedAll = [...allRainYearRecords].sort((a, b) => new Date(a.date) - new Date(b.date));
        rYearlyUsage = (sortedAll[sortedAll.length - 1].readings?.rain || 0) - (sortedAll[0].readings?.rain || 0);
      }

      const loadedUsage = { electric: e, water: w, rain: rUsage, rainYearly: rYearlyUsage };
      setCurrentUsage(loadedUsage);
      setRecords(recs);

      // 存入快取
      dataCache.current[cacheKey] = {
        limits: loadedLimits,
        carbonGoals: loadedCarbonGoals,
        usage: loadedUsage,
        records: recs,
        meterFactor: loadedMeterFactor,
        baseOffset: loadedBaseOffset,
        emissionHistory: rawHistory,
        emissionFactor: activeEmissionFactor,
        rainStats: rainStats, // 此時的 rainStats 可能尚未更新，fetchRainHistoryData 會在 useEffect 呼叫
      };
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, duration = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  };

  // 清除指定月份 cache 再重整（新增/編輯/刪除後呼叫這個）
  const refreshDashboardData = () => {
    delete dataCache.current[currentMonthStr];
    fetchDashboardData(true);
  };

  const handleRefresh = async () => {
    // 強制清除快取再重整
    delete dataCache.current[currentMonthStr];
    await Promise.all([fetchDashboardData(true), fetchRainHistoryData()]);
    showToast('✅ 資料已更新！');
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
  const now = new Date();
  const isCurrentMonth = currentMonthDate.getMonth() === now.getMonth() && currentMonthDate.getFullYear() === now.getFullYear();
  const SundayOfThisWeek = endOfWeek(now, { weekStartsOn: 1 });
  const benchDays = isCurrentMonth ? Math.min(daysTotal, SundayOfThisWeek.getDate()) : daysTotal;

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
    if (used === 0) return '⚡ 還沒開始記錄喔，等你輸入！';
    if (type === 'rain') {
      if (used > 10) return <span className="text-success">♻️ 回收效能優異，讚！</span>;
      return <span className="text-rain" style={{ opacity: 0.8 }}>♻️ 持續穩定回收中...</span>;
    }
    const pace = type === 'electric' ? ePace : wPace;
    const unitWord = type === 'electric' ? '耗電' : '用水';
    
    if (pace > 1.1) return <span className="text-error">🚨 嚴重超標了！快看看哪裡在{unitWord}</span>;
    if (pace > 1.0) return <span className="text-warning">⚠️ 已經超標囉，要稍微管控一下</span>;
    if (pace < 0.7) return <span className="text-success">✅ 還有很多空間可以用喔！</span>;
    return <span className="text-success">✅ 進度掌握得很好，讚！</span>;
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
      refreshDashboardData();
    }
  };

  const handleCopyCardImage = async (ref, title) => {
    if (!ref.current) return;
    try {
      const exportOptions = {
        backgroundColor: '#14161a',
        pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
        style: { 
          borderRadius: '16px',
          margin: '0',
          transform: 'scale(0.96)',
          transformOrigin: 'center center'
        }
      };

      if (navigator.clipboard && window.ClipboardItem) {
        // Safari / iOS 支援以 Promise 方式寫入剪貼簿
        const clipboardPromise = toBlob(ref.current, exportOptions);

        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': clipboardPromise })
        ]);
        alert(`${title} 圖片已複製到剪貼簿！`);
      } else {
        const dataUrl = await toPng(ref.current, exportOptions);
        const link = document.createElement('a');
        link.download = `${title}_${format(new Date(), 'MMdd')}.png`;
        link.href = dataUrl;
        link.click();
        alert('已下載監測快照點 (您的瀏覽器不支援直接複製圖片)。');
      }
    } catch (err) { console.error(err); }
  };


  const WeatherIcon = () => {
    if (weather.icon === 'rain') return <RainIcon className="text-water" size={18} />;
    if (weather.icon === 'cloud') return <Cloud className="text-main" size={18} />;
    return <Sun className="text-warning" size={18} />;
  };

  const getDisplayList = (list) => isHistoryExpanded ? list : list.slice(0, 2);

  const LivePulse = ({ color }) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '18px', marginLeft: '12px', opacity: 0.6 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div 
          key={i}
          style={{
            width: '2px',
            backgroundColor: color,
            borderRadius: '10px',
            animation: `pulse-bar 0.6s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );

  const ElectricTowerPulse = ({ color }) => (
    <div style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', opacity: 0.9, width: '28px' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        {/* 背景發光光暈 */}
        <circle cx="12" cy="12" r="8" fill={color} opacity="0.1">
          <animate attributeName="r" values="8;11;8" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.1;0.2;0.1" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* 核心閃電圖標 */}
        <path 
          d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" 
          fill={color} 
          style={{ 
            filter: `drop-shadow(0 0 5px ${color})`,
            animation: 'logoPulse 1.5s infinite ease-in-out'
          }} 
        />
        {/* 動態環繞圓環 */}
        <circle 
          cx="12" cy="12" r="10" 
          stroke={color} 
          strokeWidth="0.5" 
          strokeDasharray="4 8" 
          opacity="0.3"
          style={{ animation: 'spin 6s linear infinite' }} 
        />
      </svg>
    </div>
  );


  const FaucetPulse = ({ color }) => (
    <div style={{ marginLeft: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.9, width: '24px' }}>
      <svg width="20" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 11.5V14a2 2 0 1 1-4 0v-2.5" /><path d="M3 12h4" /><path d="M21 3v2" /><path d="M21 9v2" /><path d="M21 15v2" /><path d="M21 21v2" /><path d="M16 3h5" /><path d="M16 19h5" />
        <path d="M16 8.5V14a5 5 0 0 1-10 0V8.5" /><path d="M6 3h10" />
      </svg>
      {/* 動態水滴 */}
      <div style={{
        width: '4px',
        height: '6px',
        backgroundColor: color,
        borderRadius: '50% 50% 40% 40%',
        animation: 'drip 1.2s infinite cubic-bezier(0.4, 0, 0.2, 1)',
        marginTop: '-1px',
        filter: `drop-shadow(0 0 3px ${color})`
      }} />
    </div>
  );

  const RainTowerPulse = ({ color }) => (
    <div style={{ marginLeft: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '28px', opacity: 0.9 }}>
      <div style={{ 
        position: 'relative', 
        width: '22px', 
        height: '20px', 
        border: `1.5px solid ${color}`, 
        borderRadius: '4px', 
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.02)',
        boxShadow: `inset 0 0 5px ${color}22`
      }}>
        {/* 動態波浪水位 */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '-50%',
          width: '200%',
          height: '60%',
          backgroundColor: color,
          opacity: 0.3,
          borderRadius: '40%',
          animation: 'level-wave 3s infinite linear'
        }} />
        {/* 上方滴入效果 */}
        <div style={{
          position: 'absolute',
          top: '2px',
          left: '50%',
          width: '2px',
          height: '4px',
          backgroundColor: color,
          borderRadius: '2px',
          transform: 'translateX(-50%)',
          animation: 'drip 1.8s infinite ease-in'
        }} />
      </div>
    </div>
  );

  if (loading) return <div className="loader-container"><div className="spinner"></div></div>;

  return (
    <>
      <div className="fade-in">
        <AmbienceLayer type={weather.icon} />

        <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
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

          <div className="capsule-nav" style={{ gap: '6px' }}>
            <button className="nav-btn" onClick={() => handleMonthChange(-1)} title="前一個月"><ChevronLeft size={16} /></button>
            <div 
              className="nav-current" 
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', position: 'relative' }}
              onClick={() => document.getElementById('month-picker').showPicker()}
            >
              <Calendar size={18} className="text-main" style={{ minWidth: '18px' }} />
              <span style={{ whiteSpace: 'nowrap' }}>{format(currentMonthDate, 'yyyy年MM月')}</span>
              <input 
                id="month-picker"
                type="month" 
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                value={format(currentMonthDate, 'yyyy-MM')}
                onChange={(e) => {
                  if (e.target.value) {
                    const [y, m] = e.target.value.split('-');
                    setCurrentMonthDate(new Date(parseInt(y), parseInt(m) - 1, 1));
                  }
                }}
              />
            </div>
            <button className="nav-btn" onClick={() => handleMonthChange(1)} title="後一個月"><ChevronRight size={16} /></button>
            <button className="nav-btn-today" onClick={() => setCurrentMonthDate(startOfMonth(new Date()))}>本月</button>
            <button className="nav-btn-today" onClick={handleRefresh} style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="重新整理資料">
              <RefreshCw size={14} /> 更新
            </button>
          </div>
        </div>

        <div className="metric-grid">
          <div className="glass-panel metric-card" ref={electricCardRef} style={{ borderColor: electricPct >= 90 ? 'var(--color-error)' : 'var(--color-electric)', boxShadow: `0 0 15px ${electricPct >= 90 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(251, 191, 36, 0.05)'}` }}>
            <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="text-electric" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'clamp(0.9rem, 4vw, 1.1rem)' }}>
                <Zap size={18} /> {currentMonthStr.replace('-', '/')} 累積用電量
              </h3>
              <div className="card-actions" style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleCopyCardImage(electricCardRef, '用電')} className="card-action"><Camera size={16} /></button>
                {role !== 'guest' && (
                  <>
                    <button onClick={() => setFactorModalOpen(true)} className="card-action"><Calculator size={16} /></button>
                    <button onClick={() => { setInputType('electric'); setInputModalOpen(true); }} className="card-action text-electric"><PenTool size={16} /></button>
                    <button onClick={() => { setInputType('electric'); setLimitModalOpen(true); }} className="card-action"><Target size={16} /></button>
                  </>
                )}
              </div>
            </div>
            <div className="metric-value" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px', marginBottom: '0.5rem' }}>
              <div style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', color: 'var(--color-electric)' }}>
                <span>{Math.round(currentUsage.electric).toLocaleString()}</span><span className="metric-unit">/{eLimit.toLocaleString()} 度</span>
                <ElectricTowerPulse color="var(--color-electric)" />
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 500, maxWidth: '200px', lineHeight: '1.4', marginBottom: '8px' }}>
                {getAITip('electric', currentUsage.electric, eLimit)}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', marginBottom: '1rem' }}>
              <div className="text-warning" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                {ePace < 0.6 
                  ? `進度超前！這禮拜就算用到 ${Math.round(eBench).toLocaleString()} 度也還是綠燈喔` 
                  : ePace > 1.0 
                    ? `這禮拜原本希望控制在: ${Math.round(eBench).toLocaleString()} 度以內`
                    : `這禮拜最好別超過: ${Math.round(eBench).toLocaleString()} 度`
                }
              </div>
            </div>
            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
              {getDetailedAnalysis('electric', currentUsage.electric, eLimit)}
            </div>
            <div className="progress-container"><div className="progress-bar" style={{ width: `${electricPct}%`, backgroundColor: electricPct >= 90 ? 'var(--color-error)' : 'var(--color-electric)' }} /></div>
          </div>

          <div className="glass-panel metric-card" ref={waterCardRef} style={{ borderColor: waterPct >= 90 ? 'var(--color-error)' : 'var(--color-water)', boxShadow: `0 0 15px ${waterPct >= 90 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(56, 189, 248, 0.05)'}` }}>
            <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="text-water" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'clamp(0.9rem, 4vw, 1.1rem)' }}>
                <Droplet size={18} /> {currentMonthStr.replace('-', '/')} 累積用水量
              </h3>
              <div className="card-actions" style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleCopyCardImage(waterCardRef, '用水')} className="card-action"><Camera size={16} /></button>
                {role !== 'guest' && (
                  <>
                    <button onClick={() => { setInputType('water'); setInputModalOpen(true); }} className="card-action text-water"><PenTool size={16} /></button>
                    <button onClick={() => { setInputType('water'); setLimitModalOpen(true); }} className="card-action"><Target size={16} /></button>
                  </>
                )}
              </div>
            </div>
            <div className="metric-value" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px', marginBottom: '0.5rem' }}>
              <div style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', color: 'var(--color-water)' }}>
                <span>{Math.round(currentUsage.water).toLocaleString()}</span><span className="metric-unit">/{wLimit.toLocaleString()} 度</span>
                <FaucetPulse color="var(--color-water)" />
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 500, maxWidth: '200px', lineHeight: '1.4', marginBottom: '8px' }}>
                {getAITip('water', currentUsage.water, wLimit)}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', marginBottom: '1rem' }}>
              <div className="text-secondary" style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 'bold' }}>
                {wPace < 0.6 
                  ? `怎麼都沒在用水？這週其實可以用到: ${Math.round(wBench).toLocaleString()} 度` 
                  : wPace > 1.0 
                    ? `這禮拜原本希望控制在: ${Math.round(wBench).toLocaleString()} 度以內`
                    : `這禮拜最好別超過: ${Math.round(wBench).toLocaleString()} 度`
                }
              </div>
            </div>
            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
              {getDetailedAnalysis('water', currentUsage.water, wLimit)}
            </div>
            <div className="progress-container"><div className="progress-bar" style={{ width: `${waterPct}%`, backgroundColor: waterPct >= 90 ? 'var(--color-error)' : 'var(--color-water)' }} /></div>
          </div>

          <div className="glass-panel metric-card" ref={rainCardRef} style={{ borderColor: 'var(--color-rain)', boxShadow: '0 0 15px rgba(255, 255, 255, 0.05)' }}>
            <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="text-rain" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'clamp(0.9rem, 4vw, 1.1rem)' }}>
                <CloudRain size={18} /> {currentMonthStr.replace('-', '/')} 累積雨水回收量
              </h3>
              <div className="card-actions" style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleCopyCardImage(rainCardRef, '雨水')} className="card-action"><Camera size={16} /></button>
                {role !== 'guest' && (
                  <>
                    <button onClick={() => { setInputType('rain'); setInputModalOpen(true); }} className="card-action text-rain"><PenTool size={16} /></button>
                    <button onClick={() => { setInputType('rain'); setLimitModalOpen(true); }} className="card-action"><Target size={16} /></button>
                  </>
                )}
              </div>
            </div>
            <div className="metric-value text-rain" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ fontSize: '3rem', fontWeight: 800 }}>{Math.round(currentUsage.rain).toLocaleString()}</span>
                <span className="metric-unit">度</span>
                <RainTowerPulse color="var(--color-rain)" />
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                {getAITip('rain', currentUsage.rain)}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ 
                flex: 1,
                padding: '8px 12px', 
                background: 'rgba(255, 255, 255, 0.03)', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '6px' }}>
                  <RainIcon size={16} className="text-rain" />
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>當月雨天</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{rainStats.days} <span style={{ fontSize: '0.7rem', fontWeight: 500, opacity: 0.7 }}>天</span></div>
                </div>
              </div>

              <div style={{ 
                flex: 1,
                padding: '8px 12px', 
                background: 'rgba(255, 255, 255, 0.03)', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '6px' }}>
                  <Droplet size={16} className="text-rain" />
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>當月降雨</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{rainStats.amount} <span style={{ fontSize: '0.7rem', fontWeight: 500, opacity: 0.7 }}>mm</span></div>
                </div>
              </div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <span style={{ 
                padding: '4px 8px', 
                background: 'rgba(34, 197, 94, 0.1)', 
                borderRadius: '4px', 
                color: '#22c55e', 
                fontSize: '0.75rem',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Target size={12} /> 年度累積: {Math.round(currentUsage.rainYearly).toLocaleString()} 度
              </span>
            </div>
            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>本日降雨機率適中，系統持續回收。</div>
            <div className="progress-container"><div className="progress-bar" style={{ width: `${Math.min(100, (currentUsage.rain / (limits.rain || 10)) * 100)}%`, backgroundColor: 'var(--color-rain)' }} /></div>
          </div>

          <div className="glass-panel metric-card carbon-card-full" style={{ borderColor: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)', boxShadow: `0 0 20px ${isCarbonExceeded ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.05)'}` }}>
            <div className="carbon-main-info">
              <h3 style={{ margin: 0, color: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '10px' }}><Globe size={20} /> {currentMonthStr.replace('-', '/')} 碳排放量現況</h3>
              <div className="metric-value" style={{ color: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)', marginTop: '1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ fontSize: '3.5rem', fontWeight: 800 }}>{Math.round(currentUsage.electric * emissionFactor).toLocaleString()}</span>
                <span className="metric-unit">/ {carbonBudget.toLocaleString()} kg CO2e</span>
                <LivePulse color={isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)'} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', paddingLeft: '4px' }}>
                💡 計算方式：累積用電 {Math.round(currentUsage.electric).toLocaleString()} 度 × 係數 {emissionFactor}
              </div>
              <div style={{ 
                fontSize: '0.9rem', 
                color: (currentUsage.electric * emissionFactor) > carbonBudget ? 'var(--color-error)' : isCarbonExceeded ? 'var(--color-warning)' : 'var(--color-success)', 
                fontWeight: 'bold',
                marginBottom: '1rem',
                paddingLeft: '4px'
              }}>
                {(currentUsage.electric * emissionFactor) > carbonBudget 
                  ? '🚨 碳預算已經用完' 
                  : isCarbonExceeded 
                    ? '⚠️ 預計月底會超標' 
                    : '✅ 表現超棒！預測有剩餘'
                }
              </div>
            </div>
            <div className="carbon-detail-info" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                <span className="text-muted" style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>本月目標: {carbonBudget.toLocaleString()} kg</span>
                  <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>基準 {Math.round(carbonGoals.baseYearAvg).toLocaleString()} × (1 - {carbonGoals.reductionTarget}%) × {emissionFactor}</span>
                </span>
                <span style={{ color: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 'bold', textAlign: 'right' }}>
                  預計月底達成: {Math.round((carbonProjected/carbonBudget)*100)}%
                </span>
              </div>
              <div className="progress-container" style={{ height: '12px' }}><div className="progress-bar" style={{ width: `${Math.min(100, (carbonProjected/carbonBudget)*100)}%`, backgroundColor: isCarbonExceeded ? 'var(--color-error)' : 'var(--color-success)' }} /></div>
              <div style={{ marginTop: '1.2rem', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ padding: '6px 12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '20px', fontSize: '0.85rem', color: 'var(--color-success)', border: '1px solid rgba(34, 197, 94, 0.2)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                  <Leaf size={14} /> 換算救了 {Math.max(0, Math.round((carbonBudget - Math.round(currentUsage.electric * emissionFactor)) / 1.0))} 棵樹
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.9, fontWeight: '500', whiteSpace: 'nowrap' }}>
                  {isCarbonExceeded 
                    ? `預估超額: ${Math.round(carbonProjected - carbonBudget).toLocaleString()} kg` 
                    : `預計剩餘: ${Math.round(carbonBudget - carbonProjected).toLocaleString()} kg`
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        {role !== 'guest' && (
          <div className="glass-panel" style={{ marginTop: '2rem', padding: 0 }}>
            <div onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: isHistoryExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <h2 className="history-title-mobile" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '1.25rem' }}>{isHistoryExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />} {currentMonthStr} 歷史紀錄</h2>
            </div>
            {isHistoryExpanded && (
              <div style={{ padding: '0 2rem 2rem' }} className="fade-in">
                {records.length === 0 ? <p className="text-muted">本月尚無紀錄。</p> : (
                    <div style={{ marginTop: '1rem' }} className="history-accordion-content">
                      {/* 分組數據 */}
                      {(() => {
                        const electrics = records.filter(r => r.type === 'electric');
                        const waters = records.filter(r => r.type === 'water');
                        const rains = records.filter(r => r.type === 'rain');

                        const renderValueWithDiff = (val, prevVal, isFirst) => {
                          const num = Number(val) || 0;
                          if (!isFirst || prevVal === undefined || prevVal === null) return num.toLocaleString();
                          const pNum = Number(prevVal) || 0;
                          const diff = num - pNum;
                          
                          let display = '';
                          let color = 'var(--text-muted)';
                          
                          if (diff > 0) {
                            display = `+${diff.toLocaleString(undefined, { maximumFractionDigits: 3 })}↑`;
                            color = 'var(--color-error)'; // 紅色
                          } else if (diff < 0) {
                            display = `${diff.toLocaleString(undefined, { maximumFractionDigits: 3 })}↓`;
                            color = 'var(--color-warning)'; // 黃色
                          } else {
                            display = '+0';
                            color = 'var(--color-success)'; // 綠色
                          }

                          return (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <span>{num.toLocaleString()}</span>
                              <span style={{ fontSize: '0.7rem', color, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                {display}
                              </span>
                            </div>
                          );
                        };

                        return (
                          <>
                            {/* 用電表格 */}
                            {electrics.length > 0 && (
                              <div style={{ marginTop: '1rem' }}>
                                <h3 style={{ color: 'var(--color-electric)', marginBottom: '0.8rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <Zap size={16} /> 用電紀錄
                                </h3>
                                <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: '800px' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>日期</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>辦公大樓</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>倉儲大樓</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>低壓用電</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>1-1</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>1-2</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>1-3</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>2-1</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>AGV</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'right' }}>操作</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {electrics.map((r, idx) => {
                                        const baseR = electrics[electrics.length - 1]; // 當月第一筆
                                        return (
                                          <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{format(new Date(r.date), 'MM/dd')}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.ml, baseR?.readings?.ml, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.mp1, baseR?.readings?.mp1, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.mp, baseR?.readings?.mp, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.kwh11, baseR?.readings?.kwh11, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.kwh12, baseR?.readings?.kwh12, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.kwh13, baseR?.readings?.kwh13, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.kwh21, baseR?.readings?.kwh21, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.agv, baseR?.readings?.agv, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                              <button onClick={() => setEditRecordData(r)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginRight: '10px' }}><Edit2 size={14} /></button>
                                              <button onClick={() => handleDelete(r.month, r.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* 自來水表格 */}
                            {waters.length > 0 && (
                              <div style={{ marginTop: '1.5rem' }}>
                                <h3 style={{ color: 'var(--color-water)', marginBottom: '0.8rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <Droplet size={16} /> 自來水紀錄
                                </h3>
                                <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: '400px' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>日期</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>總水表(早)</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>總水表(夜)</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'right' }}>操作</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {waters.map((r, idx) => {
                                        const baseR = waters[waters.length - 1]; // 當月第一筆
                                        return (
                                          <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{format(new Date(r.date), 'MM/dd')}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.total, baseR?.readings?.total, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.drink, baseR?.readings?.drink, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                              <button onClick={() => setEditRecordData(r)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginRight: '10px' }}><Edit2 size={14} /></button>
                                              <button onClick={() => handleDelete(r.month, r.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* 雨水回收表格 */}
                            {rains.length > 0 && (
                              <div style={{ marginTop: '1.5rem' }}>
                                <h3 style={{ color: '#22c55e', marginBottom: '0.8rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <CloudRain size={16} /> 雨水回收紀錄
                                </h3>
                                <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: '300px' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>日期</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>雨水回收(自設水表)</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'right' }}>操作</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rains.map((r, idx) => {
                                        const baseR = rains[rains.length - 1]; // 當月第一筆
                                        return (
                                          <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{format(new Date(r.date), 'MM/dd')}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>{renderValueWithDiff(r.readings?.rain, baseR?.readings?.rain, idx === 0)}</td>
                                            <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                              <button onClick={() => setEditRecordData(r)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginRight: '10px' }}><Edit2 size={14} /></button>
                                              <button onClick={() => handleDelete(r.month, r.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <DataInputModal isOpen={isInputModalOpen} onClose={() => setInputModalOpen(false)} fetchDashboardData={refreshDashboardData} defaultType={inputType} />
      <LimitSettingModal isOpen={isLimitModalOpen} onClose={() => setLimitModalOpen(false)} year={currentMonthStr.substring(0, 4)} type={inputType} fetchDashboardData={refreshDashboardData} />
      <FactorSettingModal isOpen={isFactorModalOpen} onClose={() => setFactorModalOpen(false)} currentFactor={electricFactor} currentBaseOffset={electricBaseOffset} currentEmissionFactor={emissionFactor} emissionHistory={emissionHistory} currentMonthStr={currentMonthStr} carbonGoals={carbonGoals} fetchDashboardData={refreshDashboardData} />
      <EditRecordModal isOpen={!!editRecordData} onClose={() => setEditRecordData(null)} record={editRecordData} fetchDashboardData={refreshDashboardData} />

      {/* Toast 通知 */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(34, 197, 94, 0.15)',
          border: '1px solid rgba(34, 197, 94, 0.4)',
          color: '#4ade80',
          padding: '0.75rem 1.5rem',
          borderRadius: '40px',
          fontWeight: 700,
          fontSize: '0.95rem',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 20px rgba(34, 197, 94, 0.2)',
          zIndex: 9999,
          animation: 'fadeIn 0.3s ease-out',
          whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </>
  );
};

export default Dashboard;
