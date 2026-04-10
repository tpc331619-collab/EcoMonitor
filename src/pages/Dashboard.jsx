import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Zap, Droplet, CloudRain, Edit2, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, PenTool, Settings, Calculator, Download, Sparkles, Camera, Cloud, CloudDrizzle, Sun, CloudRain as RainIcon, WifiOff, CloudOff, TrendingDown, Calendar } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { format, addMonths, subMonths } from 'date-fns';
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
  const [weather, setWeather] = useState({ temp: '--', pop: '--', desc: '載入中...', icon: 'sun' });

  const electricCardRef = useRef(null);
  const waterCardRef = useRef(null);
  const rainCardRef = useRef(null);

  const monthInputRef = useRef(null);

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
          const popValueObj = popElem?.Time?.[0]?.ElementValue?.[0] || popElem?.time?.[0]?.elementValue?.[0];
          const tValueObj = tElem?.Time?.[0]?.ElementValue?.[0] || tElem?.time?.[0]?.elementValue?.[0];

          const wx = wxValueObj?.Weather || wxValueObj?.value || wxValueObj?.Value || '未知';
          const pop = popValueObj?.ProbabilityOfPrecipitation || popValueObj?.value || popValueObj?.Value || '--';
          const temp = tValueObj?.Temperature || tValueObj?.value || tValueObj?.Value || '--';

          let icon = 'sun';
          if (wx.includes('雨')) icon = 'rain';
          else if (wx.includes('陰') || wx.includes('多雲')) icon = 'cloud';

          setWeather({ temp, pop, desc: wx, icon });
        } else {
          setWeather(prev => ({ ...prev, desc: '找不到該區資料' }));
        }
      } else {
        setWeather(prev => ({ ...prev, desc: 'API 解析失效' }));
      }
    } catch (err) {
      console.error("Weather fetch failed:", err);
      setWeather(prev => ({ ...prev, desc: '氣象連線中斷' }));
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
      let loadedHistory = [{ startMonth: '2000-01', value: 0.495 }];

      if (factorSnap.exists()) {
        const fdata = factorSnap.data();
        loadedMeterFactor = Number(fdata.meter_factor || fdata.value) || 4.233;

        // 結構重組與相容性處理 (Array -> Map)
        let rawHistory = fdata.emission_history || {};
        if (Array.isArray(rawHistory)) {
          // ⚠️ 自動遷移邏輯：將陣列轉為以 startMonth 為 Key 的物件
          const migratedMap = {};
          rawHistory.forEach(h => {
            if (h.startMonth) migratedMap[h.startMonth] = h.value;
          });
          rawHistory = migratedMap;
        } else if (fdata.emission_factor) {
          // 向上相容單一值格式
          rawHistory = { '2000-01': Number(fdata.emission_factor) };
        }

        setElectricFactor(loadedMeterFactor);
        setEmissionHistory(rawHistory);

        // 自動匹配適合當前月份的係數 (從 Map 中找出最接近的 startMonth)
        const sortedMonths = Object.keys(rawHistory).sort((a, b) => b.localeCompare(a));
        const activeMonth = sortedMonths.find(m => m <= currentMonthStr) || sortedMonths[sortedMonths.length - 1];
        setEmissionFactor(rawHistory[activeMonth] || 0.495);
      }

      const loadedFactor = loadedMeterFactor;

      const carbonSnap = await getDoc(doc(db, `settings_${currentYear}`, "carbon_goals"));
      if (carbonSnap.exists()) {
        setCarbonGoals(carbonSnap.data());
      }

      const setSnap = await getDoc(limitsRef);
      if (setSnap.exists()) {
        setLimits(setSnap.data());
      } else {
        setLimits({ electric: 1000, water: 500 });
      }

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
        if (latest !== base) {
          const A = ((latest.ml || 0) - (base.ml || 0)) * 1000;
          const B = ((latest.mp1 || 0) - (base.mp1 || 0)) * 1000;
          const C = ((latest.mp || 0) - (base.mp || 0)) * 1000;
          const D = (latest.kwh11 || 0) - (base.kwh11 || 0);
          const E = (latest.kwh12 || 0) - (base.kwh12 || 0);
          const F = (latest.kwh13 || 0) - (base.kwh13 || 0);
          const G = (latest.kwh21 || 0) - (base.kwh21 || 0);
          const H = (latest.agv || 0) - (base.agv || 0);
          const totalDiff = A + B + C + D + E + F + G + H;
          e = totalDiff * loadedFactor;
        } else {
          const A = (base.ml || 0) * 1000;
          const B = (base.mp1 || 0) * 1000;
          const C = (base.mp || 0) * 1000;
          const D = base.kwh11 || 0;
          const E = base.kwh12 || 0;
          const F = base.kwh13 || 0;
          const G = base.kwh21 || 0;
          const H = base.agv || 0;
          e = (A + B + C + D + E + F + G + H) * loadedFactor;
        }
      }

      let w = 0;
      const waterBaseRecord = waterRecords.find(r => format(new Date(r.date), 'dd') === '01');
      if (waterBaseRecord && waterRecords.length >= 1) {
        const base = waterBaseRecord.readings;
        const latest = waterRecords[waterRecords.length - 1].readings;
        w = (latest.drink || 0) - (base.total || 0);
      }

      let rUsage = 0;
      const rain01 = rainRecords.find(r => format(new Date(r.date), 'dd') === '01');
      const latestRain = rainRecords[rainRecords.length - 1];
      if (latestRain && rain01) {
        rUsage = (latestRain.readings?.rain || 0) - (rain01.readings?.rain || 0);
      }

      setCurrentUsage({ electric: e, water: w, rain: rUsage });
      setRecords(recs);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => setCurrentMonthDate(subMonths(currentMonthDate, 1));
  const handleNextMonth = () => setCurrentMonthDate(addMonths(currentMonthDate, 1));

  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getDaysPassed = (date) => {
    const now = new Date();
    if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) {
      return getDaysInMonth(date);
    }
    return Math.max(1, now.getDate());
  };

  const daysTotal = getDaysInMonth(currentMonthDate);
  const daysPassed = getDaysPassed(currentMonthDate);

  const getAITip = (type, used, limit) => {
    if (used === 0) return '⚡ 系統待命中，請輸入第一筆數據以啟動分析';

    const dailyRate = used / daysPassed;
    const projected = dailyRate * daysTotal;
    const projectedPct = (projected / (limit || 1)) * 100;
    const remainingDays = Math.max(0, daysTotal - daysPassed);

    if (type === 'electric') {
      const tempNum = parseFloat(weather.temp) || 0;
      if (tempNum >= 28) {
        return <span className="text-warning"><span className="dot dot-warning" /> 🔥 <b>高溫提示</b>：當前氣溫 {weather.temp}°C，預計空調負載將增加。建議調高 1°C 可節省約 6% 電量。</span>;
      }
      if (projectedPct > 100) {
        const diff = projected - limit;
        const dailyReduction = diff / (remainingDays + 1);
        return <span className="text-error"><span className="dot dot-error" /> 🔴 警示：按目前速度，月底預計耗用 {Math.round(projectedPct)}% ({Math.round(projected).toLocaleString()}度)。建議每日減用 {Math.round(dailyReduction).toLocaleString()}度以拉回目標</span>;
      }
      if (projectedPct >= 90) {
        return <span className="text-warning"><span className="dot dot-warning" /> 🟡 提示：月底預期耗用將達 {Math.round(projectedPct)}%，接近上限，請密切注意高耗能設備</span>;
      }
      if (projectedPct >= 75) {
        return <span className="text-success"><span className="dot dot-success" /> 🟢 完美：預算利用率 {Math.round(projectedPct)}%，目前正穩定朝節能目標邁進！</span>;
      }
      return <span className="text-info"><span className="dot dot-info" /> 🔵 空間：目前預算非常充裕，預計月底僅耗用 {Math.round(projectedPct)}%，尚有 {Math.round(limit - projected).toLocaleString()} 度空間</span>;
    }

    if (type === 'water') {
      if (weather.desc?.includes('雨') || parseInt(weather.pop) >= 60) {
        return <span className="text-info"><span className="dot dot-info" /> 💧 <b>水源切換</b>：偵測到目前降雨充足，建議暫停自來水灌溉，優先消耗雨水回收槽。</span>;
      }
      if (projectedPct > 100) {
        const diff = projected - limit;
        return <span className="text-error"><span className="dot dot-error" /> 🔴 警告：用水預計將超標！目前預估為 {Math.round(projectedPct)}% ({Math.round(projected).toLocaleString()}度)。建議每日節約 {Math.round(diff / (remainingDays + 1)).toLocaleString()}度</span>;
      }
      if (projectedPct >= 90) {
        return <span className="text-warning"><span className="dot dot-warning" /> 🟡 提示：月底配水預計達 {Math.round(projectedPct)}%，請留意洩漏或過度灌溉</span>;
      }
      if (projectedPct >= 70) {
        return <span className="text-success"><span className="dot dot-success" /> 🟢 穩定：用水狀況優異，利用率約 {Math.round(projectedPct)}%，請繼續保持</span>;
      }
      const remainingSpace = limit - projected;
      return <span className="text-info"><span className="dot dot-info" /> 🔵 備載：目前用水無虞，預計月底僅耗用 {Math.round(projectedPct)}%，距離上限空間極大</span>;
    }

    if (type === 'rain') {
      const popInt = parseInt(weather.pop) || 0;
      if (popInt >= 50) {
        return <span className="text-info"><span className="dot dot-info" /> 🌧️ 預警：降雨機率高 ({weather.pop}%)，建議備妥儲水槽空間，最大化回收效益</span>;
      }
      return <span className="text-success"><span className="dot dot-success" /> 🟢 系統正常：雨水回收運作中，目前為主要輔助水源</span>;
    }
    return null;
  };

  const handleDelete = async (monthStr, id) => {
    if (window.confirm('確定要刪除這筆紀錄嗎？')) {
      const year = monthStr.substring(0, 4);
      await deleteDoc(doc(db, `usage_records_${year}`, id));
      fetchDashboardData();
    }
  };

  const calcPercent = (used, limit) => Math.min((used / (limit || 1)) * 100, 100);
  const electricPct = calcPercent(currentUsage.electric, limits.electric);
  const waterPct = calcPercent(currentUsage.water, limits.water);

  const WeatherIcon = () => {
    if (weather.icon === 'rain') return <RainIcon className="text-water" size={18} />;
    if (weather.icon === 'cloud') return <Cloud className="text-main" size={18} />;
    return <Sun className="text-warning" size={18} />;
  };

  const handleCopyCardImage = async (ref, title) => {
    if (!ref.current) return;

    // 檢查瀏覽器是否支援圖片剪貼簿 (iOS 14.7+ 與現代瀏覽器支持)
    const canCopyImage = window.ClipboardItem && navigator.clipboard?.write;

    if (canCopyImage) {
      try {
        // ✨ 專業技巧：在 iOS Safari 必須同步建立項並傳入 Promise，否則會被安全性攔截
        const item = new ClipboardItem({
          'image/png': toBlob(ref.current, {
            backgroundColor: '#0f172a',
            style: { borderRadius: '12px' }
          })
        });

        await navigator.clipboard.write([item]);
        alert(`${title} 圖片已複製！現在可以去 LINE 貼上了。`);
        return;
      } catch (err) {
        console.error('剪貼簿寫入失敗，切換至分享模式:', err);
      }
    }

    try {
      const blob = await toBlob(ref.current, {
        backgroundColor: '#0f172a',
        style: { borderRadius: '12px' }
      });

      const file = new File([blob], `${title}_status.png`, { type: 'image/png' });

      // 1. 嘗試預備分享 (原生分享介面)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${title} 監測狀態`,
          text: `EcoMonitor ${title} 資源監測數據`
        });
        return;
      }

      // 2. 萬不得已才用下載 (相容性最強)
      const dataUrl = await toPng(ref.current, {
        backgroundColor: '#0f172a',
        style: { borderRadius: '12px' }
      });
      const link = document.createElement('a');
      link.download = `${title}_${format(new Date(), 'MMdd')}.png`;
      link.href = dataUrl;
      link.click();
      alert('由於瀏覽器限制，已改為下載圖片至您的裝置。');

    } catch (err) {
      console.error('操作失敗:', err);
      alert('目前瀏覽器不支持此功能，請手動擷取螢幕畫面。');
    }
  };

  const electricList = records.filter(r => r.type === 'electric');
  const waterList = records.filter(r => r.type === 'water');
  const rainList = records.filter(r => r.type === 'rain');

  const toggleExpand = (type) => setExpandedTables(prev => ({ ...prev, [type]: !prev[type] }));
  const getDisplayList = (list, type) => expandedTables[type] ? list : list.slice(0, 2);

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    if (electricList.length > 0) {
      const electricData = electricList.map(r => ({
        "日期": format(new Date(r.date), 'yyyy/MM/dd'),
        "ML": r.readings?.ml ?? 0,
        "MP-1": r.readings?.mp1 ?? 0,
        "MP": r.readings?.mp ?? 0,
        "1-1": r.readings?.kwh11 ?? 0,
        "1-2": r.readings?.kwh12 ?? 0,
        "1-3": r.readings?.kwh13 ?? 0,
        "2-1": r.readings?.kwh21 ?? 0,
        "AGV": r.readings?.agv ?? 0
      }));
      const ws1 = XLSX.utils.json_to_sheet(electricData);
      XLSX.utils.book_append_sheet(wb, ws1, "配電紀錄");
    }
    if (waterList.length > 0) {
      const waterData = waterList.map(r => ({
        "日期": format(new Date(r.date), 'yyyy/MM/dd'),
        "總水量": r.readings?.total ?? 0,
        "飲用水表": r.readings?.drink ?? 0
      }));
      const ws2 = XLSX.utils.json_to_sheet(waterData);
      XLSX.utils.book_append_sheet(wb, ws2, "配水紀錄");
    }
    if (rainList.length > 0) {
      const rainData = rainList.map(r => ({
        "日期": format(new Date(r.date), 'yyyy/MM/dd'),
        "雨水回收": r.readings?.rain ?? 0
      }));
      const ws3 = XLSX.utils.json_to_sheet(rainData);
      XLSX.utils.book_append_sheet(wb, ws3, "雨水紀錄");
    }
    XLSX.writeFile(wb, `${currentMonthStr}_資源明細紀錄.xlsx`);
  };

  const eProjected = (currentUsage.electric / daysPassed) * daysTotal;
  const wProjected = (currentUsage.water / daysPassed) * daysTotal;
  const eLimit = limits.electric || 1;
  const wLimit = limits.water || 1;
  const carbonBudget = Math.round(carbonGoals.baseYearAvg * (1 - carbonGoals.reductionTarget / 100) * emissionFactor);
  const carbonProjected = Math.round(eProjected * emissionFactor);

  const isElectricExceeded = eProjected > eLimit;
  const isWaterExceeded = wProjected > wLimit;
  const isCarbonExceeded = carbonProjected > carbonBudget;

  let statusLevel = 'success'; // success, warning, danger
  if (isCarbonExceeded) {
    statusLevel = 'danger';
  } else if (isElectricExceeded || isWaterExceeded) {
    statusLevel = 'warning';
  }

  const getStatusColor = () => {
    if (statusLevel === 'danger') return 'var(--color-error)';
    if (statusLevel === 'warning') return '#f59e0b'; // Amber/Orange
    return 'var(--color-success)';
  };

  const getStatusBg = () => {
    if (statusLevel === 'danger') return 'radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)';
    if (statusLevel === 'warning') return 'radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, transparent 70%)';
    return 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, transparent 70%)';
  };

  if (loading) return <div className="loader-container"><div className="spinner"></div></div>;

  return (
    <div className="fade-in">
      <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ flex: '1', minWidth: '300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <h1 style={{ 
              margin: 0, 
              fontSize: '1.8rem', 
              fontWeight: '800',
              background: 'linear-gradient(to bottom, #ffffff, #94a3b8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px'
            }}>
              智慧資源監測中心
            </h1>
            {!isOnline && (
              <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'none', padding: '2px 8px', fontSize: '0.7rem' }}>
                <WifiOff size={12} /> 離線中
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.8 }}>
              <WeatherIcon />
              <span>{weather.desc} {weather.temp}°C</span>
            </div>
            <span style={{ opacity: 0.3 }}>|</span>
            <span>{format(new Date(), 'yyyy/MM/dd')}</span>
          </div>
        </div>
        {/* 頂級膠囊導航列 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          background: 'rgba(255, 255, 255, 0.04)', 
          backdropFilter: 'blur(12px)',
          padding: '4px', 
          borderRadius: '30px', 
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          marginBottom: '5px'
        }}>
          {/* 上個月 */}
          <button 
            onClick={handlePrevMonth} 
            className="hover-bright"
            style={{ 
              background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', 
              cursor: 'pointer', padding: '8px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', transition: 'all 0.3s'
            }}
          >
            <ChevronLeft size={20} />
          </button>

          {/* 月份選擇視窗 (隱形觸發器) */}
          <div 
            onClick={() => monthInputRef.current?.showPicker()}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px', cursor: 'pointer' }}
          >
            <span style={{ 
              fontSize: '1rem', fontWeight: 600, color: '#fff', 
              letterSpacing: '1px', pointerEvents: 'none',
              textShadow: '0 0 12px rgba(99, 102, 241, 0.4)',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              {currentMonthStr.substring(0, 4)}年{currentMonthStr.substring(5, 7)}月
              <Calendar size={16} style={{ color: '#ffffff' }} />
            </span>
            <input 
              ref={monthInputRef}
              type="month" 
              value={currentMonthStr}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  const [y, m] = val.split('-');
                  setCurrentMonthDate(new Date(parseInt(y), parseInt(m) - 1, 1));
                }
              }}
              style={{ 
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                opacity: 0, pointerEvents: 'none',
                appearance: 'none', WebkitAppearance: 'none'
              }}
            />
          </div>

          {/* 下個月 */}
          <button 
            onClick={handleNextMonth} 
            className="hover-bright"
            style={{ 
              background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', 
              cursor: 'pointer', padding: '8px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', transition: 'all 0.3s'
            }}
          >
            <ChevronRight size={20} />
          </button>

          {/* 分隔線 */}
          <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

          {/* 回到今天 */}
          <button 
            onClick={() => setCurrentMonthDate(new Date())}
            style={{ 
              background: 'rgba(99, 102, 241, 0.15)', 
              border: '1px solid rgba(99, 102, 241, 0.3)', 
              color: '#818cf8', 
              fontSize: '0.75rem', 
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 14px', 
              borderRadius: '20px',
              display: 'flex', alignItems: 'center',
              transition: 'all 0.3s'
            }}
            className="btn-today-active"
          >
             本月
          </button>
        </div>
      </div>


      <div className="metric-grid">
        <div className="glass-panel metric-card" ref={electricCardRef} style={{ borderColor: electricPct >= 90 ? 'var(--color-error)' : 'var(--panel-border)' }}>
          <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="metric-title" style={{ margin: 0 }}><Zap className="text-electric" /> {currentMonthStr.replace('-', '/')} 月份累計用電量</h3>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button onClick={() => handleCopyCardImage(electricCardRef, '用電')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} title="複製圖片"><Camera size={18} /></button>
              <div style={{ display: 'flex', gap: '0.8rem' }}>
                {role === 'admin' && (
                  <><button onClick={() => setFactorModalOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Calculator size={18} className="text-electric" /></button>
                    <button onClick={() => { setInputType('electric'); setLimitModalOpen(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Settings size={18} className="text-electric" /></button></>
                )}
                {role !== 'guest' && <button onClick={() => { setInputType('electric'); setInputModalOpen(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><PenTool size={18} className="text-electric" /></button>}
              </div>
            </div>
          </div>
          <div className="metric-value text-electric"><span style={{ fontSize: '3rem' }}>{Math.round(currentUsage.electric).toLocaleString()}</span><span className="metric-unit">/ {limits.electric.toLocaleString()} 度</span></div>
          <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 'auto' }}>{getAITip('electric', currentUsage.electric, limits.electric)}</div>
          <div className="progress-container"><div className="progress-bar" style={{ width: `${electricPct}%`, backgroundColor: electricPct >= 90 ? 'var(--color-error)' : 'var(--color-electric)' }} /></div>
        </div>

        <div className="glass-panel metric-card" ref={waterCardRef} style={{ borderColor: waterPct >= 90 ? 'var(--color-error)' : 'var(--panel-border)' }}>
          <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="metric-title" style={{ margin: 0 }}><Droplet className="text-water" /> {currentMonthStr.replace('-', '/')} 月份累計用水量</h3>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button onClick={() => handleCopyCardImage(waterCardRef, '用水')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} title="複製圖片"><Camera size={18} /></button>
              <div style={{ display: 'flex', gap: '0.8rem' }}>
                {role === 'admin' && <button onClick={() => { setInputType('water'); setLimitModalOpen(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Settings size={18} className="text-water" /></button>}
                {role !== 'guest' && <button onClick={() => { setInputType('water'); setInputModalOpen(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><PenTool size={18} className="text-water" /></button>}
              </div>
            </div>
          </div>
          <div className="metric-value text-water"><span style={{ fontSize: '3rem' }}>{Math.round(currentUsage.water).toLocaleString()}</span><span className="metric-unit">/ {limits.water.toLocaleString()} 度</span></div>
          <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 'auto' }}>{getAITip('water', currentUsage.water, limits.water)}</div>
          <div className="progress-container"><div className="progress-bar" style={{ width: `${waterPct}%`, backgroundColor: waterPct >= 90 ? 'var(--color-error)' : 'var(--color-water)' }} /></div>
        </div>

        <div className="glass-panel metric-card" ref={rainCardRef}>
          <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="metric-title" style={{ margin: 0 }}><CloudRain className="text-rain" /> {currentMonthStr.replace('-', '/')} 月份雨水回收量</h3>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button onClick={() => handleCopyCardImage(rainCardRef, '雨水')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} title="複製圖片"><Camera size={18} /></button>
              {role !== 'guest' && <button onClick={() => { setInputType('rain'); setInputModalOpen(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><PenTool size={18} className="text-rain" /></button>}
            </div>
          </div>
          <div className="metric-value text-rain"><span style={{ fontSize: '3rem' }}>{Math.round(currentUsage.rain).toLocaleString()}</span><span className="metric-unit">度</span></div>
          <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 'auto' }}>{getAITip('rain', currentUsage.rain, 1000)}</div>
        </div>

        {/* 碳排量指標卡 (環境貢獻總結) */}
        <div className="glass-panel metric-card" style={{ 
          borderColor: isCarbonExceeded ? 'var(--color-error)' : 'var(--panel-border)',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            bottom: '-20px',
            right: '-20px',
            width: '100px',
            height: '100px',
            background: getStatusBg(),
            zIndex: 0,
            opacity: 0.5
          }} />
          <div className="metric-header" style={{ position: 'relative', zIndex: 1 }}>
            <h3 className="metric-title" style={{ margin: 0, color: getStatusColor() }}>
              <Sparkles size={18} /> {currentMonthStr.replace('-', '/')} 碳排量餘額
            </h3>
          </div>
          <div className="metric-value" style={{ color: getStatusColor(), position: 'relative', zIndex: 1 }}>
            <span style={{ fontSize: '3rem' }}>
              {isCarbonExceeded ? (Math.abs(carbonBudget - carbonProjected).toLocaleString()) : (carbonBudget - carbonProjected).toLocaleString()}
            </span>
            <span className="metric-unit">kg</span>
          </div>
          
          <div style={{ marginTop: 'auto', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <span>月預計: {carbonProjected.toLocaleString()} kg</span>
              <span>目標: {carbonBudget.toLocaleString()} kg</span>
            </div>
            <div className="progress-container" style={{ height: '6px' }}>
              <div className="progress-bar" style={{ 
                width: `${Math.min(100, (carbonProjected / (carbonBudget || 1)) * 100)}%`, 
                backgroundColor: getStatusColor() 
              }} />
            </div>
            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: getStatusColor() }}>
              {isCarbonExceeded ? (
                <><CloudOff size={14} /> 減量目標未達成</>
              ) : (
                <><TrendingDown size={14} /> 救了 {Math.max(0, Math.round((carbonBudget - carbonProjected) / 1.0))} 棵大樹</>
              )}
            </div>
          </div>
        </div>
      </div>

      {role !== 'guest' && (
        <div className="glass-panel" style={{ marginTop: '2rem', padding: 0, overflow: 'hidden' }}>
          <div onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} style={{ padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: isHistoryExpanded ? '1px solid rgba(255,255,255,0.05)' : 'none', background: isHistoryExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>{isHistoryExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}<span>{currentMonthStr} 歷史明細紀錄</span></h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {records.length > 0 && isHistoryExpanded && <button onClick={(e) => { e.stopPropagation(); handleExportExcel(); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--panel-border)', borderRadius: '8px', color: 'var(--text-main)', cursor: 'pointer' }}><Download size={16} /> 導出 Excel</button>}
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{isHistoryExpanded ? '回縮明細' : `共 ${records.length} 筆紀錄 (點擊展開)`}</span>
            </div>
          </div>
          {isHistoryExpanded && (
            <div style={{ padding: '2rem' }} className="fade-in">
              {records.length === 0 ? <p className="text-muted">本月尚無明細紀錄。</p> : (
                <div id="history-export-container">
                  {electricList.length > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                      <h3 style={{ color: 'var(--color-electric)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}><Zap size={18} /> 用電紀錄</h3>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                              <th style={{ padding: '0.8rem', textAlign: 'left' }}>日期</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>辦公大樓</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>倉儲大樓</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>低壓用電</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>1-1</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>1-2</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>1-3</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>2-1</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>AGV</th>
                              {role !== 'guest' && <th style={{ padding: '0.8rem', textAlign: 'right' }}>操作</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {getDisplayList(electricList, 'electric').map(r => (
                              <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.8rem', textAlign: 'left' }}>{format(new Date(r.date), 'MM/dd')}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-electric)' }}>{r.readings?.ml}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-electric)' }}>{r.readings?.mp1}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-electric)' }}>{r.readings?.mp}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-electric)' }}>{r.readings?.kwh11}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-electric)' }}>{r.readings?.kwh12}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-electric)' }}>{r.readings?.kwh13}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-electric)' }}>{r.readings?.kwh21}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-electric)' }}>{r.readings?.agv}</td>
                                {role !== 'guest' && (
                                  <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                    <button onClick={() => setEditRecordData(r)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginRight: '10px' }}><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(r.month, r.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {waterList.length > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                      <h3 style={{ color: 'var(--color-water)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}><Droplet size={18} /> 自來水紀錄</h3>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                              <th style={{ padding: '0.8rem', textAlign: 'left' }}>日期</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>總水表(早)</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>總水表(夜)</th>
                              {role !== 'guest' && <th style={{ padding: '0.8rem', textAlign: 'right' }}>操作</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {getDisplayList(waterList, 'water').map(r => (
                              <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.8rem', textAlign: 'left' }}>{format(new Date(r.date), 'MM/dd')}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-water)' }}>{r.readings?.total}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-water)' }}>{r.readings?.drink}</td>
                                {role !== 'guest' && (
                                  <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                    <button onClick={() => setEditRecordData(r)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginRight: '10px' }}><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(r.month, r.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {rainList.length > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                      <h3 style={{ color: 'var(--color-rain)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}><CloudRain size={18} /> 雨水回收紀錄</h3>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                              <th style={{ padding: '0.8rem', textAlign: 'left' }}>日期</th>
                              <th style={{ padding: '0.8rem', textAlign: 'center' }}>雨水回收</th>
                              {role !== 'guest' && <th style={{ padding: '0.8rem', textAlign: 'right' }}>操作</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {getDisplayList(rainList, 'rain').map(r => (
                              <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.8rem', textAlign: 'left' }}>{format(new Date(r.date), 'MM/dd')}</td>
                                <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--color-rain)' }}>{r.readings?.rain}</td>
                                {role !== 'guest' && (
                                  <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                    <button onClick={() => setEditRecordData(r)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginRight: '10px' }}><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(r.month, r.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}><Trash2 size={16} /></button>
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
          )}
        </div>
      )}

      <DataInputModal isOpen={isInputModalOpen} onClose={() => setInputModalOpen(false)} fetchDashboardData={fetchDashboardData} defaultType={inputType} />
      <LimitSettingModal isOpen={isLimitModalOpen} onClose={() => setLimitModalOpen(false)} year={currentMonthStr.substring(0, 4)} type={inputType} fetchDashboardData={fetchDashboardData} />
      <FactorSettingModal
        isOpen={isFactorModalOpen}
        onClose={() => setFactorModalOpen(false)}
        currentFactor={electricFactor}
        currentEmissionFactor={emissionFactor}
        emissionHistory={emissionHistory}
        currentMonthStr={currentMonthStr}
        carbonGoals={carbonGoals}
        fetchDashboardData={fetchDashboardData} 
      />
      <EditRecordModal isOpen={!!editRecordData} onClose={() => setEditRecordData(null)} record={editRecordData} fetchDashboardData={fetchDashboardData} />
    </div>
  );
};

export default Dashboard;
