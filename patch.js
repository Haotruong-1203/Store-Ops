const fs = require('fs');
let content = fs.readFileSync('src/screens/ChatScreen.tsx', 'utf8');

// 1. Add Reply icon import
content = content.replace(
  "import { Send, ImagePlus, Trash2, Package, Search, X } from 'lucide-react';",
  "import { Send, ImagePlus, Trash2, Package, Search, X, Reply } from 'lucide-react';"
);

// 2. Add state for replyingToMessage
content = content.replace(
  "const [isProductPopupOpen, setIsProductPopupOpen] = useState(false);",
  "const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);\n  const [isProductPopupOpen, setIsProductPopupOpen] = useState(false);"
);

// 3. Update handleSend
content = content.replace(
  /const handleSend = async \(e: React.FormEvent\) => {[\s\S]*?setIsSending\(false\);\n    }\n  };/,
  `const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      const replyData = replyingToMessage ? {
        id: replyingToMessage.id || '',
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text,
        isImage: !!replyingToMessage.imageUrl,
        isProduct: !!replyingToMessage.productInfo
      } : undefined;
      await sendMessage(currentUser.username, getSenderName(), newMessage, undefined, undefined, replyData);
      setNewMessage('');
      setReplyingToMessage(null);
    } catch (error) {
      alert("Không thể gửi tin nhắn. Vui lòng thử lại!");
    } finally {
      setIsSending(false);
    }
  };`
);

// 4. Update handleSendProduct
content = content.replace(
  /const handleSendProduct = async \(product: Product\) => {[\s\S]*?setIsSending\(false\);\n    }\n  };/,
  `const handleSendProduct = async (product: Product) => {
    setIsSending(true);
    try {
      const replyData = replyingToMessage ? {
        id: replyingToMessage.id || '',
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text,
        isImage: !!replyingToMessage.imageUrl,
        isProduct: !!replyingToMessage.productInfo
      } : undefined;
      await sendMessage(
        currentUser.username, 
        getSenderName(), 
        '', 
        undefined, 
        {
          name: product.name,
          barcode: product.barcode,
          internalCode: product.internalCode,
          price: product.price
        },
        replyData
      );
      setIsProductPopupOpen(false);
      setProductSearch('');
      setReplyingToMessage(null);
    } catch (error) {
      alert("Lỗi khi gửi thông tin sản phẩm.");
    } finally {
      setIsSending(false);
    }
  };`
);

// 5. Update handleImageUpload
content = content.replace(
  /const handleImageUpload = async \(e: React\.ChangeEvent<HTMLInputElement>\) => {[\s\S]*?if \(fileInputRef.current\) fileInputRef.current.value = '';\n    }\n  };/,
  `const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSending(true);
    try {
      const base64Image = await compressImage(file);
      const replyData = replyingToMessage ? {
        id: replyingToMessage.id || '',
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text,
        isImage: !!replyingToMessage.imageUrl,
        isProduct: !!replyingToMessage.productInfo
      } : undefined;
      await sendMessage(currentUser.username, getSenderName(), '', base64Image, undefined, replyData);
      setReplyingToMessage(null);
    } catch (error) {
      console.error(error);
      alert("Lỗi khi tải ảnh lên.");
    } finally {
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };`
);

// 6. Update rendering logic inside msg map
content = content.replace(
  /<div className="relative group\/msg flex items-center">/,
  `<div className="relative group/msg flex items-center">
                      <div className={\`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-all z-10 \${isMe ? '-left-16' : '-right-10'}\`}>
                        {isMe && (
                           <button 
                             onClick={() => handleRevoke(msg.id)}
                             className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full"
                             title="Thu hồi tin nhắn"
                           >
                             <Trash2 size={16} />
                           </button>
                        )}
                        <button 
                           onClick={() => setReplyingToMessage(msg)}
                           className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-full"
                           title="Trả lời"
                         >
                           <Reply size={16} />
                         </button>
                      </div>`
).replace(
  /\{isMe && \(\s*<button[\s\S]*?<\/button>\s*\)\}/,
  "" // Remove old revoke button as it's now grouped
);

// 7. Update bubble to render replyTo preview
content = content.replace(
  /className={`px-4 py-2.5 rounded-\[1.2rem\] shadow-sm text-\[0.95rem\] \${\s*isMe\s*\?\s*'bg-blue-600 text-white rounded-tr-sm'\s*:\s*'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'\s*}`}/,
  `className={\`px-4 py-2.5 rounded-[1.2rem] shadow-sm text-[0.95rem] \${
                          isMe 
                            ? 'bg-blue-600 text-white rounded-tr-sm' 
                            : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'
                        }\`}>
                        {msg.replyTo && (
                          <div className={\`mb-2 p-2.5 rounded-xl text-sm border-l-4 \${isMe ? 'bg-blue-700/40 border-blue-300 text-blue-50' : 'bg-slate-100 border-slate-300 text-slate-500'}\`}>
                            <div className="font-bold mb-0.5 text-xs uppercase opacity-80">{msg.replyTo.senderName}</div>
                            <div className="opacity-90 line-clamp-2">
                              {msg.replyTo.isImage ? '📸 Hình ảnh' : msg.replyTo.isProduct ? '📦 Thông tin sản phẩm' : msg.replyTo.text}
                            </div>
                          </div>
                        )}`
).replace(
  />\s*\{msg\.imageUrl && \(/,
  `>
                        {msg.imageUrl && (`
);

// 8. Add Reply Preview in bottom panel
content = content.replace(
  /<form \s*onSubmit=\{handleSend\}/,
  `{replyingToMessage && (
          <div className="mb-2 bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-start justify-between">
            <div className="flex-1 min-w-0 border-l-4 border-blue-500 pl-3">
              <div className="text-xs font-bold text-blue-600 mb-0.5 uppercase tracking-wide">
                Trả lời {replyingToMessage.senderName}
              </div>
              <div className="text-sm text-slate-500 line-clamp-1">
                {replyingToMessage.imageUrl ? '📸 Hình ảnh' : replyingToMessage.productInfo ? '📦 Thông tin sản phẩm' : replyingToMessage.text}
              </div>
            </div>
            <button 
              type="button"
              onClick={() => setReplyingToMessage(null)} 
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <form 
          onSubmit={handleSend}`
);


fs.writeFileSync('src/screens/ChatScreen.tsx', content);
