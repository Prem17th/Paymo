import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Mic,
  MicOff,
  Send,
  Upload,
  Volume2,
  VolumeX,
  Loader2,
  FileText,
  RefreshCw,
  CreditCard,
  Play,
  Square,
  RotateCcw
} from 'lucide-react';

interface TransactionItem {
  transaction_id: string;
  order_id: string;
  amount: number;
  currency: string;
  payment_status: string;
  order_status: string;
  source: string;
  payment_method: string;
  customer_name?: string;
  customer_email?: string;
  created_at: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  audioBase64?: string;
  reportText?: string;
  reportFilename?: string;
  pendingAction?: {
    action_id: string;
    summary: string;
    status: string;
  };
}

interface ReceiptResult {
  amount: number | null;
  currency: string;
  date: string | null;
  transaction_reference: string | null;
  merchant_name: string | null;
  payment_method: string | null;
  payment_status: string | null;
  summary: string;
  is_verified: boolean;
  verification_label: string;
  matched_transaction?: {
    order_id: string;
    amount: number;
    payment_status: string;
  } | null;
}

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Telemetry & Payments
  const [stats, setStats] = useState<{
    total_verified_amount: number;
    successful_payments: number;
    pending_payments: number;
    total_payments: number;
    recent_transactions: TransactionItem[];
  }>({
    total_verified_amount: 0,
    successful_payments: 0,
    pending_payments: 0,
    total_payments: 0,
    recent_transactions: [],
  });
  const [loadingStats, setLoadingStats] = useState(true);

  // Voice & Chat State
  const [language, setLanguage] = useState<'en-IN' | 'kn-IN'>('en-IN');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStage, setVoiceStage] = useState<'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking'>('idle');
  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  // Receipt Upload & Automatic Voice State
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [extractedReceipt, setExtractedReceipt] = useState<ReceiptResult | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptAudioBase64, setReceiptAudioBase64] = useState<string | null>(null);
  const [receiptVoicePlaying, setReceiptVoicePlaying] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [receiptVoiceError, setReceiptVoiceError] = useState<string | null>(null);

  // Conversation ID
  const [conversationId] = useState(() => `session_${Date.now().toString(36)}`);

  // Load live database summary
  const loadDashboardData = async () => {
    try {
      setLoadingStats(true);
      const data = await api.getOverviewSummary();
      setStats({
        total_verified_amount: data.total_verified_amount ?? 0,
        successful_payments: data.successful_payments ?? 0,
        pending_payments: data.pending_payments ?? 0,
        total_payments: data.total_payments ?? 0,
        recent_transactions: (data.recent_transactions as unknown as TransactionItem[]) ?? [],
      });
    } catch {
      // ignore
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    return () => {
      stopAudio();
    };
  }, []);

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setPlayingMsgId(null);
    if (voiceStage === 'speaking') {
      setVoiceStage('idle');
    }
  };

  const playSynthesizedSpeech = async (text: string, msgId: string) => {
    stopAudio();
    setPlayingMsgId(msgId);
    setVoiceStage('speaking');

    try {
      const cleanText = text.replace(/\[.*?\]/g, '').trim();
      const tts = await api.synthesizeSpeech(cleanText, language);
      if (tts && tts.audio_base64) {
        const audio = new Audio(`data:audio/wav;base64,${tts.audio_base64}`);
        currentAudioRef.current = audio;
        audio.onended = () => {
          setPlayingMsgId(null);
          setVoiceStage('idle');
          currentAudioRef.current = null;
        };
        audio.onerror = () => {
          setPlayingMsgId(null);
          setVoiceStage('idle');
          currentAudioRef.current = null;
        };
        await audio.play();
      } else {
        setPlayingMsgId(null);
        setVoiceStage('idle');
      }
    } catch {
      setPlayingMsgId(null);
      setVoiceStage('idle');
    }
  };

  // Handle user query submission (Voice or Text)
  const submitQuery = async (queryText: string) => {
    const text = queryText.trim();
    if (!text) return;

    const userMsgId = `usr_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setVoiceStage('thinking');

    try {
      const agentRes = await api.sendAgentChat(conversationId, text, language);

      const assistantMsgId = agentRes.message_id || `asst_${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        content: agentRes.content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reportText: agentRes.report_text,
        reportFilename: agentRes.report_filename,
        pendingAction: agentRes.pending_action,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Refresh dashboard if a payment or case changed
      loadDashboardData();

      // Automatic vocal response via Sarvam
      await playSynthesizedSpeech(agentRes.content, assistantMsgId);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error communicating with assistant';
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: 'assistant',
        content: `Error: ${errMsg}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setVoiceStage('idle');
    }
  };

  // Microphone Recording using Browser MediaRecorder + Sarvam STT
  const startRecording = async () => {
    try {
      stopAudio();
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        if (audioBlob.size > 0) {
          setVoiceStage('transcribing');
          try {
            const sttRes = await api.transcribeAudio(audioBlob, language);
            if (sttRes && sttRes.transcript && sttRes.transcript.trim()) {
              await submitQuery(sttRes.transcript);
            } else {
              setVoiceStage('idle');
            }
          } catch {
            setVoiceStage('idle');
          }
        } else {
          setVoiceStage('idle');
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setVoiceStage('recording');
    } catch {
      alert('Microphone access denied or unavailable. You can use the text box below.');
      setIsRecording(false);
      setVoiceStage('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const toggleMic = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Receipt Audio Helper Functions
  const playReceiptAudio = (b64: string) => {
    stopAudio();
    try {
      const audio = new Audio(`data:audio/wav;base64,${b64}`);
      currentAudioRef.current = audio;
      setReceiptVoicePlaying(true);
      setAutoplayBlocked(false);

      audio.onended = () => {
        setReceiptVoicePlaying(false);
        currentAudioRef.current = null;
      };

      audio.onerror = () => {
        setReceiptVoicePlaying(false);
        currentAudioRef.current = null;
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Autoplay prevented by browser:', err);
          setReceiptVoicePlaying(false);
          setAutoplayBlocked(true);
        });
      }
    } catch {
      setReceiptVoicePlaying(false);
      setAutoplayBlocked(true);
    }
  };

  const stopReceiptAudio = () => {
    stopAudio();
    setReceiptVoicePlaying(false);
  };

  const replayReceiptAudio = async () => {
    if (receiptAudioBase64) {
      playReceiptAudio(receiptAudioBase64);
    } else if (extractedReceipt?.summary) {
      try {
        setReceiptVoiceError(null);
        const ttsRes = await api.synthesizeSpeech(extractedReceipt.summary, language);
        if (ttsRes && ttsRes.audio_base64) {
          setReceiptAudioBase64(ttsRes.audio_base64);
          playReceiptAudio(ttsRes.audio_base64);
        }
      } catch (err: unknown) {
        setReceiptVoiceError(
          err instanceof Error ? `Voice synthesis error: ${err.message}` : 'Failed to generate voice.'
        );
      }
    }
  };

  // Receipt Upload & GPT Analysis + Automatic Sarvam TTS Voice
  const handleReceiptSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingReceipt(true);
    setReceiptError(null);
    setReceiptVoiceError(null);
    setExtractedReceipt(null);
    setReceiptAudioBase64(null);
    setReceiptVoicePlaying(false);
    setAutoplayBlocked(false);
    stopAudio();

    try {
      // 1. Send to backend receipt extractor -> OpenAI GPT-4o-mini with selected language
      const data = await api.extractReceipt(file, language);
      setExtractedReceipt(data);

      // 2. Automatically synthesize speech explanation via Sarvam TTS in selected language
      if (data.summary && data.summary.trim()) {
        try {
          const ttsRes = await api.synthesizeSpeech(data.summary, language);
          if (ttsRes && ttsRes.audio_base64) {
            setReceiptAudioBase64(ttsRes.audio_base64);
            // Subject to browser autoplay permissions
            playReceiptAudio(ttsRes.audio_base64);
          }
        } catch (ttsErr: unknown) {
          // If Sarvam fails, keep the GPT summary visible and show clear error
          setReceiptVoiceError(
            ttsErr instanceof Error
              ? `Sarvam Voice: ${ttsErr.message}`
              : 'Sarvam TTS voice generation failed.'
          );
        }
      }
    } catch (err: unknown) {
      setReceiptError(err instanceof Error ? err.message : 'Failed to parse receipt.');
    } finally {
      setUploadingReceipt(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="font-mono text-white max-w-4xl mx-auto space-y-8 pb-12 select-none">
      {/* Top Header */}
      <div className="text-center space-y-1 pt-4">
        <h1 className="text-2xl font-bold tracking-widest uppercase">Paymo</h1>
        <p className="text-xs text-neutral-400 uppercase tracking-wider">
          Your AI payment assistant
        </p>
      </div>

      {/* Language Selector */}
      <div className="flex justify-center items-center gap-2 text-xs">
        <span className="text-neutral-400">LANGUAGE:</span>
        <button
          onClick={() => setLanguage('en-IN')}
          className={`px-3 py-1 border text-xs uppercase ${
            language === 'en-IN' ? 'bg-white text-black font-bold border-white' : 'border-neutral-700 text-neutral-400 hover:text-white'
          }`}
        >
          English
        </button>
        <button
          onClick={() => setLanguage('kn-IN')}
          className={`px-3 py-1 border text-xs uppercase ${
            language === 'kn-IN' ? 'bg-white text-black font-bold border-white' : 'border-neutral-700 text-neutral-400 hover:text-white'
          }`}
        >
          ಕನ್ನಡ (Kannada)
        </button>
      </div>

      {/* Center: Large Microphone Button */}
      <div className="flex flex-col items-center justify-center space-y-3 py-4">
        <button
          onClick={toggleMic}
          disabled={voiceStage === 'transcribing' || voiceStage === 'thinking'}
          className={`w-28 h-28 border-2 flex items-center justify-center transition-all ${
            isRecording
              ? 'border-white bg-white text-black animate-pulse'
              : voiceStage === 'speaking'
              ? 'border-white bg-neutral-900 text-white'
              : 'border-white text-white hover:bg-white hover:text-black'
          }`}
          aria-label="Voice input"
        >
          {isRecording ? (
            <MicOff className="w-10 h-10" />
          ) : voiceStage === 'speaking' ? (
            <Volume2 className="w-10 h-10" />
          ) : voiceStage === 'transcribing' || voiceStage === 'thinking' ? (
            <Loader2 className="w-10 h-10 animate-spin" />
          ) : (
            <Mic className="w-10 h-10" />
          )}
        </button>

        <div className="text-xs tracking-wider uppercase font-semibold">
          {voiceStage === 'recording' && 'Recording... Tap to finish'}
          {voiceStage === 'transcribing' && 'Transcribing speech...'}
          {voiceStage === 'thinking' && 'Paymo is thinking...'}
          {voiceStage === 'speaking' && 'Speaking answer... Tap mic to stop'}
          {voiceStage === 'idle' && 'Tap to speak'}
        </div>
      </div>

      {/* Input & Receipt Buttons */}
      <div className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitQuery(inputQuery);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder='Ask: "What did I pay today?" or "Show my latest payment"'
            className="flex-1 bg-black border border-white px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || voiceStage === 'thinking'}
            className="border border-white px-4 py-2 text-xs uppercase font-semibold bg-white text-black hover:bg-neutral-200 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingReceipt}
            className="border border-white px-3 py-2 text-xs uppercase text-white hover:bg-neutral-900 flex items-center gap-1.5"
            title="Upload receipt image or PDF"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Receipt</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,application/pdf"
            onChange={handleReceiptSelect}
            className="hidden"
          />
        </form>

        {uploadingReceipt && (
          <div className="border border-neutral-700 p-3 text-xs text-neutral-300 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-white" />
            <span>Analyzing receipt details with AI vision...</span>
          </div>
        )}

        {/* Extracted Receipt Card */}
        {extractedReceipt && (
          <div className="border border-white p-4 space-y-4 bg-neutral-950">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-white" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Receipt Analysis & Verification
                </span>
              </div>
              <span
                className={`text-[10px] px-2.5 py-0.5 border font-mono font-bold uppercase tracking-wider ${
                  extractedReceipt.is_verified
                    ? 'border-white bg-white text-black'
                    : 'border-neutral-600 bg-neutral-900 text-neutral-300'
                }`}
              >
                {extractedReceipt.is_verified ? 'VERIFIED' : 'UNVERIFIED'}
              </span>
            </div>

            {/* 7 Required Extraction & Verification Fields */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="border border-neutral-800 p-2.5 bg-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase">Recipient / Merchant</span>
                <span className="font-bold text-white block truncate mt-0.5">
                  {extractedReceipt.merchant_name || 'Not detected'}
                </span>
              </div>
              <div className="border border-neutral-800 p-2.5 bg-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase">Amount</span>
                <span className="font-bold text-white block mt-0.5">
                  {extractedReceipt.amount !== null
                    ? `${extractedReceipt.currency} ${extractedReceipt.amount.toFixed(2)}`
                    : 'Not detected'}
                </span>
              </div>
              <div className="border border-neutral-800 p-2.5 bg-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase">Date & Time</span>
                <span className="text-neutral-200 block truncate mt-0.5">
                  {extractedReceipt.date || 'Not detected'}
                </span>
              </div>
              <div className="border border-neutral-800 p-2.5 bg-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase">Transaction / Ref ID</span>
                <span className="text-neutral-200 block truncate mt-0.5">
                  {extractedReceipt.transaction_reference || 'Not detected'}
                </span>
              </div>
              <div className="border border-neutral-800 p-2.5 bg-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase">Payment Method</span>
                <span className="text-neutral-200 block mt-0.5">
                  {extractedReceipt.payment_method || 'Not detected'}
                </span>
              </div>
              <div className="border border-neutral-800 p-2.5 bg-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase">Receipt Status</span>
                <span className="font-bold text-white block mt-0.5">
                  {extractedReceipt.payment_status || 'Not detected'}
                </span>
              </div>
              <div className="col-span-2 border border-neutral-800 p-2.5 bg-neutral-900">
                <span className="text-[10px] text-neutral-400 block uppercase">Verification Status</span>
                <span className="text-[11px] text-white block mt-0.5">
                  {extractedReceipt.verification_label}
                </span>
              </div>
            </div>

            {/* GPT Summary Explanation & Voice Controls */}
            <div className="border-t border-neutral-900 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                  AI Summary Explanation ({language === 'kn-IN' ? 'Kannada' : 'English'})
                </span>
                <div className="flex items-center gap-2">
                  {receiptVoicePlaying ? (
                    <button
                      type="button"
                      onClick={stopReceiptAudio}
                      className="border border-white bg-white text-black text-[11px] px-2.5 py-1 flex items-center gap-1 font-bold"
                    >
                      <Square className="w-3 h-3 fill-black" />
                      <span>Stop Voice</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={replayReceiptAudio}
                      className="border border-neutral-700 hover:border-white text-neutral-200 hover:text-white text-[11px] px-2.5 py-1 flex items-center gap-1"
                    >
                      {autoplayBlocked ? <Play className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                      <span>{autoplayBlocked ? 'Play Explanation' : 'Replay Voice'}</span>
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-neutral-200 leading-relaxed bg-black p-3 border border-neutral-800">
                {extractedReceipt.summary}
              </p>

              {receiptVoiceError && (
                <div className="text-[11px] text-amber-300 border border-amber-500/40 bg-amber-950/20 p-2">
                  Notice: {receiptVoiceError}
                </div>
              )}
            </div>

            <div className="text-[10px] text-neutral-500 border-t border-neutral-900 pt-2 leading-relaxed">
              Notice: Receipt documents are never treated as verified payment proof without a matching authorized Cashfree gateway transaction confirmed by the backend. No financial transfers or payments are executed from receipt contents.
            </div>
          </div>
        )}

        {receiptError && (
          <div className="border border-red-500 p-2 text-xs text-red-300">
            {receiptError}
          </div>
        )}
      </div>

      {/* Conversation Messages */}
      {messages.length > 0 && (
        <div className="space-y-3 border-t border-neutral-900 pt-4">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
            Recent Conversation
          </div>
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`p-3 border text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'border-neutral-700 bg-neutral-950 text-neutral-200 ml-8'
                    : 'border-white bg-black text-white mr-8'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-1">
                  <span className="uppercase font-bold text-neutral-300">
                    {m.sender === 'user' ? 'You' : 'Paymo'}
                  </span>
                  <span>{m.timestamp}</span>
                </div>
                <div className="whitespace-pre-wrap">{m.content}</div>

                {/* Audio replay button for assistant */}
                {m.sender === 'assistant' && (
                  <div className="mt-2 pt-2 border-t border-neutral-900 flex items-center justify-between">
                    <button
                      onClick={() => {
                        if (playingMsgId === m.id) stopAudio();
                        else playSynthesizedSpeech(m.content, m.id);
                      }}
                      className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1"
                    >
                      {playingMsgId === m.id ? (
                        <>
                          <VolumeX className="w-3 h-3" />
                          <span>Stop audio</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3 h-3" />
                          <span>Listen (Sarvam TTS)</span>
                        </>
                      )}
                    </button>

                    {m.reportText && (
                      <button
                        onClick={() => {
                          const blob = new Blob([m.reportText || ''], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = m.reportFilename || 'Paymo_Report.txt';
                          a.click();
                        }}
                        className="text-[10px] border border-neutral-700 px-2 py-0.5 hover:border-white text-neutral-300"
                      >
                        Download Report
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom: Real-Time Payment Tracking */}
      <div className="border-t border-white pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider">
            Real-Time Payment Tracking
          </h2>
          <button
            onClick={loadDashboardData}
            disabled={loadingStats}
            className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1"
            title="Refresh payment records"
          >
            <RefreshCw className={`w-3 h-3 ${loadingStats ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-white p-3 bg-black">
            <span className="text-[10px] text-neutral-400 uppercase block">
              Total Paid
            </span>
            <div className="text-lg font-bold mt-1">
              ₹{stats.total_verified_amount.toFixed(2)}
            </div>
            <span className="text-[10px] text-neutral-500 mt-0.5 block">
              Verified successful payments only
            </span>
          </div>

          <div className="border border-white p-3 bg-black">
            <span className="text-[10px] text-neutral-400 uppercase block">
              Total Transactions
            </span>
            <div className="text-lg font-bold mt-1">
              {stats.total_payments}
            </div>
            <span className="text-[10px] text-neutral-500 mt-0.5 block">
              Actual initiated orders
            </span>
          </div>

          <div className="border border-white p-3 bg-black">
            <span className="text-[10px] text-neutral-400 uppercase block">
              Pending Payments
            </span>
            <div className="text-lg font-bold mt-1">
              {stats.pending_payments}
            </div>
            <span className="text-[10px] text-neutral-500 mt-0.5 block">
              Awaiting confirmation
            </span>
          </div>
        </div>

        {/* Recent Payment Activity Table */}
        <div className="border border-white bg-black">
          <div className="p-3 border-b border-white flex items-center justify-between text-xs font-bold uppercase">
            <span>Recent Payment Activity</span>
            <button
              onClick={() => navigate('/payments')}
              className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 font-normal"
            >
              <CreditCard className="w-3 h-3" />
              <span>Make a payment</span>
            </button>
          </div>

          {stats.recent_transactions.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-500">
              No payments yet. Make your first payment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-[10px] text-neutral-400 uppercase">
                    <th className="p-2.5 font-normal">Order ID</th>
                    <th className="p-2.5 font-normal">Amount</th>
                    <th className="p-2.5 font-normal">Status</th>
                    <th className="p-2.5 font-normal">Method</th>
                    <th className="p-2.5 font-normal">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-900">
                  {stats.recent_transactions.slice(0, 5).map((txn) => (
                    <tr key={txn.transaction_id} className="hover:bg-neutral-950">
                      <td className="p-2.5 font-semibold text-white">{txn.order_id}</td>
                      <td className="p-2.5 text-neutral-300">
                        {txn.currency} {txn.amount.toFixed(2)}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 border ${
                            txn.payment_status === 'SUCCESS'
                              ? 'border-white text-white font-bold'
                              : txn.payment_status === 'FAILED'
                              ? 'border-red-600 text-red-400'
                              : 'border-neutral-600 text-neutral-400'
                          }`}
                        >
                          {txn.payment_status}
                        </span>
                      </td>
                      <td className="p-2.5 text-neutral-400">{txn.payment_method}</td>
                      <td className="p-2.5 text-neutral-500 text-[10px]">
                        {new Date(txn.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
