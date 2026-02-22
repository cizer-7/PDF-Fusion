import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { XCircleIcon, LoaderIcon } from './Icons';
import { AppFile } from '../App';

// Set worker route from CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface PageConfig {
    selected: boolean;
    rotation: number;
}

interface PageEditorModalProps {
    file: AppFile;
    onClose: () => void;
    onSave: (config: Record<number, PageConfig>, pageCount: number) => void;
}

export const PageEditorModal: React.FC<PageEditorModalProps> = ({ file, onClose, onSave }) => {
    const [numPages, setNumPages] = useState<number>(0);
    const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
    const [config, setConfig] = useState<Record<number, PageConfig>>(file.pageConfig || {});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const loadPdf = async () => {
            if (!file || file.type !== 'pdf') return;
            try {
                const arrayBuffer = await file.file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                if (!active) return;

                setNumPages(pdf.numPages);

                // Initialize config if missing
                const newConfig = { ...config };
                let configChanged = false;
                for (let i = 0; i < pdf.numPages; i++) {
                    if (!newConfig[i]) {
                        newConfig[i] = { selected: true, rotation: 0 };
                        configChanged = true;
                    }
                }
                if (configChanged && Object.keys(config).length === 0) {
                    setConfig(newConfig);
                }

                // Generate thumbnails
                const generatedThumbnails: Record<number, string> = {};
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 0.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    if (context) {
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        await page.render({ canvasContext: context, viewport } as any).promise;
                        generatedThumbnails[i - 1] = canvas.toDataURL('image/jpeg', 0.8);
                    }
                }

                if (active) {
                    setThumbnails(generatedThumbnails);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Error loading PDF for thumbnails", err);
                if (active) setLoading(false);
            }
        };

        loadPdf();
        return () => { active = false; };
    }, [file]);

    const toggleSelection = (index: number) => {
        setConfig(prev => ({
            ...prev,
            [index]: { ...prev[index], selected: !prev[index].selected }
        }));
    };

    const rotatePage = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setConfig(prev => ({
            ...prev,
            [index]: { ...prev[index], rotation: (prev[index].rotation + 90) % 360 }
        }));
    };

    const selectAll = () => {
        const newConfig = { ...config };
        for (let i = 0; i < numPages; i++) newConfig[i].selected = true;
        setConfig(newConfig);
    };

    const deselectAll = () => {
        const newConfig = { ...config };
        for (let i = 0; i < numPages; i++) newConfig[i].selected = false;
        setConfig(newConfig);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div className="bg-[#1E5A90] rounded-lg shadow-xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-700 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-semibold text-white truncate">Editar Páginas: {file.file.name}</h3>
                        {!loading && <p className="text-sm text-slate-300 mt-1">{numPages} páginas totales</p>}
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                        <XCircleIcon className="w-8 h-8 text-slate-300 hover:text-white" />
                    </button>
                </header>

                <div className="flex-grow p-4 overflow-y-auto custom-scrollbar bg-black/20">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-300">
                            <LoaderIcon className="w-12 h-12 animate-spin mb-4 text-indigo-400" />
                            <p>Generando vista previa de páginas...</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-3 mb-6">
                                <button onClick={selectAll} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-sm rounded text-white transition-colors">Seleccionar Todas</button>
                                <button onClick={deselectAll} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-sm rounded text-white transition-colors">Deseleccionar Todas</button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                {Array.from({ length: numPages }).map((_, i) => {
                                    const conf = config[i] || { selected: true, rotation: 0 };
                                    const isSelected = conf.selected;

                                    return (
                                        <div
                                            key={i}
                                            className={`relative flex flex-col items-center p-2 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-indigo-600/30 border-2 border-indigo-400' : 'bg-black/40 border-2 border-transparent opacity-60 hover:opacity-100'}`}
                                            onClick={() => toggleSelection(i)}
                                        >
                                            <div className="w-full relative pt-[141%] mb-2 bg-slate-800 rounded overflow-hidden">
                                                {thumbnails[i] ? (
                                                    <img
                                                        src={thumbnails[i]}
                                                        alt={`Preview page ${i + 1}`}
                                                        className="absolute inset-0 w-full h-full object-contain transition-transform duration-300"
                                                        style={{ transform: `rotate(${conf.rotation}deg)` }}
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <LoaderIcon className="w-6 h-6 animate-spin text-slate-500" />
                                                    </div>
                                                )}
                                                {!isSelected && (
                                                    <div className="absolute inset-0 bg-red-900/40 flex items-center justify-center backdrop-blur-[1px]">
                                                        <XCircleIcon className="w-10 h-10 text-red-500 drop-shadow-md" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between w-full px-1">
                                                <span className="text-sm font-medium text-slate-200">Pág. {i + 1}</span>
                                                <button
                                                    onClick={(e) => rotatePage(i, e)}
                                                    className="p-1.5 bg-slate-700 hover:bg-indigo-500 rounded text-slate-300 hover:text-white transition-colors"
                                                    title="Rotar 90 grados"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 2v6h-6"></path>
                                                        <path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                <footer className="p-4 border-t border-slate-700 bg-black/10 flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="px-5 py-2 rounded text-slate-300 hover:bg-white/10 transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={() => onSave(config, numPages)}
                        disabled={loading}
                        className="px-5 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Guardar Cambios
                    </button>
                </footer>
            </div>
        </div>
    );
};
