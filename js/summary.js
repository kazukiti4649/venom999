/* ===========================
   日次集計・レジ締めページ (summary.html)
   =========================== */

// ---- 状態 ----
let summaryData = {
  sales: [],
  date: today(),
  registerRecord: null,
  employees: [],
};

// ---- 初期化 ----
document.addEventListener('DOMContentLoaded', async () => {
  // ① ログイン必須チェック
  if (!Auth.requireLogin()) return;

  Auth.renderUserBadge();
  Auth.applyPermissions();

  // ② 営業日を取得して日付ピッカーの初期値に使用
  const bizDate = await getBusinessDate();
  summaryData.date = bizDate;

  const datePicker = document.getElementById('target-date');
  if (datePicker) {
    datePicker.value = bizDate;
    datePicker.addEventListener('change', () => {
      summaryData.date = datePicker.value;
      loadSummary();
    });
  }

  // ③ 営業日バナーを表示（実日付と異なる場合）
  updateSummaryBizDateBanner(bizDate);

  document.getElementById('btn-close-register')?.addEventListener('click', calcReconcile);
  document.getElementById('btn-save-result')?.addEventListener('click', saveRegisterResult);

  loadSummary();
});

function updateSummaryBizDateBanner(bizDate) {
  const bannerEl  = document.getElementById('biz-date-banner');
  const bannerText = document.getElementById('biz-date-banner-text');
  if (!bannerEl || !bannerText) return;

  const realToday = today();
  if (bizDate && bizDate !== realToday) {
    bannerEl.style.display = 'flex';
    bannerText.textContent = `営業日: ${formatDateDisplay(bizDate)}（実際の日付とは異なります）`;
  } else {
    bannerEl.style.display = 'none';
  }
}

// ---- 集計データ読み込み ----
async function loadSummary() {
  const dateStr = summaryData.date;

  const labelEl = document.getElementById('summary-date-label');
  if (labelEl) labelEl.textContent = formatDateDisplay(dateStr);

  showLoading(document.getElementById('breakdown-grid'));
  showLoading(document.getElementById('summary-sales-list'));
  showLoading(document.getElementById('category-breakdown'));
  showLoading(document.getElementById('staff-summary-list'));

  try {
    // 全ロール: sales / daily_register / employees を取得
    const [allSales, allRegister, allEmployees] = await Promise.all([
      fetchAllRecords('sales'),
      fetchAllRecords('daily_register'),
      fetchAllRecords('employees'),
    ]);

    // 全スタッフ共通: 全員分の売上を表示
    const sales = allSales
      .filter(s => s.date === dateStr)
      .sort((a, b) => b.time.localeCompare(a.time));

    summaryData.sales = sales;
    summaryData.employees = allEmployees.filter(e => e.is_active !== false);

    const regRec = allRegister.find(r => r.date === dateStr) || null;
    summaryData.registerRecord = regRec;

    renderSummaryTotal(sales);
    renderBreakdown(sales);
    renderCategoryBreakdown(sales);
    renderStaffSummary(sales, summaryData.employees);
    renderSummaryList(sales);
    restoreRegisterForm(regRec);

  } catch (err) {
    console.error(err);
    showToast('データ読み込みに失敗しました', 'error');
  }
}

// ---- 売上合計 ----
function renderSummaryTotal(sales) {
  const subtotalSum = sales.reduce((sum, s) => sum + (s.subtotal || s.amount || 0), 0);
  const taxSum      = sales.reduce((sum, s) => sum + (s.tax != null ? s.tax : Math.round((s.subtotal || s.amount || 0) * 0.1)), 0);
  const totalSum    = sales.reduce((sum, s) => sum + getSaleTotal(s), 0);

  document.getElementById('summary-total').textContent = formatCurrency(totalSum);
  document.getElementById('summary-count').textContent = `${sales.length}件の取引`;

  // 小計・消費税の補助表示
  const subtotalEl = document.getElementById('summary-subtotal');
  const taxEl      = document.getElementById('summary-tax');
  if (subtotalEl) subtotalEl.textContent = `小計 ${formatCurrency(subtotalSum)}`;
  if (taxEl)      taxEl.textContent      = `消費税 ${formatCurrency(taxSum)}`;
}

