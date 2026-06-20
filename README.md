# BigQuery Release Notes Dashboard & Twitter Workspace

A modern, responsive, and light-dismiss-ready web application built with **Python Flask** (backend) and **Vanilla HTML5, CSS3, and JavaScript** (frontend). It fetches Google Cloud's BigQuery release notes feed, divides unified daily logs into individual updates, and helps you format and share them on Twitter/X with correct character count rules.

---

## 🚀 Key Features

* **Granular Timeline Feed**: Automatically splits daily composite logs into distinct card items categorized by type (`Feature`, `Announcement`, `Issue`, `Changed`, `General`).
- **Responsive Dark-Glass UI**: Styled with clean glassmorphic components, fluid hover transitions, active card states, and layout properties that fold into a bottom sheet drawer on mobile devices.
- **Client-Side Live Filtering**: Instantly filters updates using search keywords and type selector checkboxes without querying the backend.
- **X/Twitter-Compliant character check**: Text areas track constraints in real time. Because Twitter charges exactly 23 characters for any URL, the custom length calculator dynamically isolates links to present an accurate length count.
- **In-Memory Cache Sync**: Minimizes API latency with server cache logs, complemented by a spinner-based forced-sync command.

---

## 📂 Project Structure

```text
bq-releases-notes/
├── app.py                  # Flask Application Backend (Parses XML, cleans HTML)
├── templates/
│   └── index.html          # Semantic HTML timeline structure and dialog layers
├── static/
│   ├── css/
│   │   └── style.css       # Color palettes, custom scrollbars, animations, media queries
│   └── js/
│       └── app.js          # Client-side routing, checkbox filter controllers, character metrics
├── .gitignore              # Ignores local caches, virtual environments, and editor specs
└── README.md               # Setup instructions and documentation (this file)
```

---

## 🛠️ Installation & Setup

### Prerequisites
* Python 3.8+
- `pip` package manager
- Internet connectivity (to fetch the live BigQuery XML feed)

### 1. Clone & Access the Workspace
```bash
git clone https://github.com/Sudan23/sudan23-event-talks-app.git
cd sudan23-event-talks-app
```

### 2. Configure Environment & Dependencies
We recommend installing dependencies inside a virtual environment:

```bash
# Create a virtual environment
python3 -m venv .venv

# Activate the virtual environment
# On macOS/Linux:
source .venv/bin/activate
# On Windows (cmd):
.venv\Scripts\activate.bat

# Install Flask (Flask version 3.1.2 or later is recommended)
pip install Flask
```

### 3. Run the Server
Launch the Flask development server:
```bash
python3 app.py
```
By default, the server spins up locally on:
👉 **[http://127.0.0.1:5000/](http://127.0.0.1:5000/)**

---

## 💡 How It Works

### The Backend Pipeline ([app.py](app.py))
1. **Feed Sync**: Downloads the feed XML from `https://docs.cloud.google.com/feeds/bigquery-release-notes.xml`.
2. **Dividing Log Elements**: Parses entries with `xml.etree.ElementTree` and runs `re.split(r'(<h3>.*?</h3>)')` on the HTML body. This isolates every single category and details paragraph.
3. **Text Formatting**: Converts paragraphs, list points (`<li>`), bold blocks, and code blocks (`<code>`) to clean, markdown-friendly text templates for social posts.

### The Frontend Workspace ([app.js](static/js/app.js))
1. **Interactive State**: Clicking a timeline card assigns a `.selected` class.
2. **Twitter Rules Logic**:
   ```javascript
   function calculateTwitterLength(text) {
       const urlRegex = /https?:\/\/[^\s]+/g;
       const urls = text.match(urlRegex) || [];
       const textWithoutUrls = text.replace(urlRegex, '');
       return textWithoutUrls.length + (urls.length * 23); // Twitter url weight
   }
   ```
3. **Intent Triggers**: Clicking "Tweet on X" launches Twitter's share intent API page using `window.open` with the URI-escaped payload parameters.
