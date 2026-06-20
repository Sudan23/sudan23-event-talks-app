import os
import urllib.request
import xml.etree.ElementTree as ET
import re
import html as html_lib
import datetime
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Feed URL
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache for release notes
cache = {
    "data": None,
    "last_fetched": None
}

def clean_html_to_text(html_content):
    if not html_content:
        return ""
    text = html_content
    # Replace paragraphs
    text = re.sub(r'</p>\s*<p>', '\n\n', text)
    text = re.sub(r'<p>', '', text)
    text = re.sub(r'</p>', '\n\n', text)
    
    # Replace list items
    text = re.sub(r'<li>', '• ', text)
    text = re.sub(r'</li>', '\n', text)
    text = re.sub(r'</?ul>', '', text)
    text = re.sub(r'</?ol>', '', text)
    text = re.sub(r'</?code>', '`', text)
    text = re.sub(r'</?strong>', '**', text)
    
    # Replace links with anchor text
    text = re.sub(r'<a\s+[^>]*>(.*?)</a>', r'\1', text)
    
    # Strip any remaining tags
    text = re.sub(r'<[^>]+>', '', text)
    text = html_lib.unescape(text)
    
    # Normalize whitespaces
    lines = [line.strip() for line in text.split('\n')]
    cleaned_lines = []
    prev_empty = False
    for line in lines:
        if line:
            cleaned_lines.append(line)
            prev_empty = False
        else:
            if not prev_empty:
                cleaned_lines.append('')
                prev_empty = True
    return '\n'.join(cleaned_lines).strip()

def format_tweet(date_str, type_str, text_content, entry_link):
    # Determine emoji prefix
    emoji = "🚀"
    type_lower = type_str.lower()
    if "issue" in type_lower or "bug" in type_lower:
        emoji = "⚠️"
    elif "announce" in type_lower:
        emoji = "📢"
    elif "deprecat" in type_lower:
        emoji = "🛑"
    elif "change" in type_lower:
        emoji = "🔄"
        
    header = f"{emoji} BigQuery {type_str} ({date_str}):\n"
    url_len = 23  # standard character count for any URL on Twitter/X
    max_text_len = 280 - len(header) - 2 - url_len - 3  # -2 for spacing/newlines, -3 for ellipsis
    
    single_line_text = re.sub(r'\s+', ' ', text_content).strip()
    
    if len(single_line_text) > max_text_len:
        truncated_text = single_line_text[:max_text_len].strip()
        last_space = truncated_text.rfind(' ')
        if last_space > max_text_len - 15:
            truncated_text = truncated_text[:last_space]
        tweet_body = truncated_text + "..."
    else:
        tweet_body = single_line_text
        
    return f"{header}{tweet_body}\n\n{entry_link}"

def fetch_and_parse_feed():
    try:
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req) as response:
            xml_data = response.read()
        
        root = ET.fromstring(xml_data)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        parsed_entries = []
        
        for entry_el in root.findall('atom:entry', ns):
            title_el = entry_el.find('atom:title', ns)
            date_str = title_el.text.strip() if title_el is not None else "Unknown Date"
            
            id_el = entry_el.find('atom:id', ns)
            entry_id = id_el.text.strip() if id_el is not None else ""
            
            updated_el = entry_el.find('atom:updated', ns)
            updated_str = updated_el.text.strip() if updated_el is not None else ""
            
            link_el = entry_el.find('atom:link[@rel="alternate"]', ns)
            if link_el is None:
                link_el = entry_el.find('atom:link', ns)
            link = link_el.get('href') if link_el is not None else ""
            
            content_el = entry_el.find('atom:content', ns)
            content_html = content_el.text if content_el is not None else ""
            
            # Divide into individual updates by H3 tags
            updates = []
            if content_html:
                parts = re.split(r'(<h3>.*?</h3>)', content_html)
                
                # Check for content prior to the first H3 tag
                first_part = parts[0].strip()
                if first_part:
                    text_content = clean_html_to_text(first_part)
                    updates.append({
                        'id': f"{entry_id}_general",
                        'type': 'General',
                        'content_html': first_part,
                        'content_text': text_content,
                        'tweet_text': format_tweet(date_str, 'General', text_content, link)
                    })
                
                for idx in range(1, len(parts), 2):
                    h3_tag = parts[idx]
                    type_match = re.search(r'<h3>(.*?)</h3>', h3_tag, re.IGNORECASE)
                    type_str = type_match.group(1).strip() if type_match else "General"
                    
                    content_part = parts[idx+1] if idx+1 < len(parts) else ""
                    content_part_stripped = content_part.strip()
                    
                    if content_part_stripped:
                        text_content = clean_html_to_text(content_part_stripped)
                        update_id = f"{entry_id}_{idx}"
                        updates.append({
                            'id': update_id,
                            'type': type_str,
                            'content_html': content_part_stripped,
                            'content_text': text_content,
                            'tweet_text': format_tweet(date_str, type_str, text_content, link)
                        })
            
            parsed_entries.append({
                'id': entry_id,
                'date': date_str,
                'updated': updated_str,
                'link': link,
                'updates': updates
            })
            
        cache["data"] = parsed_entries
        cache["last_fetched"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return True, None
    except Exception as e:
        return False, str(e)

@app.route('/')
def index():
    # Attempt to load cache if empty
    if cache["data"] is None:
        fetch_and_parse_feed()
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    # If cache is empty, fetch
    if cache["data"] is None:
        success, error = fetch_and_parse_feed()
        if not success:
            return jsonify({"error": f"Failed to retrieve release notes: {error}"}), 500
            
    return jsonify({
        "last_fetched": cache["last_fetched"],
        "entries": cache["data"]
    })

@app.route('/api/refresh', methods=['POST'])
def refresh_notes():
    success, error = fetch_and_parse_feed()
    if not success:
        return jsonify({"error": f"Refresh failed: {error}"}), 500
    return jsonify({
        "success": True,
        "last_fetched": cache["last_fetched"],
        "entries": cache["data"]
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