// ---- 支払い方法別内訳 ----
function renderBreakdown(sales) {
  const grid = document.getElementById('breakdown-grid');
  if (!grid) return;

  const methods = ['現金', 'クレジット', '電子マネー', 'QRコード'];
  const icons = {
    '現金': 'fas fa-yen-sign',
    'クレジット': 'fas fa-credit-card',
    '電子マネー': 'fas fa-mobile-alt',
    'QRコード': 'fas fa-qrcode',
  };
  const map = {};
  methods.forEach(m => { map[m] = { total: 0, count: 0 }; });
  sales.forEach(s => {
    const m = s.payment_method || '現金';
    if (!map[m]) map[m] = { total: 0, count: 0 };
    map[m].total += getSaleTotal(s);  // 税込合計で集計
    map[m].count++;
  });

  const grandTotal = sales.reduce((sum, s) => sum + getSaleTotal(s), 0);

  grid.innerHTML = methods.map(m => {
    const d = map[m];
    const pct = grandTotal > 0 ? Math.round((d.total / grandTotal) * 100) : 0;
    return `
      <div class="breakdown-item method-${m}">
        <div class="breakdown-label"><i class="${icons[m]}"></i> ${m}</div>
        <div class="breakdown-amount">${formatCurrency(d.total)}</div>
        <div class="breakdown-sub">${d.count}件 / ${pct}%</div>
      </div>`;
  }).join('');
}

// ---- カテゴリ別集計 ----
function renderCategoryBreakdown(sales) {
  const el = document.getElementById('category-breakdown');
  if (!el) return;

  const catMap = {};
  sales.forEach(s => {
    const cat = s.category || '未分類';
    if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
    catMap[cat].total += getSaleTotal(s);  // 税込合計で集計
    catMap[cat].count++;
  });

  const cats = Object.entries(catMap).sort((a, b) => b[1].total - a[1].total);
  if (cats.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-tag"></i><p>カテゴリデータなし</p></div>`;
    return;
  }

  const grandTotal = sales.reduce((sum, s) => sum + getSaleTotal(s), 0);
  el.innerHTML = cats.map(([cat, d]) => {
    const pct = grandTotal > 0 ? Math.round((d.total / grandTotal) * 100) : 0;
    return `
      <div class="breakdown-item">
        <div class="breakdown-label"><i class="fas fa-tag"></i> ${cat}</div>
        <div class="breakdown-amount">${formatCurrency(d.total)}</div>
        <div class="breakdown-sub">${d.count}件 / ${pct}%</div>
      </div>`;
  }).join('');
}

// ---- 従業員別集計 ----
function renderStaffSummary(sales, employees) {
  const el = document.getElementById('staff-summary-list');
  if (!el) return;

  // 従業員ごとに集計
  const staffMap = {};

  // 登録済み従業員を先に入れる
  employees.forEach(e => {
    staffMap[e.name] = {
      name: e.name,
      color: e.color || '#1a73e8',
      total: 0,
      count: 0,
      cashTotal: 0,
      byMethod: {},
    };
  });

  // 売上を集計（従業員未登録名義も拾う）
  sales.forEach(s => {
    const name = s.staff_name || '未設定';
    if (!staffMap[name]) {
      staffMap[name] = { name, color: '#9e9e9e', total: 0, count: 0, cashTotal: 0, byMethod: {} };
    }
    const sTotal = getSaleTotal(s);  // 税込合計で集計
    staffMap[name].total += sTotal;
    staffMap[name].count++;
    const m = s.payment_method || '現金';
    staffMap[name].byMethod[m] = (staffMap[name].byMethod[m] || 0) + sTotal;
    if (m === '現金') staffMap[name].cashTotal += sTotal;
  });

  const staffList = Object.values(staffMap).sort((a, b) => b.total - a.total);
  const grandTotal = sales.reduce((sum, s) => sum + getSaleTotal(s), 0);

  if (staffList.length === 0 || grandTotal === 0) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><p>売上データがありません</p></div>`;
    return;
  }

  el.innerHTML = staffList.map(staff => {
    const pct = grandTotal > 0 ? Math.round((staff.total / grandTotal) * 100) : 0;
    const barWidth = grandTotal > 0 ? (staff.total / grandTotal * 100).toFixed(1) : 0;
    const initial = staff.name.charAt(0);
    const color = staff.color;

    // 支払い方法内訳（ミニ）
    const methodBadges = Object.entries(staff.byMethod)
      .sort((a, b) => b[1] - a[1])
      .map(([m, amt]) => `<span class="staff-method-badge">${m} ${formatCurrency(amt)}</span>`)
      .join('');

    return `
      <div class="staff-summary-item">
        <div class="staff-summary-head">
          <div class="staff-summary-avatar" style="background:${color};">${initial}</div>
          <div class="staff-summary-body">
            <div class="staff-summary-name">${staff.name}</div>
            <div class="staff-summary-meta">${staff.count}件 / ${pct}%</div>
          </div>
          <div class="staff-summary-amount" style="color:${color};">${formatCurrency(staff.total)}</div>
        </div>
        <div class="staff-progress-wrap">
          <div class="staff-progress-bar" style="width:${barWidth}%;background:${color};"></div>
        </div>
        <div class="staff-method-badges">${methodBadges}</div>
      </div>`;
  }).join('');
}

// ---- 明細リスト ----
function renderSummaryList(sales) {
  const el = document.getElementById('summary-sales-list');
  if (!el) return;
  if (sales.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-receipt"></i><p>この日の売上はありません</p></div>`;
    return;
  }
  el.innerHTML = sales.map(s => buildSaleItemHTML(s, false)).join('');
}

