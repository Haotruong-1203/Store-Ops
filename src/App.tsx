import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { 
  Product, 
  subscribeProducts, 
  addProductOnline, 
  updateProductOnline, 
  deleteProductOnline,
  syncFromLocalToOnline
} from './lib/firestoreService';
import { getAllProducts as getLocalProducts } from './lib/db';
import { getSavedUser, saveUserSession, clearUserSession } from './lib/auth';
import { LoginScreen } from './components/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import CalculatorScreen from './screens/CalculatorScreen';
import InventoryScreen from './screens/InventoryScreen';
import ScannerScreen from './screens/ScannerScreen';
import { ChatScreen } from './screens/ChatScreen';
import { CheckScreen } from './screens/CheckScreen';
import { DestructionScreen } from './screens/DestructionScreen';
import { ExpiryScreen, DataScreen } from './screens/OtherScreens';
import { SettingsScreen } from './screens/SettingsScreen';

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ username: string; name: string; role: 'admin' | 'user' } | null>(() => getSavedUser());
  const [viewingUserId, setViewingUserId] = useState<string>('all');
  const [currentScreen, setCurrentScreen] = useState<string>('home');
  const [orderMode, setOrderMode] = useState<'consumable' | 'general'>('consumable');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const handleNavigate = (screen: string, mode?: 'consumable' | 'general') => {
    if (mode) {
      setOrderMode(mode);
    }
    setCurrentScreen(screen);
  };

  const handleLoginSuccess = (user: { username: string; name: string; role: 'admin' | 'user' }) => {
    saveUserSession(user);
    setCurrentUser(user);
    setViewingUserId(user.role === 'admin' ? 'all' : user.username);
  };

  const handleLogout = () => {
    clearUserSession();
    setCurrentUser(null);
    setProducts([]);
    setCurrentScreen('home');
  };

  useEffect(() => {
    if (!currentUser) return;
    const checkAndSyncLocalData = async () => {
      try {
        const localItems = await getLocalProducts();
        if (localItems && localItems.length > 0) {
          const syncKey = `synced_local_to_cloud_${currentUser.username}`;
          if (!localStorage.getItem(syncKey)) {
            await syncFromLocalToOnline(localItems, currentUser.username);
            localStorage.setItem(syncKey, 'true');
          }
        }
      } catch (err) {
        console.warn("Local sync check note:", err);
      }
    };
    checkAndSyncLocalData();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const targetUserId = currentUser.role === 'admin' ? viewingUserId : currentUser.username;

    const unsubscribe = subscribeProducts(
      targetUserId,
      (liveData) => {
        setProducts(liveData);
        setIsLoading(false);
      },
      (error) => {
        console.error("Firestore live sync error:", error);
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser, viewingUserId]);

  const handleAdd = async (p: Omit<Product, 'id'>) => {
    if (!currentUser) return;
    const targetUser = (currentUser.role === 'admin' && viewingUserId !== 'all') 
      ? viewingUserId 
      : currentUser.username;
      
    await addProductOnline(p, targetUser);
  };

  const handleUpdate = async (p: Product) => {
    await updateProductOnline(p);
  };

  const handleDelete = async (id: string | number) => {
    await deleteProductOnline(id);
  };

  const handleImport = async (csvData: string) => {
    if (!currentUser) return;
    const targetUser = (currentUser.role === 'admin' && viewingUserId !== 'all') 
      ? viewingUserId 
      : currentUser.username;

    const lines = csvData.split('\n').slice(1);
    let count = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(',').map(v => v.replace(/"/g, '').trim());
      if (parts.length >= 2) {
        const nm = parts[0];
        const bc = parts[1];
        const internalCode = parts[2] || undefined;
        const destroyDays = parseInt(parts[3]) || 15;
        const expDate = parts[4] || '';
        const dst = parts[5] || parts[3] || '';
        const pr = parseInt(parts[6]) || 0;
        const qty = parseInt(parts[7]) || undefined;
        const note = parts[8] || undefined;

        await addProductOnline({ 
          name: nm, 
          barcode: bc, 
          internalCode: internalCode,
          destroyDaysBeforeExpiry: destroyDays,
          destructionDate: dst, 
          price: pr,
          expiryRecords: dst ? [{
            id: 'rec-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            expDate: expDate || dst,
            destructionDate: dst,
            quantity: qty,
            note: note,
            createdAt: new Date().toISOString()
          }] : []
        }, targetUser);
        count++;
      }
    }
    alert(`Đã import thành công ${count} sản phẩm lên Cloud!`);
  };

  if (!currentUser) {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  const isFullHeightScreen = currentScreen === 'chat' || currentScreen === 'settings';

  return (
    <div className="min-h-dvh w-full bg-[#f5f5f7] text-zinc-900 flex flex-col selection:bg-blue-100 selection:text-blue-900">
      <main className={`w-full mx-auto flex-1 flex flex-col relative ${
        isFullHeightScreen ? 'max-w-3xl h-dvh overflow-hidden' : 'max-w-5xl px-4 sm:px-6 lg:px-8 pt-safe pb-8'
      }`}>
        <AnimatePresence mode="wait">
          {currentScreen === 'home' && (
            <HomeScreen 
              key="home" 
              navigate={handleNavigate} 
              currentUser={currentUser}
              onLogout={handleLogout}
              viewingUserId={viewingUserId}
              onSelectViewingUser={currentUser.role === 'admin' ? setViewingUserId : undefined}
              productCount={products.length}
              products={products}
            />
          )}
          {currentScreen === 'calculator' && (
            <div key="calculator" className="max-w-lg mx-auto w-full">
              <CalculatorScreen onBack={() => setCurrentScreen('home')} />
            </div>
          )}
          {currentScreen === 'inventory' && (
            <InventoryScreen 
              key="inventory" 
              onBack={() => setCurrentScreen('home')} 
              currentUser={currentUser}
              products={products}
              onAddProduct={handleAdd}
              onUpdateProduct={handleUpdate}
              initialOrderMode={orderMode}
            />
          )}
          {currentScreen === 'check' && (
            <CheckScreen 
              key="check" 
              onBack={() => setCurrentScreen('home')} 
              products={products} 
              onAdd={handleAdd}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          )}
          {currentScreen === 'expiry' && (
            <ExpiryScreen 
              key="expiry" 
              onBack={() => setCurrentScreen('home')} 
              products={products} 
              onUpdate={handleUpdate}
            />
          )}
          {(currentScreen === 'destruction' || currentScreen === 'price') && (
            <DestructionScreen 
              key="destruction" 
              onBack={() => setCurrentScreen('home')} 
              onNavigateToData={() => setCurrentScreen('data')}
            />
          )}
          {currentScreen === 'data' && (
            <div key="data" className="max-w-2xl mx-auto w-full">
              <DataScreen 
                onBack={() => setCurrentScreen('home')} 
                products={products} 
                onImport={handleImport} 
              />
            </div>
          )}
          {currentScreen === 'scanner' && (
            <div key="scanner" className="max-w-lg mx-auto w-full flex-1 flex flex-col">
              <ScannerScreen 
                onBack={() => setCurrentScreen('home')} 
                products={products} 
                onAdd={handleAdd}
                onUpdate={handleUpdate}
                currentUserId={currentUser?.username}
              />
            </div>
          )}
          {currentScreen === 'chat' && (
            <ChatScreen 
              key="chat" 
              onBack={() => setCurrentScreen('home')} 
              currentUser={currentUser}
              products={products}
            />
          )}
          {currentScreen === 'settings' && (
            <SettingsScreen 
              key="settings" 
              onBack={() => setCurrentScreen('home')} 
              currentUser={currentUser} 
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
