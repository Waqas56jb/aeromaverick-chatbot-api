# ✈️ AeroMaverick AI Aviation Concierge Chatbot

A premium, GPT-4o powered knowledge-based chatbot for aeromaverick.com.

---

## 📁 Project Structure

```
Root/
├── server/
│   ├── server.js       ← Node.js backend with OpenAI + full knowledge base
│   └── .env            ← Your OpenAI API key goes here
├── client/
│   └── index.html      ← Complete frontend (HTML + CSS + JS in one file)
└── package.json
```

---

## 🚀 Setup & Run

### 1. Install dependencies
```bash
npm install
```

### 2. Add your OpenAI API Key
Open `server/.env` and replace the placeholder:
```
OPENAI_API_KEY=sk-your-actual-openai-key-here
PORT=3000
```

### 3. Start the server
```bash
npm start
```

### 4. Open the chatbot
Visit: **http://localhost:3000**

---

## 🔑 Key Features

- **GPT-4o** powered — most intelligent OpenAI model
- **Full AeroMaverick knowledge base** embedded in system prompt:
  - All 8 current aircraft listings with complete specs
  - Financing partners and routing logic
  - Charter partners and routing logic
  - Engine stand suppliers and routing logic
  - All membership tiers ($0 / $59 / $119 / $249)
  - All listing packages for sellers
  - Brand identity, tone, competitive positioning
  - Blog content, SafePay escrow, Terms of Service facts
- **Conversion-focused** — guides every user to a next action
- **Premium aviation UI** — dark navy + gold, Bebas Neue branding
- **Quick prompts** — 7 preset questions for instant engagement
- **Markdown rendering** — bold, lists, headers, links auto-formatted
- **Auto-links** — aeromaverick.com URLs become clickable
- **Mobile responsive** — works on all screen sizes
- **Error handling** — API errors shown as toast notifications
- **Lead capture** endpoint at `/api/lead`

---

## 🔌 API Endpoints

| Method | Endpoint      | Description                  |
|--------|---------------|------------------------------|
| POST   | /api/chat     | Send chat message to GPT-4o  |
| POST   | /api/lead     | Capture a lead (name, email) |
| GET    | /api/health   | Health check                 |

### Chat Request Body
```json
{
  "messages": [
    { "role": "user", "content": "What aircraft do you have for sale?" }
  ]
}
```

### Chat Response
```json
{
  "reply": "We currently have 8 aircraft listed on AeroMaverick..."
}
```

---

## 🌐 Deploy to Production

### Option A — cPanel / shared hosting
1. Upload all files
2. Set environment variable `OPENAI_API_KEY`
3. Run `npm install && npm start`

### Option B — VPS (Ubuntu)
```bash
npm install -g pm2
pm2 start server/server.js --name aeromaverick-bot
pm2 save
```

### Option C — Railway / Render / Heroku
- Add `OPENAI_API_KEY` as an environment variable in the dashboard
- Set start command: `node server/server.js`

---

## 💡 Embed on aeromaverick.com

To embed this chatbot as a widget on the existing WordPress site, add this iframe to any page or in the footer:

```html
<iframe 
  src="https://your-chatbot-domain.com" 
  width="420" 
  height="600"
  style="border:none; border-radius:16px; box-shadow:0 8px 40px rgba(0,0,0,0.4);"
></iframe>
```

Or deploy as a floating widget by wrapping in a fixed-position div.

---

## ✅ Chatbot Knows

- All 8 aircraft listings with full technical specs
- Financing partners: AirFleet Capital, Dorr Aviation, AOPA Finance, Global Jet Capital, JSSI, regional lenders
- Charter partners: Avinode, Air Charter Service, Stratos Jets, VistaJet, XO, JSX, and more
- Engine stand suppliers: Magnetic, National Aero, HYDRO, Dedienne, MTU/AGSE, and more
- Membership tiers: Free / Basic ($59) / Pro ($119) / Elite ($249)
- Seller listing packages: $3 – $99
- SafePay escrow integration
- Blog articles on helicopters, A250-9000, first vs business class
- Brand voice, compliance rules, competitive positioning vs AvBuyer & Controller
- Marketing strategy: Google Ads, LinkedIn, Facebook/Instagram
