// State Management
let releaseNotesData = [];
let selectedUpdateId = null;

// DOM Elements
const btnRefresh = document.getElementById('btn-refresh');
const btnExportCSV = document.getElementById('btn-export-csv');
const cacheStatus = document.getElementById('cache-status');
const feedLoader = document.getElementById('feed-loader');
const feedEmpty = document.getElementById('feed-empty');
const timelineContainer = document.getElementById('timeline-container');
const searchInput = document.getElementById('search-input');
const btnClearFilters = document.getElementById('btn-clear-filters');

// Filter Checkboxes
const filterCheckboxes = {
    Feature: document.getElementById('filter-feature'),
    Announcement: document.getElementById('filter-announcement'),
    Issue: document.getElementById('filter-issue'),
    Changed: document.getElementById('filter-changed'),
    General: document.getElementById('filter-general')
};

// Stats
const statTotalUpdates = document.getElementById('stat-total-updates');
const statFeatures = document.getElementById('stat-features');

// Tweet Composer Elements
const composerEmptyState = document.getElementById('composer-empty-state');
const composerActive = document.getElementById('composer-active');
const selectedTypeBadge = document.getElementById('selected-type');
const selectedDateSpan = document.getElementById('selected-date');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCountSpan = document.getElementById('char-count');
const charWarningMsg = document.getElementById('char-warning-msg');
const btnCopyTweet = document.getElementById('btn-copy-tweet');
const btnPostTweet = document.getElementById('btn-post-tweet');
const tweetPanel = document.getElementById('tweet-panel');

// Toast & Dialog
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const infoDialog = document.getElementById('info-dialog');
const themeCheckbox = document.getElementById('theme-checkbox');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Sync toggle switch state with current resolved theme class
    const isLight = document.documentElement.classList.contains('light-theme');
    if (themeCheckbox) {
        themeCheckbox.checked = isLight;
    }
    
    fetchReleaseNotes();
    setupEventListeners();
    setupDialogFallback();
});

// Event Listeners Setup
function setupEventListeners() {
    // Refresh Button Click
    btnRefresh.addEventListener('click', refreshReleaseNotes);

    // Export CSV Button Click
    btnExportCSV.addEventListener('click', exportToCSV);

    // Theme Toggle Switch Change
    if (themeCheckbox) {
        themeCheckbox.addEventListener('change', () => {
            const theme = themeCheckbox.checked ? 'light' : 'dark';
            document.documentElement.className = theme + '-theme';
            localStorage.setItem('theme', theme);
        });
    }

    // Close Composer Button Click
    const btnCloseComposer = document.getElementById('btn-close-composer');
    if (btnCloseComposer) {
        btnCloseComposer.addEventListener('click', deselectUpdate);
    }

    // Filter changes
    searchInput.addEventListener('input', renderFeed);
    Object.values(filterCheckboxes).forEach(cb => {
        cb.addEventListener('change', renderFeed);
    });

    // Clear filters
    btnClearFilters.addEventListener('click', () => {
        searchInput.value = '';
        Object.values(filterCheckboxes).forEach(cb => cb.checked = true);
        renderFeed();
    });

    // Copy Tweet button
    btnCopyTweet.addEventListener('click', copyTweetToClipboard);

    // Post Tweet button
    btnPostTweet.addEventListener('click', postTweetToTwitter);

    // Textarea character count update
    tweetTextarea.addEventListener('input', updateCharCount);
}

// Dialog Fallback for Light-Dismiss (clicks outside dialog contents)
function setupDialogFallback() {
    if (infoDialog && !('closedBy' in HTMLDialogElement.prototype)) {
        infoDialog.addEventListener('click', (event) => {
            if (event.target !== infoDialog) return;
            const rect = infoDialog.getBoundingClientRect();
            const isDialogContent = (
                rect.top <= event.clientY &&
                event.clientY <= rect.top + rect.height &&
                rect.left <= event.clientX &&
                event.clientX <= rect.left + rect.width
            );
            if (isDialogContent) return;
            infoDialog.close();
        });
    }
}

