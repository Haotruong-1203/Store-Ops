import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Header, InputGroup } from '../components/SharedUI';
import { Save, AlertCircle, Key } from 'lucide-react';

interface SettingsScreenProps {
  onBack: () => void;
  currentUser: { username: string; name: string; role: 'admin' | 'user' };
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack, currentUser }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Note: Hashing with SHA-256 for a real production app is typically done via Web Crypto API or a library like crypto-js.
  // For demonstration, we'll hash before saving if we were calling a real backend auth service.
  // Here we just simulate it.
  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Vui lòng điền đầy đủ các trường.' });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Mật khẩu mới không khớp.' });
      return;
    }

    try {
      // Encode password to SHA-256
      const msgBuffer = new TextEncoder().encode(newPassword);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      console.log('New hashed password (SHA-256):', hashHex);
      // Giả lập lưu thành công lên server.
      // (Trong thực tế bạn sẽ gửi currentPassword và newPassword(hashHex) lên cloud function/API)
      
      setMessage({ type: 'success', text: `Đổi mật khẩu thành công! Hash: ${hashHex.substring(0, 8)}...` });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMessage({ type: 'error', text: 'Đã có lỗi xảy ra khi xử lý đổi mật khẩu.' });
    }
  };

  const inputClass = "w-full bg-slate-50 border-2 border-slate-200 text-slate-800 rounded-xl px-4 py-3.5 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors text-[0.95rem]";

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full bg-slate-50 absolute inset-0"
    >
      <div className="pt-safe px-4 shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200 z-10 shadow-sm">
        <Header title="Cài đặt hệ thống" onBack={onBack} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        
        {/* User Info Section */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
             <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
               <Key className="text-slate-500" size={24} />
             </div>
             <div>
               <h3 className="font-bold text-slate-800">Đổi mật khẩu</h3>
               <p className="text-sm text-slate-500">Mã hóa bảo mật SHA-256</p>
             </div>
          </div>

          <div className="space-y-4">
            <InputGroup label="Mật khẩu hiện tại">
              <input 
                type="password"
                className={inputClass}
                placeholder="Nhập mật khẩu cũ..."
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
              />
            </InputGroup>

            <InputGroup label="Mật khẩu mới">
              <input 
                type="password"
                className={inputClass}
                placeholder="Nhập mật khẩu mới..."
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </InputGroup>

            <InputGroup label="Xác nhận mật khẩu mới">
              <input 
                type="password"
                className={inputClass}
                placeholder="Nhập lại mật khẩu mới..."
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </InputGroup>

            {message && (
              <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${message.type === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <AlertCircle size={16} /> {message.text}
              </div>
            )}

            <button 
              onClick={handlePasswordChange}
              className="w-full py-4 mt-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-2xl active:scale-95 transition-all flex justify-center items-center gap-2"
            >
              <Save size={18} /> Lưu mật khẩu mới
            </button>
          </div>
        </div>

        {/* Other settings can be added here */}
        <div className="text-center pt-8 text-xs font-bold text-slate-400">
          Phiên bản hệ thống: 1.2.0-cloud
        </div>
      </div>
    </motion.div>
  );
};
