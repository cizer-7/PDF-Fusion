import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { UploadIcon, LoaderIcon, XCircleIcon, PdfIcon, TrashIcon } from './Icons';
import { LiquidButton } from '@/components/ui/liquid-glass-button';

export interface CompressFile {
    id: string;
    file: File;
}

export const CompressMode: React.FC = () => {
    const [fileToCompress, setFileToCompress] = useState<CompressFile | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const canShowSavePicker = 'showSaveFilePicker' in window;

    const processFile = (file: File) => {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            setError("Por favor, seleccione un archivo PDF válido.");
            return;
        }
        setError(null);
        setFileToCompress({
            id: `${file.name}-${file.lastModified}-${Math.random()}`,
            file
        });
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files;
        if (selectedFiles && selectedFiles.length > 0) {
            processFile(selectedFiles[0]);
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
            processFile(droppedFiles[0]);
        }
    };

    const removeFile = () => {
        setFileToCompress(null);
    };

    const runCompressProcess = async (saveMethod: 'download' | 'saveAs') => {
        if (!fileToCompress) return;

        setIsProcessing(true);
        setError(null);

        try {
            const arrayBuffer = await fileToCompress.file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);

            const compressedPdfBytes = await pdfDoc.save({ useObjectStreams: true });
            // TypeScript casting fix for build error
            const compressedBlob = new Blob([compressedPdfBytes as any], { type: 'application/pdf' });

            let finalName = fileToCompress.file.name;
            finalName = finalName.replace(/\.pdf$/i, '') + '-comprimido.pdf';

            if (saveMethod === 'saveAs' && canShowSavePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: finalName,
                    types: [{
                        description: 'PDF Documents',
                        accept: { 'application/pdf': ['.pdf'] },
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(compressedBlob);
                await writable.close();
            } else {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(compressedBlob);
                link.download = finalName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            }

            setFileToCompress(null);
        } catch (e: any) {
            if (e.name === 'AbortError') return;
            console.error(e);
            setError("Ocurrió un error al comprimir el archivo. Asegúrese de que no esté corrupto o protegido.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="w-full font-sans text-white relative">
            <div className="w-full mx-auto">
                <main className="space-y-6">
                    {!fileToCompress ? (
                        <div
                            className={`p-6 rounded-lg shadow-sm border-2 border-dashed transition-colors duration-300 ${isDragOver ? 'border-indigo-400 bg-white/10' : 'border-slate-500 bg-white/5'}`}
                            onDragEnter={handleDragEvents}
                            onDragLeave={handleDragEvents}
                            onDragOver={handleDragEvents}
                            onDrop={handleDrop}
                        >
                            <div className="flex flex-col items-center justify-center text-center">
                                <UploadIcon className="w-12 h-12 text-slate-400 mb-3" />
                                <label className="cursor-pointer font-semibold py-2 px-4 rounded-md transition-colors bg-indigo-600 text-white hover:bg-indigo-700">
                                    <span>Seleccionar archivo PDF</span>
                                    <input type="file" className="sr-only" accept=".pdf" onChange={handleFileChange} />
                                </label>
                                <p className="mt-2 text-sm text-slate-300">o arrastre y suelte el archivo aquí</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-black/10 p-4 sm:p-6 rounded-lg shadow-lg">
                            <h2 className="text-lg font-semibold text-slate-100 mb-4">Archivo a comprimir</h2>

                            <div className="flex items-center bg-black/20 p-3 rounded-md border border-slate-700">
                                <PdfIcon className="w-6 h-6 text-red-400 mr-3 shrink-0" />
                                <span className="flex-grow text-slate-100 text-sm truncate" title={fileToCompress.file.name}>{fileToCompress.file.name}</span>
                                <button onClick={removeFile} className="ml-2 p-1 rounded-full text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="mt-6 border-t border-slate-700 pt-6 flex flex-col sm:flex-row gap-4">
                                {canShowSavePicker && (
                                    <LiquidButton
                                        onClick={() => runCompressProcess('saveAs')}
                                        disabled={isProcessing}
                                        className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md text-white disabled:text-slate-300 disabled:cursor-not-allowed"
                                    >
                                        {isProcessing ? (
                                            <><LoaderIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />Comprimiendo...</>
                                        ) : 'Comprimir y guardar en...'}
                                    </LiquidButton>
                                )}
                                <LiquidButton
                                    onClick={() => runCompressProcess('download')}
                                    disabled={isProcessing}
                                    className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md text-white disabled:text-slate-400 disabled:cursor-not-allowed"
                                >
                                    {isProcessing ? (
                                        <><LoaderIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />Comprimiendo...</>
                                    ) : 'Comprimir y Descargar'}
                                </LiquidButton>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/20 border-l-4 border-red-400 text-red-200 p-4 rounded-md flex items-center">
                            <XCircleIcon className="h-5 w-5 mr-3 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};
