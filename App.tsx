import React, { useState, useRef, useCallback } from 'react';
import { PdfIcon, UploadIcon, DragHandleIcon, TrashIcon, XCircleIcon, LoaderIcon } from './components/Icons';

// pdf-lib is loaded from CDN, declare it for TypeScript
declare const PDFLib: any;

interface PDFFile {
  id: string;
  file: File;
}

const App: React.FC = () => {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [mergedFileName, setMergedFileName] = useState('merged-document.pdf');
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileNameSourceId, setFileNameSourceId] = useState<string | null>(null);

  const draggedItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      const newFiles: PDFFile[] = Array.from(selectedFiles)
        .filter(file => file.type === 'application/pdf')
        .map(file => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file }));
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      setError(null);
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
       const newFiles: PDFFile[] = Array.from(droppedFiles)
        .filter(file => file.type === 'application/pdf')
        .map(file => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file }));
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      setError(null);
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

  const handleFileNameSourceChange = (selectedFile: PDFFile) => {
    if (fileNameSourceId === selectedFile.id) {
      // Unchecking the current selection
      setFileNameSourceId(null);
      setMergedFileName('merged-document.pdf');
    } else {
      // Checking a new file
      setFileNameSourceId(selectedFile.id);
      setMergedFileName(selectedFile.file.name);
    }
  };

  const handleCustomFileNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMergedFileName(e.target.value);
    if (fileNameSourceId) {
      setFileNameSourceId(null); // Uncheck any selected checkbox
    }
  };
  
  const handleMerge = useCallback(async () => {
    if (files.length < 2) {
      setError("Por favor, seleccione al menos dos archivos PDF para fusionar.");
      return;
    }
    setIsMerging(true);
    setError(null);

    try {
      const { PDFDocument } = PDFLib;
      const mergedPdf = await PDFDocument.create();

      for (const pdfFile of files) {
        const arrayBuffer = await pdfFile.file.arrayBuffer();
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
      
      // Reset state after merge
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
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-3xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800">PDF Fusion</h1>
          <p className="text-slate-600 mt-2">Fusione sus archivos PDF de forma rápida y sencilla.</p>
        </header>

        <main className="space-y-6">
          <div 
            className={`bg-white p-6 rounded-lg shadow-sm border-2 border-dashed transition-colors duration-300 ${isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'}`}
            onDragEnter={handleDragEvents}
            onDragLeave={handleDragEvents}
            onDragOver={handleDragEvents}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center text-center">
              <UploadIcon className="w-12 h-12 text-slate-400 mb-3" />
              <label htmlFor="file-upload" className="relative cursor-pointer bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                <span>Seleccionar archivos PDF</span>
                <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept=".pdf" onChange={handleFileChange} />
              </label>
              <p className="mt-2 text-sm text-slate-500">o arrastre y suelte los archivos aquí</p>
            </div>
          </div>
          
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md flex items-center">
              <XCircleIcon className="h-5 w-5 mr-3"/>
              <span>{error}</span>
            </div>
          )}

          {files.length > 0 && (
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold text-slate-700 mb-4">Archivos seleccionados ({files.length})</h2>
              <p className="text-sm text-slate-500 mb-4">Arrastre para reordenar. Marque una casilla para usar un nombre de archivo existente.</p>
              <ul className="space-y-3">
                {files.map((pdfFile, index) => (
                  <li
                    key={pdfFile.id}
                    className="flex items-center bg-slate-50 p-3 rounded-md border border-slate-200 cursor-grab active:cursor-grabbing transition-shadow"
                    draggable
                    onDragStart={() => (draggedItem.current = index)}
                    onDragEnter={() => (dragOverItem.current = index)}
                    onDragEnd={handleSort}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <DragHandleIcon className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
                    <input
                      type="checkbox"
                      checked={pdfFile.id === fileNameSourceId}
                      onChange={() => handleFileNameSourceChange(pdfFile)}
                      className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-3 shrink-0 cursor-pointer"
                      title="Usar este nombre para el archivo fusionado"
                    />
                    <PdfIcon className="w-6 h-6 text-red-500 mr-3 shrink-0" />
                    <span className="flex-grow text-slate-800 text-sm truncate" title={pdfFile.file.name}>{pdfFile.file.name}</span>
                    <button onClick={() => removeFile(pdfFile.id)} className="ml-4 p-1 rounded-full hover:bg-red-100 transition-colors">
                      <TrashIcon className="w-5 h-5 text-slate-500 hover:text-red-600" />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <label htmlFor="merged-filename" className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del archivo final
                </label>
                <input
                  type="text"
                  id="merged-filename"
                  value={mergedFileName}
                  onChange={handleCustomFileNameChange}
                  className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="ej: mi-documento-fusionado.pdf"
                />
              </div>

              <div className="mt-6 border-t pt-6">
                <button
                  onClick={handleMerge}
                  disabled={isMerging || files.length < 2}
                  className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
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
