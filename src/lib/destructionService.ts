import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';

export interface DestructionItem {
  id: string;
  stt: number | string;
  barcode: string;
  internalCode?: string;
  name: string;
  quantity?: number; // Số lượng gốc trên file/chứng từ (nếu có)
  note?: string;
  createdAt?: string;
}

const DESTRUCTION_COLLECTION = 'destruction_items';
const LOCAL_STORAGE_KEY = 'app_destruction_temp_quantities';
const LOCAL_STORAGE_NOTES_KEY = 'app_destruction_temp_notes';

// Danh sách dữ liệu mẫu ban đầu để người dùng trải nghiệm ngay
export const INITIAL_SAMPLE_DESTRUCTION_ITEMS: DestructionItem[] = [
  { id: 'dest-1', stt: 1, barcode: '8934567890123', internalCode: '100234', name: 'Sữa tươi Tiệt trùng Vinamilk 100% Có đường 1L', quantity: 3, note: 'Hộp móp, rò rỉ nắp' },
  { id: 'dest-2', stt: 2, barcode: '8935001712345', internalCode: '100456', name: 'Sữa chua men sống Probi chai 65ml (lốc 5)', quantity: 2, note: 'Hết hạn sử dụng' },
  { id: 'dest-3', stt: 3, barcode: '8934822001124', internalCode: '102389', name: 'Bánh mì tươi chà bông Kinh Đô 50g', quantity: 5, note: 'Date cận ngày' },
  { id: 'dest-4', stt: 4, barcode: '8934588012111', internalCode: '105670', name: 'Xúc xích tiệt trùng Vissan Heo dinh dưỡng 4 cây 160g', quantity: 4, note: 'Bao bì rách' },
  { id: 'dest-5', stt: 5, barcode: '8936036010022', internalCode: '108991', name: 'Nước ngọt Coca-Cola Sleek lon 320ml', quantity: 6, note: 'Vỏ lon móp méo' },
  { id: 'dest-6', stt: 6, barcode: '8934563148112', internalCode: '110245', name: 'Mì Omachi sườn hầm ngũ quả gói 80g', quantity: 10, note: 'Gói bị xì hơi' },
  { id: 'dest-7', stt: 7, barcode: '8934804021235', internalCode: '112003', name: 'Trà chanh C2 nắp vặn chai 455ml', quantity: 3, note: 'Lỗi nhãn dán' },
  { id: 'dest-8', stt: 8, barcode: '8935049500128', internalCode: '113401', name: 'Bánh gạo Ichi vị Shouyu mật ong gói 180g', quantity: 2, note: 'Gãy vụn nát' },
  { id: 'dest-9', stt: 9, barcode: '8934673102049', internalCode: '115220', name: 'Bơ Tường An Margarine hộp 200g', quantity: 1, note: 'Nứt vỡ hộp nhựa' },
  { id: 'dest-10', stt: 10, barcode: '8936011171009', internalCode: '117890', name: 'Nước tăng lực Sting Dâu Sleek lon 320ml', quantity: 8, note: 'Móp đáy lon' },
  { id: 'dest-11', stt: 11, barcode: '8934868120018', internalCode: '119044', name: 'Bánh que Pocky Socola hộp 40g', quantity: 4, note: 'Hộp bị ướt nước' },
  { id: 'dest-12', stt: 12, barcode: '8935217400199', internalCode: '121305', name: 'Kẹo ngậm không đường Halls vị Bạc hà vỉ 10 viên', quantity: 6, note: 'Tem bạc rách' }
];

// Lắng nghe dữ liệu realtime từ Firestore
export const subscribeDestructionItems = (
  onData: (items: DestructionItem[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(collection(db, DESTRUCTION_COLLECTION));
  return onSnapshot(
    q,
    async (snapshot) => {
      if (snapshot.empty) {
        // Tự động khởi tạo dữ liệu mẫu nếu chưa có dữ liệu trong Firestore
        try {
          const batch = writeBatch(db);
          INITIAL_SAMPLE_DESTRUCTION_ITEMS.forEach(item => {
            const docRef = doc(db, DESTRUCTION_COLLECTION, item.id);
            batch.set(docRef, { ...item, createdAt: new Date().toISOString() });
          });
          await batch.commit();
          return;
        } catch (e) {
          console.warn('Fallback to local sample items:', e);
          onData(INITIAL_SAMPLE_DESTRUCTION_ITEMS);
          return;
        }
      }

      const list: DestructionItem[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          stt: d.stt ?? (list.length + 1),
          barcode: d.barcode || '',
          internalCode: d.internalCode || undefined,
          name: d.name || '',
          quantity: typeof d.quantity === 'number' ? d.quantity : undefined,
          note: d.note || '',
          createdAt: d.createdAt
        });
      });

      // Sắp xếp theo STT chuẩn tăng dần theo thứ tự biên bản giấy
      list.sort((a, b) => {
        const numA = typeof a.stt === 'number' ? a.stt : parseInt(String(a.stt).replace(/\D/g, '')) || 0;
        const numB = typeof b.stt === 'number' ? b.stt : parseInt(String(b.stt).replace(/\D/g, '')) || 0;
        return numA - numB;
      });

      onData(list);
    },
    (error) => {
      console.error('Destruction subscribe error:', error);
      if (onError) onError(error);
      // Fallback
      onData(INITIAL_SAMPLE_DESTRUCTION_ITEMS);
    }
  );
};

// Lưu toàn bộ danh sách biên bản mới vào Firestore
export const saveDestructionBatchOnline = async (items: Omit<DestructionItem, 'id'>[]) => {
  // Xóa cũ trước
  await clearDestructionCollection();

  // Lưu theo từng chunk 400 docs (Firestore batch limit là 500)
  const chunkSize = 400;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    
    chunk.forEach((item, index) => {
      const docId = 'dest-' + Date.now() + '-' + (i + index) + '-' + Math.random().toString(36).substring(2, 6);
      const docRef = doc(db, DESTRUCTION_COLLECTION, docId);
      batch.set(docRef, {
        ...item,
        id: docId,
        createdAt: new Date().toISOString()
      });
    });

    await batch.commit();
  }
};

// Xóa toàn bộ dữ liệu biên bản hủy
export const clearDestructionCollection = async () => {
  const q = query(collection(db, DESTRUCTION_COLLECTION));
  const snapshot = await getDocs(q);
  const docs = snapshot.docs;
  
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  }
};

// Lưu & Lấy số lượng nhập tạm thời (Local storage để không mất khi đổi tab/tải lại trang)
export const getStoredTempQuantities = (): Record<string, number> => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

export const saveStoredTempQuantities = (quantities: Record<string, number>) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(quantities));
  } catch (e) {
    console.warn('Could not save temp quantities to localStorage');
  }
};

export const clearStoredTempQuantities = () => {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (e) {
    // ignore
  }
};

export const getStoredTempNotes = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_NOTES_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

export const saveStoredTempNotes = (notes: Record<string, string>) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_NOTES_KEY, JSON.stringify(notes));
  } catch (e) {
    console.warn('Could not save temp notes to localStorage');
  }
};
