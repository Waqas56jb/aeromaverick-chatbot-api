import React from "react";
import ReactDOM from "react-dom/client";
import { ChatApp } from "./components/ChatApp.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div id="app">
      <ChatApp />
    </div>
  </React.StrictMode>
);