// Fetch notes on load
async function fetchReleaseNotes() {
    showLoader(true);
    try {
        const response = await fetch('/api/release-notes');
        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        
        releaseNotesData = data.entries || [];
        updateCacheStatus(data.last_fetched);
        renderFeed();
    } catch (error) {
        console.error('Error fetching release notes:', error);
        showToast('Failed to load release notes. Please refresh.', true);
        showLoader(false);
        feedEmpty.classList.remove('hidden');
    }
}

// Force Refresh Feed
async function refreshReleaseNotes() {
    if (btnRefresh.classList.contains('loading')) return;
    
    btnRefresh.classList.add('loading');
    btnRefresh.disabled = true;
    cacheStatus.textContent = "Syncing feed...";
    
    try {
        const response = await fetch('/api/refresh', { method: 'POST' });
        if (!response.ok) throw new Error('Refresh request failed');
        const data = await response.json();
        
        releaseNotesData = data.entries || [];
        updateCacheStatus(data.last_fetched);
        
        // Keep selection if it still exists in the refreshed data
        const oldSelectedId = selectedUpdateId;
        renderFeed();
        
        if (oldSelectedId) {
            const cardToSelect = document.querySelector(`.update-card[data-id="${oldSelectedId}"]`);
            if (cardToSelect) {
                cardToSelect.click();
            } else {
                deselectUpdate();
            }
        }
        
        showToast('Feed successfully updated!');
    } catch (error) {
        console.error('Error refreshing release notes:', error);
        showToast('Failed to refresh release notes.', true);
        updateCacheStatus(cacheStatus.dataset.lastFetched || 'Error');
    } finally {
        btnRefresh.classList.remove('loading');
        btnRefresh.disabled = false;
    }
}

// UI State Helpers
function showLoader(show) {
    if (show) {
        feedLoader.classList.remove('hidden');
        feedEmpty.classList.add('hidden');
        timelineContainer.classList.add('hidden');
    } else {
        feedLoader.classList.add('hidden');
    }
}

function updateCacheStatus(lastFetched) {
    cacheStatus.dataset.lastFetched = lastFetched;
    cacheStatus.textContent = `Cached: ${lastFetched}`;
}

