import React, { useState, useRef, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { PdfIcon, UploadIcon, DragHandleIcon, TrashIcon, XCircleIcon, LoaderIcon, WordIcon, ExcelIcon, PreviewIcon } from './components/Icons';
import logo from './assets/logo.jpg';

// File System Access API types for window
declare global {
  interface Window {
    showSaveFilePicker: (options?: any) => Promise<any>;
  }
}

interface AppFile {
  id: string;
  file: File;
  type: 'pdf' | 'word' | 'excel';
}

interface PreviewModalProps {
  file: AppFile;
  onClose: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ file, onClose }) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file && file.type === 'pdf') {
      const url = URL.createObjectURL(file.file);
      setFileUrl(url);

      return () => {
        URL.revokeObjectURL(url);
        setFileUrl(null);
      };
    }
  }, [file]);

  if (!file || !fileUrl) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300" 
      onClick={onClose}
    >
      <div 
        className="bg-card text-card-foreground border border-border rounded-xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" 
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-border flex justify-between items-center bg-muted/50">
          <div className="flex items-center gap-3">
            <PdfIcon className="w-6 h-6 text-primary" />
            <h3 className="text-lg font-semibold truncate max-w-[200px] sm:max-w-md" title={file.file.name}>
              {file.file.name}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full hover:bg-accent transition-colors group"
            aria-label="Close preview"
          >
            <XCircleIcon className="w-6 h-6 text-muted-foreground group-hover:text-foreground" />
          </button>
        </header>
        <div className="flex-grow p-0 h-full relative bg-muted/20">
          <iframe
            src={fileUrl}
            className="w-full h-full border-0"
            title={`Preview of ${file.file.name}`}
          ></iframe>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [files, setFiles] = useState<AppFile[]>([]);
  const [mergedFileName, setMergedFileName] = useState('merged-document.pdf');
  const [isMerging, setIsMerging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileNameSourceId, setFileNameSourceId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<AppFile | null>(null);
  const [isCompressionEnabled, setIsCompressionEnabled] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const draggedItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const canShowSavePicker = 'showSaveFilePicker' in window;

  const handlePreview = (fileToPreview: AppFile) => {
    if (fileToPreview.type === 'pdf') {
      setPreviewFile(fileToPreview);
    }
  };

  const handleClosePreview = () => {
    setPreviewFile(null);
  };

  const compressImage = async (imageFile: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(imageFile);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const MAX_DIMENSION = 2000;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = (height * MAX_DIMENSION) / width;
            width = MAX_DIMENSION;
          } else {
            width = (width * MAX_DIMENSION) / height;
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(img.src);
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(img.src);
          if (blob) {
            const compressedFile = new File([blob], imageFile.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            reject(new Error('Compression failed'));
          }
        }, 'image/jpeg', 0.7);
      };
      img.onerror = (error) => {
        URL.revokeObjectURL(img.src);
        reject(error);
      };
    });
  };

  const convertImageToPdf = async (imageFile: File): Promise<File> => {
    const imageBytes = await imageFile.arrayBuffer();
    const pdfDoc = await PDFDocument.create();

    let image;
    if (imageFile.type === 'image/jpeg') {
      image = await pdfDoc.embedJpg(imageBytes);
    } else if (imageFile.type === 'image/png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      throw new Error('Unsupported image type for conversion.');
    }

    const { width, height } = image.scale(1);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });

    const pdfBytes = await pdfDoc.save();
    const originalName = imageFile.name.substring(0, imageFile.name.lastIndexOf('.')) || imageFile.name;
    return new File([pdfBytes as any], `${originalName}.pdf`, { type: 'application/pdf' });
  };

  const processAndAddFiles = async (filesToAdd: FileList) => {
    setIsProcessing(true);
    setError(null);
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    const validFiles = Array.from(filesToAdd).filter(file =>
      allowedTypes.includes(file.type) ||
      file.name.endsWith('.doc') || file.name.endsWith('.docx') ||
      file.name.endsWith('.xls') || file.name.endsWith('.xlsx') ||
      file.name.endsWith('.pdf') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') || file.name.endsWith('.png')
    );

    if (validFiles.length === 0) {
      setError("Ninguno de los archivos seleccionados es un formato válido (PDF, JPG, PNG).");
      setIsProcessing(false);
      return;
    }

    try {
      const processedFilesPromises = validFiles.map(async (file): Promise<AppFile> => {
        let fileToProcess = file;
        let fileType: AppFile['type'] = 'pdf';

        if (file.type === 'image/jpeg' || file.type === 'image/png') {
          let imageToConvert = file;
          if (isCompressionEnabled) {
            try {
              imageToConvert = await compressImage(file);
            } catch (err) {
              console.error("Compression failed, using original image", err);
            }
          }
          fileToProcess = await convertImageToPdf(imageToConvert);
          fileType = 'pdf';
        } else if (file.type.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
          fileType = 'word';
        } else if (file.type.includes('excel') || file.type.includes('spreadsheet') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
          fileType = 'excel';
        } else {
          fileType = 'pdf';
        }

        return { id: `${file.name}-${file.lastModified}-${Math.random()}`, file: fileToProcess, type: fileType };
      });

      const newFiles = await Promise.all(processedFilesPromises);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
    } catch (e) {
      console.error(e);
      setError("Ocurrió un error al procesar uno de los archivos.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      processAndAddFiles(selectedFiles);
    }
    event.target.value = '';
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragOver(true);
    } else if (e.type === 'dragleave' || e.type === 'drop') {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      processAndAddFiles(droppedFiles);
    }
  };

  const removeFile = (idToRemove: string) => {
    if (idToRemove === fileNameSourceId) {
      setFileNameSourceId(null);
      setMergedFileName('merged-document.pdf');
    }
    setFiles(files.filter((file) => file.id !== idToRemove));
  };

  const handleSort = () => {
    if (draggedItem.current === null || dragOverItem.current === null) return;
    const filesClone = [...files];
    const temp = filesClone[draggedItem.current];
    filesClone.splice(draggedItem.current, 1);
    filesClone.splice(dragOverItem.current, 0, temp);
    draggedItem.current = null;
    dragOverItem.current = null;
    setFiles(filesClone);
  };

  const handleFileNameSourceChange = (selectedFile: AppFile) => {
    if (fileNameSourceId === selectedFile.id) {
      setFileNameSourceId(null);
      setMergedFileName('merged-document.pdf');
    } else {
      setFileNameSourceId(selectedFile.id);
      const fileName = selectedFile.type === 'pdf' ? selectedFile.file.name : selectedFile.file.name.replace(/\.[^/.]+$/, ".pdf");
      setMergedFileName(fileName);
    }
  };

  const handleCustomFileNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMergedFileName(e.target.value);
    if (fileNameSourceId) {
      setFileNameSourceId(null);
    }
  };

  const createMergedPdfBlob = async (pdfFiles: AppFile[]): Promise<Blob> => {
    const mergedPdf = await PDFDocument.create();

    for (const appFile of pdfFiles) {
      const arrayBuffer = await appFile.file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => {
        mergedPdf.addPage(page);
      });
    }

    const mergedPdfBytes = await mergedPdf.save();
    return new Blob([mergedPdfBytes as any], { type: 'application/pdf' });
  };

  const runMergeProcess = async (saveMethod: 'download' | 'saveAs') => {
    if (files.length === 0) {
      setError("Por favor, seleccione al menos un archivo para crear un PDF.");
      return;
    }
    if (files.length < 2 && files.every(f => f.type === 'pdf')) {
      setError("Por favor, seleccione al menos dos archivos PDF para fusionar.");
      return;
    }

    const unsupportedFiles = files.filter(f => f.type === 'word' || f.type === 'excel');
    if (unsupportedFiles.length > 0) {
      const fileNames = unsupportedFiles.map(f => f.file.name).join(', ');
      setError(`La conversión de Word/Excel (${fileNames}) no está soportada todavía. Por favor, elimínelos para continuar.`);
      return;
    }

    setIsMerging(true);
    setError(null);

    try {
      const pdfFiles = files.filter(f => f.type === 'pdf');
      const blob = await createMergedPdfBlob(pdfFiles);

      let finalName = mergedFileName.trim();
      if (!finalName) {
        finalName = 'merged-document.pdf';
      }
      if (!finalName.toLowerCase().endsWith('.pdf')) {
        finalName += '.pdf';
      }

      if (saveMethod === 'saveAs' && canShowSavePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: finalName,
          types: [{
            description: 'PDF Documents',
            accept: { 'application/pdf': ['.pdf'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      }

      setFiles([]);
      setFileNameSourceId(null);
      setMergedFileName('merged-document.pdf');
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return;
      }
      console.error(e);
      setError("Ocurrió un error al fusionar los archivos. Asegúrese de que no estén corruptos o protegidos.");
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans transition-colors duration-300">
      {/* Background patterns */}
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-10 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary blur-[120px] rounded-full"></div>
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[50%] bg-indigo-500 blur-[150px] rounded-full"></div>
      </div>

      <nav className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden border border-border bg-white p-1">
              <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent">
              PDF Fusion
            </span>
          </div>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            {isDarkMode ? '🌞' : '🌙'}
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-12 relative z-10">
        <header className="text-center mb-12 space-y-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Fusiona tus documentos
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Combina PDF, JPG y PNG en un solo archivo profesional en segundos. Privado, rápido y seguro.
          </p>
        </header>

        <section className="space-y-8">
          {/* Dropzone */}
          <div
            className={`
              relative group cursor-pointer
              p-12 rounded-2xl border-2 border-dashed transition-all duration-300
              flex flex-col items-center justify-center text-center
              ${isDragOver 
                ? 'border-primary bg-primary/5 scale-[1.01] ring-4 ring-primary/10' 
                : 'border-border bg-card hover:border-primary/50 hover:bg-muted/30 shadow-sm'}
            `}
            onDragEnter={handleDragEvents}
            onDragLeave={handleDragEvents}
            onDragOver={handleDragEvents}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <div className={`
              w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-all duration-300
              ${isDragOver ? 'bg-primary text-white scale-110' : 'bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary'}
            `}>
              {isProcessing ? (
                <LoaderIcon className="w-8 h-8 animate-spin" />
              ) : (
                <UploadIcon className="w-8 h-8" />
              )}
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">
                {isProcessing ? 'Procesando archivos...' : 'Haz clic o arrastra archivos'}
              </h3>
              <p className="text-muted-foreground">
                Selecciona PDF, imágenes JPG o PNG para comenzar
              </p>
            </div>
            
            <input 
              id="file-upload" 
              type="file" 
              className="hidden" 
              multiple 
              accept=".pdf,.jpg,.jpeg,.png" 
              onChange={handleFileChange} 
              disabled={isProcessing} 
            />
            
            <div className="mt-8 flex gap-3 flex-wrap justify-center">
              <span className="px-3 py-1 bg-muted rounded-full text-xs font-medium">PDF</span>
              <span className="px-3 py-1 bg-muted rounded-full text-xs font-medium">JPG / JPEG</span>
              <span className="px-3 py-1 bg-muted rounded-full text-xs font-medium">PNG</span>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
              <XCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  Archivos ({files.length})
                </h2>
                <span className="text-xs text-muted-foreground italic">
                  Arrastra para reordenar
                </span>
              </div>
              
              <ul className="space-y-3">
                {files.map((appFile, index) => (
                  <li
                    key={appFile.id}
                    className="
                      group flex items-center gap-4 bg-card border border-border p-4 rounded-xl
                      shadow-sm hover:shadow-md hover:border-primary/30 transition-all 
                      cursor-grab active:cursor-grabbing
                    "
                    draggable
                    onDragStart={() => (draggedItem.current = index)}
                    onDragEnter={() => (dragOverItem.current = index)}
                    onDragEnd={handleSort}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="text-muted-foreground/30 group-hover:text-primary/50 transition-colors">
                      <DragHandleIcon className="w-5 h-5" />
                    </div>
                    
                    <div className="relative inline-flex items-center justify-center">
                      <input
                        type="checkbox"
                        id={`check-${appFile.id}`}
                        checked={appFile.id === fileNameSourceId}
                        onChange={() => handleFileNameSourceChange(appFile)}
                        className="
                          peer appearance-none h-5 w-5 border border-border rounded 
                          checked:bg-primary checked:border-primary transition-all cursor-pointer
                        "
                        title="Usar este nombre para el archivo fusionado"
                      />
                      <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 17 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 5.91667L5.78571 10.5L16 1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>

                    <div className={`p-2 rounded-lg bg-muted text-muted-foreground`}>
                      {appFile.type === 'pdf' && <PdfIcon className="w-6 h-6 text-destructive" />}
                      {appFile.type === 'word' && <WordIcon className="w-6 h-6 text-blue-500" />}
                      {appFile.type === 'excel' && <ExcelIcon className="w-6 h-6 text-green-500" />}
                    </div>
                    
                    <div className="flex-grow min-w-0">
                      <p className="font-medium truncate text-sm" title={appFile.file.name}>
                        {appFile.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(appFile.file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handlePreview(appFile)}
                        disabled={appFile.type !== 'pdf'}
                        className="p-2 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-0"
                        title="Previsualizar"
                      >
                        <PreviewIcon className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => removeFile(appFile.id)} 
                        className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Eliminar"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="bg-muted/50 p-6 rounded-2xl border border-border/50 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="merged-filename" className="block text-sm font-semibold mb-2 ml-1">
                      Nombre del archivo final
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="merged-filename"
                        value={mergedFileName}
                        onChange={handleCustomFileNameChange}
                        className="
                          w-full px-4 py-3 bg-card border border-border rounded-xl shadow-sm
                          focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all
                          placeholder:text-muted-foreground/50
                        "
                        placeholder="ej: mi-archivo-fusionado.pdf"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-1 rounded border border-border">.pdf</span>
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-card transition-colors">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={isCompressionEnabled}
                        onChange={(e) => setIsCompressionEnabled(e.target.checked)}
                        className="
                          peer appearance-none h-5 w-5 border border-border rounded-full
                          checked:bg-primary checked:border-primary transition-all cursor-pointer
                        "
                      />
                      <div className="absolute inset-1 bg-white rounded-full scale-0 peer-checked:scale-100 transition-transform"></div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Optimizar imágenes</span>
                      <span className="text-xs text-muted-foreground">Reduce el tamaño final manteniendo la calidad</span>
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {canShowSavePicker && (
                    <button
                      onClick={() => runMergeProcess('saveAs')}
                      disabled={isMerging}
                      className="
                        flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold 
                        bg-card border border-border hover:border-primary/50 text-foreground 
                        shadow-sm hover:shadow-md transition-all active:scale-[0.98]
                        disabled:opacity-50 disabled:cursor-not-allowed
                      "
                    >
                      {isMerging ? (
                        <LoaderIcon className="w-5 h-5 animate-spin" />
                      ) : (
                        <span className="text-primary">💾</span>
                      )}
                      {isMerging ? 'Preparando...' : 'Guardar como...'}
                    </button>
                  )}
                  <button
                    onClick={() => runMergeProcess('download')}
                    disabled={isMerging}
                    className={`
                      relative overflow-hidden
                      flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold 
                      text-white shadow-lg transition-all active:scale-[0.98]
                      disabled:opacity-70 disabled:cursor-not-allowed
                      ${isMerging ? 'bg-primary/80' : 'bg-primary hover:bg-primary/90 hover:shadow-primary/20'}
                      ${!canShowSavePicker ? 'sm:col-span-2' : ''}
                    `}
                  >
                    {isMerging ? (
                      <LoaderIcon className="w-5 h-5 animate-spin" />
                    ) : (
                      <span className="animate-bounce">⬇️</span>
                    )}
                    {isMerging ? 'Fusionando archivos...' : 'Fusionar y Descargar'}
                    
                    {/* Shimmer effect */}
                    {!isMerging && (
                      <div className="absolute inset-0 translate-x-[-100%] animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="mt-auto py-8 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} PDF Fusion. Todos los procesos se realizan localmente en tu navegador.</p>
        </div>
      </footer>

      {previewFile && <PreviewModal file={previewFile} onClose={handleClosePreview} />}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        .animate-in {
          animation-duration: 0.3s;
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          animation-fill-mode: forwards;
        }
        .fade-in {
          animation-name: fadeIn;
        }
        .zoom-in-95 {
          animation-name: zoomIn95;
        }
        .slide-in-from-top-4 {
          animation-name: slideInFromTop4;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes zoomIn95 {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideInFromTop4 {
          from { transform: translateY(-1rem); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}} />
    </div>
  );
};

export default App;