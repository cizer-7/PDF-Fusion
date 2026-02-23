import { useState } from 'react';
import { MergeMode } from './components/MergeMode';
import logo from './assets/logo.jpg';
import { SignMode } from './components/SignMode';
import { CompressMode } from './components/CompressMode';

function App() {
    const [activeTab, setActiveTab] = useState<'merge' | 'sign' | 'compress'>('merge');

    return (
        <div className="min-h-screen flex flex-col font-sans text-white relative bg-slate-900">
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
                    <div className="bg-black/30 p-1 rounded-lg inline-flex">
                        <button
                            onClick={() => setActiveTab('merge')}
                            className={`px-6 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'merge'
                                ? 'bg-indigo-600 text-white shadow'
                                : 'text-slate-400 hover:text-white hover:bg-black/20'
                                }`}
                        >
                            Fusionar PDFs
                        </button>
                        <button
                            onClick={() => setActiveTab('sign')}
                            className={`px-6 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'sign'
                                ? 'bg-indigo-600 text-white shadow'
                                : 'text-slate-400 hover:text-white hover:bg-black/20'
                                }`}
                        >
                            Firma Múltiple
                        </button>
                        <button
                            onClick={() => setActiveTab('compress')}
                            className={`px-6 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'compress'
                                ? 'bg-indigo-600 text-white shadow'
                                : 'text-slate-400 hover:text-white hover:bg-black/20'
                                }`}
                        >
                            Comprimir PDF
                        </button>
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
