async function generateDailySummary() {
  const outEl = $('daily-summary-out');
  outEl.innerHTML = '<span class="ai-thinking">Generating daily summary</span>';

  try {
    const res = await fetch(`${API_BASE}/ai/daily-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok) {
      outEl.textContent = data.error || 'Error generating summary';
      return;
    }
    outEl.textContent = data.summary || 'No summary returned.';
    toast('✓ Daily AI summary generated');
  } catch (e) {
    outEl.textContent = 'API error: ' + e.message;
  }
}