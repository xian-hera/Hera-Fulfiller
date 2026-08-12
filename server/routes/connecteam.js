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

const EMOJI_MAP = {
  '01': '🟫', '02': '🟧', '03': '🟨', '04': '🟩', '05': '⬛',
  '06': '🟪', '07': '🟥', '08': '⬜', '09': '🟦', '11': '🔳'
};

// ── Helper: build subtask title for one transfer item ────────────────────────
async function buildSubtaskTitle(item, loc) {
  const B = item.quantity;
  const pcText = B > 1 ? 'pcs' : 'pc';
  const D = item.sku || '';
  const E = item.order_number || '';
  const emoji = EMOJI_MAP[loc] || '⬜';
  const A = `${emoji}${loc}${emoji}`;

  let wigPrefix = '';
  if (item.product_type && item.product_type.toUpperCase() === 'WIG') {
    try {
      const lineItem = await db.prepare(
        'SELECT wig_number FROM line_items WHERE id = ?'
      ).get(item.line_item_id);
      if (lineItem?.wig_number) {
        wigPrefix = `${lineItem.wig_number} `;
      }
    } catch (err) {
      console.error(`Failed to fetch wig_number for line_item ${item.line_item_id}:`, err.message);
    }
  }

  const C = `${wigPrefix}${item.custom_name || item.title || ''}`;
  return `${A}  ${B} ${pcText} ----- ${C} SKU ${D}  #${E}`;
}

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
  '10': 6905921,  // MTL10_M (confirmed via API testing)
  '11': 6905956,  // MTL11_M
};

let accessToken = null;
let tokenExpiry = null;

// ── OAuth Token ──────────────────────────────────────────────────────────────

