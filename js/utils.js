/* ===========================
   共通ユーティリティ関数
   =========================== */

function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '¥0';
  return '¥' + Math.round(amount).toLocaleString('ja-JP');
}

function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateDisplay(dateStr) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(dateStr + 'T00:00:00');
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const w = days[d.getDay()];
  return `${m}/${day}（${w}）`;
}

function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function today() {
  return formatDate(new Date());
}

function showToast(message, type = '', duration = 2400) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast'; }, duration);
}

function paymentIcon(method) {
  const icons = {
    '現金': 'fas fa-yen-sign',
    'クレジット': 'fas fa-credit-card',
    '電子マネー': 'fas fa-mobile-alt',
    'QRコード': 'fas fa-qrcode',
  };
  return `<i class="${icons[method] || 'fas fa-circle'}"></i>`;
}

/**
 * LocalStorage ベースのデータストア
 * tables/[tableName] のパターンをエミュレート
 */
async function apiFetch(url, options = {}) {
  // URLを解析: tables/employees, tables/employees/123 など
  const urlParts = url.split('?')[0].split('/');
  const method = options.method || 'GET';
  
  // tables/[tableName] または tables/[tableName]/[id]
  if (urlParts[0] === 'tables' && urlParts[1]) {
    const tableName = urlParts[1];
    const recordId = urlParts[2] ? parseInt(urlParts[2]) : null;
    
    if (method === 'GET') {
      const allRecords = getTableData(tableName);
      if (recordId) {
        // 単一レコード取得
        const record = allRecords.find(r => r.id === recordId);
        if (!record) throw new Error(`Record ${recordId} not found in ${tableName}`);
        return record;
      } else {
        // 全レコード取得（ページネーション対応）
        const query = new URLSearchParams(url.split('?')[1] || '');
        const page = parseInt(query.get('page')) || 1;
        const limit = parseInt(query.get('limit')) || 500;
        const start = (page - 1) * limit;
        const end = start + limit;
        return {
          data: allRecords.slice(start, end),
          total: allRecords.length,
          page,
          limit
        };
      }
    }
    
    if (method === 'POST') {
      // 新規作成
      const allRecords = getTableData(tableName);
      const body = options.body ? JSON.parse(options.body) : {};
      const newRecord = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...body
      };
      allRecords.push(newRecord);
      saveTableData(tableName, allRecords);
      return newRecord;
    }
    
    if (method === 'PUT' && recordId) {
      // 更新
      const allRecords = getTableData(tableName);
      const index = allRecords.findIndex(r => r.id === recordId);
      if (index === -1) throw new Error(`Record ${recordId} not found in ${tableName}`);
      const body = options.body ? JSON.parse(options.body) : {};
      allRecords[index] = {
        ...allRecords[index],
        ...body,
        id: recordId,
        updated_at: new Date().toISOString()
      };
      saveTableData(tableName, allRecords);
      return allRecords[index];
    }
    
    if (method === 'DELETE' && recordId) {
      // 削除
      const allRecords = getTableData(tableName);
      const filtered = allRecords.filter(r => r.id !== recordId);
      if (filtered.length === allRecords.length) {
        throw new Error(`Record ${recordId} not found in ${tableName}`);
      }
      saveTableData(tableName, filtered);
      return null;
    }
  }
  
  throw new Error(`Unsupported API call: ${method} ${url}`);
}

/**
 * LocalStorageからテーブルデータを取得
 */
