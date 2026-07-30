/*! AeroMaverick Chat Widget — WordPress / any website embed
 * Usage:
 *   <script src="https://aeromaverick-chatbot-api-oi1s.vercel.app/widget.js" async></script>
 * Optional config before the script:
 *   <script>window.AEROMAVERICK_WIDGET={ position:'right', apiBase:'https://aeromaverick-chatbot-api.vercel.app' };</script>
 */
(function () {
  if (window.__aeromaverick_widget_loaded) return;
  window.__aeromaverick_widget_loaded = true;

  var CFG = Object.assign({
    apiBase: "https://aeromaverick-chatbot-api.vercel.app",
    frontendUrl: "https://aeromaverick-chatbot-api-oi1s.vercel.app",
    brand: "AeroMaverick",
    botName: "AeroMaverick AI",
    tagline: "Aviation marketplace concierge",
    domain: "aeromaverick.com",
    greeting: "Welcome to AeroMaverick! I can help with aircraft, financing, charter, auctions, and engine stands. What are you looking for?",
    position: 'right',
    mode: "messages",
    offsetX: 22,
    offsetY: 22
  }, window.AEROMAVERICK_WIDGET || {});

  var ID = "aeromaverick";
  var sessionKey = ID + '_widget_session';
  var sessionId = localStorage.getItem(sessionKey);
  if (!sessionId) {
    sessionId = 'w_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(sessionKey, sessionId);
  }
  var history = [];
  var busy = false;

  var style = document.createElement('style');
  style.textContent = ".aeromaverick-root{all:initial;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}\n.aeromaverick-root *{box-sizing:border-box}\n.aeromaverick-fab{position:fixed;z-index:2147483000;width:64px;height:64px;border-radius:50%;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 40px rgba(0,0,0,.28),0 0 0 1px rgba(255,255,255,.12) inset;background:linear-gradient(145deg,#2563eb,#0ea5e9);color:#fff;transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s}\n.aeromaverick-fab:hover{transform:scale(1.06);box-shadow:0 16px 48px rgba(0,0,0,.35)}\n.aeromaverick-fab svg{width:28px;height:28px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}\n.aeromaverick-fab.aeromaverick-open{transform:rotate(45deg)}\n.aeromaverick-panel{position:fixed;z-index:2147483001;width:min(400px,calc(100vw - 24px));height:min(640px,calc(100vh - 110px));border-radius:22px;overflow:hidden;display:flex;flex-direction:column;background:#fff;box-shadow:0 25px 80px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.06);opacity:0;pointer-events:none;transform:translateY(18px) scale(.96);transition:opacity .28s ease,transform .28s cubic-bezier(.2,.8,.2,1)}\n.aeromaverick-panel.aeromaverick-show{opacity:1;pointer-events:auto;transform:translateY(0) scale(1)}\n.aeromaverick-head{background:linear-gradient(135deg,#0f2744 0%,#2563eb 70%,#0ea5e9 140%);color:#fff;padding:16px 16px 14px;display:flex;align-items:center;gap:12px;flex-shrink:0}\n.aeromaverick-avatar{width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;letter-spacing:.04em;border:1px solid rgba(255,255,255,.25)}\n.aeromaverick-head h3{margin:0;font-size:15px;font-weight:700;letter-spacing:.01em}\n.aeromaverick-head p{margin:2px 0 0;font-size:11px;opacity:.85}\n.aeromaverick-online{display:inline-flex;align-items:center;gap:5px;font-size:10px;margin-top:4px;opacity:.9}\n.aeromaverick-online i{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 8px #4ade80;display:inline-block}\n.aeromaverick-head-actions{margin-left:auto;display:flex;gap:6px}\n.aeromaverick-iconbtn{width:32px;height:32px;border:0;border-radius:10px;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}\n.aeromaverick-iconbtn:hover{background:rgba(255,255,255,.22)}\n.aeromaverick-msgs{flex:1;overflow-y:auto;padding:16px;background:linear-gradient(180deg,#f7f9fc 0%,#eef2f7 100%);display:flex;flex-direction:column;gap:10px}\n.aeromaverick-bubble{max-width:86%;padding:10px 13px;border-radius:16px;font-size:13.5px;line-height:1.45;word-wrap:break-word;white-space:pre-wrap}\n.aeromaverick-bubble a{color:#2563eb;text-decoration:underline}\n.aeromaverick-bot{align-self:flex-start;background:#fff;color:#1e293b;border:1px solid rgba(15,23,42,.06);border-bottom-left-radius:5px;box-shadow:0 2px 8px rgba(15,23,42,.04)}\n.aeromaverick-user{align-self:flex-end;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;border-bottom-right-radius:5px}\n.aeromaverick-typing{align-self:flex-start;background:#fff;border:1px solid rgba(15,23,42,.06);padding:12px 16px;border-radius:16px;display:none;gap:4px}\n.aeromaverick-typing.aeromaverick-on{display:inline-flex}\n.aeromaverick-typing span{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:aeromaverick-dot 1.2s infinite ease-in-out}\n.aeromaverick-typing span:nth-child(2){animation-delay:.15s}\n.aeromaverick-typing span:nth-child(3){animation-delay:.3s}\n@keyframes aeromaverick-dot{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}\n.aeromaverick-foot{padding:12px;background:#fff;border-top:1px solid rgba(15,23,42,.06);flex-shrink:0}\n.aeromaverick-form{display:flex;gap:8px;align-items:flex-end}\n.aeromaverick-input{flex:1;resize:none;min-height:42px;max-height:110px;border:1px solid rgba(15,23,42,.1);border-radius:14px;padding:10px 12px;font:inherit;font-size:13.5px;outline:none;background:#f8fafc;color:#0f172a}\n.aeromaverick-input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(0,0,0,.08)}\n.aeromaverick-send{width:42px;height:42px;border:0;border-radius:14px;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}\n.aeromaverick-send:disabled{opacity:.5;cursor:not-allowed}\n.aeromaverick-powered{margin-top:8px;text-align:center;font-size:10px;color:#94a3b8}\n.aeromaverick-powered a{color:#2563eb;text-decoration:none;font-weight:600}\n@media (max-width:480px){.aeromaverick-panel{width:calc(100vw - 16px);height:calc(100vh - 90px);border-radius:18px}}";
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.className = ID + '-root';
  root.setAttribute('data-brand', CFG.brand);

  var side = (CFG.position === 'left') ? 'left' : 'right';
  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = ID + '-fab';
  fab.setAttribute('aria-label', 'Open ' + CFG.botName + ' chat');
  fab.style[side] = (CFG.offsetX || 22) + 'px';
  fab.style.bottom = (CFG.offsetY || 22) + 'px';
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var panel = document.createElement('div');
  panel.className = ID + '-panel';
  panel.style[side] = (CFG.offsetX || 22) + 'px';
  panel.style.bottom = ((CFG.offsetY || 22) + 76) + 'px';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', CFG.botName);

  var initials = CFG.botName.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();

  panel.innerHTML =
    '<div class="' + ID + '-head">' +
      '<div class="' + ID + '-avatar">' + initials + '</div>' +
      '<div style="min-width:0">' +
        '<h3>' + escapeHtml(CFG.botName) + '</h3>' +
        '<p>' + escapeHtml(CFG.tagline) + '</p>' +
        '<div class="' + ID + '-online"><i></i> Online now</div>' +
      '</div>' +
      '<div class="' + ID + '-head-actions">' +
        '<button type="button" class="' + ID + '-iconbtn" data-act="expand" title="Open full chat" aria-label="Open full chat">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
        '</button>' +
        '<button type="button" class="' + ID + '-iconbtn" data-act="close" title="Close" aria-label="Close">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>' +
    '<div class="' + ID + '-msgs" data-msgs></div>' +
    '<div class="' + ID + '-foot">' +
      '<form class="' + ID + '-form" data-form>' +
        '<textarea class="' + ID + '-input" data-input rows="1" placeholder="Type your message…" aria-label="Message"></textarea>' +
        '<button type="submit" class="' + ID + '-send" data-send aria-label="Send">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
      '</form>' +
      '<div class="' + ID + '-powered">Powered by <a href="https://' + escapeHtml(CFG.domain) + '" target="_blank" rel="noopener">' + escapeHtml(CFG.brand) + '</a></div>' +
    '</div>';

  root.appendChild(panel);
  root.appendChild(fab);

  function mount() {
    if (!document.body) return setTimeout(mount, 20);
    document.body.appendChild(root);
  }
  mount();

  var msgsEl = panel.querySelector('[data-msgs]');
  var form = panel.querySelector('[data-form]');
  var input = panel.querySelector('[data-input]');
  var sendBtn = panel.querySelector('[data-send]');
  var typing = document.createElement('div');
  typing.className = ID + '-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  msgsEl.appendChild(typing);

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatText(text) {
    var t = escapeHtml(text);
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return t;
  }

  function addBubble(role, text) {
    var div = document.createElement('div');
    div.className = ID + '-bubble ' + (role === 'user' ? ID + '-user' : ID + '-bot');
    div.innerHTML = formatText(text);
    msgsEl.insertBefore(div, typing);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function setOpen(open) {
    if (open) {
      panel.classList.add(ID + '-show');
      fab.classList.add(ID + '-open');
      fab.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      setTimeout(function () { input.focus(); }, 220);
    } else {
      panel.classList.remove(ID + '-show');
      fab.classList.remove(ID + '-open');
      fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }
  }

  var openedOnce = false;
  fab.addEventListener('click', function () {
    var willOpen = !panel.classList.contains(ID + '-show');
    setOpen(willOpen);
    if (willOpen && !openedOnce) {
      openedOnce = true;
      addBubble('bot', CFG.greeting);
    }
  });

  panel.querySelector('[data-act="close"]').addEventListener('click', function () { setOpen(false); });
  panel.querySelector('[data-act="expand"]').addEventListener('click', function () {
    window.open(CFG.frontendUrl, '_blank', 'noopener');
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  });
  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  });

  async function sendChat(userText) {
    var base = String(CFG.apiBase || '').replace(/\/$/, '');
    var url = base + '/api/chat';
    var body;
    if (CFG.mode === 'medisaver') {
      body = {
        message: userText,
        sessionId: sessionId,
        conversationHistory: history.slice(-10),
        leadInfo: {}
      };
    } else {
      body = {
        messages: history.map(function (m) { return { role: m.role, content: m.content }; }),
        sessionId: sessionId
      };
    }
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    if (CFG.mode === 'medisaver') return data.response || data.reply || 'Sorry, I could not respond right now.';
    return data.reply || data.response || 'Sorry, I could not respond right now.';
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var text = (input.value || '').trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';
    addBubble('user', text);
    history.push({ role: 'user', content: text });
    typing.classList.add(ID + '-on');
    msgsEl.scrollTop = msgsEl.scrollHeight;
    try {
      var reply = await sendChat(text);
      history.push({ role: 'assistant', content: reply });
      typing.classList.remove(ID + '-on');
      addBubble('bot', reply);
    } catch (err) {
      typing.classList.remove(ID + '-on');
      addBubble('bot', 'Connection issue. Please try again, or visit https://' + CFG.domain);
      console.error(CFG.brand + ' widget error:', err);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  });

  window["AeroMaverickChatWidget"] = {
    open: function () { setOpen(true); if (!openedOnce) { openedOnce = true; addBubble('bot', CFG.greeting); } },
    close: function () { setOpen(false); },
    config: CFG
  };
})();