// ---- レジ締めフォーム復元 ----
function restoreRegisterForm(rec) {
  const statusBadge = document.getElementById('close-status-badge');
  const resultCard = document.getElementById('result-card');

  if (rec) {
    if (statusBadge) {
      statusBadge.textContent = rec.is_closed ? '締め済み' : '未締め';
      statusBadge.className = `status-badge ${rec.is_closed ? 'closed' : 'open'}`;
    }
    const openingEl = document.getElementById('opening-balance');
    const cashEl = document.getElementById('cash-in-register');
    const noteEl = document.getElementById('register-note');
    if (openingEl) openingEl.value = rec.opening_balance || '';
    if (cashEl) cashEl.value = rec.cash_in_register || '';
    if (noteEl) noteEl.value = rec.note || '';

    if (rec.is_closed && rec.cash_in_register != null) {
      renderReconcileResult(rec.opening_balance || 0, rec.cash_in_register, summaryData.sales);
      if (resultCard) resultCard.style.display = '';
    }
  } else {
    if (statusBadge) {
      statusBadge.textContent = '未締め';
      statusBadge.className = 'status-badge open';
    }
    if (resultCard) resultCard.style.display = 'none';
  }
}

// ---- レジ締め計算 ----
function calcReconcile() {
  const opening = parseFloat(document.getElementById('opening-balance').value) || 0;
  const cashInRegister = parseFloat(document.getElementById('cash-in-register').value);

  if (isNaN(cashInRegister) || cashInRegister < 0) {
    showToast('レジ内現金を入力してください', 'error');
    document.getElementById('cash-in-register').focus();
    return;
  }

  const resultCard = document.getElementById('result-card');
  if (resultCard) resultCard.style.display = '';
  renderReconcileResult(opening, cashInRegister, summaryData.sales);
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- 突き合わせ結果レンダリング ----
function renderReconcileResult(opening, cashInRegister, sales) {
  // 現金売上は税込合計で突き合わせ
  const cashSales = sales
    .filter(s => s.payment_method === '現金')
    .reduce((sum, s) => sum + getSaleTotal(s), 0);

  const expected = opening + cashSales;
  const diff = cashInRegister - expected;

  document.getElementById('res-cash-sales').textContent = formatCurrency(cashSales);
  document.getElementById('res-opening').textContent = formatCurrency(opening);
  document.getElementById('res-expected').textContent = formatCurrency(expected);
  document.getElementById('res-actual').textContent = formatCurrency(cashInRegister);

  const diffEl = document.getElementById('res-diff');
  const diffRow = document.getElementById('diff-row');
  const msgEl = document.getElementById('result-message');

  diffEl.textContent = (diff === 0 ? '' : diff > 0 ? '+' : '') + formatCurrency(diff);

  if (diff === 0) {
    diffRow.className = 'reconcile-row result-row balanced';
    msgEl.className = 'result-message balanced';
    msgEl.textContent = '✅ ピッタリ！過不足なしです。';
  } else if (diff > 0) {
    diffRow.className = 'reconcile-row result-row surplus';
    msgEl.className = 'result-message surplus';
    msgEl.innerHTML = `💰 <strong>${formatCurrency(diff)}</strong> 余剰があります（過剰）`;
  } else {
    diffRow.className = 'reconcile-row result-row shortage';
    msgEl.className = 'result-message shortage';
    msgEl.innerHTML = `⚠️ <strong>${formatCurrency(Math.abs(diff))}</strong> 不足しています（不足）`;
  }
}

// ---- レジ締め結果を保存 ----
async function saveRegisterResult() {
  const opening = parseFloat(document.getElementById('opening-balance').value) || 0;
  const cashInRegister = parseFloat(document.getElementById('cash-in-register').value);
  const note = document.getElementById('register-note').value.trim();

  if (isNaN(cashInRegister)) {
    showToast('レジ内現金を入力してください', 'error');
    return;
  }

  const btn = document.getElementById('btn-save-result');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> 保存中…';

  const payload = {
    date: summaryData.date,
    opening_balance: opening,
    cash_in_register: cashInRegister,
    note,
    is_closed: true,
  };

  try {
    const existing = summaryData.registerRecord;
    if (existing) {
      await apiFetch(`tables/daily_register/${existing.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      const created = await apiFetch('tables/daily_register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      summaryData.registerRecord = created;
    }

    showToast('レジ締め結果を保存しました', 'success');
    const statusBadge = document.getElementById('close-status-badge');
    if (statusBadge) {
      statusBadge.textContent = '締め済み';
      statusBadge.className = 'status-badge closed';
    }
  } catch (err) {
    console.error(err);
    showToast('保存に失敗しました', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> 結果を保存';
  }
}
