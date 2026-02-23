import React, { useState, useRef, useEffect } from 'react';
import { UploadIcon, TrashIcon, PdfIcon, XCircleIcon, LoaderIcon } from './Icons';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import { LiquidButton } from '@/components/ui/liquid-glass-button';

// Set worker route from CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface SignFile {
    id: string;
    file: File;
}

export const SignMode: React.FC = () => {
    const [pdfs, setPdfs] = useState<SignFile[]>([]);
    const [signatureImage, setSignatureImage] = useState<File | null>(null);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
    const [sigImageDims, setSigImageDims] = useState<{ width: number, height: number } | null>(null);

    const [isDragOverPdfs, setIsDragOverPdfs] = useState(false);
    const [isDragOverSig, setIsDragOverSig] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSigning, setIsSigning] = useState(false);

    // Settings
    const [useVisualPlacement, setUseVisualPlacement] = useState<boolean>(true);
    const [position, setPosition] = useState<'TL' | 'TR' | 'BL' | 'BR'>('BR');
    const [pagesToSign, setPagesToSign] = useState<'ALL' | 'FIRST' | 'LAST'>('ALL');
    const [signatureScale, setSignatureScale] = useState<number>(0.2); // 20% by default

    // Canvas & Preview state
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [pdfPageDimensions, setPdfPageDimensions] = useState<{ width: number, height: number } | null>(null);
    const [canvasDims, setCanvasDims] = useState<{ width: number, height: number } | null>(null);

    const [dragPos, setDragPos] = useState({ x: 50, y: 50 });
    const [isDragging, setIsDragging] = useState(false);

    const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>) => {
        let newFiles: File[] = [];
        if ('dataTransfer' in e) {
            newFiles = Array.from(e.dataTransfer.files);
        } else if (e.target.files) {
            newFiles = Array.from(e.target.files);
        }

        const validPdfs = newFiles.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

        if (validPdfs.length === 0 && newFiles.length > 0) {
            setError('Por favor, sube solo archivos PDF para firmar.');
            return;
        }

        const signFiles = validPdfs.map(f => ({
            id: `${f.name}-${Date.now()}-${Math.random()}`,
            file: f
        }));

        setPdfs(prev => [...prev, ...signFiles]);
        setError(null);
    };

    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>) => {
        let file: File | null = null;
        if ('dataTransfer' in e && e.dataTransfer.files) {
            if (e.dataTransfer.files.length > 0) file = e.dataTransfer.files[0];
        } else {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files.length > 0) file = target.files[0];
        }

        if (file) {
            if (file.type === 'image/jpeg' || file.type === 'image/png') {
                setSignatureImage(file);

                const url = URL.createObjectURL(file);
                setSignatureUrl(url);

                const img = new Image();
                img.onload = () => {
                    setSigImageDims({ width: img.naturalWidth, height: img.naturalHeight });
                };
                img.src = url;
                setError(null);
            } else {
                setError('La firma debe ser una imagen JPG o PNG.');
            }
        }
    };

    const removePdf = (id: string) => {
        setPdfs(pdfs.filter(p => p.id !== id));
    };

    const clearSignature = () => {
        setSignatureImage(null);
        if (signatureUrl) URL.revokeObjectURL(signatureUrl);
        setSignatureUrl(null);
        setSigImageDims(null);
    };

    // Preview generation
    useEffect(() => {
        if (!useVisualPlacement || pdfs.length === 0 || !canvasRef.current || !containerRef.current) return;

        let renderTask: any = null;
        let isActive = true;

        const renderPage = async () => {
            try {
                const arrayBuffer = await pdfs[0].file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdfDocument = await loadingTask.promise;

                if (!isActive) return;

                const page = await pdfDocument.getPage(1);
                if (!isActive) return;

                const containerWidth = containerRef.current?.clientWidth || 400;
                const unscaledViewport = page.getViewport({ scale: 1.0 });

                const scale = containerWidth / unscaledViewport.width;
                const viewport = page.getViewport({ scale });

                setPdfPageDimensions({ width: unscaledViewport.width, height: unscaledViewport.height });

                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext('2d');
                if (!context) return;

                canvas.height = viewport.height;
                canvas.width = viewport.width;
                setCanvasDims({ width: viewport.width, height: viewport.height });

                const renderContext = {
                    canvasContext: context,
                    canvas: canvas,
                    viewport: viewport
                };

                renderTask = page.render(renderContext);
                await renderTask.promise;
            } catch (error) {
                console.error("Error rendering PDF preview", error);
            }
        };

        renderPage();

        return () => {
            isActive = false;
            if (renderTask) renderTask.cancel();
        };
    }, [pdfs, useVisualPlacement]);

    const visualWidth = sigImageDims && pdfPageDimensions && canvasDims
        ? sigImageDims.width * signatureScale * (canvasDims.width / pdfPageDimensions.width)
        : 150;

    const handleMouseDown = () => setIsDragging(true);
    const handleMouseUp = () => setIsDragging(false);

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDragging || !canvasRef.current || !sigImageDims) return;

        let clientX = 0;
        let clientY = 0;

        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        const rect = canvasRef.current.getBoundingClientRect();

        const visualHeight = visualWidth * (sigImageDims.height / sigImageDims.width);

        let x = clientX - rect.left - (visualWidth / 2);
        let y = clientY - rect.top - (visualHeight / 2);

        // Bounds validation
        if (x < 0) x = 0;
        if (y < 0) y = 0;
        if (x + visualWidth > rect.width) x = rect.width - visualWidth;
        if (y + visualHeight > rect.height) y = rect.height - visualHeight;

        setDragPos({ x, y });
    };

    const handleSign = async () => {
        if (pdfs.length === 0 || !signatureImage) return;
        setIsSigning(true);
        setError(null);

        try {
            const sigBytes = await signatureImage.arrayBuffer();
            const isJpg = signatureImage.type === 'image/jpeg';

            const signedPdfs: { name: string, blob: Blob }[] = [];

            for (const pdfItem of pdfs) {
                const pdfBytes = await pdfItem.file.arrayBuffer();
                const pdfDoc = await PDFDocument.load(pdfBytes);

                const embeddedImage = isJpg ? await pdfDoc.embedJpg(sigBytes) : await pdfDoc.embedPng(sigBytes);
                const signatureDims = embeddedImage.scale(signatureScale);

                const pages = pdfDoc.getPages();
                let pagesToProcess: import('pdf-lib').PDFPage[] = [];

                if (pagesToSign === 'ALL') pagesToProcess = pages;
                else if (pagesToSign === 'FIRST' && pages.length > 0) pagesToProcess = [pages[0]];
                else if (pagesToSign === 'LAST' && pages.length > 0) pagesToProcess = [pages[pages.length - 1]];

                pagesToProcess.forEach(page => {
                    const { width, height } = page.getSize();
                    const padding = 20;

                    let x = padding;
                    let y = padding;

                    if (useVisualPlacement && canvasDims) {
                        // Calculate relative percentage using canvas bounds
                        const rectPercentageX = dragPos.x / canvasDims.width;
                        const rectPercentageY = dragPos.y / canvasDims.height;

                        x = rectPercentageX * width;

                        // PDF native origin is bottom-left, canvas origin is top-left
                        y = height - (rectPercentageY * height) - signatureDims.height;
                    } else {
                        if (position === 'TL') {
                            x = padding;
                            y = height - signatureDims.height - padding;
                        } else if (position === 'TR') {
                            x = width - signatureDims.width - padding;
                            y = height - signatureDims.height - padding;
                        } else if (position === 'BL') {
                            x = padding;
                            y = padding;
                        } else if (position === 'BR') {
                            x = width - signatureDims.width - padding;
                            y = padding;
                        }
                    }

                    page.drawImage(embeddedImage, {
                        x,
                        y,
                        width: signatureDims.width,
                        height: signatureDims.height,
                    });
                });

                const modifiedPdfBytes = await pdfDoc.save();
                const newName = pdfItem.file.name.replace(/\.[^/.]+$/, "") + "_firmado.pdf";

                signedPdfs.push({
                    name: newName,
                    blob: new Blob([new Uint8Array(modifiedPdfBytes)], { type: 'application/pdf' })
                });
            }

            if (signedPdfs.length === 1) {
                // Download single file
                const link = document.createElement('a');
                link.href = URL.createObjectURL(signedPdfs[0].blob);
                link.download = signedPdfs[0].name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            } else {
                // Download as ZIP
                const zip = new JSZip();
                signedPdfs.forEach(sp => {
                    zip.file(sp.name, sp.blob);
                });
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = "documentos_firmados.zip";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            }

            setPdfs([]);
            clearSignature();

        } catch (err) {
            console.error("Signing error", err);
            setError("Ocurrió un error al firmar los documentos.");
        } finally {
            setIsSigning(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Errors */}
            {error && (
                <div className="bg-red-500/20 border-l-4 border-red-400 text-red-200 p-4 rounded-md flex items-center mb-6">
                    <XCircleIcon className="h-5 w-5 mr-3" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* PDFs Uploader */}
                <div className="bg-black/10 p-6 rounded-lg shadow-lg border border-slate-700/50 flex flex-col h-full">
                    <h2 className="text-xl font-semibold mb-4 text-slate-100">1. Sube los PDFs</h2>

                    <div
                        className={`flex-grow p-6 rounded-lg border-2 border-dashed transition-colors duration-300 flex flex-col items-center justify-center text-center ${isDragOverPdfs ? 'border-indigo-400 bg-white/10' : 'border-slate-600 bg-black/20'}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragOverPdfs(true); }}
                        onDragLeave={() => setIsDragOverPdfs(false)}
                        onDrop={(e) => { e.preventDefault(); setIsDragOverPdfs(false); handlePdfUpload(e); }}
                    >
                        <UploadIcon className="w-10 h-10 text-slate-400 mb-3" />
                        <label className="cursor-pointer font-semibold py-2 px-4 rounded-md transition-colors bg-indigo-600 text-white hover:bg-indigo-700 mb-2">
                            Seleccionar PDFs
                            <input type="file" className="sr-only" multiple accept=".pdf" onChange={handlePdfUpload} />
                        </label>
                        <p className="text-sm text-slate-400">o arrastra tus PDFs aquí</p>
                    </div>

                    {/* File List */}
                    {pdfs.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-700 max-h-48 overflow-y-auto custom-scrollbar">
                            <p className="text-sm text-slate-300 mb-2">{pdfs.length} archivos añadidos:</p>
                            <ul className="space-y-2">
                                {pdfs.map(pdf => (
                                    <li key={pdf.id} className="flex items-center justify-between text-sm bg-black/30 p-2 rounded">
                                        <div className="flex items-center truncate">
                                            <PdfIcon className="w-4 h-4 text-red-400 mr-2 shrink-0" />
                                            <span className="truncate" title={pdf.file.name}>{pdf.file.name}</span>
                                        </div>
                                        <button onClick={() => removePdf(pdf.id)} className="text-slate-400 hover:text-red-400 ml-2">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Signature Uploader & Settings */}
                <div className="bg-black/10 p-6 rounded-lg shadow-lg border border-slate-700/50 flex flex-col">
                    <h2 className="text-xl font-semibold mb-4 text-slate-100">2. Tu Firma y Ajustes</h2>

                    {/* Signature Upload */}
                    {!signatureUrl ? (
                        <div
                            className={`p-6 mb-6 rounded-lg border-2 border-dashed transition-colors duration-300 flex flex-col items-center justify-center text-center ${isDragOverSig ? 'border-green-400 bg-white/10' : 'border-slate-600 bg-black/20'}`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragOverSig(true); }}
                            onDragLeave={() => setIsDragOverSig(false)}
                            onDrop={(e) => { e.preventDefault(); setIsDragOverSig(false); handleSignatureUpload(e); }}
                        >
                            <UploadIcon className="w-8 h-8 text-slate-400 mb-2" />
                            <label className="cursor-pointer text-sm font-semibold py-1.5 px-4 rounded-md transition-colors bg-slate-700 text-white hover:bg-slate-600 mb-2">
                                Añade Firma (JPG/PNG)
                                <input type="file" className="sr-only" accept=".jpg,.jpeg,.png" onChange={handleSignatureUpload} />
                            </label>
                            <p className="text-xs text-slate-400">Recomendado: PNG sin fondo</p>
                        </div>
                    ) : (
                        <div className="mb-6 p-4 rounded-lg bg-black/30 flex items-center justify-between border border-green-500/30">
                            <div className="flex items-center">
                                <img src={signatureUrl} alt="Firma" className="h-12 w-auto max-w-[150px] object-contain bg-white/10 rounded mr-4" />
                                <span className="text-sm text-green-300 truncate font-medium">Firma lista</span>
                            </div>
                            <button onClick={clearSignature} className="text-slate-400 hover:text-red-400 p-2">
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    {/* Settings */}
                    <div className="space-y-4 mb-2 flex-grow">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Páginas a firmar:</label>
                            <select
                                value={pagesToSign}
                                onChange={(e) => setPagesToSign(e.target.value as any)}
                                className="block w-full px-3 py-2 bg-black/30 border border-slate-600 rounded-md text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            >
                                <option value="ALL">Todas las páginas</option>
                                <option value="FIRST">Solo la primera página</option>
                                <option value="LAST">Solo la última página</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Modo de posición:</label>
                            <div className="flex flex-col space-y-2 mb-4">
                                <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={useVisualPlacement}
                                        onChange={() => setUseVisualPlacement(true)}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>Personalizada (Arrastrar en previsualización)</span>
                                </label>
                                <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={!useVisualPlacement}
                                        onChange={() => setUseVisualPlacement(false)}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>Automática (Esquinas)</span>
                                </label>
                            </div>
                        </div>

                        {!useVisualPlacement && (
                            <div className="pt-2">
                                <label className="block text-sm font-medium text-slate-300 mb-1">Posición predeterminada:</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setPosition('TL')} className={`py-1.5 px-2 text-sm rounded ${position === 'TL' ? 'bg-indigo-600 text-white border border-indigo-400' : 'bg-black/30 text-slate-300 border border-transparent hover:bg-black/50'} transition-colors`}>Arriba Izq.</button>
                                    <button onClick={() => setPosition('TR')} className={`py-1.5 px-2 text-sm rounded ${position === 'TR' ? 'bg-indigo-600 text-white border border-indigo-400' : 'bg-black/30 text-slate-300 border border-transparent hover:bg-black/50'} transition-colors`}>Arriba Der.</button>
                                    <button onClick={() => setPosition('BL')} className={`py-1.5 px-2 text-sm rounded ${position === 'BL' ? 'bg-indigo-600 text-white border border-indigo-400' : 'bg-black/30 text-slate-300 border border-transparent hover:bg-black/50'} transition-colors`}>Abajo Izq.</button>
                                    <button onClick={() => setPosition('BR')} className={`py-1.5 px-2 text-sm rounded ${position === 'BR' ? 'bg-indigo-600 text-white border border-indigo-400' : 'bg-black/30 text-slate-300 border border-transparent hover:bg-black/50'} transition-colors`}>Abajo Der.</button>
                                </div>
                            </div>
                        )}

                        <div className="pt-2">
                            <label className="block text-sm font-medium text-slate-300 mb-1 flex justify-between">
                                <span>Tamaño de la firma:</span>
                                <span className="text-indigo-300">{Math.round(signatureScale * 100)}%</span>
                            </label>
                            <input
                                type="range"
                                min="0.05"
                                max="0.8"
                                step="0.05"
                                value={signatureScale}
                                onChange={(e) => setSignatureScale(parseFloat(e.target.value))}
                                className="w-full"
                            />
                        </div>

                        {/* Interactive Canvas Preview */}
                        {useVisualPlacement && pdfs.length > 0 && signatureUrl && (
                            <div className="mt-6 pt-6 border-t border-slate-700">
                                <label className="block text-sm font-medium text-indigo-300 mb-3 text-center">
                                    Previsualización (Arrastra tu firma)
                                </label>
                                <div
                                    ref={containerRef}
                                    className="relative w-full max-h-[450px] overflow-hidden flex justify-center bg-black/60 rounded cursor-crosshair select-none border border-slate-600"
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                    onTouchMove={handleMouseMove}
                                    onTouchEnd={handleMouseUp}
                                >
                                    <canvas ref={canvasRef} className="max-w-full h-auto shadow-xl" />

                                    <img
                                        src={signatureUrl}
                                        alt="Firma Preview"
                                        className="absolute cursor-move border-2 border-dashed border-indigo-400/80 bg-white/5"
                                        style={{
                                            left: dragPos.x,
                                            top: dragPos.y,
                                            width: visualWidth,
                                            opacity: isDragging ? 0.7 : 1,
                                            pointerEvents: 'none' // To allow container to handle drag events
                                        }}
                                        draggable={false}
                                    />

                                    {/* Invisible drag handle over the image */}
                                    <div
                                        className="absolute cursor-move"
                                        style={{
                                            left: dragPos.x,
                                            top: dragPos.y,
                                            width: visualWidth,
                                            height: sigImageDims ? visualWidth * (sigImageDims.height / sigImageDims.width) : visualWidth / 2
                                        }}
                                        onMouseDown={handleMouseDown}
                                        onTouchStart={handleMouseDown}
                                    />
                                </div>
                                <p className="text-xs text-slate-400 mt-2 text-center break-words">
                                    Se previsualiza la primera página de <strong>{pdfs[0].file.name}</strong>. Todas las firmas de este lote se aplicarán en esta misma posición relativa.
                                </p>
                            </div>
                        )}

                        {useVisualPlacement && (pdfs.length === 0 || !signatureUrl) && (
                            <div className="mt-6 pt-6 border-t border-slate-700">
                                <div className="p-4 bg-black/20 border border-slate-700 rounded text-center text-sm text-slate-400">
                                    Sube al menos un PDF y tu firma para ver la previsualización interactiva.
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="bg-black/20 p-4 border border-slate-700/50 rounded-lg flex justify-end mt-6">
                <LiquidButton
                    disabled={pdfs.length === 0 || !signatureImage || isSigning}
                    className="flex items-center justify-center px-6 py-3 text-base font-medium rounded-full text-white disabled:text-slate-400 disabled:cursor-not-allowed"
                    onClick={handleSign}
                >
                    {isSigning ? (
                        <><LoaderIcon className="w-5 h-5 mr-3 animate-spin" /> Procesando...</>
                    ) : (
                        `Firmar ${pdfs.length > 0 ? `${pdfs.length} Documentos` : 'Documentos'}`
                    )}
                </LiquidButton>
            </div>
        </div>
    );
};