// Render the Timeline Feed based on Filters
function renderFeed() {
    showLoader(false);
    
    const query = searchInput.value.toLowerCase().trim();
    
    // Get checked filters
    const activeFilters = Object.keys(filterCheckboxes).filter(key => filterCheckboxes[key].checked);
    
    // Filter and build entries
    let totalFilteredUpdates = 0;
    let totalFeaturesCount = 0;
    
    timelineContainer.innerHTML = '';
    
    releaseNotesData.forEach(entry => {
        // Filter updates inside this entry
        const matchedUpdates = entry.updates.filter(update => {
            const matchesType = activeFilters.includes(update.type);
            const matchesSearch = !query || 
                update.type.toLowerCase().includes(query) || 
                update.content_text.toLowerCase().includes(query) || 
                entry.date.toLowerCase().includes(query);
                
            return matchesType && matchesSearch;
        });
        
        if (matchedUpdates.length > 0) {
            // Create day group
            const dayGroup = document.createElement('div');
            dayGroup.className = 'day-group';
            
            const dateBubble = document.createElement('div');
            dateBubble.className = 'day-date-bubble';
            dateBubble.innerHTML = `<span class="day-date-node"></span>${entry.date}`;
            dayGroup.appendChild(dateBubble);
            
            matchedUpdates.forEach(update => {
                totalFilteredUpdates++;
                if (update.type === 'Feature') totalFeaturesCount++;
                
                const updateCard = document.createElement('div');
                updateCard.className = `update-card ${selectedUpdateId === update.id ? 'selected' : ''}`;
                updateCard.setAttribute('data-id', update.id);
                updateCard.setAttribute('data-type', update.type);
                
                // Content type badge class mapping
                const badgeClass = `badge badge-${update.type.toLowerCase()}`;
                
                updateCard.innerHTML = `
                    <div class="card-header">
                        <div class="card-title-area">
                            <span class="${badgeClass}">${update.type}</span>
                            <h4>${entry.date}</h4>
                        </div>
                    </div>
                    <div class="card-body">
                        ${update.content_html}
                    </div>
                    <div class="card-footer">
                        <button class="btn btn-secondary btn-card-copy" title="Copy plain text to clipboard">
                            <svg class="btn-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span>Copy</span>
                        </button>
                        <button class="btn btn-secondary btn-card-tweet">
                            <svg class="btn-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                            </svg>
                            <span>Draft Tweet</span>
                        </button>
                    </div>
                `;
                
                // Copy Card Content Event
                const btnCardCopy = updateCard.querySelector('.btn-card-copy');
                btnCardCopy.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent selecting the card for tweeting
                    navigator.clipboard.writeText(update.content_text).then(() => {
                        showToast('Release note copied to clipboard!');
                        // Small success state feedback on the button
                        const span = btnCardCopy.querySelector('span');
                        const originalText = span.textContent;
                        span.textContent = 'Copied!';
                        btnCardCopy.style.borderColor = 'var(--color-feature)';
                        setTimeout(() => {
                            span.textContent = originalText;
                            btnCardCopy.style.borderColor = '';
                        }, 1000);
                    }).catch(err => {
                        console.error('Failed to copy card text:', err);
                        showToast('Failed to copy content.', true);
                    });
                });
                
                // Select Card Event
                updateCard.addEventListener('click', (e) => {
                    // Prevent nested interactive events if we clicked a link inside the card or copy button
                    if (e.target.tagName === 'A' || e.target.closest('.btn-card-copy')) return;
                    selectUpdate(update, entry.date);
                });
                
                dayGroup.appendChild(updateCard);
            });
            
            timelineContainer.appendChild(dayGroup);
        }
    });
    
    // Update Stats counters
    statTotalUpdates.textContent = totalFilteredUpdates;
    statFeatures.textContent = totalFeaturesCount;
    
    // Show empty state if nothing matches
    if (totalFilteredUpdates === 0) {
        timelineContainer.classList.add('hidden');
        feedEmpty.classList.remove('hidden');
    } else {
        timelineContainer.classList.remove('hidden');
        feedEmpty.classList.add('hidden');
    }
}

// Select an Update and Populate Tweet Composer
function selectUpdate(update, dateStr) {
    selectedUpdateId = update.id;
    
    // Remove selected highlights
    document.querySelectorAll('.update-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Highlight active card
    const card = document.querySelector(`.update-card[data-id="${update.id}"]`);
    if (card) card.classList.add('selected');
    
    // Show active composer view
    composerEmptyState.classList.add('hidden');
    composerActive.classList.remove('hidden');
    
    // Badge and metadata
    selectedTypeBadge.className = `badge badge-${update.type.toLowerCase()}`;
    selectedTypeBadge.textContent = update.type;
    selectedDateSpan.textContent = dateStr;
    
    // Populate textarea
    tweetTextarea.value = update.tweet_text;
    updateCharCount();
    
    // Smooth scroll composer into view on mobile
    if (window.innerWidth <= 1200) {
        document.querySelector('.sidebar-right').classList.add('active');
        // Add overlay backdrop or close trigger if needed
    }
}

function deselectUpdate() {
    selectedUpdateId = null;
    document.querySelectorAll('.update-card').forEach(card => {
        card.classList.remove('selected');
    });
    composerActive.classList.add('hidden');
    composerEmptyState.classList.remove('hidden');
    
    if (window.innerWidth <= 1200) {
        document.querySelector('.sidebar-right').classList.remove('active');
    }
}

// Calculate Twitter Character Length (handling URL rule: all URLs count as 23 characters)
function calculateTwitterLength(text) {
    // Regex for matching http/https URLs
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    
    // Strip URLs to measure length of rest of text
    const textWithoutUrls = text.replace(urlRegex, '');
    
    // Twitter charges 23 characters for any URL
    return textWithoutUrls.length + (urls.length * 23);
}

// Update Character Count Visuals
function updateCharCount() {
    const text = tweetTextarea.value;
    const charLen = calculateTwitterLength(text);
    
    charCountSpan.textContent = `${charLen} / 280`;
    
    // Character limit threshold styles
    charCountSpan.className = 'char-count';
    charWarningMsg.classList.add('hidden');
    btnPostTweet.disabled = false;
    
    if (charLen > 280) {
        charCountSpan.classList.add('danger');
        charWarningMsg.classList.remove('hidden');
        btnPostTweet.disabled = true; // Disable sending
    } else if (charLen > 250) {
        charCountSpan.classList.add('warning');
    }
}

// Copy Tweet Text to Clipboard
function copyTweetToClipboard() {
    const text = tweetTextarea.value;
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('Tweet content copied to clipboard!');
        
        // Add subtle success pulse animation
        btnCopyTweet.classList.add('btn-success');
        setTimeout(() => btnCopyTweet.classList.remove('btn-success'), 1000);
    }).catch(err => {
        console.error('Error copying text:', err);
        showToast('Failed to copy text. Please select and copy manually.', true);
    });
}

