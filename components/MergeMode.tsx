import React, { useState, useRef, useEffect } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { PdfIcon, UploadIcon, DragHandleIcon, TrashIcon, XCircleIcon, LoaderIcon, WordIcon, ExcelIcon, PreviewIcon } from './Icons';
import { jsPDF } from 'jspdf';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';

import { PageEditorModal, PageConfig } from './PageEditorModal';

// File System Access API types for window
declare global {
  interface Window {
    showSaveFilePicker: (options?: any) => Promise<any>;
  }
}

export interface AppFile {
  id: string;
  file: File;
  type: 'pdf' | 'word' | 'excel';
  pageConfig?: Record<number, PageConfig>;
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1E5A90] rounded-lg shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 border-b border-slate-700 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-semibold text-white truncate" title={file.file.name}>{file.file.name}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 transition-colors">
            <XCircleIcon className="w-8 h-8 text-slate-300 hover:text-white" />
          </button>
        </header>
        <div className="flex-grow p-2 h-0">
          <iframe
            src={fileUrl}
            className="w-full h-full border-0 rounded-b-md"
            title={`Preview of ${file.file.name}`}
          ></iframe>
        </div>
      </div>
    </div>
  );
};


export const MergeMode: React.FC = () => {
  const [files, setFiles] = useState<AppFile[]>([]);
  const [mergedFileName, setMergedFileName] = useState('merged-document.pdf');
  const [isMerging, setIsMerging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileNameSourceId, setFileNameSourceId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<AppFile | null>(null);
  const [editingPagesFile, setEditingPagesFile] = useState<AppFile | null>(null);
  const [isCompressionEnabled, setIsCompressionEnabled] = useState(true);

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

  const handleEditPages = (fileToEdit: AppFile) => {
    if (fileToEdit.type === 'pdf') {
      setEditingPagesFile(fileToEdit);
    }
  };

  const handleSavePageConfig = (config: Record<number, PageConfig>, _: number) => {
    if (editingPagesFile) {
      setFiles(prev => prev.map(f =>
        f.id === editingPagesFile.id ? { ...f, pageConfig: config } : f
      ));
    }
    setEditingPagesFile(null);
  };

  const handleClosePageEditor = () => {
    setEditingPagesFile(null);
  };

  const compressImage = async (imageFile: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(imageFile);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Optional: Max dimension constraint (e.g., 2000px) to further reduce size
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
        }, 'image/jpeg', 0.7); // 0.7 quality
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
    // TypeScript casting fix for build error
    return new File([pdfBytes as any], `${originalName}.pdf`, { type: 'application/pdf' });
  };

  const convertOfficeToPdf = async (file: File, type: 'word' | 'excel'): Promise<File> => {
    return new Promise(async (resolve, reject) => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        let htmlString = '';

        if (type === 'word') {
          const result = await mammoth.convertToHtml({ arrayBuffer });
          htmlString = result.value;
        } else if (type === 'excel') {
          const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          htmlString = XLSX.utils.sheet_to_html(worksheet);
        }

        // Create a temporary container
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        container.style.width = '1000px';
        container.style.backgroundColor = 'white';
        container.style.color = 'black';
        container.style.padding = '40px';
        container.innerHTML = htmlString;

        // Add some basic styling for excel tables to look decent
        if (type === 'excel') {
          const style = document.createElement('style');
          style.innerHTML = `
                        table { border-collapse: collapse; width: 100%; }
                        td, th { border: 1px solid #ddd; padding: 8px; }
                        tr:nth-child(even){background-color: #f2f2f2;}
                    `;
          container.appendChild(style);
        }

        document.body.appendChild(container);

        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: 'a4',
        });

        await doc.html(container, {
          callback: function (doc) {
            const pdfBlob = doc.output('blob');
            const pdfFile = new File([pdfBlob], file.name.replace(/\.[^/.]+$/, ".pdf"), { type: 'application/pdf' });
            document.body.removeChild(container);
            resolve(pdfFile);
          },
          x: 10,
          y: 10,
          width: 430, // Default a4 width in px is ~446, leaving margins
          windowWidth: 1000
        });

      } catch (e) {
        console.error("Conversion error", e);
        reject(e);
      }
    });
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
          fileToProcess = await convertOfficeToPdf(file, 'word');
          fileType = 'word';
        } else if (file.type.includes('excel') || file.type.includes('spreadsheet') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
          fileToProcess = await convertOfficeToPdf(file, 'excel');
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

  const createMergedPdfBlob = async (pdfFiles: AppFile[]): Promise<Blob> => {
    const mergedPdf = await PDFDocument.create();

    for (const appFile of pdfFiles) {
      const arrayBuffer = await appFile.file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());

      copiedPages.forEach((page, index) => {
        // Apply page configuration if available
        if (appFile.pageConfig && appFile.pageConfig[index]) {
          const config = appFile.pageConfig[index];
          if (!config.selected) return; // Skip excluded pages

          if (config.rotation) {
            const currentRotation = page.getRotation().angle;
            page.setRotation(degrees(currentRotation + config.rotation));
          }
        }
        mergedPdf.addPage(page);
      });
    }

    const mergedPdfBytes = await mergedPdf.save({ useObjectStreams: isCompressionEnabled });
    // TypeScript casting fix for build error
    return new Blob([mergedPdfBytes as any], { type: 'application/pdf' });
  };

  const runMergeProcess = async (saveMethod: 'download' | 'saveAs') => {
    if (files.length === 0) {
      setError("Por favor, seleccione al menos un archivo para crear un PDF.");
      return;
    }
    // Now that all files are internally converted to PDFs (even if icon says word/excel), 
    // we can merge as long as there's at least one file.
    if (files.length < 2) {
      // We can actually just download the single converted file, 
      // but maybe log a warning. For now let's allow single file to act as a converter.
    }

    setIsMerging(true);
    setError(null);

    try {
      // Treat all files as PDFs because processAndAddFiles converts them all
      const pdfFiles = files;
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
      // Don't show an error if the user cancels the save dialog
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
    <div className="w-full font-sans text-white relative">
      <div className="w-full mx-auto">
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
              <XCircleIcon className="h-5 w-5 mr-3" />
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
                    <button
                      onClick={() => handleEditPages(appFile)}
                      disabled={appFile.type !== 'pdf'}
                      className="ml-2 p-1 rounded text-xs font-medium bg-black/30 text-indigo-300 hover:text-white hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={appFile.type === 'pdf' ? 'Editar páginas (Seleccionar/Rotar)' : 'La edición de páginas no está disponible para este formato'}
                    >
                      Páginas
                    </button>
                    <button
                      onClick={() => handlePreview(appFile)}
                      disabled={appFile.type !== 'pdf'}
                      className="ml-2 p-1 rounded-full text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:text-slate-600 disabled:hover:bg-transparent"
                      title={appFile.type === 'pdf' ? 'Previsualizar archivo completob' : 'La previsualización no está disponible'}
                    >
                      <PreviewIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => removeFile(appFile.id)} className="ml-2 p-1 rounded-full text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <TrashIcon className="w-5 h-5" />
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

              <div className="mt-6 flex items-center">
                <input
                  id="compression-checkbox"
                  type="checkbox"
                  checked={isCompressionEnabled}
                  onChange={(e) => setIsCompressionEnabled(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="compression-checkbox" className="ml-2 block text-sm text-slate-200">
                  Comprimir imágenes (reduce el tamaño del archivo final)
                </label>
              </div>

              <div className="mt-6 border-t border-slate-700 pt-6 flex flex-col sm:flex-row gap-4">
                {canShowSavePicker && (
                  <button
                    onClick={() => runMergeProcess('saveAs')}
                    disabled={isMerging}
                    className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0F4C81] focus:ring-indigo-500 disabled:bg-indigo-800 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {isMerging ? (
                      <>
                        <LoaderIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                        Guardando...
                      </>
                    ) : (
                      'Fusionar y guardar en...'
                    )}
                  </button>
                )}
                <button
                  onClick={() => runMergeProcess('download')}
                  disabled={isMerging}
                  className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm transition-colors text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0F4C81] focus:ring-green-500 disabled:bg-green-900 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  {isMerging ? (
                    <>
                      <LoaderIcon className="animate-spin -ml-1 mr-3 h-5 w-5" />
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
        {previewFile && <PreviewModal file={previewFile} onClose={handleClosePreview} />}
        {editingPagesFile && <PageEditorModal file={editingPagesFile} onClose={handleClosePageEditor} onSave={handleSavePageConfig} />}
      </div>
    </div>
  );
};

export default MergeMode;