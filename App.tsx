
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { UserRole, Chat, Message, PreCodedGpt, DoctorProfile, ClinicalProtocol } from './types';
import { PRE_CODED_GPTS } from './constants';
import { Icon } from './components/Icon';
import { LicenseVerificationModal } from './components/LicenseVerificationModal';
import { ScribeSessionView } from './components/VedaSessionView';
import { CLINICAL_PROTOCOLS } from './knowledgeBase';
import { PrintViewModal } from './components/PrintViewModal';
import { AboutModal } from './components/AboutModal';
import { generateCaseSummary } from './services/geminiService';
import { CaseSummaryModal } from './components/CaseSummaryModal';

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const userRole = UserRole.DOCTOR; 
  const [language, setLanguage] = useState('English');
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [isDoctorVerified, setIsDoctorVerified] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [pendingVerificationMessage, setPendingVerificationMessage] = useState<string | null>(null);
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null);
  
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile>({
      qualification: 'BAMS',
      canPrescribeAllopathic: 'no'
  });
  
  type View = 'chat' | 'scribe';
  const [activeView, setActiveView] = useState<View>('chat');

  const [isInsightsPanelOpen, setIsInsightsPanelOpen] = useState(false);
  const knowledgeBaseProtocols = useMemo(() => CLINICAL_PROTOCOLS, []);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [summaryContent, setSummaryContent] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);


  const activeChat = useMemo(() => {
    return chats.find(chat => chat.id === activeChatId) || null;
  }, [chats, activeChatId]);

  const handleNewChat = useCallback((gpt?: PreCodedGpt) => {
    const newChat: Chat = {
      id: `chat-${Date.now()}`,
      title: gpt ? gpt.title : `New Conversation`,
      messages: gpt ? [{
        id: `msg-${Date.now()}`,
        sender: 'AI',
        text: `You've started a new session with ${gpt.title}. ${gpt.description} How can I help you today?`,
        action_type: 'Informational',
      }] : [],
      userRole: userRole,
      gptId: gpt?.id,
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setActiveView('chat'); 
    setPendingVerificationMessage(null);
    setPendingFirstMessage(null);
    setIsInsightsPanelOpen(false); 
    if(window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [userRole]);

  const updateChat = useCallback((chatId: string, messages: Message[]) => {
    setChats(prev => prev.map(chat =>
      chat.id === chatId ? { ...chat, messages } : chat
    ));
  }, []);

  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setActiveView('chat'); 
    setPendingVerificationMessage(null);
    setIsInsightsPanelOpen(false); 
    if(window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);
  
  const relevantGpts = useMemo(() => PRE_CODED_GPTS, []);

  const handleVerifyLicense = () => {
    setIsDoctorVerified(true);
    setShowVerificationModal(false);
  };
  
  const handleStartScribeSession = () => {
      setActiveView('scribe');
      if(window.innerWidth < 768) {
        setSidebarOpen(false);
      }
  };

  const handleGenerateCaseSummary = useCallback(async () => {
    if (!activeChat || activeChat.messages.length === 0) return;
    setIsGeneratingSummary(true);
    setSummaryContent(null);
    setIsSummaryModalOpen(true);
    try {
        const summary = await generateCaseSummary(activeChat.messages, language, doctorProfile);
        setSummaryContent(summary);
    } catch (error) {
        console.error("Failed to generate case summary:", error);
        setSummaryContent("Error generating summary.");
    } finally {
        setIsGeneratingSummary(false);
    }
  }, [activeChat, language, doctorProfile]);

  const renderActiveView = () => {
    switch (activeView) {
        case 'scribe':
            return <ScribeSessionView
                onEndSession={() => setActiveView('chat')}
                doctorProfile={doctorProfile}
                language={language}
            />;
        case 'chat':
        default:
            return (
                <>
                    <header className="md:hidden p-4 flex items-center justify-between border-b border-aivana-light-grey bg-aivana-dark sticky top-0 z-10">
                      <button
                        onClick={() => setSidebarOpen(true)}
                        className="text-white p-2 rounded-md hover:bg-aivana-grey"
                        aria-label="Open menu"
                      >
                        <Icon name="menu" />
                      </button>
                      <h2 className="text-lg font-semibold truncate px-2">
                        {activeChat?.title || 'Aivana General Medicine'}
                      </h2>
                       <div className="w-9 h-9">
                        {activeChat && (
                            <button
                              onClick={() => setIsInsightsPanelOpen(true)}
                              className="text-white p-2 rounded-md hover:bg-aivana-grey"
                            >
                              <Icon name="lightbulb" />
                            </button>
                        )}
                      </div>
                    </header>
                    <ChatView
                      key={activeChatId} 
                      chat={activeChat}
                      onNewChat={handleNewChat}
                      updateChat={updateChat}
                      userRole={userRole}
                      language={language}
                      isDoctorVerified={isDoctorVerified}
                      setShowVerificationModal={setShowVerificationModal}
                      setPendingVerificationMessage={setPendingVerificationMessage}
                      pendingVerificationMessage={pendingVerificationMessage}
                      doctorProfile={doctorProfile}
                      pendingFirstMessage={pendingFirstMessage}
                      setPendingFirstMessage={setPendingFirstMessage}
                      isInsightsPanelOpen={isInsightsPanelOpen}
                      setIsInsightsPanelOpen={setIsInsightsPanelOpen}
                      knowledgeBaseProtocols={knowledgeBaseProtocols}
                    />
                </>
            );
    }
  }


  return (
    <div className="flex h-screen w-screen text-aivana-text bg-aivana-dark-sider">
      <Sidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        gpts={relevantGpts}
        chats={chats}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        activeChat={activeChat}
        activeChatId={activeChatId}
        language={language}
        setLanguage={setLanguage}
        doctorProfile={doctorProfile}
        setDoctorProfile={setDoctorProfile}
        onStartScribeSession={handleStartScribeSession}
        activeView={activeView}
        onShowPrintModal={() => setIsPrintModalOpen(true)}
        onShowAboutModal={() => setIsAboutModalOpen(true)}
        onGenerateCaseSummary={handleGenerateCaseSummary}
      />
      <main className="flex-1 flex flex-col bg-aivana-dark relative">
        {renderActiveView()}
      </main>
      <LicenseVerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onVerify={handleVerifyLicense}
      />
      <PrintViewModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        protocols={knowledgeBaseProtocols}
      />
       <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />
      <CaseSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        summaryContent={summaryContent}
        isGenerating={isGeneratingSummary}
        chatTitle={activeChat?.title || "Case Summary"}
      />
    </div>
  );
};

export default App;