function getTableData(tableName) {
  try {
    const data = localStorage.getItem(`venom_table_${tableName}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error(`Error reading table ${tableName}:`, e);
    return [];
  }
}

/**
 * LocalStorageにテーブルデータを保存
 */
function saveTableData(tableName, records) {
  try {
    localStorage.setItem(`venom_table_${tableName}`, JSON.stringify(records));
  } catch (e) {
    console.error(`Error saving table ${tableName}:`, e);
    throw new Error('データの保存に失敗しました');
  }
}

function showLoading(el) {
  if (!el) return;
  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>読み込み中…</span></div>`;
}

/**
 * 税計算ヘルパー
 * amount = 小計（税抜）として 10% 消費税を計算
 */
function calcTax(amount) {
  const subtotal = Math.round(amount || 0);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

/**
 * 売上レコードから税込合計を取得
 * total フィールドがあればそれを優先、なければ amount から計算
 */
function getSaleTotal(sale) {
  if (sale.total != null && sale.total > 0) return sale.total;
  return calcTax(sale.amount).total;
}

/**
 * 売上レコードから1件分のHTML文字列を生成
 * 小計・消費税・税込合計を表示、staff_name があれば担当者バッジを表示
 */
function buildSaleItemHTML(sale, showDeleteBtn = true) {
  const timeStr  = sale.time || '';
  const method   = sale.payment_method || '';
  const category = sale.category || '';
  const note     = sale.note || '';
  const staffName = sale.staff_name || '';
  const isTaxCut  = sale.tax_cut === true || sale.tax_cut === 'true';

  // 金額計算: total フィールドがあれば使用、なければ amount から算出
  const subtotal = sale.subtotal != null ? Math.round(sale.subtotal) : Math.round(sale.amount || 0);
  const tax      = isTaxCut ? 0 : (sale.tax != null ? Math.round(sale.tax) : Math.round(subtotal * 0.1));
  const total    = isTaxCut ? subtotal : (sale.total != null ? Math.round(sale.total) : subtotal + tax);

  const deleteBtn = showDeleteBtn
    ? `<button class="btn-delete" data-id="${sale.id}" onclick="confirmDelete('${sale.id}')" aria-label="削除">
         <i class="fas fa-trash-alt"></i>
       </button>`
    : '';

  const categoryTag = category
    ? `<span class="sale-tag">${category}</span>`
    : '';

  // 従業員バッジ
  const staffBadge = staffName
    ? `<span class="sale-staff-badge" data-staff="${staffName}">
         <i class="fas fa-user"></i> ${staffName}
       </span>`
    : '';

  const noteRow = note
    ? `<div class="sale-note"><i class="fas fa-sticky-note" style="font-size:10px;"></i> ${note}</div>`
    : '';

  // TAX CUT バッジ / 税行表示の分岐
  const taxCutBadge = isTaxCut
    ? `<span class="sale-taxcut-badge"><i class="fas fa-scissors"></i> TAX CUT</span>`
    : '';

  const taxRow = isTaxCut
    ? `<div class="sale-tax-row taxcut-row">
         <span class="sale-subtotal-text">税抜 ${formatCurrency(subtotal)}</span>
         <span class="sale-tax-cut-text">消費税カット</span>
       </div>`
    : `<div class="sale-tax-row">
         <span class="sale-subtotal-text">小計 ${formatCurrency(subtotal)}</span>
         <span class="sale-tax-text">消費税 ${formatCurrency(tax)}</span>
       </div>`;

  const totalLabel = isTaxCut
    ? `<span class="sale-tax-label taxcut">TAX CUT</span>`
    : `<span class="sale-tax-label">税込</span>`;

  return `
    <div class="sale-item${isTaxCut ? ' taxcut-item' : ''}" data-id="${sale.id}" data-method="${method}" data-staff="${staffName}">
      <div class="sale-icon">${paymentIcon(method)}</div>
      <div class="sale-body">
        <div class="sale-amount-block">
          <div class="sale-amount-total">${formatCurrency(total)}${totalLabel}</div>
          ${taxRow}
        </div>
        <div class="sale-meta">
          <span class="sale-time">${timeStr}</span>
          <span>${method}</span>
          ${categoryTag}
          ${taxCutBadge}
          ${staffBadge}
        </div>
        ${noteRow}
      </div>
      ${deleteBtn}
    </div>`;
}

/**
 * 管理者が設定した「営業日」を取得する
 * app_settings テーブルの business_date キーを参照し、
 * 設定がなければ今日の実日付（today()）を返す
 * @returns {Promise<string>} YYYY-MM-DD 形式の営業日
 */
async function getBusinessDate() {
  try {
    const all = await fetchAllRecords('app_settings');
    const rec = all.find(r => r.key === 'business_date');
    if (rec && rec.value && rec.value.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return rec.value;
    }
  } catch (e) {
    // 取得失敗時は実日付にフォールバック
  }
  return today();
}

async function fetchAllRecords(tableName) {
  let page = 1;
  const limit = 500;
  let all = [];
  while (true) {
    const res = await apiFetch(`tables/${tableName}?page=${page}&limit=${limit}`);
    all = all.concat(res.data || []);
    if (all.length >= res.total) break;
    page++;
  }
  return all;
}
