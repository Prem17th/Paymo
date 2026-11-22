import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { usePaymo } from '../context/PaymoContext';
import { api } from '../lib/api';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  languageCode?: string;
  disabled?: boolean;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  onTranscript,
  languageCode = 'en-IN',
  disabled = false
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const { showToast } = usePaymo();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    if (disabled || isTranscribing) return;

    audioChunksRef.current = [];
    setRecordSeconds(0);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Microphone recording is not supported in this browser.', 'warn');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all audio tracks to release microphone hardware immediately
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/wav'
        });

        if (audioBlob.size === 0) {
          showToast('No audio data captured.', 'warn');
          return;
        }

        setIsTranscribing(true);
        try {
          const res = await api.transcribeAudio(audioBlob, languageCode);
          if (res.transcript && res.transcript.trim()) {
            onTranscript(res.transcript.trim());
            showToast(`Sarvam STT transcribed (${res.language_code}): "${res.transcript.trim()}"`, 'info');
          } else {
            showToast('No speech was detected in the recording.', 'warn');
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Transcription failed';
          if (errMsg.includes('503') || errMsg.includes('not configured')) {
            showToast('[SARVAM STT NOT CONFIGURED] Backend SARVAM_API_KEY required. Text chat remains fully functional.', 'warn');
          } else {
            showToast(`Sarvam STT Error: ${errMsg}`, 'warn');
          }
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start(250); // Slice every 250ms
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev >= 30) {
            // Automatically stop at 30 seconds limit
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);

      showToast('Recording audio... Speak clearly in your selected language.', 'info');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Access denied';
      showToast(`[MIC ACCESS BLOCKED] ${errMsg}. Please type your query in the text box.`, 'warn');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={toggleRecording}
        disabled={disabled || isTranscribing}
        title={
          isTranscribing
            ? 'Transcribing audio via Sarvam STT...'
            : isRecording
            ? 'Click to stop recording'
            : 'Click to record speech via Sarvam STT'
        }
        className={`h-12 w-12 border flex items-center justify-center transition-colors focus:outline-none ${
          isTranscribing
            ? 'bg-neutral-900 border-neutral-600 text-neutral-400 cursor-wait'
            : isRecording
            ? 'bg-white text-black border-white animate-pulse'
            : 'bg-black text-white border-white hover:bg-neutral-900'
        } ${disabled ? 'border-neutral-800 text-neutral-600 cursor-not-allowed' : ''}`}
      >
        {isTranscribing ? (
          <Loader2 className="w-5 h-5 animate-spin text-white" />
        ) : isRecording ? (
          <Square className="w-4 h-4 fill-black" />
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </button>

      <span className="text-[10px] font-mono text-neutral-400 mt-1 uppercase tracking-wider text-center">
        {isTranscribing
          ? '[TRANSCRIBING]'
          : isRecording
          ? `[REC ${recordSeconds}s]`
          : '[MIC]'}
      </span>
    </div>
  );
};
