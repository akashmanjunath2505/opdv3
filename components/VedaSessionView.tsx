
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DoctorProfile, TranscriptEntry } from '../types';
import { Icon } from './Icon';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { processAudioSegment, generateClinicalNote } from '../services/geminiService';
import { renderMarkdownToHTML } from '../utils/markdownRenderer';

interface ScribeSessionViewProps {
    onEndSession: void;
    doctorProfile: DoctorProfile;
    language: string;
}

interface PatientDemographics {
    name: string; age: string; sex: string; mobile: string; weight: string; height: string; bmi: string;
    date: string; hospitalName: string; hospitalAddress: string; hospitalPhone: string;
}

// FIX: Added missing AudioWaveform component to visualize signal acquisition
// Corrected: Explicitly using React namespace by adding import to resolve 'Cannot find namespace React'
const AudioWaveform: React.FC = () => (
    <div className="flex items-center justify-center gap-1 h-8 px-4">
        {[...Array(8)].map((_, i) => (
            <div
                key={i}
                className="w-1 bg-aivana-accent rounded-full animate-pulse"
                style={{
                    height: `${20 + Math.random() * 80}%`,
                    animationDuration: `${0.6 + Math.random() * 0.4}s`,
                    animationDelay: `${i * 0.05}s`
                }}
            ></div>
        ))}
    </div>
);

