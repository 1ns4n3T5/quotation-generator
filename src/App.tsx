import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import html2pdf from 'html2pdf.js';
import { Plus, Trash2, Download, Printer, Image as ImageIcon, FileText, Save, FolderOpen, X, FilePlus, LogIn, LogOut, LayoutDashboard, CloudUpload, CloudDownload } from 'lucide-react';
import { db, auth, loginWithGoogle, logout } from './firebase';
import { collection, doc, setDoc, onSnapshot, query, where, orderBy, getDocs, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Dashboard } from './Dashboard';
import { Toaster, toast } from 'sonner';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface QuotationItem {
  id: string;
  particulars: string;
  dimension: string;
  qty: number | '';
  squareFeet: number | '';
  rate: number | '';
  amount: number | '';
  remark: string;
}

export interface QuotationData {
  id: string;
  quotationNumber: string;
  date: string;
  items: QuotationItem[];
  materials: string[];
  remarks: string[];
  signOff: string[];
  headerImage: string | null;
  discount?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [savedQuotations, setSavedQuotations] = useState<QuotationData[]>(() => {
    const saved = localStorage.getItem('localQuotations');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentView, setCurrentView] = useState<'editor' | 'dashboard'>('editor');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const [data, setData] = useState<QuotationData>(() => {
    const savedLogo = localStorage.getItem('localLogo');
    return {
      id: Date.now().toString(),
      quotationNumber: '',
      date: new Date().toLocaleDateString('en-GB').replace(/\//g, '.'),
      headerImage: savedLogo || null,
      items: [
        { id: '1', particulars: 'W1, Casement window', dimension: "5' x 5.5'", qty: 1, squareFeet: 27.5, rate: 38000, amount: 1045000, remark: '4mm solar green' },
        { id: '2', particulars: 'W2, Slide window', dimension: "3' x 4'", qty: 2, squareFeet: 24, rate: 24000, amount: 576000, remark: '4mm solar green' },
        { id: '3', particulars: 'W3, Slide window', dimension: "4' x 4'", qty: 6, squareFeet: 96, rate: 24000, amount: 2304000, remark: '4mm solar green' },
        { id: '4', particulars: 'F(1) Fixed glass', dimension: "3' x 2'", qty: 2, squareFeet: '', rate: 180000, amount: 360000, remark: '4mm solar green' },
        { id: '5', particulars: 'F1A Fixed glass', dimension: "3' x 2'", qty: 1, squareFeet: '', rate: 180000, amount: 180000, remark: '4mm solar green' },
      ],
      materials: ['728 Serial grey aluminum ( use materials )'],
      remarks: [
        '5mm clear glass = 4,642,500',
        '5mm grey glass = 4,967,500'
      ],
      signOff: ['Best Regards', 'Zaw Lin Aung', '09-420225277']
    };
  });

  const saveQuotation = async () => {
    if (!data.quotationNumber) {
      toast.error('Please enter a quotation number before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const quotationToSave = {
        ...data,
        createdAt: (data as any).createdAt || Date.now()
      };
      
      const existingIndex = savedQuotations.findIndex(q => q.id === data.id);
      let newQuotations;
      if (existingIndex >= 0) {
        newQuotations = [...savedQuotations];
        newQuotations[existingIndex] = quotationToSave;
      } else {
        newQuotations = [quotationToSave, ...savedQuotations];
      }
      
      newQuotations.sort((a, b) => ((b as any).createdAt || 0) - ((a as any).createdAt || 0));
      
      setSavedQuotations(newQuotations);
      localStorage.setItem('localQuotations', JSON.stringify(newQuotations));
      
      if (user) {
        try {
          const { headerImage, ...rest } = quotationToSave;
          await setDoc(doc(db, 'quotations', quotationToSave.id), { ...rest, userId: user.uid });
          toast.success('Quotation saved locally and backed up to cloud!');
        } catch (error) {
          toast.success('Quotation saved locally! (Cloud backup failed)');
          handleFirestoreError(error, OperationType.WRITE, 'quotations');
        }
      } else {
        toast.success('Quotation saved locally!');
      }
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const loadQuotation = (quotation: QuotationData) => {
    setData({ ...quotation, headerImage: data.headerImage });
    setShowSavedModal(false);
    toast.success('Quotation restored successfully!');
  };

  const deleteQuotation = async (id: string) => {
    toast('Delete Quotation', {
      description: 'Are you sure you want to delete this quotation locally? It will remain safe in your Google Cloud backup.',
      action: {
        label: 'Delete',
        onClick: async () => {
          const newQuotations = savedQuotations.filter(q => q.id !== id);
          setSavedQuotations(newQuotations);
          localStorage.setItem('localQuotations', JSON.stringify(newQuotations));
          toast.success('Quotation deleted locally (Still in Cloud)');
        }
      }
    });
  };

  const backupToCloud = async () => {
    if (!user) return;
    setIsSaving(true);
    
    const backupPromise = (async () => {
      const promises = savedQuotations.map(q => {
        const { headerImage, ...rest } = q;
        return setDoc(doc(db, 'quotations', q.id), { ...rest, userId: user.uid });
      });
      await Promise.all(promises);
      
      if (data.headerImage) {
        await setDoc(doc(db, 'settings', user.uid), {
          userId: user.uid,
          headerImage: data.headerImage
        });
      }
    })();

    toast.promise(backupPromise, {
      loading: 'Backing up to Google Cloud...',
      success: 'Successfully backed up to Google Cloud!',
      error: (err) => {
        handleFirestoreError(err, OperationType.WRITE, 'quotations');
        return 'Backup failed. Please try again.';
      },
    });

    try {
      await backupPromise;
    } finally {
      setIsSaving(false);
    }
  };

  const restoreFromCloud = async () => {
    if (!user) return;
    setIsSaving(true);

    const restorePromise = (async () => {
      const q = query(collection(db, 'quotations'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const cloudQuotations: QuotationData[] = [];
      snapshot.forEach(doc => {
        cloudQuotations.push(doc.data() as QuotationData);
      });
      
      const mergedMap = new Map<string, QuotationData>();
      savedQuotations.forEach(q => mergedMap.set(q.id, q));
      cloudQuotations.forEach(q => mergedMap.set(q.id, q));
      
      const mergedList = Array.from(mergedMap.values());
      mergedList.sort((a, b) => ((b as any).createdAt || 0) - ((a as any).createdAt || 0));
      
      setSavedQuotations(mergedList);
      localStorage.setItem('localQuotations', JSON.stringify(mergedList));
      
      const settingsDoc = await getDoc(doc(db, 'settings', user.uid));
      if (settingsDoc.exists()) {
        const settings = settingsDoc.data();
        if (settings.headerImage) {
          setData(prev => ({ ...prev, headerImage: settings.headerImage }));
          localStorage.setItem('localLogo', settings.headerImage);
        }
      }
    })();

    toast.promise(restorePromise, {
      loading: 'Restoring from Google Cloud...',
      success: 'Successfully restored from Google Cloud!',
      error: (err) => {
        handleFirestoreError(err, OperationType.GET, 'quotations');
        return 'Restore failed. Please try again.';
      },
    });

    try {
      await restorePromise;
    } finally {
      setIsSaving(false);
    }
  };

  const createNewQuotation = () => {
    toast('New Quotation', {
      description: 'Create new quotation? Unsaved changes will be lost.',
      action: {
        label: 'Create',
        onClick: () => {
          setData({
            id: Date.now().toString(),
            quotationNumber: '',
            date: new Date().toLocaleDateString('en-GB').replace(/\//g, '.'),
            headerImage: data.headerImage,
            items: [
              { id: '1', particulars: '', dimension: '', qty: '', squareFeet: '', rate: '', amount: '', remark: '' }
            ],
            materials: [''],
            remarks: [''],
            signOff: ['Best Regards', 'Zaw Lin Aung', '09-420225277'],
            discount: ''
          });
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const handleLogoUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setData(prev => ({...prev, headerImage: base64}));
      localStorage.setItem('localLogo', base64);
      
      if (user) {
        try {
          await setDoc(doc(db, 'settings', user.uid), {
            userId: user.uid,
            headerImage: base64
          });
          toast.success('Logo uploaded and backed up to cloud');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'settings');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = async () => {
    setData(prev => ({...prev, headerImage: null}));
    localStorage.removeItem('localLogo');
    toast.success('Logo removed locally (Still in Cloud)');
  };

  const previewRef = useRef<HTMLDivElement>(null);

  const handleItemChange = (id: string, field: keyof QuotationItem, value: any) => {
    setData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          if (field === 'qty' || field === 'squareFeet' || field === 'rate') {
             const r = Number(updatedItem.rate) || 0;
             const q = Number(updatedItem.qty) || 0;
             const sq = Number(updatedItem.squareFeet) || 0;
             const multiplier = sq > 0 ? sq : q;
             updatedItem.amount = multiplier * r;
          }
          return updatedItem;
        }
        return item;
      })
    }));
  };

  const addItem = () => {
    setData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        { id: Date.now().toString(), particulars: '', dimension: '', qty: '', squareFeet: '', rate: '', amount: '', remark: '' }
      ]
    }));
  };

  const removeItem = (id: string) => {
    setData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const handleRemarkChange = (index: number, value: string) => {
    setData(prev => {
      const newRemarks = [...prev.remarks];
      newRemarks[index] = value;
      return { ...prev, remarks: newRemarks };
    });
  };

  const addRemark = () => {
    setData(prev => ({ ...prev, remarks: [...prev.remarks, ''] }));
  };

  const removeRemark = (index: number) => {
    setData(prev => ({
      ...prev,
      remarks: prev.remarks.filter((_, i) => i !== index)
    }));
  };

  const handleMaterialChange = (index: number, value: string) => {
    setData(prev => {
      const newMaterials = [...prev.materials];
      newMaterials[index] = value;
      return { ...prev, materials: newMaterials };
    });
  };

  const addMaterial = () => {
    setData(prev => ({ ...prev, materials: [...prev.materials, ''] }));
  };

  const removeMaterial = (index: number) => {
    setData(prev => ({
      ...prev,
      materials: prev.materials.filter((_, i) => i !== index)
    }));
  };

  const handleSignOffChange = (index: number, value: string) => {
    setData(prev => {
      const newSignOff = [...prev.signOff];
      newSignOff[index] = value;
      return { ...prev, signOff: newSignOff };
    });
  };

  const addSignOff = () => {
    setData(prev => ({ ...prev, signOff: [...prev.signOff, ''] }));
  };

  const removeSignOff = (index: number) => {
    setData(prev => ({
      ...prev,
      signOff: prev.signOff.filter((_, i) => i !== index)
    }));
  };

  const totalAmount = data.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const finalTotal = totalAmount - (Number(data.discount) || 0);

  const generateImage = async () => {
    if (!previewRef.current) return;
    try {
      const element = previewRef.current;
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `quotation-${data.date}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to generate image', err);
      toast.error('Failed to generate image. Please try again.');
    }
  };

  const generatePDF = async () => {
    if (!previewRef.current) return;
    try {
      const element = previewRef.current;
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      
      const pdf = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgRatio = canvas.width / canvas.height;
      const finalWidth = pdfWidth;
      const finalHeight = finalWidth / imgRatio;
      
      let heightLeft = finalHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'JPEG', 0, position, finalWidth, finalHeight);
      heightLeft -= pdfHeight;
      
      // Only add a new page if the remaining content is significant (e.g., > 15mm)
      // This prevents blank or almost-blank extra pages
      while (heightLeft > 15) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, finalWidth, finalHeight);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`quotation-${data.date}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF', err);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <Toaster position="top-center" richColors duration={2000} />
      {/* Header Bar */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row justify-between items-center gap-4 bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shadow-blue-200 shadow-lg">
            <FileText className="text-white" size={20} />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">Quotation Generator</h1>
        </div>
        <div className="w-full md:w-auto overflow-x-auto no-scrollbar">
          {isAuthReady && (
            user ? (
              <div className="flex items-center gap-2 sm:gap-3 min-w-max">
                <button
                  onClick={() => setCurrentView(currentView === 'editor' ? 'dashboard' : 'editor')}
                  className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl transition-all font-semibold ${
                    currentView === 'editor' 
                    ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' 
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  {currentView === 'editor' ? <><LayoutDashboard size={16} /> Dashboard</> : <><FileText size={16} /> Editor</>}
                </button>
                <button 
                  onClick={backupToCloud}
                  disabled={isSaving}
                  className="flex items-center gap-2 text-sm bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl transition-all font-semibold disabled:opacity-50"
                  title="Backup to Cloud"
                >
                  <CloudUpload size={16} /> <span className="hidden sm:inline">Backup</span>
                </button>
                <button 
                  onClick={restoreFromCloud}
                  disabled={isSaving}
                  className="flex items-center gap-2 text-sm bg-sky-50 hover:bg-sky-100 text-sky-700 px-4 py-2 rounded-xl transition-all font-semibold disabled:opacity-50"
                  title="Restore from Cloud"
                >
                  <CloudDownload size={16} /> <span className="hidden sm:inline">Restore</span>
                </button>
                <div className="flex items-center gap-2 ml-1 pl-3 border-l border-gray-200">
                  <div className="hidden sm:block">
                    {user.photoURL ? (
                      <img 
                        src={user.photoURL} 
                        alt={user.displayName || 'User'} 
                        className="w-9 h-9 rounded-full border-2 border-white shadow-sm"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                        {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={logout}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    title="Sign Out"
                  >
                    <LogOut size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={loginWithGoogle}
                className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 font-semibold"
              >
                <LogIn size={18} /> Sign in to Backup
              </button>
            )
          )}
        </div>
      </div>

      {currentView === 'dashboard' ? (
        <Dashboard quotations={savedQuotations} />
      ) : (
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Form Section */}
          <div className="lg:col-span-4 xl:col-span-5 bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 h-fit">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Editor</h2>
            <div className="flex flex-row flex-nowrap gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              <button 
                onClick={createNewQuotation} 
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md border border-gray-200 transition-colors whitespace-nowrap" 
                title="New Quotation"
              >
                <FilePlus size={18} /> <span className="text-sm font-medium">New</span>
              </button>
              <button 
                onClick={() => setShowSavedModal(true)} 
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md border border-gray-200 transition-colors whitespace-nowrap" 
                title="Open Saved"
              >
                <FolderOpen size={18} /> <span className="text-sm font-medium">Open</span>
              </button>
              <button 
                onClick={saveQuotation} 
                disabled={isSaving}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-gray-200 transition-colors whitespace-nowrap ${isSaving ? 'text-gray-400 bg-gray-100' : 'text-blue-600 hover:bg-blue-50'}`} 
                title="Save Locally"
              >
                <Save size={18} /> <span className="text-sm font-medium">{isSaving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="mb-2">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700">Header Logo Image</label>
                {data.headerImage && (
                  <button 
                    onClick={removeLogo}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove Logo
                  </button>
                )}
              </div>
              <input 
                type="file" 
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 1048576) {
                      toast.error('Image is too large. Please upload an image smaller than 1MB.');
                      return;
                    }
                    handleLogoUpload(file);
                  }
                }}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quotation No.</label>
                <input 
                  type="text" 
                  value={data.quotationNumber} 
                  onChange={e => setData({...data, quotationNumber: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Q-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input 
                  type="text" 
                  value={data.date} 
                  onChange={e => setData({...data, date: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-gray-800">Items</h3>
                <button onClick={addItem} className="text-sm bg-blue-50 text-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-100 flex items-center gap-1">
                  <Plus size={16} /> Add Item
                </button>
              </div>
              
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {data.items.map((item, index) => (
                  <div key={item.id} className="p-4 border border-gray-100 rounded-2xl bg-gray-50/50 hover:bg-gray-50 transition-colors relative group">
                    <button 
                      onClick={() => removeItem(item.id)}
                      className="absolute -top-2 -right-2 bg-white text-red-500 hover:bg-red-50 p-1.5 rounded-full shadow-sm border border-gray-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-12">
                        <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Particulars</label>
                        <input type="text" value={item.particulars} onChange={e => handleItemChange(item.id, 'particulars', e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="Item name..." />
                      </div>
                      <div className="grid grid-cols-2 sm:contents gap-3">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Dimension</label>
                          <input type="text" value={item.dimension} onChange={e => handleItemChange(item.id, 'dimension', e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="Size..." />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Qty</label>
                          <input type="number" value={item.qty} onChange={e => handleItemChange(item.id, 'qty', e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Sq. Feet</label>
                          <input type="number" value={item.squareFeet} onChange={e => handleItemChange(item.id, 'squareFeet', e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:contents gap-3">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Rate</label>
                          <input type="number" value={item.rate} onChange={e => handleItemChange(item.id, 'rate', e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold text-blue-600" />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Amount</label>
                          <input type="number" value={item.amount} onChange={e => handleItemChange(item.id, 'amount', e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-100 font-bold" readOnly />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Remark</label>
                          <input type="text" value={item.remark} onChange={e => handleItemChange(item.id, 'remark', e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="..." />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Discount</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Discount Amount (Ks)</label>
                <input
                  type="number"
                  value={data.discount || ''}
                  onChange={(e) => setData({ ...data, discount: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter discount amount (e.g. 154750)"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Footer Info</h3>
              
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Materials Used</label>
                  <button onClick={addMaterial} className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-md hover:bg-blue-100 flex items-center gap-1 font-medium transition-colors">
                    <Plus size={14} /> Add Material
                  </button>
                </div>
                <div className="space-y-2">
                  {data.materials.map((material, index) => (
                    <div key={index} className="flex gap-2">
                      <input 
                        type="text" 
                        value={material} 
                        onChange={e => handleMaterialChange(index, e.target.value)}
                        className="flex-1 p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <button onClick={() => removeMaterial(index)} className="text-red-500 hover:bg-red-50 p-2 rounded-md">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Remarks List</label>
                  <button onClick={addRemark} className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-md hover:bg-blue-100 flex items-center gap-1 font-medium transition-colors">
                    <Plus size={14} /> Add Remark
                  </button>
                </div>
                <div className="space-y-2">
                  {data.remarks.map((remark, index) => (
                    <div key={index} className="flex gap-2">
                      <input 
                        type="text" 
                        value={remark} 
                        onChange={e => handleRemarkChange(index, e.target.value)}
                        className="flex-1 p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <button onClick={() => removeRemark(index)} className="text-red-500 hover:bg-red-50 p-2 rounded-md">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Sign-off Details</label>
                  <button onClick={addSignOff} className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-md hover:bg-blue-100 flex items-center gap-1 font-medium transition-colors">
                    <Plus size={14} /> Add Line
                  </button>
                </div>
                <div className="space-y-2">
                  {data.signOff.map((line, index) => (
                    <div key={index} className="flex gap-2">
                      <input 
                        type="text" 
                        value={line} 
                        onChange={e => handleSignOffChange(index, e.target.value)}
                        className="flex-1 p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <button onClick={() => removeSignOff(index)} className="text-red-500 hover:bg-red-50 p-2 rounded-md">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Preview Section */}
        <div className="lg:col-span-8 xl:col-span-7 space-y-6">
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Preview</h2>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <select 
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
                  className="flex-1 sm:flex-none p-2 text-sm border border-gray-300 rounded-md bg-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="portrait">Portrait (A4)</option>
                  <option value="landscape">Landscape (A4)</option>
                </select>
                <button onClick={generateImage} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 transition-colors shadow-sm">
                  <ImageIcon size={18} /> <span className="text-sm font-medium">Save as Image</span>
                </button>
                <button onClick={generatePDF} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors shadow-sm">
                  <Printer size={18} /> <span className="text-sm font-medium">Save as PDF</span>
                </button>
              </div>
            </div>
            
            {/* The A4 Document Container */}
            <div className="w-full overflow-x-auto pb-8 custom-scrollbar">
              <div className="shadow-xl mx-auto" style={{ width: 'fit-content' }}>
                <div 
                  ref={previewRef}
                  className="preview-container transition-all duration-300"
                  style={{ 
                  backgroundColor: '#ffffff',
                  width: orientation === 'portrait' ? '793px' : '1122px', 
                  minWidth: orientation === 'portrait' ? '793px' : '1122px',
                  minHeight: orientation === 'portrait' ? '1122px' : '793px',
                  padding: '40px 50px',
                  color: '#000000',
                  fontFamily: '"Times New Roman", Times, serif',
                  boxSizing: 'border-box'
                }}
              >
              {/* Header */}
              <div className="mt-6 mb-8 flex justify-center w-full">
                {data.headerImage ? (
                  <img src={data.headerImage} alt="ZLA Header" className="max-w-full h-auto max-h-36 object-contain mx-auto" />
                ) : (
                  <div className="w-full h-36 border-2 border-dashed flex items-center justify-center" style={{ backgroundColor: '#f9fafb', borderColor: '#d1d5db', color: '#9ca3af' }}>
                    Upload your header logo image in the form
                  </div>
                )}
              </div>

              {/* Quotation Info */}
              <div className="flex justify-between items-center mb-4 text-[15px] font-bold">
                <div>Quotation: {data.quotationNumber}</div>
                <div>Date: {data.date}</div>
              </div>

              {/* Table */}
              <table className="w-full border-collapse border border-[#000000] mb-6 text-[14px] text-[#000000]">
                <thead className="font-bold">
                  <tr className="border-b border-[#000000]">
                    <th className="border-r border-[#000000] px-2 py-1.5 text-center w-10">No</th>
                    <th className="border-r border-[#000000] px-2 py-1.5 text-center">Particulars</th>
                    <th className="border-r border-[#000000] px-2 py-1.5 text-center w-24">Dimension</th>
                    <th className="border-r border-[#000000] px-2 py-1.5 text-center w-12">Qty</th>
                    <th className="border-r border-[#000000] px-2 py-1.5 text-center w-20">Square Feet</th>
                    <th className="border-r border-[#000000] px-2 py-1.5 text-center w-24">Rate</th>
                    <th className="border-r border-[#000000] px-2 py-1.5 text-center w-28">Amount(Ks)</th>
                    <th className="px-2 py-1.5 text-center w-24">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, index) => (
                    <tr key={item.id} className="border-b border-[#000000] break-inside-avoid">
                      <td className="border-r border-[#000000] px-2 py-1.5 text-center">{index + 1}.</td>
                      <td className="border-r border-[#000000] px-2 py-1.5">{item.particulars}</td>
                      <td className="border-r border-[#000000] px-2 py-1.5 text-center">{item.dimension}</td>
                      <td className="border-r border-[#000000] px-2 py-1.5 text-center">{item.qty}</td>
                      <td className="border-r border-[#000000] px-2 py-1.5 text-right">{item.squareFeet || '-'}</td>
                      <td className="border-r border-[#000000] px-2 py-1.5 text-right">{item.rate ? Number(item.rate).toLocaleString() : '-'}</td>
                      <td className="border-r border-[#000000] px-2 py-1.5 text-right">{item.amount ? Number(item.amount).toLocaleString() : '-'}</td>
                      <td className="px-2 py-1.5 text-center">{item.remark}</td>
                    </tr>
                  ))}
                  {/* Total Rows */}
                  {Number(data.discount) > 0 ? (
                    <>
                      <tr className="border-b border-[#000000] font-bold break-inside-avoid">
                        <td colSpan={6} className="border-r border-[#000000] px-2 py-1.5 text-center">Sub Total</td>
                        <td className="border-r border-[#000000] px-2 py-1.5 text-right">{totalAmount.toLocaleString()}</td>
                        <td className="px-2 py-1.5"></td>
                      </tr>
                      <tr className="border-b border-[#000000] font-bold break-inside-avoid" style={{ color: '#dc2626' }}>
                        <td colSpan={6} className="border-r border-[#000000] px-2 py-1.5 text-center">Discount</td>
                        <td className="border-r border-[#000000] px-2 py-1.5 text-right">- {Number(data.discount).toLocaleString()}</td>
                        <td className="px-2 py-1.5"></td>
                      </tr>
                      <tr className="font-bold break-inside-avoid">
                        <td colSpan={6} className="border-r border-[#000000] px-2 py-1.5 text-center">Total</td>
                        <td className="border-r border-[#000000] px-2 py-1.5 text-right">{finalTotal.toLocaleString()}</td>
                        <td className="px-2 py-1.5"></td>
                      </tr>
                    </>
                  ) : (
                    <tr className="font-bold break-inside-avoid">
                      <td colSpan={6} className="border-r border-[#000000] px-2 py-1.5 text-center">Total</td>
                      <td className="border-r border-[#000000] px-2 py-1.5 text-right">{totalAmount.toLocaleString()}</td>
                      <td className="px-2 py-1.5"></td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Footer Content */}
              <div className="text-[14px] break-inside-avoid">
                <div className="mb-2">
                  {data.materials.map((material, index) => (
                    <p key={index} className="mb-0.5">{material}</p>
                  ))}
                </div>
                
                {data.remarks.length > 0 && <p className="mb-0.5 font-bold">Remark</p>}
                <ul className="list-disc pl-8 mb-4 space-y-0">
                  {data.remarks.map((remark, index) => (
                    <li key={index}>{remark}</li>
                  ))}
                </ul>

                {/* Sign-off */}
                <div className="flex justify-end mt-6">
                  <div className="text-center space-y-1">
                    {data.signOff.map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
      </div>
      </div>
      )}

      {/* Saved Quotations Modal */}
      {showSavedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">Saved Quotations</h2>
              <button onClick={() => setShowSavedModal(false)} className="text-gray-500 hover:bg-gray-100 p-2 rounded-md">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {savedQuotations.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No saved quotations found.</p>
              ) : (
                <div className="space-y-3">
                  {savedQuotations.map(q => {
                    const qTotal = q.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                    return (
                      <div key={q.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                        <div>
                          <div className="font-semibold text-gray-800">{q.quotationNumber || 'Untitled'}</div>
                          <div className="text-sm text-gray-500">Date: {q.date} • Total: {(q.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) - (Number(q.discount) || 0)).toLocaleString()} Ks</div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button 
                            onClick={() => loadQuotation(q)}
                            className="flex-1 sm:flex-none px-3 py-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 text-sm font-medium text-center"
                          >
                            Load
                          </button>
                          <button 
                            onClick={() => deleteQuotation(q.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-md flex justify-center items-center"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