// Open Twitter compose window with encoded text
function postTweetToTwitter() {
    const text = tweetTextarea.value;
    if (!text) return;
    
    const charLen = calculateTwitterLength(text);
    if (charLen > 280) {
        showToast('Tweet content is too long!', true);
        return;
    }
    
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
}

// Show Custom Toast
let toastTimeout;
function showToast(message, isError = false) {
    clearTimeout(toastTimeout);
    
    toastMessage.textContent = message;
    toast.className = 'toast'; // reset
    if (isError) {
        toast.classList.add('toast-error');
        toast.style.borderColor = 'var(--color-issue)';
    } else {
        toast.style.borderColor = 'var(--g-blue)';
    }
    
    toast.classList.remove('hidden');
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(-10px)';
    
    toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
}

// Export Filtered Release Notes to CSV File
function exportToCSV() {
    const query = searchInput.value.toLowerCase().trim();
    const activeFilters = Object.keys(filterCheckboxes).filter(key => filterCheckboxes[key].checked);
    
    const csvRows = [
        ['Date', 'Type', 'Content Text', 'Source Link', 'Tweet Draft'] // Header row
    ];
    
    releaseNotesData.forEach(entry => {
        entry.updates.forEach(update => {
            const matchesType = activeFilters.includes(update.type);
            const matchesSearch = !query || 
                update.type.toLowerCase().includes(query) || 
                update.content_text.toLowerCase().includes(query) || 
                entry.date.toLowerCase().includes(query);
                
            if (matchesType && matchesSearch) {
                const csvDate = escapeCSVValue(entry.date);
                const csvType = escapeCSVValue(update.type);
                const csvText = escapeCSVValue(update.content_text);
                const csvLink = escapeCSVValue(entry.link);
                const csvTweet = escapeCSVValue(update.tweet_text);
                
                csvRows.push([csvDate, csvType, csvText, csvLink, csvTweet]);
            }
        });
    });
    
    if (csvRows.length <= 1) {
        showToast('No updates found matching your filters to export.', true);
        return;
    }
    
    const csvContent = csvRows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `bigquery_release_notes_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('CSV export downloaded successfully!');
}

// Helper to escape CSV values correctly (RFC 4180 standard)
function escapeCSVValue(val) {
    if (val === undefined || val === null) return '""';
    let stringVal = String(val);
    
    // Double quotes must be escaped by double double-quotes
    stringVal = stringVal.replace(/"/g, '""');
    
    // Wrap in double quotes if it contains commas, newlines, or quotes
    if (stringVal.includes(',') || stringVal.includes('\n') || stringVal.includes('\r') || stringVal.includes('"')) {
        return `"${stringVal}"`;
    }
    return stringVal;
}
