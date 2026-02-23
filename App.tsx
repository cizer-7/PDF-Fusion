import { useState } from 'react';
import { MergeMode } from './components/MergeMode';
import { SignMode } from './components/SignMode';
import { CompressMode } from './components/CompressMode';
import { LiquidButton } from '@/components/ui/liquid-glass-button';
import logo from './assets/logo.jpg';

function App() {
    const [activeTab, setActiveTab] = useState<'merge' | 'sign' | 'compress'>('merge');

    return (
        <div className="min-h-screen flex flex-col font-sans text-white relative transition-colors duration-500 bg-[#004986]">
            {/* Header and Logo shared across tabs */}
            <div className="absolute top-4 left-4 flex items-center gap-3">
                <img src={logo} alt="Logo" className="w-16 h-auto" />
            </div>

            <div className="w-full max-w-3xl mx-auto pt-8">
                <header className="text-center mb-6">
                    <h1 className="text-4xl font-bold text-white">PDF Fusion</h1>
                    <p className="text-slate-400 mt-2">
                        Gestiona tus documentos fácilmente.
                    </p>
                </header>

                {/* Tab Navigation */}
                <div className="flex justify-center mb-8">
                    <div className="bg-black/20 p-1.5 rounded-full inline-flex gap-2 shadow-inner border border-white/10">
                        <LiquidButton
                            onClick={() => setActiveTab('merge')}
                            className={`px-6 py-2 rounded-full font-medium text-sm transition-all duration-300 ${activeTab === 'merge'
                                ? 'bg-white/20 text-white shadow-lg shadow-white/10 ring-1 ring-white/20'
                                : 'text-slate-200 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            Fusionar PDFs
                        </LiquidButton>
                        <LiquidButton
                            onClick={() => setActiveTab('sign')}
                            className={`px-6 py-2 rounded-full font-medium text-sm transition-all duration-300 ${activeTab === 'sign'
                                ? 'bg-white/20 text-white shadow-lg shadow-white/10 ring-1 ring-white/20'
                                : 'text-slate-200 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            Firma Múltiple
                        </LiquidButton>
                        <LiquidButton
                            onClick={() => setActiveTab('compress')}
                            className={`px-6 py-2 rounded-full font-medium text-sm transition-all duration-300 ${activeTab === 'compress'
                                ? 'bg-white/20 text-white shadow-lg shadow-white/10 ring-1 ring-white/20'
                                : 'text-slate-200 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            Comprimir PDF
                        </LiquidButton>
                    </div>
                </div>

                {/* Tab Content */}
                {activeTab === 'merge' && <MergeMode />}
                {activeTab === 'sign' && <SignMode />}
                {activeTab === 'compress' && <CompressMode />}
            </div>
        </div>
    );
}

export default App;
