import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePaymo } from '../context/PaymoContext';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { VoiceInput } from '../components/VoiceInput';
import { StatusLabel } from '../components/StatusLabel';
import { api } from '../lib/api';
import { Message } from '../types';
import {
  Send,
  Upload,
  Volume2,
  Square,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  Download,
  Cpu,
  Loader2,
  ShieldAlert,
  CreditCard
} from 'lucide-react';

const CONVERSATION_ID = 'conv_default_demo';

const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', name: 'English (India)' },
  { code: 'hi-IN', name: 'Hindi (हिंदी)' },
  { code: 'kn-IN', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ta-IN', name: 'Tamil (தமிழ்)' },
  { code: 'te-IN', name: 'Telugu (తెలుగు)' },
  { code: 'bn-IN', name: 'Bengali (বাংলা)' },
  { code: 'mr-IN', name: 'Marathi (मराठी)' },
  { code: 'gu-IN', name: 'Gujarati (ગુજરાતી)' },
];

export const AssistantPage: React.FC = () => {
  const navigate = useNavigate();
  const { createCase, showToast } = usePaymo();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(true);
  const [isAgentThinking, setIsAgentThinking] = useState<boolean>(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Audio Playback State
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [synthesizingMessageId, setSynthesizingMessageId] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const [auditStatus, setAuditStatus] = useState<{
    configured: boolean;
    reachable: boolean;
    model: string;
    status: string;
    message: string;
  } | null>(null);

  const [voiceStatus, setVoiceStatus] = useState<{
    configured: boolean;
    reachable: boolean;
    stt_model: string;
    tts_model: string;
    status: string;
    message: string;
  } | null>(null);

  // Active transaction details in right panel
  const [activeDetail, setActiveDetail] = useState({
    orderId: 'ORD_9823412',
    transactionId: 'cf_tx_90812938',
    amount: 2499.00,
    currency: 'INR',
    paymentStatus: 'FAILED',
    orderStatus: 'PENDING_CONFIRMATION',
    caseId: 'CASE-2024-8831',
    customerName: 'Aarav Sharma'
  });

  // Stop active audio when unmounting
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Fetch messages from backend
  const loadMessages = async () => {
    try {
      setLoadingMessages(true);
      const [messagesData, auditData, voiceData] = await Promise.all([
        api.getConversationMessages(CONVERSATION_ID),
        api.getAgentAuditStatus().catch(() => null),
        api.getVoiceStatus().catch(() => null)
      ]);
      if (auditData) setAuditStatus(auditData);
      if (voiceData) setVoiceStatus(voiceData);

      const mapped: Message[] = messagesData.map((m) => {
        let metaObj;
        if (m.metadata_json) {
          try {
            metaObj = JSON.parse(m.metadata_json);
          } catch {
            // ignore
          }
        }
        return {
          id: m.message_id,
          sender: m.sender_type as 'user' | 'assistant',
          content: m.message_content,
          timestamp: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          audioAvailable: m.audio_available,
          executionEngine: metaObj?.execution_engine || (m.sender_type === 'assistant' ? 'LOCAL_FALLBACK' : undefined),
          isFallback: metaObj?.is_fallback ?? true,
          fallbackReason: metaObj?.fallback_reason,
          reportText: metaObj?.report_text,
          reportFilename: metaObj?.report_file,
          metadata: metaObj
        };
      });
      setMessages(mapped);
    } catch (err: unknown) {
      showToast(`Notice: Loading messages (${err instanceof Error ? err.message : 'API offline'})`, 'warn');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const handleDownloadReport = (reportText: string, filename?: string) => {
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'Paymo_Incident_Report.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Report downloaded: ${filename || 'Paymo_Incident_Report.txt'}`, 'success');
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isAgentThinking) return;

    setAgentError(null);
    setIsAgentThinking(true);

    // Optimistically show user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInputText('');

    try {
      // Execute turn via GPT Agent service
      const agentRes = await api.sendAgentChat(CONVERSATION_ID, text, selectedLanguage);

      const assistantMsg: Message = {
        id: agentRes.message_id,
        sender: 'assistant',
        content: agentRes.content,
        timestamp: new Date(agentRes.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        audioAvailable: true,
        executionEngine: agentRes.execution_engine,
        isFallback: agentRes.is_fallback,
        fallbackReason: agentRes.fallback_reason,
        toolsExecuted: agentRes.tools_executed,
        pendingAction: agentRes.pending_action,
        reportText: agentRes.report_text,
        reportFilename: agentRes.report_filename
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // If a case or order was referenced in tool output, update context panel
      if (agentRes.tools_executed && agentRes.tools_executed.length > 0) {
        for (const t of agentRes.tools_executed) {
          if (t.tool === 'check_payment' && t.result && (t.result as Record<string, unknown>).found) {
            const resData = t.result as Record<string, unknown>;
            setActiveDetail((prev) => ({
              ...prev,
              orderId: (resData.order_id as string) || prev.orderId,
              transactionId: (resData.transaction_id as string) || prev.transactionId,
              amount: typeof resData.amount === 'number' ? resData.amount : prev.amount,
              paymentStatus: (resData.payment_status as string) || prev.paymentStatus,
              orderStatus: (resData.order_status as string) || prev.orderStatus,
              customerName: (resData.customer_name as string) || prev.customerName
            }));
          } else if (t.tool === 'create_case' && t.result && (t.result as Record<string, unknown>).created) {
            const resData = t.result as Record<string, unknown>;
            setActiveDetail((prev) => ({
              ...prev,
              caseId: (resData.case_id as string) || prev.caseId
            }));
          }
        }
      }

      // If voice is active or user requested speech, auto-playback can be offered
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : 'Agent invocation failed';
      setAgentError(errStr);
      showToast(`Agent Error: ${errStr}`, 'warn');
    } finally {
      setIsAgentThinking(false);
    }
  };

  const handleStopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingMessageId(null);
    setSynthesizingMessageId(null);
  };

  const handleListenResponse = async (msgId: string, text: string) => {
    if (playingMessageId === msgId) {
      handleStopAudio();
      return;
    }

    handleStopAudio();
    setSynthesizingMessageId(msgId);

    const cleanText = text.replace(/\[.*?\]/g, '').trim() || text.trim();

    try {
      // 1. Try official Sarvam TTS via backend
      const ttsRes = await api.synthesizeSpeech(cleanText, selectedLanguage);
      if (ttsRes.audio_base64) {
        const audio = new Audio(`data:audio/wav;base64,${ttsRes.audio_base64}`);
        currentAudioRef.current = audio;

        audio.onplay = () => {
          setSynthesizingMessageId(null);
          setPlayingMessageId(msgId);
        };

        audio.onended = () => {
          setPlayingMessageId(null);
          currentAudioRef.current = null;
        };

        audio.onerror = () => {
          setPlayingMessageId(null);
          setSynthesizingMessageId(null);
          currentAudioRef.current = null;
          showToast('Audio playback encountered an error.', 'warn');
        };

        await audio.play();
        showToast(`Playing speech via Sarvam TTS (${ttsRes.language_code} / ${ttsRes.speaker})`, 'info');
        return;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'TTS Error';
      // If unconfigured or failed, fallback gracefully to browser SpeechSynthesis
      if (errMsg.includes('503') || errMsg.includes('not configured')) {
        showToast('[SARVAM TTS NOT CONFIGURED] Using browser SpeechSynthesis fallback.', 'info');
      } else {
        showToast(`Sarvam TTS notice: ${errMsg}. Using browser fallback.`, 'info');
      }
    } finally {
      setSynthesizingMessageId(null);
    }

    // 2. Browser fallback
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => setPlayingMessageId(null);
      utterance.onerror = () => setPlayingMessageId(null);
      setPlayingMessageId(msgId);
      window.speechSynthesis.speak(utterance);
    } else {
      showToast('Speech playback is not supported in this browser.', 'warn');
    }
  };

  // Phase 3B: Server-Validated Confirmation of Staged Action
  const handleConfirmAction = async (actionId: string) => {
    try {
      setActionInProgress(actionId);
      const res = await api.confirmAction(CONVERSATION_ID, actionId);
      if (res.success) {
        showToast(`Authorization confirmed! Incident ${res.case?.id || ''} created.`, 'success');
        // Update pending action in message state
        setMessages((prev) =>
          prev.map((m) => {
            if (m.pendingAction && m.pendingAction.action_id === actionId) {
              return {
                ...m,
                pendingAction: {
                  ...m.pendingAction,
                  status: 'CONFIRMED'
                }
              };
            }
            return m;
          })
        );
        if (res.case?.id) {
          setActiveDetail((prev) => ({ ...prev, caseId: res.case!.id }));
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Confirmation failed';
      showToast(`Action Confirmation Error: ${errMsg}`, 'warn');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancelAction = async (actionId: string) => {
    try {
      setActionInProgress(actionId);
      const res = await api.cancelAction(CONVERSATION_ID, actionId);
      if (res.success) {
        showToast('Action cancelled. No changes were made.', 'info');
        setMessages((prev) =>
          prev.map((m) => {
            if (m.pendingAction && m.pendingAction.action_id === actionId) {
              return {
                ...m,
                pendingAction: {
                  ...m.pendingAction,
                  status: 'CANCELLED'
                }
              };
            }
            return m;
          })
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Cancellation failed';
      showToast(`Action Cancellation Error: ${errMsg}`, 'warn');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      showToast(
        `Receipt attached: ${file.name}.`,
        'info'
      );
    }
  };

  const handleCreateIncidentFromChat = async () => {
    const newCase = await createCase({
      orderId: activeDetail.orderId,
      transactionId: activeDetail.transactionId,
      customerName: activeDetail.customerName,
      customerEmail: 'aarav.sharma@example.com',
      amount: activeDetail.amount,
      paymentStatus: 'FAILED',
      orderStatus: 'PENDING_CONFIRMATION',
      assignedTeam: 'Engineering',
      channel: 'UPI',
      errorMessage: `Incident generated from Assistant conversation (${CONVERSATION_ID}) for ${activeDetail.orderId}.`
    });

    if (newCase) {
      setActiveDetail((prev) => ({ ...prev, caseId: newCase.id }));
      navigate('/payments');
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 font-mono text-white max-w-7xl mx-auto">
      {/* Main Chat Area */}
      <div className="flex-1 border border-white bg-black flex flex-col justify-between h-[calc(100vh-8.5rem)] min-h-[500px]">
        {/* Assistant Header & Language Selector */}
        <div className="border-b border-white p-3 flex flex-wrap items-center justify-between gap-2 bg-neutral-950">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-white inline-block"></span>
            <span className="text-xs uppercase font-bold tracking-wider flex flex-wrap items-center gap-1.5">
              <span>Paymo AI Sentinel</span>
              <span className={`text-[10px] border px-1.5 py-0.5 ${auditStatus?.configured && auditStatus?.reachable ? 'border-white text-white font-bold' : 'border-neutral-700 text-neutral-400'}`}>
                {auditStatus?.configured
                  ? (auditStatus.reachable ? `[OPENAI: REACHABLE // ${auditStatus.model}]` : `[OPENAI: UNREACHABLE]`)
                  : '[OPENAI: NOT CONFIGURED]'}
              </span>
              <span className={`text-[10px] border px-1.5 py-0.5 ${voiceStatus?.configured && voiceStatus?.reachable ? 'border-white text-white font-bold' : 'border-neutral-700 text-neutral-400'}`}>
                {voiceStatus?.configured
                  ? (voiceStatus.reachable ? `[SARVAM: ACTIVE // ${voiceStatus.stt_model}]` : `[SARVAM: UNREACHABLE]`)
                  : '[SARVAM: NOT CONFIGURED]'}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="lang-select" className="text-[10px] text-neutral-400 uppercase">
              Language:
            </label>
            <select
              id="lang-select"
              value={selectedLanguage}
              onChange={(e) => {
                setSelectedLanguage(e.target.value);
                showToast(`Language set to ${SUPPORTED_LANGUAGES.find(l => l.code === e.target.value)?.name}`, 'info');
              }}
              className="bg-black border border-white text-white text-[11px] px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-white"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Conversation History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="border border-neutral-800 p-2 text-center text-[11px] text-neutral-400 bg-neutral-950 flex items-center justify-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-white" />
            <span>SESSION PERSISTED IN FASTAPI DATABASE: {CONVERSATION_ID}</span>
          </div>

          {loadingMessages ? (
            <div className="text-center text-xs text-neutral-500 py-8">
              Loading conversation history from SQLite...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-xs text-neutral-500 py-8">
              No messages found. Start typing below to query payments or request case reports.
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender === 'user';
              const isPlaying = playingMessageId === msg.id;
              const isSynthesizing = synthesizingMessageId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="text-[10px] text-neutral-500 mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-neutral-300">
                      {isUser ? 'YOU' : 'PAYMO AI SENTINEL'}
                    </span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                    {!isUser && msg.executionEngine && (
                      <>
                        <span>•</span>
                        <span className={`px-1 py-0.2 border text-[9px] uppercase tracking-wider ${msg.isFallback ? 'border-neutral-700 text-neutral-400' : 'border-white text-white font-bold'}`}>
                          [{msg.executionEngine}]
                        </span>
                      </>
                    )}
                  </div>

                  <div
                    className={`max-w-xl p-3 border text-xs leading-relaxed space-y-2 ${
                      isUser
                        ? 'border-white bg-white text-black'
                        : 'border-neutral-700 bg-neutral-950 text-white'
                    }`}
                  >
                    {/* Tool execution badge if tools were run */}
                    {msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pb-1 border-b border-neutral-800 text-[10px]">
                        {msg.toolsExecuted.map((t, idx) => (
                          <span
                            key={idx}
                            className="border border-neutral-700 bg-black px-1.5 py-0.5 text-neutral-300 font-mono"
                          >
                            [TOOL: {t.tool}]
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Phase 3B: Server-Validated Pending Action Authorization Card */}
                    {msg.pendingAction && (
                      <div className="border border-white p-3 bg-black mt-3 space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-neutral-800">
                          <span className="font-bold uppercase text-white flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 text-white" />
                            <span>Server Authorization Gate</span>
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400">
                            ID: {msg.pendingAction.action_id}
                          </span>
                        </div>

                        <div className="text-xs text-neutral-200">
                          {msg.pendingAction.summary}
                        </div>

                        <div className="text-[10px] text-neutral-400 font-mono">
                          STATUS: [{msg.pendingAction.status}] • EXPIRES: {new Date(msg.pendingAction.expires_at).toLocaleTimeString()}
                        </div>

                        {msg.pendingAction.status === 'PENDING' ? (
                          <div className="flex gap-2 pt-1">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleConfirmAction(msg.pendingAction!.action_id)}
                              disabled={actionInProgress === msg.pendingAction.action_id}
                            >
                              {actionInProgress === msg.pendingAction.action_id ? 'AUTHORIZING...' : 'CONFIRM & EXECUTE'}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleCancelAction(msg.pendingAction!.action_id)}
                              disabled={actionInProgress === msg.pendingAction.action_id}
                            >
                              CANCEL
                            </Button>
                          </div>
                        ) : msg.pendingAction.status === 'CONFIRMED' ? (
                          <div className="border border-neutral-700 p-1.5 text-[10px] text-neutral-300 flex items-center gap-1.5 bg-neutral-950">
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            <span>AUTHORIZED & EXECUTED ON SERVER. INCIDENT CREATED.</span>
                          </div>
                        ) : (
                          <div className="border border-neutral-800 p-1.5 text-[10px] text-neutral-500 bg-neutral-950">
                            ACTION CANCELLED BY USER. NO DATABASE WRITES OCCURRED.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Report Download action button if report was generated */}
                    {msg.reportText && (
                      <div className="border border-white p-2.5 bg-black mt-2 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold uppercase text-white">
                            Generated Incident Report File
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            {msg.reportFilename || 'report.txt'}
                          </span>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          fullWidth
                          onClick={() => handleDownloadReport(msg.reportText!, msg.reportFilename)}
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          <span>Download Report (.txt)</span>
                        </Button>
                      </div>
                    )}

                    {/* Assistant Actions (Listen / Stop response via Sarvam TTS) */}
                    {!isUser && (
                      <div className="mt-2.5 pt-2 border-t border-neutral-800 flex items-center justify-between text-[10px]">
                        <span className="text-neutral-500 font-mono">
                          {isPlaying ? 'AUDIO PLAYING' : isSynthesizing ? 'SYNTHESIZING TTS...' : 'AGENT OUTPUT'}
                        </span>
                        {isPlaying ? (
                          <button
                            onClick={handleStopAudio}
                            className="flex items-center gap-1 text-white border border-white px-2 py-0.5 bg-neutral-900 focus:outline-none"
                          >
                            <Square className="w-3 h-3 fill-white" />
                            <span>Stop audio</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleListenResponse(msg.id, msg.content)}
                            disabled={isSynthesizing}
                            className="flex items-center gap-1 text-neutral-300 hover:text-white border border-neutral-800 px-2 py-0.5 hover:border-white focus:outline-none disabled:opacity-50"
                          >
                            {isSynthesizing ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                            <span>{isSynthesizing ? 'Generating speech...' : 'Listen to response'}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Loading indicator during agent execution */}
          {isAgentThinking && (
            <div className="flex flex-col items-start">
              <div className="text-[10px] text-neutral-500 mb-1">PAYMO AI SENTINEL • Running...</div>
              <div className="border border-white bg-black p-3 text-xs flex items-center gap-2 text-neutral-300">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Agent thinking, validating tools & querying payment records...</span>
              </div>
            </div>
          )}

          {/* Error notice */}
          {agentError && (
            <div className="border border-white bg-neutral-950 p-3 text-xs text-white">
              [AGENT ERROR]: {agentError}
            </div>
          )}
        </div>

        {/* Selected file preview indicator */}
        {selectedFileName && (
          <div className="border-t border-neutral-800 bg-neutral-950 px-4 py-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-neutral-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              <span>Attached: <strong className="text-white">{selectedFileName}</strong></span>
              <span className="text-[10px] text-neutral-500">(OCR available)</span>
            </div>
            <button
              onClick={() => setSelectedFileName(null)}
              className="text-[10px] text-neutral-400 hover:text-white underline"
            >
              Remove
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="border-t border-white p-3 bg-black space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            {/* Large microphone button connected to Sarvam STT */}
            <VoiceInput
              languageCode={selectedLanguage}
              onTranscript={(transcript) => {
                setInputText(transcript);
                handleSendMessage(transcript);
              }}
            />

            {/* Text input */}
            <div className="flex-1">
              <Input
                placeholder="Ask about payments (e.g. 'Check ORD_9823412' or 'Generate a report for CASE-2024-8831')..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </div>

            {/* Receipt Upload button */}
            <label
              className="border border-white bg-black hover:bg-neutral-900 text-white px-3 py-2 cursor-pointer flex items-center justify-center text-xs h-10 select-none"
              title="Upload payment receipt image or PDF"
            >
              <Upload className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Receipt</span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>

            {/* Send button */}
            <Button
              type="submit"
              variant="primary"
              className="h-10 px-4"
              disabled={(!inputText.trim() && !selectedFileName) || isAgentThinking}
            >
              <Send className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">{isAgentThinking ? 'Thinking...' : 'Send'}</span>
            </Button>
          </form>

          <div className="flex items-center justify-between text-[10px] text-neutral-500">
            <span>Powered by Sarvam AI (Saaras v2 / Bulbul v1) & OpenAI API. Zero credentials in frontend.</span>
            <span>SERVER-VALIDATED ACTION GATES</span>
          </div>
        </div>
      </div>

      {/* Right Panel: Transaction & Incident Context */}
      <div className="w-full lg:w-80 border border-white bg-black p-4 flex flex-col justify-between font-mono text-xs">
        <div className="space-y-4">
          <div className="border-b border-white pb-2 flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-xs">
              Context Telemetry
            </span>
            <span className="text-[10px] text-neutral-400">DATABASE ACTIVE</span>
          </div>

          <div className="space-y-3">
            <div className="border border-neutral-800 p-2.5 bg-neutral-950">
              <span className="text-[10px] text-neutral-400 block uppercase">Transaction ID</span>
              <span className="text-white font-bold block mt-0.5">{activeDetail.transactionId}</span>
            </div>

            <div className="border border-neutral-800 p-2.5 bg-neutral-950">
              <span className="text-[10px] text-neutral-400 block uppercase">Payment Amount</span>
              <span className="text-white font-bold text-sm block mt-0.5">
                ₹{activeDetail.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="border border-neutral-800 p-2.5 bg-neutral-950">
              <span className="text-[10px] text-neutral-400 block uppercase">Gateway Status</span>
              <div className="mt-1">
                <StatusLabel status={activeDetail.paymentStatus} type="payment" />
              </div>
            </div>

            <div className="border border-neutral-800 p-2.5 bg-neutral-950">
              <span className="text-[10px] text-neutral-400 block uppercase">Order Status</span>
              <div className="mt-1">
                <StatusLabel status={activeDetail.orderStatus} type="order" />
              </div>
            </div>

            <div className="border border-neutral-800 p-2.5 bg-neutral-950">
              <span className="text-[10px] text-neutral-400 block uppercase">Linked Incident</span>
              <span className="text-white font-bold block mt-0.5">{activeDetail.caseId}</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-white space-y-3 mt-4">
          <Button
            variant="primary"
            fullWidth
            onClick={handleCreateIncidentFromChat}
          >
            <PlusCircle className="w-3.5 h-3.5 mr-2" />
            <span>Register Support Complaint</span>
          </Button>

          <Button
            variant="secondary"
            fullWidth
            onClick={() => navigate('/payments')}
          >
            <CreditCard className="w-3.5 h-3.5 mr-2" />
            <span>Make / View Payments</span>
          </Button>

          <div className="p-2 border border-neutral-800 bg-neutral-950 text-[10px] text-neutral-400 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-white shrink-0 mt-0.5" />
            <span>Try: "Check payment ORD_9823412" or "Generate a report for case CASE-2024-8831"</span>
          </div>
        </div>
      </div>
    </div>
  );
};
