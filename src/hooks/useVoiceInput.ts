import { useState, useCallback, useRef } from 'react';
import { AudioRecorder, transcribeAudio, parseVoiceCommand } from '../services/ai/voice-recognition';
import { isAIEnabled } from '../services/ai/openai-client';
import type { Product, VoiceRecognitionResult, VoiceCommandResult } from '../types';

interface UseVoiceInputProps {
  products: Product[];
  context: 'receipt' | 'usage';
}

interface UseVoiceInputReturn {
  isRecording: boolean;
  isProcessing: boolean;
  transcription: string | null;
  commandResult: VoiceCommandResult | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<VoiceRecognitionResult | null>;
  parseCommand: (text: string) => Promise<VoiceCommandResult>;
  reset: () => void;
  isAIAvailable: boolean;
}

export function useVoiceInput({
  products,
  context,
}: UseVoiceInputProps): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [commandResult, setCommandResult] = useState<VoiceCommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscription(null);
    setCommandResult(null);

    try {
      recorderRef.current = new AudioRecorder();
      await recorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'マイクへのアクセスに失敗しました';
      setError(errorMessage);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<VoiceRecognitionResult | null> => {
    if (!recorderRef.current) {
      return null;
    }

    setIsRecording(false);
    setIsProcessing(true);
    setError(null);

    try {
      const audioBlob = await recorderRef.current.stop();

      // Whisper APIで文字起こし
      const result = await transcribeAudio(audioBlob);
      setTranscription(result.transcription);

      // コマンド解析
      const command = await parseVoiceCommand(result.transcription, products, context);
      setCommandResult(command);

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '音声認識に失敗しました';
      setError(errorMessage);
      return null;
    } finally {
      setIsProcessing(false);
      recorderRef.current = null;
    }
  }, [products, context]);

  const parseCommand = useCallback(
    async (text: string): Promise<VoiceCommandResult> => {
      setIsProcessing(true);
      setError(null);

      try {
        const command = await parseVoiceCommand(text, products, context);
        setCommandResult(command);
        return command;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'コマンド解析に失敗しました';
        setError(errorMessage);
        return {
          action: 'unknown',
          interpretation: errorMessage,
        };
      } finally {
        setIsProcessing(false);
      }
    },
    [products, context]
  );

  const reset = useCallback(() => {
    setTranscription(null);
    setCommandResult(null);
    setError(null);
  }, []);

  return {
    isRecording,
    isProcessing,
    transcription,
    commandResult,
    error,
    startRecording,
    stopRecording,
    parseCommand,
    reset,
    isAIAvailable: isAIEnabled(),
  };
}
