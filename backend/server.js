import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Fix for local self-signed cert chain issues

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Base route for health check
app.get('/', (req, res) => {
  res.send('OpsCore Backend API is running!');
});

// ─────────────────────────────────────────────
// In‑memory data (same as your frontend demo)
// ─────────────────────────────────────────────
let jobs = [];

let inventory = [];

// ─────────────────────────────────────────────
// Jobs API
// ─────────────────────────────────────────────
function buildDailyOpsText() {
  const today = new Date().toISOString().slice(0, 10);

  const completedToday = jobs.filter(j => j.status === 'Completed' && j.due === today);
  const delayed = jobs.filter(j => j.status === 'Delayed');
  const inProgress = jobs.filter(j => j.status === 'In Progress');
  const scheduled = jobs.filter(j => j.status === 'Scheduled');

  const lowStock = inventory.filter(i => i.qty > 0 && i.qty <= i.reorder);
  const outOfStock = inventory.filter(i => i.qty === 0);

  const totalValue = inventory.reduce((s, i) => s + i.qty * i.price, 0);

  return `
DATE: ${today}

Production:
- Total jobs: ${jobs.length}
- Completed today (by due date): ${completedToday.length} (${completedToday.map(j => j.name).join(', ') || 'none'})
- In progress: ${inProgress.length} (${inProgress.map(j => j.name).join(', ') || 'none'})
- Scheduled (not started): ${scheduled.length} (${scheduled.map(j => j.name).join(', ') || 'none'})
- Delayed: ${delayed.length} (${delayed.map(j => j.name).join(', ') || 'none'})
- Urgent jobs: ${jobs.filter(j => j.priority === 'Urgent').map(j => j.name).join(', ') || 'none'}

Inventory:
- Total SKUs: ${inventory.length}
- Out of stock: ${outOfStock.length} (${outOfStock.map(i => i.name).join(', ') || 'none'})
- Low stock: ${lowStock.length} (${lowStock.map(i => i.name + '(' + i.qty + ')').join(', ') || 'none'})
- Total inventory value: ₹${totalValue.toLocaleString('en-IN')}
`;
}
app.get('/api/jobs', (req, res) => {
  res.json(jobs);
});

app.post('/api/jobs', (req, res) => {
  const { name, product, qty, line, due, priority } = req.body;
  if (!name || !product || !qty || !due) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const job = {
    id: Date.now(),
    name,
    product,
    qty: Number(qty),
    line: line || 'Line A',
    due,
    priority: priority || 'Normal',
    status: 'Scheduled',
    progress: 0
  };
  jobs.push(job);
  res.status(201).json(job);
});

