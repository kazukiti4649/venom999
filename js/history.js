/* ===========================
   売上履歴ページ (history.html)
   =========================== */

// ---- 状態 ----
let selectedFilterPayment = '';
let selectedFilterStaff = '';
let allEmployeeCache = [];

// ---- 初期化 ----
document.addEventListener('DOMContentLoaded', async () => {
  // ログイン必須チェック
  if (!Auth.requireLogin()) return;

  Auth.renderUserBadge();
  Auth.applyPermissions();

  const toDate = today();
  const fromDate = formatDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  document.getElementById('filter-from').value = fromDate;
  document.getElementById('filter-to').value = toDate;

  initFilterPaymentButtons();
  await loadStaffFilterButtons();

  // スタッフの場合は自分の担当者フィルターを固定 & フィルターUIを非表示
  const staffFilter = Auth.getStaffFilter();
  if (staffFilter) {
    selectedFilterStaff = staffFilter;
    // 担当者フィルターUIを非表示（スタッフは自分の売上のみ）
    const staffFilterSection = document.getElementById('staff-filter-section');
    if (staffFilterSection) staffFilterSection.style.display = 'none';
    // ページタイトルをスタッフ向けに変更
    const pageTitle = document.querySelector('.page-title-text');
    if (pageTitle) pageTitle.textContent = 'マイ売上履歴';
  }

  document.getElementById('btn-search')?.addEventListener('click', searchHistory);
  searchHistory();
});

// ---- 支払い方法フィルターボタン ----
function initFilterPaymentButtons() {
  const btns = document.querySelectorAll('#filter-payment-row .filter-pay-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFilterPayment = btn.dataset.value;
    });
  });
}

// ---- 従業員フィルターボタンを動的生成 ----
async function loadStaffFilterButtons() {
  try {
    const all = await fetchAllRecords('employees');
    allEmployeeCache = all
      .filter(e => e.is_active !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // スタッフは担当者フィルターUI不要（自分の売上のみ表示）
    if (!Auth.isAdmin()) return;

    const row = document.getElementById('filter-staff-row');
    if (!row) return;

    const staffBtns = allEmployeeCache.map(e => {
      const color = e.color || '#1a73e8';
      return `
        <button type="button" class="filter-pay-btn" data-value="${e.name}"
          style="--staff-color:${color};"
          onclick="selectStaffFilter(this, '${e.name}')">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px;vertical-align:middle;"></span>
          ${e.name}
        </button>`;
    }).join('');

    row.innerHTML = `
      <button type="button" class="filter-pay-btn active" data-value=""
        onclick="selectStaffFilter(this, '')">全員</button>
      ${staffBtns}`;

  } catch (err) {
    console.error('従業員フィルター読み込みエラー:', err);
  }
}

function selectStaffFilter(btn, value) {
  document.querySelectorAll('#filter-staff-row .filter-pay-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedFilterStaff = value;
}

// ---- 履歴検索 ----
async function searchHistory() {
  const fromDate = document.getElementById('filter-from').value;
  const toDate = document.getElementById('filter-to').value;

  if (!fromDate || !toDate) {
    showToast('開始日と終了日を入力してください', 'error');
    return;
  }
  if (fromDate > toDate) {
    showToast('開始日は終了日以前にしてください', 'error');
    return;
  }

  const listEl = document.getElementById('history-list');
  showLoading(listEl);
  document.getElementById('period-summary-card').style.display = 'none';

  try {
    const all = await fetchAllRecords('sales');

    // 期間フィルター
    let filtered = all.filter(s => s.date >= fromDate && s.date <= toDate);
    // 支払い方法フィルター
    if (selectedFilterPayment) {
      filtered = filtered.filter(s => s.payment_method === selectedFilterPayment);
    }
    // 担当者フィルター（スタッフは自分のみ固定、管理者は選択フィルター）
    const staffFilter = Auth.getStaffFilter();
    const effectiveStaffFilter = staffFilter || selectedFilterStaff;
    if (effectiveStaffFilter) {
      filtered = filtered.filter(s => s.staff_name === effectiveStaffFilter);
    }

    // 新しい順にソート
    filtered.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.time.localeCompare(a.time);
    });

    const countEl = document.getElementById('history-result-count');
    if (countEl) countEl.textContent = `${filtered.length}件`;

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-search"></i>
          <p>該当する売上データがありません</p>
        </div>`;
      return;
    }

    renderPeriodSummary(filtered);
    renderGroupedHistory(listEl, filtered);

  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>読み込みエラーが発生しました</p></div>`;
    showToast('データ取得に失敗しました', 'error');
  }
}

