import React, { useState, useRef, useCallback } from 'react';
import { PdfIcon, UploadIcon, DragHandleIcon, TrashIcon, XCircleIcon, LoaderIcon, WordIcon, ExcelIcon } from './components/Icons';

// pdf-lib is loaded from CDN, declare it for TypeScript
declare const PDFLib: any;

interface AppFile {
  id: string;
  file: File;
  type: 'pdf' | 'word' | 'excel';
}

const App: React.FC = () => {
  const [files, setFiles] = useState<AppFile[]>([]);
  const [mergedFileName, setMergedFileName] = useState('merged-document.pdf');
  const [isMerging, setIsMerging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileNameSourceId, setFileNameSourceId] = useState<string | null>(null);

  const draggedItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const convertImageToPdf = async (imageFile: File): Promise<File> => {
    const { PDFDocument } = PDFLib;
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
    return new File([pdfBytes], `${originalName}.pdf`, { type: 'application/pdf' });
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
                fileToProcess = await convertImageToPdf(file);
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
      // Unchecking the current selection
      setFileNameSourceId(null);
      setMergedFileName('merged-document.pdf');
    } else {
      // Checking a new file
      setFileNameSourceId(selectedFile.id);
      const fileName = selectedFile.type === 'pdf' ? selectedFile.file.name : selectedFile.file.name.replace(/\.[^/.]+$/, ".pdf");
      setMergedFileName(fileName);
    }
  };

  const handleCustomFileNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMergedFileName(e.target.value);
    if (fileNameSourceId) {
      setFileNameSourceId(null); // Uncheck any selected checkbox
    }
  };
  
  const handleMerge = useCallback(async () => {
    if (files.length < 2 && !files.some(f => f.type !== 'pdf')) {
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
      const { PDFDocument } = PDFLib;
      const mergedPdf = await PDFDocument.create();

      for (const appFile of files) {
        const arrayBuffer = await appFile.file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => {
          mergedPdf.addPage(page);
        });
      }

      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      let finalName = mergedFileName.trim();
      if (!finalName) {
          finalName = 'merged-document.pdf';
      }
      if (!finalName.toLowerCase().endsWith('.pdf')) {
          finalName += '.pdf';
      }
      link.download = finalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      
      setFiles([]);
      setFileNameSourceId(null);
      setMergedFileName('merged-document.pdf');
    } catch (e) {
      console.error(e);
      setError("Ocurrió un error al fusionar los archivos PDF. Asegúrese de que no estén corruptos o protegidos con contraseña.");
    } finally {
      setIsMerging(false);
    }
  }, [files, mergedFileName]);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans text-white">
      <div className="w-full max-w-3xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">PDF Fusion</h1>
          <p className="text-slate-300 mt-2">Fusione sus archivos PDF, JPG y PNG de forma rápida y sencilla.</p>
        </header>

        <main className="space-y-6">
          <div 
            className={`p-6 rounded-lg shadow-sm border-2 border-dashed transition-colors duration-300 ${isDragOver ? 'border-indigo-400 bg-white/10' : 'border-slate-500 bg-white/5'}`}
            onDragEnter={handleDragEvents}
            onDragLeave={handleDragEvents}
            onDragOver={handleDragEvents}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center text-center">
              {isProcessing ? (
                  <LoaderIcon className="w-12 h-12 text-indigo-400 animate-spin mb-3" />
              ) : (
                  <UploadIcon className="w-12 h-12 text-slate-400 mb-3" />
              )}
              <label htmlFor="file-upload" className={`relative font-semibold py-2 px-4 rounded-md transition-colors ${isProcessing ? 'cursor-not-allowed bg-indigo-800 text-slate-300' : 'cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                <span>{isProcessing ? 'Procesando...' : 'Seleccionar archivos'}</span>
                <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} disabled={isProcessing} />
              </label>
              <p className="mt-2 text-sm text-slate-300">o arrastre y suelte los archivos aquí</p>
               <p className="mt-1 text-xs text-slate-400">Formatos soportados: PDF, JPG, PNG</p>
            </div>
          </div>
          
          {error && (
            <div className="bg-red-500/20 border-l-4 border-red-400 text-red-200 p-4 rounded-md flex items-center">
              <XCircleIcon className="h-5 w-5 mr-3"/>
              <span>{error}</span>
            </div>
          )}

          {files.length > 0 && (
            <div className="bg-black/10 p-4 sm:p-6 rounded-lg shadow-lg">
              <h2 className="text-lg font-semibold text-slate-100 mb-4">Archivos seleccionados ({files.length})</h2>
              <p className="text-sm text-slate-300 mb-4">Arrastre para reordenar. Marque una casilla para usar un nombre de archivo existente.</p>
              <ul className="space-y-3">
                {files.map((appFile, index) => (
                  <li
                    key={appFile.id}
                    className="flex items-center bg-black/20 p-3 rounded-md border border-slate-700 cursor-grab active:cursor-grabbing transition-shadow"
                    draggable
                    onDragStart={() => (draggedItem.current = index)}
                    onDragEnter={() => (dragOverItem.current = index)}
                    onDragEnd={handleSort}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <DragHandleIcon className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
                    <input
                      type="checkbox"
                      checked={appFile.id === fileNameSourceId}
                      onChange={() => handleFileNameSourceChange(appFile)}
                      className="h-4 w-4 bg-transparent text-indigo-500 border-slate-500 rounded focus:ring-indigo-500 focus:ring-offset-[#0F4C81] mr-3 shrink-0 cursor-pointer"
                      title="Usar este nombre para el archivo fusionado"
                    />
                    {appFile.type === 'pdf' && <PdfIcon className="w-6 h-6 text-red-400 mr-3 shrink-0" />}
                    {appFile.type === 'word' && <WordIcon className="w-6 h-6 text-blue-400 mr-3 shrink-0" />}
                    {appFile.type === 'excel' && <ExcelIcon className="w-6 h-6 text-green-400 mr-3 shrink-0" />}
                    <span className="flex-grow text-slate-100 text-sm truncate" title={appFile.file.name}>{appFile.file.name}</span>
                    <button onClick={() => removeFile(appFile.id)} className="ml-4 p-1 rounded-full hover:bg-red-500/10 transition-colors">
                      <TrashIcon className="w-5 h-5 text-slate-400 hover:text-red-400" />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <label htmlFor="merged-filename" className="block text-sm font-medium text-slate-200 mb-1">
                  Nombre del archivo final
                </label>
                <input
                  type="text"
                  id="merged-filename"
                  value={mergedFileName}
                  onChange={handleCustomFileNameChange}
                  className="block w-full px-3 py-2 bg-black/20 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-slate-100 placeholder-slate-400"
                  placeholder="ej: mi-documento-fusionado.pdf"
                />
              </div>

              <div className="mt-6 border-t border-slate-700 pt-6">
                <button
                  onClick={handleMerge}
                  disabled={isMerging}
                  className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0F4C81] focus:ring-indigo-500 disabled:bg-indigo-800 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isMerging ? (
                    <>
                      <LoaderIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                      Fusionando...
                    </>
                  ) : (
                    'Fusionar y Descargar'
                  )}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;