const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database/init');

// ============================================================================
// Connecteam API 配置
// ============================================================================

const CONNECTEAM_BASE_URL = 'https://api.connecteam.com';
const CLIENT_ID = process.env.CONNECTEAM_CLIENT_ID || 'ct_rmvsxhnixttsidlw_a2d4e84022cd6776c835c18bc0a6073a';
const CLIENT_SECRET = process.env.CONNECTEAM_CLIENT_SECRET || 'OepjUJDMH490UoXGFCvwSGo8lCPp8NJj8Np4M8YiZh4';
const API_KEY = process.env.CONNECTEAM_API_KEY || '81e988c4-e5b0-4cf0-ab66-52223ceff2ca';
const TASK_BOARD_ID = 6434396;
const CUSTOM_PUBLISHER_ID = 2095242; // "Online Transfer" publisher

// Label IDs (confirmed via API testing)
const LABEL_IDS = {
  'WEB':                  '660eedbd18d2595ee1c36e9b',
  'WAREHOUSE / DELIVERY': '65de047f153c0653d65ad8ce',
  'MTL01': '65de2ebbababa72e9f5de572',
  'MTL02': '65de2ec0a70ed173d437b36d',
  'MTL03': '65de2ec4ababa72e9f5de573',
  'MTL04': '65de2ec8348ca1c3d4a0a557',
  'MTL05': '65de2ecc153c0653d65adaa7',
  'MTL06': '65de2ef2a70ed173d437b36f',
  'MTL07': '65de2efc153c0653d65adaa9',
  'MTL08': '65de2f008e76b7a064e738b9',
  'MTL09': '65de2f12153c0653d65adaaa',
  'MTL11': '65de2f1d8e76b7a064e738ba',
};

// MTL time clock IDs for clocked-in check (confirmed via API testing)
const TIME_CLOCK_IDS = {
  '01': 6905828,  // MTL01_M
  '02': 6905850,  // MTL02_M
  '03': 6905862,  // MTL03_M
  '04': 6905877,  // MTL04_M
  '05': 6905888,  // MTL05_M  (05 & 06 share managers)
  '06': 6905890,  // MTL05 & 06_M
  '07': 6905892,  // MTL02 & 07_M
  '08': 6905896,  // MTL08_M
  '09': 6905904,  // MTL09_M
  '11': 6905956,  // MTL11_M
};

let accessToken = null;
let tokenExpiry = null;

// ── OAuth Token ──────────────────────────────────────────────────────────────

