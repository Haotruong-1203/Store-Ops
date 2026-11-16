import React, { useState, useEffect } from 'react';
import { ArrowRight, Eye, EyeOff, Check, UserCheck, UserPlus, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  getAllProfiles, 
  authenticateUser, 
  saveCustomUser, 
  fetchRemoteCustomUsers 
} from '../lib/auth';

interface LoginModalProps {
  onSuccess: (user: { username: string; name: string; role: 'admin' | 'user' }) => void;
}

export const LoginScreen: React.FC<LoginModalProps> = ({ onSuccess }) => {
  const [profiles, setProfiles] = useState(() => getAllProfiles());
  const [selectedUserKey, setSelectedUserKey] = useState<string>('conghao');
  
  // Login with existing profile
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  // Create & login with "Người dùng khác"
  const [newUserName, setNewUserName] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Load profiles từ Firestore nếu có tài khoản mới tạo từ thiết bị khác
  useEffect(() => {
    fetchRemoteCustomUsers().then(() => {
      setProfiles(getAllProfiles());
    });
  }, []);

  const isOtherSelected = selectedUserKey === '__other__';

  const handleSelectProfile = (key: string) => {
    setSelectedUserKey(key);
    setPassword('');
    setError('');
  };

  const handleSelectOther = () => {
    setSelectedUserKey('__other__');
    setNewUserName('');
    setNewPassword('');
    setError('');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    if (isOtherSelected) {
      // Xử lý tạo "Người dùng khác"
      const trimmedName = newUserName.trim();
      const trimmedPass = newPassword.trim();

      if (!trimmedName) {
        setError('Vui lòng nhập tên của bạn!');
        return;
      }
      if (!trimmedPass) {
        setError('Vui lòng tạo mật khẩu cho tài khoản!');
        return;
      }
      if (trimmedPass.length < 3) {
        setError('Mật khẩu tối thiểu 3 ký tự!');
        return;
      }

      setIsSubmitting(true);
      try {
        const newUser = await saveCustomUser(trimmedName, trimmedPass);
        // Cập nhật lại danh sách profile
        setProfiles(getAllProfiles());
        onSuccess({
          username: newUser.username,
          name: newUser.name,
          role: 'user'
        });
      } catch (err) {
        setError('Đã có lỗi khi tạo tài khoản. Vui lòng thử lại!');
        setIsSubmitting(false);
      }
    } else {
      // Đăng nhập tài khoản đã có
      if (!password) {
        setError('Vui lòng nhập mật khẩu');
        return;
      }

      setIsSubmitting(true);
      setTimeout(() => {
        const user = authenticateUser(selectedUserKey, password);
        if (user) {
          onSuccess(user);
        } else {
          setError('Mật khẩu không chính xác!');
          setIsSubmitting(false);
        }
      }, 150);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden font-sans select-none">
      {/* Soft natural frosted glass background orbs */}
      <div className="absolute top-[-15%] left-[-10%] w-[28rem] h-[28rem] bg-sky-200/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[26rem] h-[26rem] bg-slate-200/60 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-[35%] right-[-5%] w-[18rem] h-[18rem] bg-indigo-100/40 rounded-full blur-2xl pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-sm relative z-10 bg-white/90 backdrop-blur-xl rounded-3xl p-7 shadow-apple-lg border-0"
      >
        {/* Header minimal */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-white shadow-apple p-1.5 flex items-center justify-center">
            <img 
              src="/assets/aistudio/image_c37e9c28.png" 
              alt="Logo Quản Lý Hàng" 
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Quản Lý Hàng</h1>
        </div>

        {/* Danh sách Profile: Công Hào, Các tài khoản đã tạo & Người dùng khác */}
        <div className="mb-5">
          <label className="block text-[0.7rem] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Tài khoản
          </label>
          <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto no-scrollbar pr-0.5">
            {profiles.map((p) => {
              const isSelected = selectedUserKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleSelectProfile(p.key)}
                  className={`py-3 px-4 rounded-2xl border text-left flex items-center justify-between transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                    isSelected 
                      ? 'bg-white shadow-apple text-slate-900 border-0' 
                      : 'bg-slate-100/70 hover:bg-white text-slate-600 shadow-apple-soft border-0'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl ${p.avatarBg} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs`}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <span className="text-[0.9rem] font-bold text-slate-800 block truncate">
                        {p.name}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}

            {/* Profile "Người dùng khác" (Luôn hiện ở cuối để thêm tài khoản mới) */}
            <button
              type="button"
              onClick={handleSelectOther}
              className={`py-3 px-4 rounded-2xl border border-dashed text-left flex items-center justify-between transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                isOtherSelected 
                  ? 'bg-blue-50/90 shadow-apple text-blue-950 border-0' 
                  : 'bg-slate-100/70 hover:bg-white text-slate-700 shadow-apple-soft border-0'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                  isOtherSelected ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 text-slate-700'
                }`}>
                  <UserPlus size={16} />
                </div>
                <div>
                  <span className={`text-[0.9rem] font-bold block leading-tight ${isOtherSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                    Người dùng khác
                  </span>
                </div>
              </div>
              {isOtherSelected && (
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Form Đăng nhập / Tạo tài khoản mới */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* NẾU CHỌN NGƯỜI DÙNG KHÁC: HIỆN THÊM Ô NHẬP TÊN CỦA BẠN TRÊN Ô MẬT KHẨU */}
          {isOtherSelected ? (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div>
                <label className="block text-[0.7rem] font-bold text-blue-900 uppercase tracking-wider mb-1">
                  Tên của bạn <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Nhập họ và tên của bạn..."
                  autoFocus
                  className="w-full py-3.5 px-4 bg-slate-100/80 rounded-2xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 border-0 transition-all box-border font-medium"
                />
              </div>

              <div>
                <label className="block text-[0.7rem] font-bold text-blue-900 uppercase tracking-wider mb-1">
                  Tạo mật khẩu cho tài khoản <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Tạo mật khẩu đăng nhập..."
                    className="w-full py-3.5 pl-4 pr-10 bg-slate-100/80 rounded-2xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 border-0 transition-all box-border font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                    title={showNewPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[0.68rem] text-slate-500 mt-1">
                  Lần sau đăng xuất, tài khoản này sẽ hiển thị sẵn trên danh sách để bạn đăng nhập nhanh.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[0.7rem] font-semibold text-slate-400 uppercase tracking-wider">
                  Mật khẩu
                </label>
              </div>
              
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  autoFocus
                  className="w-full py-3.5 pl-4 pr-10 bg-slate-100/80 rounded-2xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 border-0 transition-all box-border font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Hiển thị thông báo lỗi */}
          <AnimatePresence>
            {error && (
              <motion.p 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }} 
                className="text-rose-600 text-xs mt-1 font-medium flex items-center gap-1"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-3.5 text-white font-semibold text-sm rounded-full shadow-apple flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 active:scale-[0.98] border-0 ${
              isOtherSelected 
                ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20' 
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {isSubmitting ? (
              <span>Đang xử lý...</span>
            ) : isOtherSelected ? (
              <>
                <span>Tạo tài khoản & Đăng nhập</span>
                <Sparkles size={16} />
              </>
            ) : (
              <>
                <span>Vào ứng dụng</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>


      </motion.div>
    </div>
  );
};
