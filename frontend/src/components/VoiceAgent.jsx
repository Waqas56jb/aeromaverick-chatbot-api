/**
 * AeroMaverick Voice Agent — Galaxy Widget
 * GPT-4o Realtime via WebRTC + ephemeral token.
 * Cross-platform: iOS Safari ✅  Android Chrome ✅  Desktop ✅
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

const API_BASE       = (import.meta.env.VITE_CHATBOT_API_BASE || 'https://aeromaverick-chatbot-api.vercel.app').trim().replace(/\/$/, '');
const REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';
const BOT_LABEL      = 'AeroMaverick AI';

/* ── Galaxy CSS (self-injected) ─────────────────────────────── */
const GALAXY_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Mono&display=swap');
.va-gl-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;}
.va-gl-backdrop{position:absolute;inset:0;background:rgba(4,2,15,.88);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}
canvas.va-stars{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}
.va-gl-widget{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;gap:0;}
.va-gl-label{font-family:'Space Mono','Courier New',monospace;font-size:10px;letter-spacing:.3em;color:rgba(191,95,255,.65);text-transform:uppercase;margin-bottom:24px;}
.va-gl-orb{position:relative;width:clamp(160px,42vw,220px);height:clamp(160px,42vw,220px);cursor:pointer;animation:vaHue 18s linear infinite;}
canvas.va-galaxy{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;}
.va-glass{position:absolute;inset:0;border-radius:50%;background:radial-gradient(ellipse at 35% 30%,rgba(255,255,255,.18) 0%,rgba(255,255,255,.04) 40%,transparent 70%);box-shadow:inset 0 0 60px rgba(191,95,255,.15),inset 0 0 120px rgba(0,255,231,.08),0 0 80px rgba(191,95,255,.25),0 0 160px rgba(0,207,255,.15);border:1px solid rgba(255,255,255,.12);pointer-events:none;transition:box-shadow .4s ease;}
.va-gl-orb.va-active .va-glass{box-shadow:inset 0 0 60px rgba(191,95,255,.35),inset 0 0 120px rgba(0,255,231,.2),0 0 120px rgba(191,95,255,.55),0 0 240px rgba(0,207,255,.35);}
.va-ring{position:absolute;inset:-18px;border-radius:50%;border:1px solid rgba(191,95,255,.2);animation:vaSpinR 12s linear infinite;pointer-events:none;}
.va-ring::before{content:'';position:absolute;top:-3px;left:50%;width:6px;height:6px;border-radius:50%;background:#bf5fff;box-shadow:0 0 10px #bf5fff,0 0 20px #bf5fff;transform:translateX(-50%);}
.va-ring2{position:absolute;inset:-32px;border-radius:50%;border:1px solid rgba(0,255,231,.12);animation:vaSpinR 20s linear infinite reverse;pointer-events:none;}
.va-ring2::before{content:'';position:absolute;bottom:-3px;left:50%;width:4px;height:4px;border-radius:50%;background:#00ffe7;box-shadow:0 0 8px #00ffe7,0 0 16px #00ffe7;transform:translateX(-50%);}
.va-pulse-ring{position:absolute;inset:-4px;border-radius:50%;border:1.5px solid rgba(0,255,231,0);pointer-events:none;}
.va-gl-orb.va-active .va-pulse-ring{animation:vaPulse 1.8s ease-out infinite;}
.va-gl-orb.va-active .va-pulse-ring:nth-child(2){animation-delay:.6s;}
.va-gl-orb.va-active .va-pulse-ring:nth-child(3){animation-delay:1.2s;}
.va-mic-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:5;}
.va-mic-icon{width:clamp(40px,10vw,52px);height:clamp(40px,10vw,52px);display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(10,5,32,.65);border:1px solid rgba(255,255,255,.15);backdrop-filter:blur(10px);transition:transform .2s ease,background .3s ease;}
.va-gl-orb:hover .va-mic-icon{transform:scale(1.08);}
.va-gl-orb.va-active .va-mic-icon{background:rgba(191,95,255,.22);border-color:rgba(191,95,255,.4);}
.va-mic-icon svg{width:clamp(18px,4vw,22px);height:clamp(18px,4vw,22px);}
.va-wave-bar{margin-top:clamp(28px,7vw,44px);width:clamp(180px,65vw,280px);height:52px;display:flex;align-items:center;justify-content:center;gap:3px;}
.va-bar{width:3px;border-radius:6px;opacity:.85;transition:height .08s ease;}
.va-gl-status{margin-top:14px;font-family:'Space Mono','Courier New',monospace;font-size:11px;letter-spacing:.2em;color:rgba(255,255,255,.35);text-transform:uppercase;min-height:18px;transition:color .4s ease;}
.va-gl-status.va-lit{color:#00ffe7;}
.va-gl-status.va-spk{color:#bf5fff;}
.va-end-btn{margin-top:22px;padding:8px 28px;border-radius:999px;background:rgba(239,68,68,.12);color:rgba(255,180,180,.88);border:1px solid rgba(239,68,68,.28);font-size:12px;letter-spacing:.1em;cursor:pointer;transition:background .2s,border-color .2s;font-family:inherit;}
.va-end-btn:hover{background:rgba(239,68,68,.28);border-color:rgba(239,68,68,.6);}
.va-err-card{background:rgba(10,5,32,.95);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:44px 36px 36px;display:flex;flex-direction:column;align-items:center;gap:16px;z-index:10;position:relative;width:min(340px,88vw);}
.va-err-icon{font-size:44px;line-height:1;}
.va-err-text{font-size:14px;line-height:1.65;color:rgba(255,255,255,.7);text-align:center;white-space:pre-line;max-width:280px;margin:0;}
@keyframes vaPulse{0%{inset:-4px;border-color:rgba(0,255,231,.5);}100%{inset:-50px;border-color:rgba(0,255,231,0);}}
@keyframes vaSpinR{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes vaHue{0%{filter:hue-rotate(0deg);}100%{filter:hue-rotate(360deg);}}
@media(max-width:480px){.va-ring{inset:-10px;}.va-ring2{inset:-20px;}.va-gl-label{margin-bottom:14px;}.va-wave-bar{gap:2px;}.va-bar{width:2.5px;}.va-end-btn{margin-top:16px;}}
`;

function micErrorMsg(err) {
  const n = err?.name || '';
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError')
    return { icon: '🎙️', text: 'Microphone access was denied.\nTap the 🔒 icon in your browser address bar → Allow Microphone, then try again.' };
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError')
    return { icon: '🔇', text: 'No microphone found on this device. Connect a microphone and try again.' };
  if (n === 'NotReadableError' || n === 'TrackStartError')
    return { icon: '⚠️', text: 'Microphone is in use by another app. Close it and try again.' };
  return { icon: '⚠️', text: 'Could not access microphone. Please check browser permissions.' };
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

function createAudioEl() {
  const el = document.createElement('audio');
  el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', '');
  el.autoplay = false; el.controls = false; el.muted = false;
  document.body.appendChild(el); return el;
}

export function VoiceAgent({ onClose }) {
  const [status, setStatus] = useState('connecting');
  const [errInfo, setErr]   = useState(null);
  const pcRef = useRef(null), dcRef = useRef(null), audioElRef = useRef(null);
  const streamRef = useRef(null), transcriptRef = useRef([]), aiTextBuf = useRef('');
  const starCanvasRef = useRef(null), galaxyCanvasRef = useRef(null);
  const barsRef = useRef([]), animRef = useRef(null), energyRef = useRef(0);
  const particlesRef = useRef([]), statusRef = useRef('connecting');

  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    if (document.getElementById('va-galaxy-css')) return;
    const s = document.createElement('style'); s.id = 'va-galaxy-css'; s.textContent = GALAXY_CSS;
    document.head.appendChild(s);
    return () => { const el = document.getElementById('va-galaxy-css'); if (el) el.remove(); };
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    try { dcRef.current?.close(); } catch (_) {}
    try { pcRef.current?.close(); } catch (_) {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (audioElRef.current) { audioElRef.current.srcObject = null; audioElRef.current.remove(); audioElRef.current = null; }
    onClose([...transcriptRef.current]);
  }, [onClose]);

  const handleEvent = useCallback((ev) => {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started':  setStatus('listening'); break;
      case 'input_audio_buffer.speech_stopped':  setStatus('speaking');  break;
      case 'response.created':                   setStatus('speaking'); aiTextBuf.current = ''; break;
      case 'response.audio_transcript.delta':    aiTextBuf.current += ev.delta || ''; break;
      case 'response.audio_transcript.done':
        if (aiTextBuf.current.trim()) transcriptRef.current.push({ role: 'assistant', text: aiTextBuf.current.trim() });
        aiTextBuf.current = ''; setStatus('ready'); break;
      case 'conversation.item.input_audio_transcription.completed':
        if (ev.transcript?.trim()) transcriptRef.current.push({ role: 'user', text: ev.transcript.trim() }); break;
      case 'error':
        console.error('[VoiceAgent]', ev.error); setStatus('error');
        setErr({ icon: '⚠️', text: ev.error?.message || 'An error occurred.' }); break;
      default: break;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Object.assign(new Error(), { friendly: { icon: '🌐', text: 'Voice is not supported in this browser.\nPlease use Chrome or Safari.' } });
        if (!window.RTCPeerConnection)
          throw Object.assign(new Error(), { friendly: { icon: '🌐', text: 'WebRTC not supported. Please update your browser.' } });
        const tokenRes = await fetch(`${API_BASE}/api/realtime-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (!tokenRes.ok) {
          const body = await tokenRes.text().catch(() => '');
          throw Object.assign(new Error(), { friendly: { icon: '🔌', text: `Voice server error (${tokenRes.status}).\nMake sure the backend is running.\n${body.slice(0, 100)}` } });
        }
        const { token } = await tokenRes.json();
        if (cancelled) return;
        let stream;
        try { stream = await getMicrophone(); }
        catch (micErr) { setStatus('denied'); setErr(micErrorMsg(micErr)); return; }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
        pcRef.current = pc;
        const audioEl = createAudioEl(); audioElRef.current = audioEl;
        pc.ontrack = async (e) => {
          if (audioEl.srcObject !== e.streams[0]) { audioEl.srcObject = e.streams[0]; try { await audioEl.play(); } catch (pe) { console.warn('[VoiceAgent] play:', pe.message); } }
        };
        stream.getAudioTracks().forEach(t => pc.addTrack(t, stream));
        const dc = pc.createDataChannel('oai-events'); dcRef.current = dc;
        dc.onopen    = () => { if (!cancelled) { setStatus('speaking'); dc.send(JSON.stringify({ type: 'response.create' })); } };
        dc.onmessage = (e) => { if (!cancelled) try { handleEvent(JSON.parse(e.data)); } catch (_) {} };
        dc.onerror   = () => { if (!cancelled) { setStatus('error'); setErr({ icon: '⚠️', text: 'Voice connection lost. Please end and try again.' }); } };
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' }, body: offer.sdp
        });
        if (!sdpRes.ok) throw Object.assign(new Error(), { friendly: { icon: '⚠️', text: `Connection refused by AI server. (${sdpRes.status})` } });
        await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });
      } catch (err) {
        if (cancelled) return;
        console.error('[VoiceAgent]', err);
        setStatus('error'); setErr(err.friendly || { icon: '⚠️', text: err.message || 'Could not start voice session.' });
      }
    }
    init();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  const overlayActive = !['connecting', 'error', 'denied'].includes(status);

  useEffect(() => {
    if (!overlayActive) return;
    const starCanvas = starCanvasRef.current, galaxyCanvas = galaxyCanvasRef.current;
    if (!starCanvas || !galaxyCanvas) return;
    const sCtx = starCanvas.getContext('2d'), gCtx = galaxyCanvas.getContext('2d');
    galaxyCanvas.width = 220; galaxyCanvas.height = 220;
    const CX = 110, CY = 110, R = 108;
    const resize = () => { starCanvas.width = window.innerWidth; starCanvas.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const stars = Array.from({ length: 180 }, () => ({
      x: Math.random() * starCanvas.width, y: Math.random() * starCanvas.height,
      r: Math.random() * 1.2 + 0.2, a: Math.random(), speed: Math.random() * 0.003 + 0.001, phase: Math.random() * Math.PI * 2
    }));
    particlesRef.current = Array.from({ length: 420 }, () => {
      const angle = Math.random() * Math.PI * 2, radius = Math.pow(Math.random(), 0.5) * R * 0.85;
      const speed = (0.0004 + Math.random() * 0.0008) * (Math.random() > 0.5 ? 1 : -1);
      return { angle, baseRadius: radius, radius, speed, hue: Math.random()*80+260, layer: Math.floor(Math.random()*3),
               size: Math.random()*2+0.5, alpha: Math.random()*0.7+0.3, wavePhase: Math.random()*Math.PI*2, waveAmp: Math.random()*12+3 };
    });
    function drawStars(t) {
      sCtx.clearRect(0,0,starCanvas.width,starCanvas.height);
      stars.forEach(s => { s.a=0.3+0.7*Math.abs(Math.sin(t*s.speed+s.phase)); sCtx.beginPath(); sCtx.arc(s.x,s.y,s.r,0,Math.PI*2); sCtx.fillStyle=`rgba(255,255,255,${s.a.toFixed(2)})`; sCtx.fill(); });
    }
    function drawGalaxy(energy, time) {
      gCtx.clearRect(0,0,220,220); const hs=(time*0.3)%360;
      const bg=gCtx.createRadialGradient(CX,CY,0,CX,CY,R);
      bg.addColorStop(0,`hsla(${260+hs*.1},80%,8%,.95)`); bg.addColorStop(0.4,`hsla(${280+hs*.15},70%,5%,.9)`); bg.addColorStop(1,`hsla(${300+hs*.08},60%,2%,.85)`);
      gCtx.save(); gCtx.beginPath(); gCtx.arc(CX,CY,R,0,Math.PI*2); gCtx.fillStyle=bg; gCtx.fill(); gCtx.restore();
      for(let i=0;i<3;i++){const a=time*0.0005+i*2.1,nx=CX+Math.cos(a)*35,ny=CY+Math.sin(a)*25,ng=gCtx.createRadialGradient(nx,ny,0,nx,ny,55),nh=(170+i*80+hs*.5)%360;ng.addColorStop(0,`hsla(${nh},90%,55%,${0.06+energy*0.08})`);ng.addColorStop(1,`hsla(${nh},80%,40%,0)`);gCtx.save();gCtx.beginPath();gCtx.arc(CX,CY,R,0,Math.PI*2);gCtx.clip();gCtx.fillStyle=ng;gCtx.fillRect(0,0,220,220);gCtx.restore();}
      particlesRef.current.forEach(p=>{p.angle+=p.speed*(1+energy*2.5);p.radius=p.baseRadius+p.waveAmp*Math.sin(time*0.002+p.wavePhase)*energy;const x=CX+Math.cos(p.angle)*p.radius,y=CY+Math.sin(p.angle)*p.radius*0.55,dist=Math.sqrt((x-CX)**2+(y-CY)**2);if(dist>R)return;const ph=(p.hue+hs*.8+time*.05)%360,al=p.alpha*(1-dist/R*0.4)*(0.6+energy*0.4),sz=p.size*(1+energy*1.2);gCtx.save();gCtx.globalCompositeOperation=p.layer===1?'lighter':'screen';gCtx.beginPath();gCtx.arc(x,y,sz,0,Math.PI*2);gCtx.fillStyle=`hsla(${ph},90%,70%,${al.toFixed(2)})`;gCtx.fill();if(p.size>1.5){const glow=gCtx.createRadialGradient(x,y,0,x,y,sz*3.5);glow.addColorStop(0,`hsla(${ph},100%,80%,${(al*0.4).toFixed(2)})`);glow.addColorStop(1,`hsla(${ph},90%,60%,0)`);gCtx.fillStyle=glow;gCtx.beginPath();gCtx.arc(x,y,sz*3.5,0,Math.PI*2);gCtx.fill();}gCtx.restore();});
      const ch=(180+hs)%360,core=gCtx.createRadialGradient(CX,CY,0,CX,CY,30+energy*20);core.addColorStop(0,`hsla(${ch},100%,90%,${0.3+energy*0.5})`);core.addColorStop(0.5,`hsla(${(ch+40)%360},90%,70%,${0.1+energy*0.2})`);core.addColorStop(1,`hsla(${(ch+80)%360},80%,50%,0)`);gCtx.save();gCtx.globalCompositeOperation='screen';gCtx.fillStyle=core;gCtx.beginPath();gCtx.arc(CX,CY,30+energy*20,0,Math.PI*2);gCtx.fill();gCtx.restore();
    }
    function loop(t) {
      const st=statusRef.current,isAct=st==='listening'||st==='ready'||st==='speaking';
      const tgt=isAct?0.55+Math.sin(t*0.004)*0.45:0.1; energyRef.current+=(tgt-energyRef.current)*0.06;
      drawStars(t); drawGalaxy(energyRef.current,t);
      barsRef.current.forEach((b,i)=>{if(!b)return;const base=Math.sin(t*0.003+i*0.35)*0.5+0.5,wave2=Math.sin(t*0.005+i*0.6)*0.3+0.3;const h=isAct?4+(base*wave2+Math.random()*0.3)*44:4+base*10;b.style.height=Math.round(h)+'px';b.style.opacity=String(0.4+(h/48)*0.6);});
      animRef.current=requestAnimationFrame(loop);
    }
    animRef.current=requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize',resize); };
  }, [overlayActive]); // eslint-disable-line

  const isOrbActive = ['listening','ready','speaking'].includes(status);
  const statusCls = status==='listening'?'va-gl-status va-lit':status==='speaking'?'va-gl-status va-spk':'va-gl-status';
  const statusTxt = status==='listening'?'listening...':status==='speaking'?'neural response...':status==='ready'?'tap to speak':'';

  if (status==='connecting') return createPortal(
    <div className="va-gl-overlay"><div className="va-gl-backdrop"/><div className="va-loader-dots" aria-hidden><span/><span/><span/></div></div>, document.body);

  if ((status==='error'||status==='denied')&&errInfo) return createPortal(
    <div className="va-gl-overlay" role="alertdialog" aria-modal="true"><div className="va-gl-backdrop"/>
      <div className="va-err-card"><span className="va-err-icon">{errInfo.icon}</span><p className="va-err-text">{errInfo.text}</p><button type="button" className="va-end-btn" onClick={stop}>Close</button></div>
    </div>, document.body);

  return createPortal(
    <div className="va-gl-overlay" role="dialog" aria-modal="true">
      <div className="va-gl-backdrop"/>
      <canvas className="va-stars" ref={starCanvasRef} aria-hidden/>
      <div className="va-gl-widget">
        <div className="va-gl-label">{BOT_LABEL}</div>
        <div className={`va-gl-orb${isOrbActive?' va-active':''}`} onClick={stop} title="Click to end session">
          <canvas className="va-galaxy" ref={galaxyCanvasRef} aria-hidden/>
          <div className="va-pulse-ring" aria-hidden/><div className="va-pulse-ring" aria-hidden/><div className="va-pulse-ring" aria-hidden/>
          <div className="va-glass" aria-hidden/><div className="va-ring" aria-hidden/><div className="va-ring2" aria-hidden/>
          <div className="va-mic-center" aria-hidden><div className="va-mic-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/>
            </svg>
          </div></div>
        </div>
        <div className="va-wave-bar" aria-hidden>
          {Array.from({length:48},(_,i)=>{const hue=170+(i/48)*100;return(<div key={i} className="va-bar" style={{height:'4px',background:`linear-gradient(to top,hsl(${hue+80},90%,60%),hsl(${hue},100%,70%))`}} ref={el=>{barsRef.current[i]=el;}}/>);})}
        </div>
        <div className={statusCls} role="status" aria-live="polite">{statusTxt}</div>
        <button type="button" className="va-end-btn" onClick={stop}>■ End Session</button>
      </div>
    </div>, document.body);
}
