import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, parseErrorResponse } from "../utils/api.js";
import { Header } from "./Header.jsx";
import { QuickPrompts } from "./QuickPrompts.jsx";
import { WelcomePanel } from "./WelcomePanel.jsx";
import { MessageBubble } from "./MessageBubble.jsx";
import { TypingIndicator } from "./TypingIndicator.jsx";
import { InputArea } from "./InputArea.jsx";
import { ErrorToast } from "./ErrorToast.jsx";

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatApp() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sendDisabled, setSendDisabled] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const messagesRef = useRef(null);
  const inputRef = useRef(null);

  const goHome = () => setShowWelcome(true);
  const backToChat = () => setShowWelcome(false);

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, showWelcome, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendWithText = useCallback(
    async (rawText) => {
      const text = rawText.trim();
      if (!text || isTyping) return;

      setShowWelcome(false);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";

      const userEntry = { id: `u-${Date.now()}`, role: "user", text, time: timeNow() };
      setMessages((m) => [...m, userEntry]);

      const nextHistory = [...conversationHistory, { role: "user", content: text }];
      setConversationHistory(nextHistory);

      setIsTyping(true);
      setSendDisabled(true);

      try {
        const res = await fetch(apiUrl("/api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextHistory }),
        });

        if (!res.ok) {
          throw new Error(await parseErrorResponse(res));
        }

        const data = await res.json();
        const reply = data.reply;
        setConversationHistory((h) => [...h, { role: "assistant", content: reply }]);
        setMessages((m) => [...m, { id: `b-${Date.now()}`, role: "bot", text: reply, time: timeNow() }]);
      } catch (err) {
        setErrorMsg(err.message || "Connection error. Please try again.");
        setConversationHistory((h) => h.slice(0, -1));
        setMessages((m) => m.slice(0, -1));
      } finally {
        setIsTyping(false);
        setSendDisabled(false);
        inputRef.current?.focus();
      }
    },
    [conversationHistory, isTyping]
  );

  const sendMessage = useCallback(() => {
    void sendWithText(input);
  }, [input, sendWithText]);

  const sendQuick = useCallback(
    (text) => {
      setInput(text);
      void sendWithText(text);
    },
    [sendWithText]
  );

  const clearChat = useCallback(() => {
    setConversationHistory([]);
    setMessages([]);
    setShowWelcome(true);
    setInput("");
    setErrorMsg("");
    inputRef.current?.focus();
  }, []);

  return (
    <>
      <Header
        onClear={clearChat}
        showBackToChat={showWelcome && messages.length > 0}
        onBackToChat={backToChat}
        showHome={!showWelcome && messages.length > 0}
        onGoHome={goHome}
      />
      <QuickPrompts onQuick={sendQuick} disabled={isTyping} />
      <div id="messages" ref={messagesRef}>
        {showWelcome && (
          <>
            <WelcomePanel onSelectTopic={sendQuick} disabled={isTyping} />
            {messages.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 16px' }}>
                <button
                  type="button"
                  className="continue-chat-btn"
                  onClick={() => setShowWelcome(false)}
                >
                  💬 Continue Conversation →
                </button>
              </div>
            )}
          </>
        )}
        {!showWelcome &&
          messages.map((msg) => <MessageBubble key={msg.id} role={msg.role} text={msg.text} time={msg.time} />)}
        <TypingIndicator visible={isTyping && !showWelcome} />
      </div>
      <InputArea
        value={input}
        onChange={setInput}
        onSend={sendMessage}
        disabled={sendDisabled}
        inputRef={inputRef}
      />
      <ErrorToast message={errorMsg} onHide={() => setErrorMsg("")} />
    </>
  );
}