// ---- 期間集計 ----
function renderPeriodSummary(sales) {
  const summaryCard = document.getElementById('period-summary-card');
  if (!summaryCard) return;
  summaryCard.style.display = '';

  const subtotalSum = sales.reduce((sum, s) => sum + (s.subtotal || s.amount || 0), 0);
  const taxSum      = sales.reduce((sum, s) => sum + (s.tax != null ? s.tax : Math.round((s.subtotal || s.amount || 0) * 0.1)), 0);
  const totalSum    = sales.reduce((sum, s) => sum + getSaleTotal(s), 0);

  document.getElementById('period-total').textContent = formatCurrency(totalSum);
  document.getElementById('period-count').textContent = `${sales.length}件`;

  // 小計・消費税の補助表示
  const periodSubtotalEl = document.getElementById('period-subtotal');
  const periodTaxEl      = document.getElementById('period-tax');
  if (periodSubtotalEl) periodSubtotalEl.textContent = `小計 ${formatCurrency(subtotalSum)}`;
  if (periodTaxEl)      periodTaxEl.textContent      = `消費税 ${formatCurrency(taxSum)}`;

  // 支払い方法別（税込合計で集計）
  const grid = document.getElementById('history-breakdown-grid');
  const methods = ['現金', 'クレジット', '電子マネー', 'QRコード'];
  const icons = {
    '現金': 'fas fa-yen-sign',
    'クレジット': 'fas fa-credit-card',
    '電子マネー': 'fas fa-mobile-alt',
    'QRコード': 'fas fa-qrcode',
  };
  const methodMap = {};
  methods.forEach(m => { methodMap[m] = { total: 0, count: 0 }; });
  sales.forEach(s => {
    const m = s.payment_method || '現金';
    if (!methodMap[m]) methodMap[m] = { total: 0, count: 0 };
    methodMap[m].total += getSaleTotal(s);  // 税込合計で集計
    methodMap[m].count++;
  });

  if (grid) {
    grid.innerHTML = methods
      .filter(m => methodMap[m].count > 0)
      .map(m => {
        const d = methodMap[m];
        const pct = totalSum > 0 ? Math.round((d.total / totalSum) * 100) : 0;
        return `
          <div class="breakdown-item method-${m}">
            <div class="breakdown-label"><i class="${icons[m]}"></i> ${m}</div>
            <div class="breakdown-amount">${formatCurrency(d.total)}</div>
            <div class="breakdown-sub">${d.count}件 / ${pct}%</div>
          </div>`;
      }).join('');
  }

  // 従業員別集計
  renderHistoryStaffSummary(sales, totalSum);
}

// ---- 従業員別集計（履歴） ----
function renderHistoryStaffSummary(sales, grandTotal) {
  // スタッフは自分の売上のみ表示のため、担当者別集計セクションは不要
  if (!Auth.isAdmin()) return;

  const el = document.getElementById('history-staff-summary');
  if (!el) return;

  const staffMap = {};

  // 登録済み従業員を先に
  allEmployeeCache.forEach(e => {
    staffMap[e.name] = { name: e.name, color: e.color || '#1a73e8', total: 0, count: 0 };
  });

  sales.forEach(s => {
    const name = s.staff_name || '未設定';
    if (!staffMap[name]) {
      staffMap[name] = { name, color: '#9e9e9e', total: 0, count: 0 };
    }
    staffMap[name].total += getSaleTotal(s);  // 税込合計で集計
    staffMap[name].count++;
  });

  const staffList = Object.values(staffMap)
    .filter(s => s.count > 0)
    .sort((a, b) => b.total - a.total);

  if (staffList.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:16px;"><i class="fas fa-users"></i><p>担当者データなし</p></div>`;
    return;
  }

  el.innerHTML = staffList.map(staff => {
    const pct = grandTotal > 0 ? Math.round((staff.total / grandTotal) * 100) : 0;
    const barWidth = grandTotal > 0 ? (staff.total / grandTotal * 100).toFixed(1) : 0;
    const initial = staff.name.charAt(0);
    return `
      <div class="staff-summary-item">
        <div class="staff-summary-head">
          <div class="staff-summary-avatar" style="background:${staff.color};">${initial}</div>
          <div class="staff-summary-body">
            <div class="staff-summary-name">${staff.name}</div>
            <div class="staff-summary-meta">${staff.count}件 / ${pct}%</div>
          </div>
          <div class="staff-summary-amount" style="color:${staff.color};">${formatCurrency(staff.total)}</div>
        </div>
        <div class="staff-progress-wrap">
          <div class="staff-progress-bar" style="width:${barWidth}%;background:${staff.color};"></div>
        </div>
      </div>`;
  }).join('');
}

// ---- 日別グループ化レンダリング ----
function renderGroupedHistory(container, sales) {
  const groups = {};
  sales.forEach(s => {
    if (!groups[s.date]) groups[s.date] = [];
    groups[s.date].push(s);
  });

  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  container.innerHTML = sortedDates.map(date => {
    const daySales = groups[date];
    const dayTotal = daySales.reduce((sum, s) => sum + getSaleTotal(s), 0);  // 税込合計
    const itemsHTML = daySales.map(s => buildSaleItemHTML(s, false)).join('');

    return `
      <div class="day-group">
        <div class="day-group-header">
          <span class="day-group-date">
            <i class="fas fa-calendar-day"></i> ${formatDateDisplay(date)}
          </span>
          <span class="day-group-total">${formatCurrency(dayTotal)}（${daySales.length}件）</span>
        </div>
        <div class="sales-list">${itemsHTML}</div>
      </div>`;
  }).join('');
}