async function getAccessToken() {
  // Reuse token if still valid (with 60s buffer)
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry - 60000) {
    return accessToken;
  }

  const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');

  const response = await axios.post(
    `${CONNECTEAM_BASE_URL}/oauth/v1/token`,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`,
      },
    }
  );

  accessToken = response.data.access_token;
  // Tokens typically last 1 hour
  tokenExpiry = Date.now() + (response.data.expires_in || 3600) * 1000;
  return accessToken;
}

async function getApiClient() {
  const token = await getAccessToken();
  return axios.create({
    baseURL: CONNECTEAM_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
}

// ── Helper: description format conversion ────────────────────────────────────
// GET returns description as array of html blocks, PUT needs { content: string }
function convertDescriptionForPut(raw) {
  if (!raw) return { content: '' };
  if (!Array.isArray(raw)) return raw;
  const text = raw.map(block => {
    if (block.type === 'html' && block.html) {
      return block.html.replace(/<[^>]+>/g, '').trim();
    }
    return block.text || '';
  }).filter(Boolean).join('\n');
  return { content: text };
}

// ── Helper: build task title ─────────────────────────────────────────────────
function buildTaskTitle(locationOrder, dateChoice) {
  // locationOrder: ['05', '01', '02'] → "5 - 1 - 2 - [WEB] Mar.07"
  const locNumbers = locationOrder.map(loc => parseInt(loc, 10).toString());
  
  const date = new Date();
  if (dateChoice === 'tomorrow') {
    date.setDate(date.getDate() + 1);
  } else if (dateChoice === 'monday') {
    const day = date.getDay();
    const daysUntilMonday = day === 0 ? 1 : (8 - day);
    date.setDate(date.getDate() + daysUntilMonday);
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateStr = `${months[date.getMonth()]}.${String(date.getDate()).padStart(2, '0')}`;

  return `${locNumbers.join(' - ')} - [WEB] ${dateStr}`;
}

function extractTitleDate(title) {
  // "5 - 1 - 2 - [WEB] Mar.07" → "Mar.07"
  const match = title.match(/\[WEB\]\s*([A-Za-z]+\.\d+)/);
  return match ? match[1] : '';
}

function extractLocationsFromTitle(title) {
  // "5 - 1 - 2 - [WEB] Mar.07" → ['05', '01', '02']
  const match = title.match(/^([\d\s\-]+)\s*-\s*\[WEB\]/);
  if (!match) return [];
  return match[1].split('-').map(n => n.trim().padStart(2, '0')).filter(Boolean);
}

// ── Helper: get due date timestamps ─────────────────────────────────────────
function getTaskDates(dateChoice) {
  // startTime = right now (cannot be in the past)
  const startTime = Math.floor(Date.now() / 1000);

  const dueDate = new Date();
  if (dateChoice === 'today') {
    dueDate.setDate(dueDate.getDate() + 1);
  } else if (dateChoice === 'tomorrow') {
    dueDate.setDate(dueDate.getDate() + 2);
  } else if (dateChoice === 'monday') {
    const day = dueDate.getDay();
    const daysUntilNextMonday = day === 0 ? 8 : (8 - day);
    dueDate.setDate(dueDate.getDate() + daysUntilNextMonday);
  }
  dueDate.setHours(21, 0, 0, 0);

  return {
    startTime,
    dueDate: Math.floor(dueDate.getTime() / 1000),
  };
}

// ── Helper: get clocked-in user IDs for given locations ─────────────────────
async function getClockedInUserIds(locations) {
  const clockedInIds = new Set();
  const today = new Date().toISOString().split('T')[0];

  for (const loc of locations) {
    const clockId = TIME_CLOCK_IDS[loc];
    if (!clockId) continue;

    try {
      const response = await axios.get(
        `${CONNECTEAM_BASE_URL}/time-clock/v1/time-clocks/${clockId}/time-activities`,
        {
          headers: { 'X-API-KEY': API_KEY, 'accept': 'application/json' },
          params: { startDate: today, endDate: today },
        }
      );
      const activities = response.data?.data?.activities || [];
      activities
        .filter(a => a.clockIn && !a.clockOut)
        .forEach(a => clockedInIds.add(a.userId));
    } catch (err) {
      console.error(`Error checking time clock for location ${loc}:`, err.message);
    }
  }

  return [...clockedInIds];
}

// ── Helper: send message via Custom Publisher ────────────────────────────────
async function sendMessageToUsers(userIds, api) {
  const message = 'Hi there, a transfer task for your store has been published / updated, please refresh Connecteam and check it out, thank you very much!';
  const results = [];

  for (const userId of userIds) {
    try {
      await api.post(`/chat/v1/conversations/privateMessage/${userId}`, {
        senderId: CUSTOM_PUBLISHER_ID,
        text: message,
      });
      results.push({ userId, sent: true });
    } catch (err) {
      console.error(`Failed to send message to user ${userId}:`, err.message);
      results.push({ userId, sent: false });
    }
  }

  return results;
}

// ── Helper: get WEB tasks from Connecteam ────────────────────────────────────
async function getWebTasks(api, status = 'published') {
  let allTasks = [];
  let offset = 0;
  const limit = 100;
  const WEB_LABEL_ID = LABEL_IDS['WEB'];

  while (true) {
    const response = await api.get(
      `${CONNECTEAM_BASE_URL}/tasks/v1/taskboards/${TASK_BOARD_ID}/tasks`,
      {
        params: new URLSearchParams([
          ['labelIds[]', WEB_LABEL_ID],
          ['status', status],
          ['limit', String(limit)],
          ['offset', String(offset)],
        ]),
      }
    );
    const tasks = response.data?.data?.tasks || [];
    allTasks = allTasks.concat(tasks);
    if (tasks.length < limit) break;
    offset += limit;
  }

  return allTasks;
}

// ============================================================================
// Routes
// ============================================================================

// GET /api/connecteam/settings
router.get('/settings', async (req, res) => {
  try {
    const rows = await db.prepare('SELECT key, value FROM connecteam_settings').all();
    const settings = {};
    rows.forEach(row => {
      try { settings[row.key] = JSON.parse(row.value); }
      catch { settings[row.key] = row.value; }
    });
    res.json(settings);
  } catch (err) {
    console.error('Error fetching connecteam settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connecteam/settings
router.post('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    await db.prepare(
      'INSERT INTO connecteam_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP'
    ).run(key, valueStr);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving connecteam setting:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/connecteam/users  — get cached user list
router.get('/users', async (req, res) => {
  try {
    const users = await db.prepare(
      'SELECT * FROM connecteam_users WHERE is_archived = 0 ORDER BY first_name, last_name'
    ).all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connecteam/sync-users  — sync users from Connecteam API
router.post('/sync-users', async (req, res) => {
  try {
    const api = await getApiClient();
    let allUsers = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const response = await api.get('/users/v1/users', { params: { limit, offset } });
      const users = response.data?.data?.users || [];
      allUsers = allUsers.concat(users);
      if (users.length < limit) break;
      offset += limit;
    }

    // Upsert into local cache
    for (const user of allUsers) {
      const userId = user.id || user.userId;
      await db.prepare(`
        INSERT INTO connecteam_users 
          (user_id, first_name, last_name, email, user_type, is_archived, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          email = EXCLUDED.email,
          user_type = EXCLUDED.user_type,
          is_archived = EXCLUDED.is_archived,
          synced_at = CURRENT_TIMESTAMP
      `).run(
        userId,
        user.firstName || '',
        user.lastName || '',
        user.email || '',
        user.userType || '',
        user.isArchived ? 1 : 0
      );
    }

    console.log(`Synced ${allUsers.length} Connecteam users`);
    res.json({ success: true, count: allUsers.length });
  } catch (err) {
    console.error('Error syncing Connecteam users:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/connecteam/search-user?name=xxx  — search user by name (for settings)
router.get('/search-user', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.json([]);

    const users = await db.prepare(`
      SELECT user_id, first_name, last_name, email
      FROM connecteam_users
      WHERE is_archived = 0
        AND (
          LOWER(first_name || ' ' || last_name) LIKE LOWER(?)
          OR LOWER(first_name) LIKE LOWER(?)
          OR LOWER(last_name) LIKE LOWER(?)
        )
      LIMIT 10
    `).all(`%${name}%`, `%${name}%`, `%${name}%`);

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/connecteam/latest-task  — get the most recent WEB task from our DB
router.get('/latest-task', async (req, res) => {
  try {
    const task = await db.prepare(
      'SELECT * FROM connecteam_tasks ORDER BY created_at DESC LIMIT 1'
    ).get();
    res.json(task || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/connecteam/not-tasked  — get waiting items that are NOT tasked
router.get('/not-tasked', async (req, res) => {
  try {
    const items = await db.prepare(`
      SELECT * FROM transfer_items
      WHERE status = 'waiting' AND connecteam_tasked = 0
      ORDER BY transfer_from ASC, created_at ASC
    `).all();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connecteam/publish-task
// Body: { itemIds, locationOrder, dateChoice }
router.post('/publish-task', async (req, res) => {
  try {
    const { itemIds, locationOrder, dateChoice } = req.body;

    if (!itemIds || itemIds.length === 0) {
      return res.status(400).json({ error: 'No items selected' });
    }

    // Fetch items from DB
    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT * FROM transfer_items WHERE id IN (${placeholders})`
    ).all(...itemIds);

    // Get settings
    const settingsRows = await db.prepare('SELECT key, value FROM connecteam_settings').all();
    const settings = {};
    settingsRows.forEach(r => {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    });

    const defaultAssigneeIds = settings.default_assignee_ids || [];
    const defaultDescription = settings.default_description || 'Please double check the SKU and quantity, Thank you.';
    const locationMembersMap = settings.location_members || {};

    // Determine unique locations from items
    const uniqueLocations = [...new Set(items.map(i => i.transfer_from).filter(Boolean))];

    // Sort location order: use provided order, fallback to ascending
    const sortedLocationOrder = locationOrder && locationOrder.length > 0
      ? locationOrder.filter(l => uniqueLocations.includes(l))
      : [...uniqueLocations].sort();
    // Add any locations not in the provided order
    uniqueLocations.forEach(loc => {
      if (!sortedLocationOrder.includes(loc)) sortedLocationOrder.push(loc);
    });

    // Build assignee IDs: default + location members
    const assigneeIds = new Set(defaultAssigneeIds.map(Number));
    for (const loc of uniqueLocations) {
      const members = locationMembersMap[loc] || [];
      members.forEach(id => assigneeIds.add(Number(id)));
    }

    // Build label IDs
    const labelIds = [LABEL_IDS['WAREHOUSE / DELIVERY'], LABEL_IDS['WEB']];
    uniqueLocations.forEach(loc => {
      const locLabel = LABEL_IDS[`MTL${loc}`];
      if (locLabel) labelIds.push(locLabel);
    });

    // Build subtasks: grouped by location order, each item = one subtask
    const subtasks = [];
    for (const loc of sortedLocationOrder) {
      const locItems = items.filter(i => i.transfer_from === loc);
      for (const item of locItems) {
        // Get copy text for this item
        const B = item.quantity;
        const pcText = B > 1 ? 'pcs' : 'pc';
        const C = item.custom_name || item.title || '';
        const D = item.sku || '';
        const E = item.order_number || '';
        const EMOJI_MAP = {
          '01': '🟫', '02': '🟧', '03': '🟨', '04': '🟩', '05': '⬛',
          '06': '🟪', '07': '🟥', '08': '⬜', '09': '🟦', '11': '🔳'
        };
        const emoji = EMOJI_MAP[loc] || '⬜';
        const A = `${emoji}${loc}${emoji}`;
        const subtaskTitle = `${A}  ${B} ${pcText} ----- ${C} SKU ${D}  #${E}`;
        subtasks.push(subtaskTitle);
      }
    }

    // Build title
    const title = buildTaskTitle(sortedLocationOrder, dateChoice || 'today');
    const titleDate = extractTitleDate(title);
    const { startTime, dueDate } = getTaskDates(dateChoice || 'today');

    // Call Connecteam API
    const api = await getApiClient();

    // Create task
    const taskResponse = await api.post(
      `/tasks/v1/taskboards/${TASK_BOARD_ID}/tasks`,
      {
        userIds: [...assigneeIds],
        status: 'published',
        title,
        startTime,
        dueDate,
        type: 'oneTime',
        labelIds,
        description: { content: defaultDescription },
      }
    );

    const taskData = taskResponse.data?.data;
    const taskId = taskData?.id || taskData?._id;

    if (!taskId) {
      throw new Error('Task created but no ID returned');
    }

    // Add subtasks
    for (const subtaskTitle of subtasks) {
      try {
        await api.post(
          `/tasks/v1/taskboards/${TASK_BOARD_ID}/tasks/${taskId}/sub-tasks`,
          { title: subtaskTitle, isCompleted: false }
        );
      } catch (err) {
        console.error(`Failed to create subtask: ${subtaskTitle}`, err.message);
      }
    }

    // Save task to DB
    await db.prepare(`
      INSERT OR REPLACE INTO connecteam_tasks (task_id, title, title_date, locations, item_count, status, updated_at)
      VALUES (?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP)
    `).run(taskId, title, titleDate, JSON.stringify(sortedLocationOrder), items.length);

    // Update transfer_items
    for (const item of items) {
      await db.prepare(`
        UPDATE transfer_items
        SET connecteam_tasked = 1, connecteam_task_id = ?, connecteam_task_title_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(taskId, titleDate, item.id);
    }

    // Send messages to clocked-in managers
    const clockedInIds = await getClockedInUserIds(uniqueLocations);
    if (clockedInIds.length > 0) {
      await sendMessageToUsers(clockedInIds, api);
    } else {
      // No one clocked in — send to all location members
      const allMemberIds = new Set();
      for (const loc of uniqueLocations) {
        const members = locationMembersMap[loc] || [];
        members.forEach(id => allMemberIds.add(Number(id)));
      }
      if (allMemberIds.size > 0) {
        await sendMessageToUsers([...allMemberIds], api);
      }
    }

    res.json({
      success: true,
      taskId,
      title,
      titleDate,
      itemsUpdated: items.length,
    });

  } catch (err) {
    console.error('Error publishing Connecteam task:', err.message);
    if (err.response) {
      console.error('Connecteam API status:', err.response.status);
      console.error('Connecteam API response:', JSON.stringify(err.response.data, null, 2));
      return res.status(500).json({
        error: err.message,
        details: err.response.data,
        status: err.response.status,
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connecteam/add-to-task
// Body: { itemIds, locationOrder }
router.post('/add-to-task', async (req, res) => {
  try {
    const { itemIds, locationOrder } = req.body;

    if (!itemIds || itemIds.length === 0) {
      return res.status(400).json({ error: 'No items selected' });
    }

    // Get the latest task from our DB
    const latestTask = await db.prepare(
      'SELECT * FROM connecteam_tasks ORDER BY created_at DESC LIMIT 1'
    ).get();

    if (!latestTask) {
      return res.status(404).json({ error: 'No previous task found. Please publish a new task first.' });
    }

    // Fetch items
    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT * FROM transfer_items WHERE id IN (${placeholders})`
    ).all(...itemIds);

    // Get settings
    const settingsRows = await db.prepare('SELECT key, value FROM connecteam_settings').all();
    const settings = {};
    settingsRows.forEach(r => {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    });
    const locationMembersMap = settings.location_members || {};

    // New unique locations from items
    const newLocations = [...new Set(items.map(i => i.transfer_from).filter(Boolean))];
    const existingLocations = JSON.parse(latestTask.locations || '[]');

    const api = await getApiClient();

    // Fetch the existing task from Connecteam
    const webTasks = await getWebTasks(api, 'published');
    const existingTask = webTasks.find(t => t.id === latestTask.task_id);

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found in Connecteam. It may have been deleted.' });
    }

    // ── Update title ──────────────────────────────────────────────────────────
    const titleLocations = extractLocationsFromTitle(existingTask.title);
    const titleDate = extractTitleDate(existingTask.title);
    const newTitleLocations = [...titleLocations];

    // Merge new locations into title order based on locationOrder provided
    for (const loc of (locationOrder || newLocations.sort())) {
      if (!newTitleLocations.includes(loc) && newLocations.includes(loc)) {
        // Find the right insertion point based on locationOrder
        const orderIndex = (locationOrder || []).indexOf(loc);
        if (orderIndex === 0) {
          newTitleLocations.unshift(loc);
        } else {
          // Insert after the previous location in locationOrder
          const prevLoc = (locationOrder || [])[orderIndex - 1];
          const prevIndex = newTitleLocations.indexOf(prevLoc);
          if (prevIndex >= 0) {
            newTitleLocations.splice(prevIndex + 1, 0, loc);
          } else {
            newTitleLocations.push(loc);
          }
        }
      }
    }

    const newTitle = `${newTitleLocations.map(l => parseInt(l, 10)).join(' - ')} - [WEB] ${titleDate}`;

    // ── Update assignees and labels ───────────────────────────────────────────
    const existingUserIds = new Set(existingTask.userIds || []);
    const newLabelIds = [...(existingTask.labelIds || [])];
    const locationsToNotify = [];

    for (const loc of newLocations) {
      if (!existingLocations.includes(loc)) {
        // New location — add members and label
        const members = locationMembersMap[loc] || [];
        members.forEach(id => existingUserIds.add(Number(id)));

        const locLabel = LABEL_IDS[`MTL${loc}`];
        if (locLabel && !newLabelIds.includes(locLabel)) newLabelIds.push(locLabel);

        locationsToNotify.push(loc);
      }
    }

    // ── PUT update the task ───────────────────────────────────────────────────
    const updatePayload = {
      ...existingTask,
      title: newTitle,
      userIds: [...existingUserIds],
      labelIds: newLabelIds,
      description: convertDescriptionForPut(existingTask.description),
    };
    delete updatePayload.id;
    delete updatePayload.isArchived;
    delete updatePayload.subTasks;

    await api.put(
      `/tasks/v1/taskboards/${TASK_BOARD_ID}/tasks/${latestTask.task_id}`,
      updatePayload
    );

    // ── Add subtasks ──────────────────────────────────────────────────────────
    const EMOJI_MAP = {
      '01': '🟫', '02': '🟧', '03': '🟨', '04': '🟩', '05': '⬛',
      '06': '🟪', '07': '🟥', '08': '⬜', '09': '🟦', '11': '🔳'
    };

    const subtaskOrder = locationOrder && locationOrder.length > 0
      ? locationOrder.filter(l => newLocations.includes(l))
      : [...newLocations].sort();
    newLocations.forEach(loc => { if (!subtaskOrder.includes(loc)) subtaskOrder.push(loc); });

    for (const loc of subtaskOrder) {
      const locItems = items.filter(i => i.transfer_from === loc);
      for (const item of locItems) {
        const B = item.quantity;
        const pcText = B > 1 ? 'pcs' : 'pc';
        const C = item.custom_name || item.title || '';
        const D = item.sku || '';
        const E = item.order_number || '';
        const emoji = EMOJI_MAP[loc] || '⬜';
        const A = `${emoji}${loc}${emoji}`;
        const subtaskTitle = `${A}  ${B} ${pcText} ----- ${C} SKU ${D}  #${E}`;

        try {
          await api.post(
            `/tasks/v1/taskboards/${TASK_BOARD_ID}/tasks/${latestTask.task_id}/sub-tasks`,
            { title: subtaskTitle, isCompleted: false }
          );
        } catch (err) {
          console.error(`Failed to add subtask: ${subtaskTitle}`, err.message);
        }
      }
    }

    // ── Update DB ─────────────────────────────────────────────────────────────
    const allLocations = [...new Set([...existingLocations, ...newLocations])];
    await db.prepare(`
      UPDATE connecteam_tasks
      SET title = ?, locations = ?, item_count = item_count + ?, updated_at = CURRENT_TIMESTAMP
      WHERE task_id = ?
    `).run(newTitle, JSON.stringify(allLocations), items.length, latestTask.task_id);

    for (const item of items) {
      await db.prepare(`
        UPDATE transfer_items
        SET connecteam_tasked = 1, connecteam_task_id = ?, connecteam_task_title_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(latestTask.task_id, titleDate, item.id);
    }

    // ── Send messages ─────────────────────────────────────────────────────────
    // Only notify managers of newly added locations
    const locationsForNotification = locationsToNotify.length > 0 ? locationsToNotify : newLocations;
    const clockedInIds = await getClockedInUserIds(locationsForNotification);
    if (clockedInIds.length > 0) {
      await sendMessageToUsers(clockedInIds, api);
    } else {
      const allMemberIds = new Set();
      for (const loc of locationsForNotification) {
        const members = locationMembersMap[loc] || [];
        members.forEach(id => allMemberIds.add(Number(id)));
      }
      if (allMemberIds.size > 0) {
        await sendMessageToUsers([...allMemberIds], api);
      }
    }

    res.json({
      success: true,
      taskId: latestTask.task_id,
      newTitle,
      titleDate,
      itemsUpdated: items.length,
    });

  } catch (err) {
    console.error('Error adding to Connecteam task:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;