/**
 * AeroMaverick Voice Agent — GPT-4o Realtime via WebRTC + ephemeral token.
 * Cross-platform: iOS Safari ✅  Android Chrome ✅  Desktop ✅
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

const API_BASE = (import.meta.env.VITE_CHATBOT_API_BASE || 'https://aeromaverick-chatbot-api.vercel.app').trim().replace(/\/$/, '');
const REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

function micErrorMsg(err) {
  const n = err?.name || '';
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError')
    return { icon: '🎙️', text: 'Microphone access was denied.\nTap the 🔒 icon in your browser address bar → Site Settings → Allow Microphone, then try again.' };
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError')
    return { icon: '🔇', text: 'No microphone found on this device. Connect a microphone and try again.' };
  if (n === 'NotReadableError' || n === 'TrackStartError')
    return { icon: '⚠️', text: 'Microphone is being used by another app. Close it and try again.' };
  return { icon: '⚠️', text: 'Could not access microphone. Please check browser permissions and try again.' };
}

async function getMicrophone() {
  const ideal = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: { ideal: 24000 }, channelCount: 1 } };
  try { return await navigator.mediaDevices.getUserMedia(ideal); }
  catch (err) {
    if (err.name === 'OverconstrainedError' || err.name === 'TypeError')
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    throw err;
  }
}

function createAudioElement() {
  const el = document.createElement('audio');
  el.setAttribute('playsinline', '');
  el.setAttribute('webkit-playsinline', '');
  el.autoplay = false; el.controls = false; el.muted = false;
  document.body.appendChild(el);
  return el;
}

export function VoiceAgent({ onClose }) {
  const [status, setStatus] = useState('connecting');
  const [errInfo, setErr] = useState(null);
  const pcRef = useRef(null); const dcRef = useRef(null);
  const audioElRef = useRef(null); const streamRef = useRef(null);
  const transcriptRef = useRef([]); const aiTextBuf = useRef('');

  const stop = useCallback(() => {
    try { dcRef.current?.close(); } catch (_) {}
    try { pcRef.current?.close(); } catch (_) {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (audioElRef.current) { audioElRef.current.srcObject = null; audioElRef.current.remove(); audioElRef.current = null; }
    onClose([...transcriptRef.current]);
  }, [onClose]);

  const handleEvent = useCallback((ev) => {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started': setStatus('listening'); break;
      case 'input_audio_buffer.speech_stopped': setStatus('speaking'); break;
      case 'response.created': setStatus('speaking'); aiTextBuf.current = ''; break;
      case 'response.audio_transcript.delta': aiTextBuf.current += ev.delta || ''; break;
      case 'response.audio_transcript.done':
        if (aiTextBuf.current.trim()) transcriptRef.current.push({ role: 'assistant', text: aiTextBuf.current.trim() });
        aiTextBuf.current = ''; setStatus('ready'); break;
      case 'conversation.item.input_audio_transcription.completed':
        if (ev.transcript?.trim()) transcriptRef.current.push({ role: 'user', text: ev.transcript.trim() }); break;
      case 'error': console.error('[VoiceAgent]', ev.error); setStatus('error'); setErr({ icon: '⚠️', text: ev.error?.message || 'An error occurred.' }); break;
      default: break;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('not-supported'), { friendly: { icon: '🌐', text: 'Voice is not supported in this browser. Please use Chrome or Safari.' } });
        if (!window.RTCPeerConnection) throw Object.assign(new Error('no-webrtc'), { friendly: { icon: '🌐', text: 'This browser does not support WebRTC. Please update your browser.' } });
        const tokenRes = await fetch(`${API_BASE}/api/realtime-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (!tokenRes.ok) { const errBody = await tokenRes.text().catch(() => ''); throw Object.assign(new Error('voice-server'), { friendly: { icon: '🔌', text: 'Voice server returned an error (' + tokenRes.status + '). Make sure the backend is running and OPENAI_API_KEY is set.\n\n' + (errBody.slice(0,120) || '') } }); }
        const { token } = await tokenRes.json();
        if (cancelled) return;
        let stream;
        try { stream = await getMicrophone(); }
        catch (micErr) { setStatus('denied'); setErr(micErrorMsg(micErr)); return; }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
        pcRef.current = pc;
        const audioEl = createAudioElement(); audioElRef.current = audioEl;
        pc.ontrack = async (e) => {
          if (audioEl.srcObject !== e.streams[0]) {
            audioEl.srcObject = e.streams[0];
            try { await audioEl.play(); } catch (playErr) { console.warn('[VoiceAgent] audio.play():', playErr.message); }
          }
        };
        stream.getAudioTracks().forEach(t => pc.addTrack(t, stream));
        const dc = pc.createDataChannel('oai-events'); dcRef.current = dc;
        dc.onopen = () => { if (cancelled) return; setStatus('speaking'); dc.send(JSON.stringify({ type: 'response.create' })); };
        dc.onmessage = (e) => { if (cancelled) return; try { handleEvent(JSON.parse(e.data)); } catch (_) {} };
        dc.onerror = () => { if (!cancelled) { setStatus('error'); setErr({ icon: '⚠️', text: 'Voice connection lost. Please end and try again.' }); } };
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' }, body: offer.sdp });
        if (!sdpRes.ok) throw Object.assign(new Error('sdp-failed'), { friendly: { icon: '⚠️', text: `Connection refused by AI server. (${sdpRes.status})` } });
        await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });
      } catch (err) {
        if (cancelled) return;
        console.error('[VoiceAgent] init:', err);
        setStatus('error'); setErr(err.friendly || { icon: '⚠️', text: err.message || 'Could not start voice session.' });
      }
    }
    init();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isListening = status === 'listening' || status === 'ready';
  const isSpeaking = status === 'speaking';
  const isErr = status === 'error' || status === 'denied';
  const subtitle = isSpeaking ? 'AeroMaverick AI is speaking…' : isErr ? '' : 'Speak naturally — I\'m listening';

  if (status === 'connecting') return createPortal(
    <div className="va-loader-overlay" aria-busy="true"><div className="va-loader-dots" aria-hidden><span /><span /><span /></div></div>, document.body);

  if (isErr && errInfo) return createPortal(
    <div className="voice-overlay" role="alertdialog" aria-modal="true">
      <div className="voice-overlay__backdrop" />
      <div className="voice-overlay__card va-error-card">
        <span className="va-error-icon" aria-hidden>{errInfo.icon}</span>
        <p className="va-error-text">{errInfo.text}</p>
        <button type="button" className="voice-overlay__stop-btn" onClick={stop}>Close</button>
      </div>
    </div>, document.body);

  return createPortal(
    <div className="voice-overlay" role="dialog" aria-modal="true" aria-label="Voice agent active">
      <div className="voice-overlay__backdrop" />
      <div className="voice-overlay__card">
        <div className={`vor-status vor-status--${status}`} role="status" aria-live="polite">
          <span className="vor-status__dot" aria-hidden /><span className="vor-status__label">{isSpeaking ? 'Speaking…' : 'Listening…'}</span>
        </div>
        <p className="voice-overlay__sub">{subtitle}</p>
        <div className="voice-overlay__rings-wrap" aria-hidden>
          {isListening && (<><span className="vor-ring vor-ring--1" /><span className="vor-ring vor-ring--2" /><span className="vor-ring vor-ring--3" /><span className="vor-ring vor-ring--4" /></>)}
          <div className={`voice-overlay__mic-circle${isSpeaking ? ' vmc--speaking' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" className="voice-overlay__mic-svg" aria-hidden>
              <rect x="9" y="2" width="6" height="12" rx="3" fill="white" />
              <path d="M5 11a7 7 0 0 0 14 0" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <line x1="12" y1="18" x2="12" y2="22" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <line x1="9" y1="22" x2="15" y2="22" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        {isSpeaking && (<div className="voice-overlay__wave" aria-hidden>{[1,2,3,4,5,6,7].map(i => <span key={i} className={`vow-bar vow-bar--${i}`} />)}</div>)}
        <button type="button" className="voice-overlay__stop-btn" onClick={stop} aria-label="End voice session">
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
          End Session
        </button>
      </div>
    </div>, document.body);
}