async function getAccessToken() {
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

// ── Helper: get due date object based on dateChoice ──────────────────────────
function getDueDate(dateChoice) {
  const date = new Date();
  if (dateChoice === 'tomorrow') {
    date.setDate(date.getDate() + 1);
  } else if (dateChoice === 'monday') {
    const day = date.getDay();
    const daysUntilMonday = day === 0 ? 1 : (8 - day);
    date.setDate(date.getDate() + daysUntilMonday);
  }
  // 'today' keeps date as-is
  date.setHours(21, 0, 0, 0);
  return date;
}

// ── Helper: build task title ─────────────────────────────────────────────────
function buildTaskTitle(locationOrder, dateChoice) {
  const locNumbers = locationOrder.map(loc => parseInt(loc, 10).toString());

  const dueDate = getDueDate(dateChoice);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateStr = `${months[dueDate.getMonth()]}.${String(dueDate.getDate()).padStart(2, '0')}`;

  return `${locNumbers.join(' - ')} - [WEB] ${dateStr}`;
}

function extractTitleDate(title) {
  const match = title.match(/\[WEB\]\s*([A-Za-z]+\.\d+)/);
  return match ? match[1] : '';
}

function extractLocationsFromTitle(title) {
  const match = title.match(/^([\d\s\-]+)\s*-\s*\[WEB\]/);
  if (!match) return [];
  return match[1].split('-').map(n => n.trim().padStart(2, '0')).filter(Boolean);
}

// ── Helper: get due date timestamps ─────────────────────────────────────────
function getTaskDates(dateChoice) {
  const startTime = Math.floor(Date.now() / 1000);
  const dueDate = getDueDate(dateChoice);
  return {
    startTime,
    dueDate: Math.floor(dueDate.getTime() / 1000),
  };
}

// ── Helper: get clocked-in user IDs for given locations ─────────────────────
async function getClockedInUserIds(locations) {
  const clockedInIds = new Set();
  const today = new Date().toISOString().split('T')[0];

  // 🆕 并发查询所有 location 的打卡状态（Connecteam 确认 Enterprise 计划无并发限制）
  await Promise.all(locations.map(async (loc) => {
    const clockId = TIME_CLOCK_IDS[loc];
    if (!clockId) return;

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
  }));

  return [...clockedInIds];
}

// ── Helper: send message via Custom Publisher ────────────────────────────────
async function sendMessageToUsers(userIds, api) {
  const message = 'Hi there, a transfer task for your store has been published / updated, please refresh Connecteam and check it out, thank you very much!';

  // 🆕 并发发送私信，不再逐个排队等待
  const results = await Promise.all(userIds.map(async (userId) => {
    try {
      await api.post(`/chat/v1/conversations/privateMessage/${userId}`, {
        senderId: CUSTOM_PUBLISHER_ID,
        text: message,
      });
      return { userId, sent: true };
    } catch (err) {
      console.error(`Failed to send message to user ${userId}:`, err.message);
      return { userId, sent: false };
    }
  }));

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

// GET /api/connecteam/users
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

// GET /api/connecteam/clocked-in?location=01
// 🆕 Phone Numbers modal — "Check Clock In" button for a single location
router.get('/clocked-in', async (req, res) => {
  try {
    const { location } = req.query;
    if (!location) {
      return res.status(400).json({ error: 'location is required' });
    }
    const clockedInUserIds = await getClockedInUserIds([location]);
    res.json({ clockedInUserIds });
  } catch (err) {
    console.error('Error checking clocked-in status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connecteam/sync-users
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

    for (const user of allUsers) {
      const userId = user.id || user.userId;
      await db.prepare(`
        INSERT INTO connecteam_users
          (user_id, first_name, last_name, email, phone_number, user_type, is_archived, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          email = EXCLUDED.email,
          phone_number = EXCLUDED.phone_number,
          user_type = EXCLUDED.user_type,
          is_archived = EXCLUDED.is_archived,
          synced_at = CURRENT_TIMESTAMP
      `).run(
        userId,
        user.firstName || '',
        user.lastName || '',
        user.email || '',
        user.phoneNumber || '',
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

// GET /api/connecteam/search-user?name=xxx
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

// GET /api/connecteam/latest-task
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

// GET /api/connecteam/not-tasked
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

const recentPublishRequests = new Map();

router.post('/publish-task', async (req, res) => {
  try {
    const { itemIds, locationOrder, dateChoice } = req.body;

    if (!itemIds || itemIds.length === 0) {
      return res.status(400).json({ error: 'No items selected' });
    }

    // Dedup guard (2 分钟窗口)
    const requestKey = JSON.stringify([...itemIds].sort());
    const lastRequest = recentPublishRequests.get(requestKey);
    if (lastRequest && Date.now() - lastRequest < 120000) {
      console.log('Duplicate publish-task request blocked:', requestKey);
      return res.status(429).json({ error: 'Duplicate request. Please wait a moment before trying again.' });
    }
    recentPublishRequests.set(requestKey, Date.now());
    for (const [key, time] of recentPublishRequests.entries()) {
      if (Date.now() - time > 150000) recentPublishRequests.delete(key);
    }

    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT * FROM transfer_items WHERE id IN (${placeholders})`
    ).all(...itemIds);

    const settingsRows = await db.prepare('SELECT key, value FROM connecteam_settings').all();
    const settings = {};
    settingsRows.forEach(r => {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    });

    const defaultAssigneeIds = settings.default_assignee_ids || [];
    const defaultDescription = settings.default_description || 'Please double check the SKU and quantity, Thank you.';
    const locationMembersMap = settings.location_members || {};

    const uniqueLocations = [...new Set(items.map(i => i.transfer_from).filter(Boolean))];

    const sortedLocationOrder = locationOrder && locationOrder.length > 0
      ? locationOrder.filter(l => uniqueLocations.includes(l))
      : [...uniqueLocations].sort();
    uniqueLocations.forEach(loc => {
      if (!sortedLocationOrder.includes(loc)) sortedLocationOrder.push(loc);
    });

    const assigneeIds = new Set(defaultAssigneeIds.map(Number));
    for (const loc of uniqueLocations) {
      const members = locationMembersMap[loc] || [];
      members.forEach(id => assigneeIds.add(Number(id)));
    }

    const labelIds = [LABEL_IDS['WAREHOUSE / DELIVERY'], LABEL_IDS['WEB']];
    uniqueLocations.forEach(loc => {
      const locLabel = LABEL_IDS[`MTL${loc}`];
      if (locLabel) labelIds.push(locLabel);
    });

    // 🆕 每个 sub-task 现在是 { title, isCompleted } 对象，直接嵌套进 Create Task 请求里
    // 数组顺序 = sortedLocationOrder 的顺序（location 内按 item 原顺序），一次请求搞定，顺序有保证
    const subTasks = [];
    for (const loc of sortedLocationOrder) {
      const locItems = items.filter(i => i.transfer_from === loc);
      for (const item of locItems) {
        const subtaskTitle = await buildSubtaskTitle(item, loc);
        subTasks.push({ title: subtaskTitle, isCompleted: false });
      }
    }

    const title = buildTaskTitle(sortedLocationOrder, dateChoice || 'today');
    const titleDate = extractTitleDate(title);
    const { startTime, dueDate } = getTaskDates(dateChoice || 'today');

    const api = await getApiClient();

    // 🆕 Task + 全部 sub-task 一次性建好（比逐个 POST sub-task 快得多，顺序也有保证）
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
        subTasks,
      }
    );

    const taskData = taskResponse.data?.data;
    const taskId = taskData?.id || taskData?._id;

    if (!taskId) {
      throw new Error('Task created but no ID returned');
    }

    await db.prepare(`
      INSERT INTO connecteam_tasks (task_id, title, title_date, locations, item_count, status, updated_at)
      VALUES (?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP)
      ON CONFLICT (task_id) DO UPDATE SET
        title = EXCLUDED.title,
        title_date = EXCLUDED.title_date,
        locations = EXCLUDED.locations,
        item_count = EXCLUDED.item_count,
        updated_at = CURRENT_TIMESTAMP
    `).run(taskId, title, titleDate, JSON.stringify(sortedLocationOrder), items.length);

    for (const item of items) {
      await db.prepare(`
        UPDATE transfer_items
        SET connecteam_tasked = 1, connecteam_task_id = ?, connecteam_task_title_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(taskId, titleDate, item.id);
    }

    const clockedInIds = await getClockedInUserIds(uniqueLocations);
    if (clockedInIds.length > 0) {
      await sendMessageToUsers(clockedInIds, api);
    } else {
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

    const latestTask = await db.prepare(
      'SELECT * FROM connecteam_tasks ORDER BY created_at DESC LIMIT 1'
    ).get();

    if (!latestTask) {
      return res.status(404).json({ error: 'No previous task found. Please publish a new task first.' });
    }

    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT * FROM transfer_items WHERE id IN (${placeholders})`
    ).all(...itemIds);

    const settingsRows = await db.prepare('SELECT key, value FROM connecteam_settings').all();
    const settings = {};
    settingsRows.forEach(r => {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    });
    const locationMembersMap = settings.location_members || {};

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

    for (const loc of (locationOrder || newLocations.sort())) {
      if (!newTitleLocations.includes(loc) && newLocations.includes(loc)) {
        const orderIndex = (locationOrder || []).indexOf(loc);
        if (orderIndex === 0) {
          newTitleLocations.unshift(loc);
        } else {
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
        const members = locationMembersMap[loc] || [];
        members.forEach(id => existingUserIds.add(Number(id)));

        const locLabel = LABEL_IDS[`MTL${loc}`];
        if (locLabel && !newLabelIds.includes(locLabel)) newLabelIds.push(locLabel);

        locationsToNotify.push(loc);
      }
    }

    // ── Build subtasks array: 旧的（带 id）+ 新的（不带 id）────────────────────
    // 旧的 subtask 原样保留，带上 id 和 isCompleted，确保 checked 状态不丢失
    const existingSubTasks = (existingTask.subTasks || []).map(st => ({
      id: st.id,
      title: st.title,
      isCompleted: st.isCompleted ?? false,
    }));

    // 新的 subtask 按 location 顺序构建
    const subtaskOrder = locationOrder && locationOrder.length > 0
      ? locationOrder.filter(l => newLocations.includes(l))
      : [...newLocations].sort();
    newLocations.forEach(loc => { if (!subtaskOrder.includes(loc)) subtaskOrder.push(loc); });

    const newSubTasks = [];
    for (const loc of subtaskOrder) {
      const locItems = items.filter(i => i.transfer_from === loc);
      for (const item of locItems) {
        const subtaskTitle = await buildSubtaskTitle(item, loc);
        newSubTasks.push({ title: subtaskTitle, isCompleted: false }); // 新的不带 id
      }
    }

    // 旧的在前，新的追加在后
    const allSubTasks = [...existingSubTasks, ...newSubTasks];

    // ── PUT update the task，包含完整 subTasks 数组 ───────────────────────────
    const updatePayload = {
      title: newTitle,
      status: existingTask.status,
      type: existingTask.type,
      userIds: [...existingUserIds],
      labelIds: newLabelIds,
      description: convertDescriptionForPut(existingTask.description),
      subTasks: allSubTasks,
    };

    await api.put(
      `/tasks/v1/taskboards/${TASK_BOARD_ID}/tasks/${latestTask.task_id}`,
      updatePayload
    );

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
    console.error('Error adding to Connecteam task:', err.message);
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

module.exports = router;