const stripMarkdown = (text: string): string => {
    if (!text) return "";
    return text.replace(/^[#\s*+-]+/gm, '').replace(/[*_]{1,2}/g, '').trim();
};

// Corrected: Explicitly using React namespace by adding import to resolve 'Cannot find namespace React'
const PrescriptionTemplate: React.FC<{ patient: PatientDemographics; clinicalNote: string; isPreview?: boolean }> = ({ patient, clinicalNote, isPreview }) => {
    const getSectionContent = (title: string) => {
        if (!clinicalNote) return "";
        const regex = new RegExp(`##\\s*${title}[^]*?(?=##|$)`, 'i');
        const match = clinicalNote.match(regex);
        if (!match) return "";
        return stripMarkdown(match[0].replace(new RegExp(`##\\s*${title}`, 'i'), '').trim());
    };

    const containerClass = isPreview
        ? "w-full bg-white text-black p-6 rounded-lg shadow-inner overflow-hidden border border-gray-200"
        : "printable-area p-8 bg-white text-black min-h-screen relative";

    const baseFontSize = isPreview ? 'text-[10px]' : 'text-[12.5px]';
    const headerTitleSize = isPreview ? 'text-[15px]' : 'text-[22px]';
    const metaLabelSize = isPreview ? 'text-[9.5px]' : 'text-[12.5px]';

    const planLines = getSectionContent('Plan').split('\n').map(l => l.trim()).filter(Boolean);
    const medicines = planLines.filter(l => l.includes('|')).map(line => {
        const parts = line.split('|').map(p => p.trim());
        return {
            name: parts[0] || '',
            dosage: parts[1] || '-',
            frequency: parts[2] || '-',
            route: parts[3] || '-'
        };
    });
    const adviceLines = planLines.filter(l => !l.includes('|'));

    return (
        <div className={containerClass} style={{ fontFamily: 'Arial, Helvetica, "Noto Sans Devanagari", sans-serif' }}>
            {/* Header Branding */}
            <div className="flex justify-between items-start mb-1">
                <div className="flex-1">
                    <div className={`${headerTitleSize} font-bold leading-tight uppercase`}>Doctors Name</div>
                    <div className={`${isPreview ? 'text-[8.5px]' : 'text-[11.5px]'} font-normal mt-0.5`}>Qualification</div>
                    <div className={`${isPreview ? 'text-[8.5px]' : 'text-[11.5px]'} font-normal`}>Reg. No :</div>
                </div>
                <div className="flex-1 text-right">
                    <div className={`${headerTitleSize} font-bold leading-tight uppercase`}>{patient.hospitalName}</div>
                    <div className={`${isPreview ? 'text-[8.5px]' : 'text-[11.5px]'} font-normal mt-0.5`}>{patient.hospitalAddress}</div>
                    <div className={`flex justify-end ${isPreview ? 'gap-4' : 'gap-10'} mt-1 ${isPreview ? 'text-[8.5px]' : 'text-[11.5px]'}`}>
                        <div><span className="font-bold">Ph:</span> {patient.hospitalPhone}</div>
                        <div><span className="font-bold">Time:</span> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                    </div>
                </div>
            </div>

            <div className="h-0.5 bg-[#8A63D2] w-full mb-5"></div>

            {/* Demographics Grid */}
            <div className="grid grid-cols-2 border border-gray-300 mb-5 relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300"></div>
                <div className={`${metaLabelSize} space-y-3.5 p-3.5`}>
                    <div className="font-bold">Name/ID - <span className="font-normal ml-1">{patient.name}</span></div>
                    <div className="font-bold">Age - <span className="font-normal ml-1">{patient.age}</span></div>
                    <div className="flex justify-between max-w-[95%]">
                        <div className="font-bold">Sex - <span className="font-normal ml-1">{patient.sex}</span></div>
                        <div className="font-bold">Mob. No. - <span className="font-normal ml-1">{patient.mobile}</span></div>
                    </div>
                </div>
                <div className={`${metaLabelSize} p-3.5 space-y-3.5`}>
                    <div className="font-bold">Date: <span className="font-normal ml-1">{patient.date}</span></div>
                    <div className="font-bold">Weight - <span className="font-normal ml-1">{patient.weight}</span></div>
                    <div className="flex justify-between">
                        <div className="font-bold">Height - <span className="font-normal ml-1">{patient.height}</span></div>
                        <div className="font-bold">B.M.I. - <span className="font-normal ml-1">{patient.bmi}</span></div>
                    </div>
                </div>
            </div>

            {/* Side-by-Side: Chief Complaints & Clinical Findings */}
            <div className="grid grid-cols-2 border-l border-r border-t border-gray-300 bg-[#F0F7FF]">
                <div className={`${baseFontSize} p-2 font-bold border-r border-gray-300 uppercase tracking-tighter`}>Chief Complaint</div>
                <div className={`${baseFontSize} p-2 font-bold uppercase tracking-tighter`}>Clinical Findings</div>
            </div>
            <div className={`grid grid-cols-2 border border-gray-300 mb-5`}>
                <div className={`${baseFontSize} p-4 border-r border-gray-300 whitespace-pre-wrap leading-relaxed min-h-[140px] font-normal`}>
                    {getSectionContent('Subjective')}
                </div>
                <div className={`${baseFontSize} p-4 whitespace-pre-wrap leading-relaxed min-h-[140px] font-normal`}>
                    {getSectionContent('Objective')}
                </div>
            </div>

            {/* Diagnosis (Full Width) */}
            <div className="bg-[#FFF0F0] border-l border-r border-t border-gray-300 p-2">
                <div className={`${baseFontSize} font-bold uppercase tracking-tighter`}>Diagnosis</div>
            </div>
            <div className={`border border-gray-300 mb-5 p-4 ${baseFontSize} whitespace-pre-wrap min-h-[60px] font-normal leading-relaxed`}>
                {getSectionContent('Assessment')}
            </div>

            {/* Medicine Table */}
            <div className="mb-5">
                <div className="grid grid-cols-4 bg-[#D1F7E2] border border-gray-300 font-bold uppercase tracking-tighter">
                    <div className={`${baseFontSize} p-2 border-r border-gray-300`}>Name</div>
                    <div className={`${baseFontSize} p-2 border-r border-gray-300 text-center`}>Dosage</div>
                    <div className={`${baseFontSize} p-2 border-r border-gray-300 text-center`}>Frequency</div>
                    <div className={`${baseFontSize} p-2 text-center`}>Route</div>
                </div>
                <div className="border-l border-r border-b border-gray-300 min-h-[140px]">
                    {medicines.map((med, i) => (
                        <div key={i} className="grid grid-cols-4 border-b border-gray-200 last:border-0 font-normal">
                            <div className={`${baseFontSize} p-3 border-r border-gray-200`}>{med.name}</div>
                            <div className={`${baseFontSize} p-3 border-r border-gray-200 text-center`}>{med.dosage}</div>
                            <div className={`${baseFontSize} p-3 border-r border-gray-200 text-center`}>{med.frequency}</div>
                            <div className={`${baseFontSize} p-3 text-center`}>{med.route}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Advice (Full Width) */}
            <div className="flex flex-col flex-grow">
                <div className="bg-[#FEF9C3] border border-gray-300 p-2">
                    <div className={`${baseFontSize} font-bold uppercase tracking-tighter`}>Advice / Instructions</div>
                </div>
                <div className={`border-l border-r border-b border-gray-300 p-4 h-full ${baseFontSize} whitespace-pre-wrap leading-relaxed font-normal`}>
                    {adviceLines.join('\n') || "N/A"}
                </div>
            </div>

            {/* Signature Area */}
            <div className="flex justify-end items-end pt-14">
                <div className="text-center">
                    <div className={`border-t border-black ${isPreview ? 'w-32' : 'w-60'} pt-2 font-bold ${baseFontSize} uppercase`}>Doctors Signature</div>
                </div>
            </div>
        </div>
    );
};

// Corrected: Explicitly using React namespace by adding import to resolve 'Cannot find namespace React'
export const ScribeSessionView: React.FC<ScribeSessionViewProps> = ({ onEndSession, doctorProfile, language: defaultLanguage }) => {
    const [phase, setPhase] = useState<'consent' | 'active' | 'processing' | 'review'>('consent');
    const [sessionLanguage, setSessionLanguage] = useState(defaultLanguage);
    const [transcriptHistory, setTranscriptHistory] = useState<TranscriptEntry[]>([]);
    const [clinicalNote, setClinicalNote] = useState('');
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [isGeneratingNote, setIsGeneratingNote] = useState(false);
    const [duration, setDuration] = useState(0);
    const [showPdfPreview, setShowPdfPreview] = useState(true);

    const [patient, setPatient] = useState<PatientDemographics>({
        name: '', age: '', sex: '', mobile: '', weight: '', height: '', bmi: '',
        date: new Date().toLocaleDateString('en-GB'),
        hospitalName: 'OPD PLATFORM CLINIC',
        hospitalAddress: 'Mumbai, India',
        hospitalPhone: ''
    });

    const processedSegmentsRef = useRef<number>(0);
    const pendingSegmentsQueue = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    const { isRecording, startRecording, stopRecording } = useAudioRecorder();
    const { startListening, stopListening, interimTranscript } = useSpeechRecognition({ lang: sessionLanguage });

    useEffect(() => {
        if (isRecording) {
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [isRecording]);

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcriptHistory, interimTranscript]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const processSegment = useCallback(async (blob: Blob, index: number) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            const context = transcriptHistory.slice(-3).map(t => `${t.speaker}: ${t.text}`).join(' ');
            const results = await processAudioSegment(base64Audio, blob.type, sessionLanguage, doctorProfile, context);
            if (results) {
                const newEntries: TranscriptEntry[] = results.map((r, i) => ({
                    id: `seg-${index}-${i}-${Date.now()}`,
                    speaker: r.speaker,
                    text: r.text,
                    segmentIndex: index
                }));
                setTranscriptHistory(prev => {
                    if (prev.some(e => e.segmentIndex === index)) return prev;
                    return [...prev, ...newEntries];
                });
            }
            processedSegmentsRef.current++;
        };
    }, [sessionLanguage, doctorProfile, transcriptHistory]);

    const handleStartSession = async () => {
        setPhase('active');
        setDuration(0);
        setTranscriptHistory([]);
        setClinicalNote('');
        processedSegmentsRef.current = 0;
        pendingSegmentsQueue.current = [];
        await startRecording({
            segmentDuration: 15000,
            onSegment: (blob) => {
                const idx = pendingSegmentsQueue.current.length;
                pendingSegmentsQueue.current.push(blob);
                processSegment(blob, idx);
            }
        });
        startListening();
    };

    const handleStopSession = async () => {
        stopListening();
        setPhase('processing');
        const finalBlob = await stopRecording();
        if (finalBlob) await processSegment(finalBlob, pendingSegmentsQueue.current.length);
        let attempts = 0;
        const checkDone = setInterval(() => {
            if (processedSegmentsRef.current >= pendingSegmentsQueue.current.length || attempts > 10) {
                clearInterval(checkDone);
                setPhase('review');
            }
            attempts++;
        }, 500);
    };

    const handleGenerateNote = async () => {
        setIsGeneratingNote(true);
        const fullTranscript = transcriptHistory.map(t => `${t.speaker}: ${t.text}`).join('\n');
        const note = await generateClinicalNote(fullTranscript, doctorProfile, sessionLanguage);
        setClinicalNote(note);
        setIsGeneratingNote(false);
    };

    const handleDownloadPDF = () => {
        window.print();
    };

    if (phase === 'consent') return (
        <div className="flex-1 flex items-center justify-center p-8 bg-aivana-dark">
            <div className="bg-aivana-grey p-12 rounded-[40px] border border-aivana-light-grey max-w-lg w-full text-center shadow-2xl animate-fadeInUp">
                <div className="w-20 h-20 bg-aivana-accent/20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-aivana-accent/30 shadow-lg">
                    <Icon name="logo" className="w-10 h-10 text-aivana-accent" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4 uppercase tracking-tighter">Veda Assistant</h2>
                <p className="text-gray-500 mb-10 text-sm leading-relaxed">
                    Professional speaker segregation and clinical analysis engine. Supports 6 native Indian scripts.
                </p>
                <div className="space-y-4">
                    <div className="text-left">
                        <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">Session Language</label>
                        <select value={sessionLanguage} onChange={(e) => setSessionLanguage(e.target.value)} className="w-full mt-2 bg-black border border-white/10 text-white rounded-2xl px-5 py-4 font-bold outline-none">
                            {["English", "Hindi", "Marathi", "Gujarati", "Tamil", "Bengali"].map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                    <button onClick={handleStartSession} className="w-full py-5 bg-aivana-accent text-white rounded-2xl font-bold text-lg shadow-2xl transition-all active:scale-95">Initiate Signal Acquisition</button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex-1 flex flex-col bg-aivana-dark overflow-hidden">
            <div className="hidden"><PrescriptionTemplate patient={patient} clinicalNote={clinicalNote} /></div>
            <header className="h-20 border-b border-aivana-light-grey bg-black relative px-8 flex items-center justify-between shadow-lg no-print">
                {phase === 'active' && <AudioWaveform />}
                <div className="flex items-center gap-4 relative z-10">
                    <div className={`p-2 rounded-xl border ${phase === 'active' ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
                        {phase === 'active' ? <div className="w-5 h-5 rounded-full bg-red-500 animate-pulse"></div> : <Icon name="shieldCheck" className="w-5 h-5 text-green-500" />}
                    </div>
                    <div>
                        <span className="text-xs font-black text-white uppercase tracking-widest block">{phase === 'active' ? 'Signal Acquisition' : 'Clinical Finalization'}</span>
                        <span className="text-[10px] font-bold text-gray-500 block">{formatTime(duration)}</span>
                    </div>
                </div>
                <div className="flex gap-4 relative z-10">
                    {phase === 'active' && <button onClick={handleStopSession} className="px-6 py-2.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest">Stop Capture</button>}
                    <button onClick={onEndSession} className="px-5 py-2.5 rounded-xl border border-white/10 text-[10px] font-black uppercase text-gray-400 hover:text-white transition-all bg-black/50 backdrop-blur-sm">Exit Session</button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative no-print">
                {phase === 'processing' && (
                    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-8">
                        <div className="w-24 h-24 border-4 border-t-aivana-accent border-white/5 rounded-full animate-spin mb-6"></div>
                        <h2 className="text-3xl font-bold text-white mb-4 uppercase tracking-widest">Finalizing Analysis</h2>
                        <p className="text-gray-500 max-w-sm">Generating native clinical documentation...</p>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar bg-black/10">
                    {transcriptHistory.length === 0 && !interimTranscript && (
                        <div className="h-full flex flex-col items-center justify-center opacity-10">
                            <Icon name="microphone" className="w-16 h-16 mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em]">Listening for dialogue...</p>
                        </div>
                    )}
                    {transcriptHistory.map(entry => (
                        <div key={entry.id} className={`flex gap-6 animate-fadeInUp ${entry.speaker === 'Doctor' ? '' : 'flex-row-reverse'}`}>
                            <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center border ${entry.speaker === 'Doctor' ? 'bg-aivana-accent/20 border-aivana-accent/30 text-aivana-accent' : 'bg-blue-600/20 border-blue-500/30 text-blue-400'}`}>
                                <Icon name={entry.speaker === 'Doctor' ? 'ai' : 'user'} className="w-5 h-5" />
                            </div>
                            <div className={`flex flex-col max-w-[80%] ${entry.speaker === 'Doctor' ? '' : 'items-end'}`}>
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-600 mb-1">{entry.speaker}</span>
                                <div className={`px-5 py-3 rounded-2xl text-[14px] leading-relaxed shadow-md ${entry.speaker === 'Doctor' ? 'bg-aivana-grey text-white rounded-tl-none font-medium' : 'bg-blue-950/20 text-blue-100 rounded-tr-none font-medium'}`}>
                                    {entry.text}
                                </div>
                            </div>
                        </div>
                    ))}
                    {interimTranscript && (
                        <div className="flex justify-center py-4">
                            <div className="px-4 py-2 bg-white/[0.02] border border-white/5 rounded-full text-[12px] text-gray-600 flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-aivana-accent animate-ping"></div>
                                <span className="italic">"{interimTranscript}..."</span>
                            </div>
                        </div>
                    )}
                    <div ref={transcriptEndRef} />
                </div>

                <aside className={`w-[540px] border-l border-white/5 bg-aivana-dark-sider flex flex-col overflow-hidden shadow-2xl transition-all duration-700 ${phase === 'review' ? 'translate-x-0' : 'translate-x-full'}`}>
                    <div className="p-5 bg-black/20 border-b border-white/5 grid grid-cols-4 gap-3">
                        <div className="col-span-4 mb-1"><h3 className="text-[10px] font-black uppercase tracking-widest text-aivana-accent">Patient Metadata</h3></div>
                        <div className="col-span-2"><label className="text-[9px] uppercase font-bold text-gray-500 mb-1 block">Full Name</label><input type="text" value={patient.name} onChange={e => setPatient({ ...patient, name: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-aivana-accent transition-colors" /></div>
                        <div className="col-span-1"><label className="text-[9px] uppercase font-bold text-gray-500 mb-1 block">Age</label><input type="text" value={patient.age} onChange={e => setPatient({ ...patient, age: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-aivana-accent transition-colors" /></div>
                        <div className="col-span-1"><label className="text-[9px] uppercase font-bold text-gray-500 mb-1 block">Sex</label><input type="text" value={patient.sex} onChange={e => setPatient({ ...patient, sex: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-aivana-accent transition-colors" /></div>
                    </div>

                    <div className="p-6 border-b border-white/5 bg-black/40 flex flex-col gap-4">
                        {!clinicalNote ? (
                            <button onClick={handleGenerateNote} disabled={isGeneratingNote || transcriptHistory.length === 0} className="w-full py-4 bg-aivana-accent text-white rounded-2xl font-bold text-sm shadow-xl flex items-center justify-center gap-3 disabled:opacity-20 hover:bg-purple-600 transition-all">
                                {isGeneratingNote ? <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div> : <Icon name="sparkles" className="w-4 h-4" />}
                                {isGeneratingNote ? 'Generating Note...' : 'Synthesize Clinical SOAP'}
                            </button>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => setIsEditingNote(!isEditingNote)} className={`py-3.5 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all ${isEditingNote ? 'bg-green-600 text-white shadow-lg' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}>
                                    {isEditingNote ? 'Save Changes' : 'Edit Analysis'}
                                </button>
                                <button onClick={handleDownloadPDF} className="py-3.5 bg-aivana-accent text-white rounded-xl font-bold text-[11px] uppercase tracking-widest shadow-lg shadow-aivana-accent/30 hover:bg-purple-600 transition-all">Export Prescription</button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/10">
                        {clinicalNote ? (
                            <div className="p-6 space-y-10">
                                <section>
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-5">Draft Preview</h4>
                                    {isEditingNote ? (
                                        <textarea value={clinicalNote} onChange={(e) => setClinicalNote(e.target.value)} className="w-full h-72 bg-transparent text-gray-200 text-sm leading-relaxed outline-none resize-none font-mono p-5 rounded-2xl border border-white/10 bg-white/[0.02]" spellCheck={false} />
                                    ) : (
                                        <div className="animate-fadeInUp prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(clinicalNote) }} />
                                    )}
                                </section>

                                <section className="pt-8 border-t border-white/5">
                                    <button onClick={() => setShowPdfPreview(!showPdfPreview)} className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-all mb-4 group">
                                        <div className="flex items-center gap-3"><Icon name="document-text" className="w-5 h-5 text-aivana-accent" /><span className="text-[11px] font-bold uppercase tracking-widest text-gray-500 group-hover:text-white transition-colors">Digital Prescription Preview</span></div>
                                        <Icon name="chevronDown" className={`w-4 h-4 text-gray-600 transition-transform duration-300 ${showPdfPreview ? 'rotate-180' : ''}`} />
                                    </button>
                                    {showPdfPreview && <div className="animate-fadeInUp shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] rounded-2xl overflow-hidden border border-white/5"><PrescriptionTemplate patient={patient} clinicalNote={clinicalNote} isPreview /></div>}
                                </section>
                            </div>
                        ) : <div className="h-full flex flex-col items-center justify-center text-center opacity-10"><Icon name="document-text" className="w-16 h-16 mb-4" /><p className="text-[10px] font-black uppercase tracking-[0.4em]">Awaiting Analysis</p></div>}
                    </div>
                </aside>
            </div>
        </div>
    );
};
