import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Header, Card, InputGroup } from '../components/SharedUI';
import { formatDate, getStatus } from '../lib/utils';

const CalculatorScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [mfgDate, setMfgDate] = useState('');
  const [mode, setMode] = useState<'direct' | 'calc'>('direct');
  const [directDate, setDirectDate] = useState('');
  const [numValue, setNumValue] = useState('');
  const [numUnit, setNumUnit] = useState('days');
  const [destroyDays, setDestroyDays] = useState('');

  const results = useMemo(() => {
    if (!mfgDate) return null;

    let exp = null;
    if (mode === 'direct' && directDate) {
      exp = directDate;
    } else if (mode === 'calc' && numValue) {
      const d = new Date(mfgDate);
      d.setDate(d.getDate() + (numUnit === 'months' ? parseInt(numValue) * 30 : parseInt(numValue)));
      exp = d.toISOString().split('T')[0];
    }

    if (!exp) return null;

    const st = getStatus(exp);
    let destroyRes = null;

    if (destroyDays) {
      const d = new Date(exp);
      d.setDate(d.getDate() - parseInt(destroyDays));
      const dstr = d.toISOString().split('T')[0];
      const st2 = getStatus(dstr);
      destroyRes = { date: dstr, status: st2 };
    }

    return { exp, status: st, destroy: destroyRes };
  }, [mfgDate, mode, directDate, numValue, numUnit, destroyDays]);

  const inputClass = "w-full max-w-full box-border block p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[0.95rem] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <Header title="TÍNH NGÀY HỦY" onBack={onBack} />
      <Card>
        <InputGroup label="Ngày sản xuất (NSX)">
          <input type="date" className={inputClass} value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} />
        </InputGroup>

        <InputGroup label="Hạn sử dụng (HSD)">
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-4">
            <button 
              className={`flex-1 py-2.5 text-[0.85rem] font-bold rounded-xl transition-all ${mode === 'direct' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setMode('direct')}
            >
              Ghi sẵn
            </button>
            <button 
              className={`flex-1 py-2.5 text-[0.85rem] font-bold rounded-xl transition-all ${mode === 'calc' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setMode('calc')}
            >
              Tính từ NSX
            </button>
          </div>
          
          {mode === 'direct' ? (
            <input type="date" className={inputClass} value={directDate} onChange={(e) => setDirectDate(e.target.value)} />
          ) : (
            <div className="flex gap-3">
              <input 
                type="number" 
                inputMode="numeric" 
                pattern="[0-9]*"
                min="0" 
                placeholder="Số..." 
                className={`${inputClass} flex-[2]`} 
                value={numValue} 
                onChange={(e) => setNumValue(e.target.value)} 
              />
              <select className={`${inputClass} flex-1`} value={numUnit} onChange={(e) => setNumUnit(e.target.value)}>
                <option value="days">Ngày</option>
                <option value="months">Tháng</option>
              </select>
            </div>
          )}
        </InputGroup>

        <InputGroup label="Số ngày hủy trước HSD">
          <input 
            type="number" 
            inputMode="numeric" 
            pattern="[0-9]*"
            min="0" 
            placeholder="Ví dụ: 15" 
            className={inputClass} 
            value={destroyDays} 
            onChange={(e) => setDestroyDays(e.target.value)} 
          />
        </InputGroup>

        {results && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
            <div className={`p-5 rounded-[1.5rem] bg-gradient-to-br ${results.status.cls} text-white shadow-lg`}>
              <div className="text-[0.7rem] uppercase font-bold tracking-wider opacity-80 mb-1">Hết hạn HSD</div>
              <div className="text-2xl font-black mb-1">{formatDate(results.exp)}</div>
              <div className="text-[0.85rem] font-medium opacity-90">{results.status.txt}</div>
            </div>
            
            {results.destroy && (
              <div className={`p-5 rounded-[1.5rem] bg-gradient-to-br ${results.destroy.status.cls} text-white shadow-lg`}>
                <div className="text-[0.7rem] uppercase font-bold tracking-wider opacity-80 mb-1">Phải hủy</div>
                <div className="text-2xl font-black mb-1">{formatDate(results.destroy.date)}</div>
                <div className="text-[0.85rem] font-medium opacity-90">{results.destroy.status.txt}</div>
              </div>
            )}
          </motion.div>
        )}
      </Card>
    </motion.div>
  );
}

export default CalculatorScreen;
