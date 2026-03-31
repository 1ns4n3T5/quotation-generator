import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import html2pdf from 'html2pdf.js';
import { Plus, Trash2, Download, Printer, Image as ImageIcon, FileText, Save, FolderOpen, X, FilePlus, LogIn, LogOut, LayoutDashboard, CloudUpload, CloudDownload, Globe, Menu } from 'lucide-react';
import { db, auth, loginWithGoogle, logout } from './firebase';
import { collection, doc, setDoc, onSnapshot, query, where, orderBy, getDocs, getDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Dashboard } from './Dashboard';
import { Toaster, toast } from 'sonner';
import { translations, Language } from './translations';

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

const myNotifications = Object.fromEntries(
  Object.entries(translations.my).filter(([key]) => key.startsWith('notif'))
);

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const t = {
    ...translations[language],
    ...myNotifications
  } as typeof translations['en'];
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [savedQuotations, setSavedQuotations] = useState<QuotationData[]>(() => {
    const saved = localStorage.getItem('localQuotations');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        return parsed.map((q: any) => ({ ...q, headerImage: null }));
      } catch (e) { return []; }
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
      items: [],
      materials: [],
      remarks: [],
      signOff: ['Best Regards', 'Zaw Lin Aung', '09-420225277']
    };
  });

  const saveQuotation = async (): Promise<boolean> => {
    if (!data.quotationNumber) {
      toast.error(t.notifEnterQuotationNo);
      return false;
    }

    setIsSaving(true);
    try {
      const { headerImage, ...restData } = data;
      const quotationToSave = {
        ...restData,
        headerImage: null,
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
        const { headerImage, ...rest } = quotationToSave;
        setDoc(doc(db, 'quotations', quotationToSave.id), { ...rest, userId: user.uid })
          .then(() => {
            toast.success(t.notifSavedLocalCloud);
          })
          .catch((error) => {
            toast.success(t.notifSavedLocalCloudFail);
            try {
              handleFirestoreError(error, OperationType.WRITE, 'quotations');
            } catch (e) {
              // Ignore the thrown error from handleFirestoreError
            }
          });
      } else {
        toast.success(t.notifSavedLocal);
      }
      return true;
    } catch (error) {
      console.error(error);
      return false;
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const loadQuotation = (quotation: QuotationData) => {
    setData({ ...quotation, headerImage: data.headerImage });
    setShowSavedModal(false);
    toast.success(t.notifRestoredSuccess);
  };

  const deleteQuotation = async (id: string) => {
    toast(t.notifDeleteTitle, {
      description: t.notifDeleteDesc,
      action: {
        label: t.delete,
        onClick: async () => {
          const newQuotations = savedQuotations.filter(q => q.id !== id);
          setSavedQuotations(newQuotations);
          localStorage.setItem('localQuotations', JSON.stringify(newQuotations));
          toast.success(t.notifDeletedLocal);
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
      loading: t.notifBackupLoading,
      success: t.notifBackupSuccess,
      error: (err) => {
        try {
          handleFirestoreError(err, OperationType.WRITE, 'quotations');
        } catch (e) {
          // Ignore
        }
        return t.notifBackupError;
      },
    });

    try {
      await backupPromise;
    } catch (e) {
      // Error is handled by toast.promise
    } finally {
      setIsSaving(false);
    }
  };

  const backupToCloudRef = useRef(backupToCloud);
  useEffect(() => {
    backupToCloudRef.current = backupToCloud;
  }, [backupToCloud]);

  useEffect(() => {
    const handleOnline = () => {
      if (auth.currentUser) {
        backupToCloudRef.current();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

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
      
      const settingsDoc = await getDoc(doc(db, 'settings', user.uid));
      
      if (cloudQuotations.length === 0 && !settingsDoc.exists()) {
        throw new Error('NO_DATA');
      }
      
      const mergedMap = new Map<string, QuotationData>();
      savedQuotations.forEach(q => mergedMap.set(q.id, q));
      cloudQuotations.forEach(q => mergedMap.set(q.id, q));
      
      const mergedList = Array.from(mergedMap.values());
      mergedList.sort((a, b) => ((b as any).createdAt || 0) - ((a as any).createdAt || 0));
      
      setSavedQuotations(mergedList);
      localStorage.setItem('localQuotations', JSON.stringify(mergedList));
      
      if (settingsDoc.exists()) {
        const settings = settingsDoc.data();
        if (settings.headerImage) {
          setData(prev => ({ ...prev, headerImage: settings.headerImage }));
          localStorage.setItem('localLogo', settings.headerImage);
        }
      }
    })();

    toast.promise(restorePromise, {
      loading: t.notifRestoreLoading,
      success: t.notifRestoreSuccess,
      error: (err: any) => {
        if (err?.message === 'NO_DATA') {
          return t.notifNoBackupData;
        }
        try {
          handleFirestoreError(err, OperationType.GET, 'quotations');
        } catch (e) {
          // Ignore
        }
        return t.notifRestoreError;
      },
    });

    try {
      await restorePromise;
    } catch (e) {
      // Error is handled by toast.promise
    } finally {
      setIsSaving(false);
    }
  };

  const createNewQuotation = () => {
    toast(t.notifNewTitle, {
      description: t.notifNewDesc,
      action: {
        label: t.notifNewAction,
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
        setDoc(doc(db, 'settings', user.uid), {
          userId: user.uid,
          headerImage: base64
        })
          .then(() => {
            toast.success(t.notifLogoUploaded);
          })
          .catch((error) => {
            try {
              handleFirestoreError(error, OperationType.WRITE, 'settings');
            } catch (e) {}
          });
      }
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = async () => {
    setData(prev => ({...prev, headerImage: null}));
    localStorage.removeItem('localLogo');
    toast.success(t.notifLogoRemoved);
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
    const saved = await saveQuotation();
    if (!saved) return;

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
      toast.success(t.notifImageSaved);
    } catch (err) {
      console.error('Failed to generate image', err);
      toast.error(t.notifImageGenFail);
    }
  };

  const generatePDF = async () => {
    if (!previewRef.current) return;
    const saved = await saveQuotation();
    if (!saved) return;

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
      toast.error(t.notifPdfGenFail);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <Toaster position="top-center" richColors duration={2000} />
      {/* Header Bar */}
      <div className="max-w-7xl mx-auto mb-6 bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg shadow-blue-200 shadow-lg">
              <FileText className="text-white" size={20} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">Quotation Generator</h1>
          </div>
          
          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthReady && (
              user ? (
                <div className="flex items-center gap-2 sm:gap-3 min-w-max">
                  <div className="flex items-center bg-gray-100 p-1 rounded-xl">
                    <button
                      onClick={() => setLanguage('en')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${language === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Globe size={14} /> EN
                    </button>
                    <button
                      onClick={() => setLanguage('my')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${language === 'my' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Globe size={14} /> MM
                    </button>
                  </div>
                  <button
                    onClick={() => setCurrentView(currentView === 'editor' ? 'dashboard' : 'editor')}
                    className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl transition-all font-semibold ${
                      currentView === 'editor' 
                      ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' 
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    {currentView === 'editor' ? <><LayoutDashboard size={16} /> {t.dashboard}</> : <><FileText size={16} /> {t.editor}</>}
                  </button>
                  <button 
                    onClick={restoreFromCloud}
                    disabled={isSaving}
                    className="flex items-center gap-2 text-sm bg-sky-50 hover:bg-sky-100 text-sky-700 px-4 py-2 rounded-xl transition-all font-semibold disabled:opacity-50"
                    title={t.restore}
                  >
                    <CloudDownload size={16} /> <span className="hidden sm:inline">{t.restore}</span>
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
                <div className="flex items-center gap-2 sm:gap-3 min-w-max">
                  <div className="flex items-center bg-gray-100 p-1 rounded-xl">
                    <button
                      onClick={() => setLanguage('en')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${language === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Globe size={14} /> EN
                    </button>
                    <button
                      onClick={() => setLanguage('my')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${language === 'my' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Globe size={14} /> MM
                    </button>
                  </div>
                  <button 
                    onClick={loginWithGoogle}
                    className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 font-semibold"
                  >
                    <LogIn size={18} /> {t.signInToBackup}
                  </button>
                </div>
              )
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMobileMenuOpen && (
          <div className="md:hidden pt-4 mt-4 border-t border-gray-100 flex flex-col gap-3">
            {isAuthReady && (
              user ? (
                <>
                  <div className="flex items-center bg-gray-100 p-1 rounded-xl self-start">
                    <button
                      onClick={() => setLanguage('en')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${language === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Globe size={14} /> EN
                    </button>
                    <button
                      onClick={() => setLanguage('my')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${language === 'my' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Globe size={14} /> MM
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setCurrentView(currentView === 'editor' ? 'dashboard' : 'editor');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-xl transition-all font-semibold w-full ${
                      currentView === 'editor' 
                      ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' 
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    {currentView === 'editor' ? <><LayoutDashboard size={16} /> {t.dashboard}</> : <><FileText size={16} /> {t.editor}</>}
                  </button>
                  <div className="grid grid-cols-1 gap-2">
                    <button 
                      onClick={() => { restoreFromCloud(); setIsMobileMenuOpen(false); }}
                      disabled={isSaving}
                      className="flex items-center justify-center gap-2 text-sm bg-sky-50 hover:bg-sky-100 text-sky-700 px-4 py-3 rounded-xl transition-all font-semibold disabled:opacity-50"
                    >
                      <CloudDownload size={16} /> {t.restore}
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 pt-3 mt-1 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      {user.photoURL ? (
                        <img 
                          src={user.photoURL} 
                          alt={user.displayName || 'User'} 
                          className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                          {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                        </div>
                      )}
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-semibold text-gray-800 truncate">{user.displayName || 'User'}</span>
                        <span className="text-xs text-gray-500 truncate">{user.email}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => { logout(); setIsMobileMenuOpen(false); }}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all w-full"
                    >
                      <LogOut size={16} /> Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center bg-gray-100 p-1 rounded-xl self-start">
                    <button
                      onClick={() => setLanguage('en')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${language === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Globe size={14} /> EN
                    </button>
                    <button
                      onClick={() => setLanguage('my')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${language === 'my' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Globe size={14} /> MM
                    </button>
                  </div>
                  <button 
                    onClick={() => { loginWithGoogle(); setIsMobileMenuOpen(false); }}
                    className="flex items-center justify-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl transition-all shadow-md font-semibold w-full"
                  >
                    <LogIn size={18} /> {t.signInToBackup}
                  </button>
                </>
              )
            )}
          </div>
        )}
      </div>

      {currentView === 'dashboard' ? (
        <Dashboard quotations={savedQuotations} language={language} />
      ) : (
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Form Section */}
          <div className="lg:col-span-4 xl:col-span-5 bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 h-fit">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800">{t.editor}</h2>
            <div className="flex flex-row flex-nowrap gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              <button 
                onClick={createNewQuotation} 
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md border border-gray-200 transition-colors whitespace-nowrap" 
                title={t.new}
              >
                <FilePlus size={18} /> <span className="text-base font-medium">{t.new}</span>
              </button>
              <button 
                onClick={() => setShowSavedModal(true)} 
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md border border-gray-200 transition-colors whitespace-nowrap" 
                title={t.open}
              >
                <FolderOpen size={18} /> <span className="text-base font-medium">{t.open}</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="mb-2">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-base font-semibold text-gray-700">{t.headerLogoImage}</label>
                {data.headerImage && (
                  <button 
                    onClick={removeLogo}
                    className="text-xs text-red-600 hover:underline"
                  >
                    {t.removeLogo}
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
                      toast.error(t.notifImageLarge);
                      return;
                    }
                    handleLogoUpload(file);
                  }
                }}
                className="w-full text-base text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-base file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-semibold text-gray-700 mb-1">{t.quotationNo}</label>
                <input 
                  type="text" 
                  value={data.quotationNumber} 
                  onChange={e => setData({...data, quotationNumber: e.target.value})}
                  className="w-full p-2 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Q-001"
                />
              </div>
              <div>
                <label className="block text-base font-semibold text-gray-700 mb-1">{t.date}</label>
                <input 
                  type="text" 
                  value={data.date} 
                  onChange={e => setData({...data, date: e.target.value})}
                  className="w-full p-2 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-gray-800">{t.items}</h3>
                <button onClick={addItem} className="text-base bg-blue-50 text-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-100 flex items-center gap-1">
                  <Plus size={16} /> {t.addItem}
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
                        <label className="block text-sm uppercase tracking-wider font-bold text-gray-500 mb-1">{t.particulars}</label>
                        <input type="text" value={item.particulars} onChange={e => handleItemChange(item.id, 'particulars', e.target.value)} className="w-full p-2 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder={t.itemName} />
                      </div>
                      <div className="grid grid-cols-2 sm:contents gap-3">
                        <div className="sm:col-span-4">
                          <label className="block text-sm uppercase tracking-wider font-bold text-gray-500 mb-1">{t.dimension}</label>
                          <input type="text" value={item.dimension} onChange={e => handleItemChange(item.id, 'dimension', e.target.value)} className="w-full p-2 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder={t.size} />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-sm uppercase tracking-wider font-bold text-gray-500 mb-1">{t.qty}</label>
                          <input type="number" value={item.qty} onChange={e => handleItemChange(item.id, 'qty', e.target.value)} className="w-full p-2 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-sm uppercase tracking-wider font-bold text-gray-500 mb-1">{t.sqFeet}</label>
                          <input type="number" value={item.squareFeet} onChange={e => handleItemChange(item.id, 'squareFeet', e.target.value)} className="w-full p-2 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:contents gap-3">
                        <div className="sm:col-span-4">
                          <label className="block text-sm uppercase tracking-wider font-bold text-gray-500 mb-1">{t.rate}</label>
                          <input type="number" value={item.rate} onChange={e => handleItemChange(item.id, 'rate', e.target.value)} className="w-full p-2 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold text-blue-600" />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-sm uppercase tracking-wider font-bold text-gray-500 mb-1">{t.amount}</label>
                          <input type="number" value={item.amount} onChange={e => handleItemChange(item.id, 'amount', e.target.value)} className="w-full p-2 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-100 font-bold" readOnly />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-sm uppercase tracking-wider font-bold text-gray-500 mb-1">{t.remark}</label>
                          <input type="text" value={item.remark} onChange={e => handleItemChange(item.id, 'remark', e.target.value)} className="w-full p-2 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="..." />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-xl font-bold text-gray-800 mb-3">{t.discount}</h3>
              <div className="mb-4">
                <label className="block text-base font-semibold text-gray-700 mb-1">{t.discountAmount}</label>
                <input
                  type="number"
                  value={data.discount || ''}
                  onChange={(e) => setData({ ...data, discount: e.target.value })}
                  className="w-full p-2 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter discount amount (e.g. 154750)"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">{t.footerInfo}</h3>
              
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xl font-bold text-gray-800">{t.materialsUsed}</label>
                  <button onClick={addMaterial} className="text-sm bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-md hover:bg-blue-100 flex items-center gap-1 font-medium transition-colors">
                    <Plus size={14} /> {t.addMaterial}
                  </button>
                </div>
                <div className="space-y-2">
                  {data.materials.map((material, index) => (
                    <div key={index} className="flex gap-2">
                      <input 
                        type="text" 
                        value={material} 
                        onChange={e => handleMaterialChange(index, e.target.value)}
                        className="flex-1 p-2 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
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
                  <label className="block text-xl font-bold text-gray-800">{t.remarksList}</label>
                  <button onClick={addRemark} className="text-sm bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-md hover:bg-blue-100 flex items-center gap-1 font-medium transition-colors">
                    <Plus size={14} /> {t.addRemark}
                  </button>
                </div>
                <div className="space-y-2">
                  {data.remarks.map((remark, index) => (
                    <div key={index} className="flex gap-2">
                      <input 
                        type="text" 
                        value={remark} 
                        onChange={e => handleRemarkChange(index, e.target.value)}
                        className="flex-1 p-2 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
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
                  <label className="block text-base font-semibold text-gray-700">{t.signOffDetails}</label>
                  <button onClick={addSignOff} className="text-sm bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-md hover:bg-blue-100 flex items-center gap-1 font-medium transition-colors">
                    <Plus size={14} /> {t.addLine}
                  </button>
                </div>
                <div className="space-y-2">
                  {data.signOff.map((line, index) => (
                    <div key={index} className="flex gap-2">
                      <input 
                        type="text" 
                        value={line} 
                        onChange={e => handleSignOffChange(index, e.target.value)}
                        className="flex-1 p-2 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
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
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800">{t.preview}</h2>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <select 
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
                  className="flex-1 sm:flex-none p-2 text-base border border-gray-300 rounded-md bg-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="portrait">Portrait (A4)</option>
                  <option value="landscape">Landscape (A4)</option>
                </select>
                <button onClick={generateImage} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 transition-colors shadow-sm">
                  <ImageIcon size={18} /> <span className="text-base font-medium">Save as Image</span>
                </button>
                <button onClick={generatePDF} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors shadow-sm">
                  <Printer size={18} /> <span className="text-base font-medium">{t.downloadPdf}</span>
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
              {(() => {
                const hasRemarks = data.items.some(item => item.remark && item.remark.trim() !== '');
                return (
                  <table className="w-full border-collapse border border-[#000000] mb-6 text-[14px] text-[#000000]">
                    <thead className="font-bold">
                      <tr className="border-b border-[#000000]">
                        <th className="border-r border-[#000000] px-2 py-1.5 text-center w-10">{t.no}</th>
                        <th className="border-r border-[#000000] px-2 py-1.5 text-center">{t.particulars}</th>
                        <th className="border-r border-[#000000] px-2 py-1.5 text-center w-24">{t.dimension}</th>
                        <th className="border-r border-[#000000] px-2 py-1.5 text-center w-12">{t.qty}</th>
                        <th className="border-r border-[#000000] px-2 py-1.5 text-center w-20">{t.sqFeet}</th>
                        <th className="border-r border-[#000000] px-2 py-1.5 text-center w-24">{t.rate}</th>
                        <th className={`${hasRemarks ? 'border-r border-[#000000]' : ''} px-2 py-1.5 text-center w-28`}>{t.amount}</th>
                        {hasRemarks && <th className="px-2 py-1.5 text-center w-24">{t.remark}</th>}
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
                          <td className={`${hasRemarks ? 'border-r border-[#000000]' : ''} px-2 py-1.5 text-right`}>{item.amount ? Number(item.amount).toLocaleString() : '-'}</td>
                          {hasRemarks && <td className="px-2 py-1.5 text-center">{item.remark}</td>}
                        </tr>
                      ))}
                      {/* Total Rows */}
                      {Number(data.discount) > 0 ? (
                        <>
                          <tr className="border-b border-[#000000] font-bold break-inside-avoid">
                            <td colSpan={6} className="border-r border-[#000000] px-2 py-1.5 text-center">Sub Total</td>
                            <td className={`${hasRemarks ? 'border-r border-[#000000]' : ''} px-2 py-1.5 text-right`}>{totalAmount.toLocaleString()}</td>
                            {hasRemarks && <td className="px-2 py-1.5"></td>}
                          </tr>
                          <tr className="border-b border-[#000000] font-bold break-inside-avoid" style={{ color: '#dc2626' }}>
                            <td colSpan={6} className="border-r border-[#000000] px-2 py-1.5 text-center">{t.discount}</td>
                            <td className={`${hasRemarks ? 'border-r border-[#000000]' : ''} px-2 py-1.5 text-right`}>- {Number(data.discount).toLocaleString()}</td>
                            {hasRemarks && <td className="px-2 py-1.5"></td>}
                          </tr>
                          <tr className="font-bold break-inside-avoid">
                            <td colSpan={6} className="border-r border-[#000000] px-2 py-1.5 text-center">{t.total}</td>
                            <td className={`${hasRemarks ? 'border-r border-[#000000]' : ''} px-2 py-1.5 text-right`}>{finalTotal.toLocaleString()}</td>
                            {hasRemarks && <td className="px-2 py-1.5"></td>}
                          </tr>
                        </>
                      ) : (
                        <tr className="font-bold break-inside-avoid">
                          <td colSpan={6} className="border-r border-[#000000] px-2 py-1.5 text-center">{t.total}</td>
                          <td className={`${hasRemarks ? 'border-r border-[#000000]' : ''} px-2 py-1.5 text-right`}>{totalAmount.toLocaleString()}</td>
                          {hasRemarks && <td className="px-2 py-1.5"></td>}
                        </tr>
                      )}
                    </tbody>
                  </table>
                );
              })()}

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
              <h2 className="text-xl font-bold text-gray-800">{t.savedQuotations}</h2>
              <button onClick={() => setShowSavedModal(false)} className="text-gray-500 hover:bg-gray-100 p-2 rounded-md">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {savedQuotations.length === 0 ? (
                <p className="text-gray-500 text-center py-8">{t.noSavedQuotations}</p>
              ) : (
                <div className="space-y-3">
                  {savedQuotations.map(q => {
                    const qTotal = q.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                    return (
                      <div key={q.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                        <div>
                          <div className="font-semibold text-gray-800">{q.quotationNumber || t.untitled}</div>
                          <div className="text-sm text-gray-500">{t.date}: {q.date} • {t.total}: {(q.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) - (Number(q.discount) || 0)).toLocaleString()} Ks</div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button 
                            onClick={() => loadQuotation(q)}
                            className="flex-1 sm:flex-none px-3 py-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 text-sm font-medium text-center"
                          >
                            {t.load}
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