app.patch('/api/jobs/:id/progress', (req, res) => {
  const id = Number(req.params.id);
  const { delta } = req.body; // e.g. +20
  const job = jobs.find(j => j.id === id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const increment = typeof delta === 'number' ? delta : 20;
  job.progress = Math.min(100, job.progress + increment);
  if (job.progress === 100) {
    job.status = 'Completed';
  } else if (job.status === 'Scheduled') {
    job.status = 'In Progress';
  }
  res.json(job);
});

app.patch('/api/jobs/:id/qty', (req, res) => {
  const id = Number(req.params.id);
  const { amount } = req.body;
  const job = jobs.find(j => j.id === id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const qtyDelta = Number(amount) || 0;
  job.qty = Math.max(0, job.qty + qtyDelta);
  res.json(job);
});

app.delete('/api/jobs/:id', (req, res) => {
  const id = Number(req.params.id);
  const before = jobs.length;
  jobs = jobs.filter(j => j.id !== id);
  if (jobs.length === before) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.status(204).end();
});

// ─────────────────────────────────────────────
// Inventory API
// ─────────────────────────────────────────────
app.get('/api/inventory', (req, res) => {
  res.json(inventory);
});

app.post('/api/inventory', (req, res) => {
  const { name, cat, qty, reorder, price, supplier } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Item name required' });
  }
  const existing = inventory.find(
    i => i.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    existing.qty += Number(qty) || 0;
    return res.json(existing);
  }

  const item = {
    id: Date.now(),
    name,
    cat: cat || 'Raw Material',
    qty: Number(qty) || 0,
    reorder: Number(reorder) || 0,
    price: Number(price) || 0,
    supplier: supplier || '-'
  };
  inventory.push(item);
  res.status(201).json(item);
});

app.patch('/api/inventory/:id/restock', (req, res) => {
  const id = Number(req.params.id);
  const { amount } = req.body;
  const item = inventory.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const qtyAdd = Number(amount) || 0;
  item.qty += qtyAdd;
  res.json(item);
});

app.patch('/api/inventory/:id/qty', (req, res) => {
  const id = Number(req.params.id);
  const { amount } = req.body;
  const item = inventory.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const qtyDelta = Number(amount) || 0;
  item.qty = Math.max(0, item.qty + qtyDelta);
  res.json(item);
});

app.delete('/api/inventory/:id', (req, res) => {
  const id = Number(req.params.id);
  const before = inventory.length;
  inventory = inventory.filter(i => i.id !== id);
  if (inventory.length === before) {
    return res.status(404).json({ error: 'Item not found' });
  }
  res.status(204).end();
});

// ─────────────────────────────────────────────
// AI Advisor API – calls Anthropic (or mocks)
// ─────────────────────────────────────────────
app.post('/api/ai', async (req, res) => {
  const { mode, question } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  // summarize context for the AI
  const prodCtx = `Production: ${jobs.length} jobs total. Active: ${
    jobs.filter(j => j.status === 'In Progress').length
  }. Delayed: ${
    jobs.filter(j => j.status === 'Delayed').map(j => j.name).join(', ') || 'none'
  }. Completed: ${
    jobs.filter(j => j.status === 'Completed').length
  }. Urgent: ${
    jobs.filter(j => j.priority === 'Urgent').map(j => j.name).join(', ') || 'none'
  }. Lines: A, B, C.`;

  const invCtx = `Inventory: ${inventory.length} SKUs. Out of stock: ${
    inventory.filter(i => i.qty === 0).map(i => i.name).join(', ') || 'none'
  }. Low stock: ${
    inventory
      .filter(i => i.qty > 0 && i.qty <= i.reorder)
      .map(i => `${i.name}(${i.qty})`)
      .join(', ') || 'none'
  }. Total value: ₹${inventory
    .reduce((s, i) => s + i.qty * i.price, 0)
    .toLocaleString('en-IN')}.`;

  const systemPrompt = `You are 'OpsGenie', a highly experienced industrial operations director and financial strategist for a mid-size Indian manufacturing company using OpsCore.
You excel at identifying cost-efficiencies, evaluating pricing impacts, and maximizing profitability.
Live data:
${prodCtx}
${invCtx}
User page: ${mode === 'inv' ? 'Inventory Manager' : 'Production Scheduler'}.
Give clear, actionable advice in 2-3 sentences. Be specific to the data. Always include a brief pricing or cost analysis (e.g., potential savings, inventory holding costs, production cost estimates, revenue impact).`;

  // If no API key, return a mock response
  if (!process.env.GEMINI_API_KEY) {
    const mock =
      mode === 'inv'
        ? 'Based on current inventory, immediately reorder items marked low or out of stock to avoid production halts. Additionally, note that clearing out slow-moving SKUs could free up roughly ₹45,000 in tied-up capital and lower holding costs.'
        : 'Prioritize delayed and urgent jobs like Batch #A102, then fill spare capacity on Line B to maximize line profitability. Accelerating these high-priority orders can prevent late-delivery penalties and secure projected revenues.';
    return res.json({ answer: mock, source: 'mock' });
  }

  try {
    const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [{
          role: 'user',
          parts: [{ text: question }]
        }],
        generationConfig: {
          maxOutputTokens: 1000,
        }
      })
    });

    const data = await apiRes.json();
    let text = 'No response from AI API.';
    if (data.candidates && data.candidates.length > 0) {
      text = data.candidates[0].content.parts.map(p => p.text).join('');
    } else if (data.error) {
      throw new Error(data.error.message || 'Unknown API error');
    }
    res.json({ answer: text, source: 'gemini' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI API error', details: err.message });
  }
});

// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`OpsCore backend running on http://localhost:${PORT}`);
});
app.post('/api/ai/daily-summary', async (req, res) => {
  const baseText = buildDailyOpsText();

  const systemPrompt = `You are 'OpsGenie', an expert industrial operations director and financial analyst writing a concise daily summary for a manufacturing plant in India.
You specialize in cost tracking, pricing optimization, and operational efficiency.
Use the data below to produce:
1) A short overview (2-3 sentences) including financial health and pricing impact,
2) 3-5 bullet points with key highlights (include holding costs, potential pricing issues, or cost savings),
3) 2 concrete action items for tomorrow focused on operations and cost/revenue optimization.
Be practical and specific, avoid generic advice.`;

  const userPrompt = `Here is today's production and inventory data:

${baseText}

Write the daily summary now.`;

  // If no real key, return a mock daily summary
  if (!process.env.GEMINI_API_KEY) {
    const mock = `
Daily overview:
Production maintained a steady pace, but delayed jobs risk incurring late-delivery penalties and affecting top-line revenue. Overall inventory value is stable, though capital is tied up in slow-moving goods while critical components are dangerously low.

Highlights:
- ${jobs.filter(j => j.status === 'Delayed').length || 'No'} delayed jobs; expediting these will protect our margins and client relationships.
- ${inventory.filter(i => i.qty === 0).length || 'No'} SKUs out-of-stock. Expedited shipping costs for these components will reduce batch profitability if not managed carefully.
- Inventory holding costs are suboptimal; rebalancing stock levels could free up significant working capital.
- Spare capacity on high-efficiency lines presents an opportunity to run high-margin batches ahead of schedule.

Action items for tomorrow:
- Authorize purchase orders for out-of-stock items, comparing supplier pricing to minimize rushed procurement costs.
- Re-route the highest-priority delayed jobs to Line B to avoid contract penalties, accepting minor overtime costs as a net positive for overall ROI.
`.trim();
    return res.json({ summary: mock, source: 'mock' });
  }

  try {
    const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [{
          role: 'user',
          parts: [{ text: userPrompt }]
        }],
        generationConfig: {
          maxOutputTokens: 1500,
        }
      })
    });

    const data = await apiRes.json();
    let text = 'No response from AI API.';
    if (data.candidates && data.candidates.length > 0) {
      text = data.candidates[0].content.parts.map(p => p.text).join('');
    } else if (data.error) {
      throw new Error(data.error.message || 'Unknown API error');
    }
    res.json({ summary: text, source: 'gemini' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI API error', details: err.message });
  }
});