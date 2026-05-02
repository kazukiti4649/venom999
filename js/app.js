/* ===========================
   売上入力ページ (index.html)
   =========================== */

// ---- 状態 ----
let selectedPayment = '現金';
let selectedStaff = null;       // { id, name, color }
let allStaffList = [];           // 全従業員
let todaySalesCache = [];        // 本日の全売上キャッシュ
let currentListFilter = 'all';  // 一覧タブのフィルター
let deleteTargetId = null;
let currentBusinessDate = null; // 営業日（YYYY-MM-DD）

// ---- 初期化 ----
document.addEventListener('DOMContentLoaded', async () => {
  // ① ログイン必須チェック
  if (!Auth.requireLogin()) return;

  // ② ヘッダーにユーザーバッジを表示
  Auth.renderUserBadge();

  // ③ auth_error があればトースト表示
  Auth.showAuthError();

  // ④ ログイン中ユーザーを初期タブとして選択
  const session = Auth.getSession();
  if (session) {
    selectedStaff = { id: session.id, name: session.name, color: session.color };
  }

  // 営業日を取得してから初期化
  currentBusinessDate = await getBusinessDate();

  initDateBadge();
  initPaymentButtons();
  initForm();
  initTaxCut();
  await loadStaffTabs();
  loadTodaySales();

  // ⑤ 権限に応じてUI要素を表示/非表示
  Auth.applyPermissions();
});

// ----------------------------------------
// 日付バッジ（営業日を表示）
// ----------------------------------------
function initDateBadge() {
  const el = document.getElementById('current-date');
  if (el) el.textContent = formatDateDisplay(currentBusinessDate || today());

  // 営業日バナーを更新
  updateBusinessDateBanner();
}

function updateBusinessDateBanner() {
  const bannerEl  = document.getElementById('biz-date-banner');
  const bannerText = document.getElementById('biz-date-banner-text');
  if (!bannerEl || !bannerText) return;

  const realToday = today();
  const bizDate   = currentBusinessDate || realToday;

  if (bizDate !== realToday) {
    bannerEl.style.display = 'flex';
    bannerText.textContent = `営業日: ${formatDateDisplay(bizDate)}（実際の日付とは異なります）`;
  } else {
    bannerEl.style.display = 'none';
  }
}

// ----------------------------------------
// 支払いボタン
// ----------------------------------------
function initPaymentButtons() {
  const btns = document.querySelectorAll('#payment-btns .pay-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPayment = btn.dataset.value;
    });
  });
}

// ----------------------------------------
// TAX CUT チェックボックス
// ----------------------------------------
function initTaxCut() {
  const checkbox = document.getElementById('tax-cut-checkbox');
  const amountInput = document.getElementById('input-amount');
  if (!checkbox) return;

  // チェック状態変更時にラベルとプレビューを更新
  checkbox.addEventListener('change', () => {
    updateTaxCutUI();
    updateTaxPreview();
  });

  // 金額入力時にプレビューを更新
  if (amountInput) {
    amountInput.addEventListener('input', updateTaxPreview);
  }
}

function updateTaxCutUI() {
  const checkbox = document.getElementById('tax-cut-checkbox');
  const label    = document.getElementById('taxcut-label');
  if (!checkbox || !label) return;
  if (checkbox.checked) {
    label.classList.add('active');
  } else {
    label.classList.remove('active');
  }
}

function updateTaxPreview() {
  const checkbox    = document.getElementById('tax-cut-checkbox');
  const amountInput = document.getElementById('input-amount');
  const taxPreview  = document.getElementById('tax-preview');
  const cutPreview  = document.getElementById('taxcut-preview');
  if (!checkbox || !amountInput) return;

  const amount = parseFloat(amountInput.value);
  const isCut  = checkbox.checked;

  if (!amount || amount <= 0) {
    if (taxPreview)  taxPreview.style.display  = 'none';
    if (cutPreview)  cutPreview.style.display  = 'none';
    return;
  }

  if (isCut) {
    // TAX CUT: 税なし
    if (taxPreview) taxPreview.style.display = 'none';
    if (cutPreview) cutPreview.style.display = 'flex';
  } else {
    // 通常: 小計＋消費税＝税込
    if (cutPreview) cutPreview.style.display = 'none';
    const { subtotal, tax, total } = calcTax(amount);
    const subtotalEl = document.getElementById('tax-preview-subtotal');
    const taxEl      = document.getElementById('tax-preview-tax');
    const totalEl    = document.getElementById('tax-preview-total');
    if (subtotalEl) subtotalEl.textContent = `小計 ${formatCurrency(subtotal)}`;
    if (taxEl)      taxEl.textContent      = `消費税 ${formatCurrency(tax)}`;
    if (totalEl)    totalEl.innerHTML      = `<strong>税込 ${formatCurrency(total)}</strong>`;
    if (taxPreview) taxPreview.style.display = 'flex';
  }
}

// ----------------------------------------
// フォーム
// ----------------------------------------
function initForm() {
  const form = document.getElementById('sale-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitSale();
  });
}

// ----------------------------------------
// 従業員タブの読み込み・描画
// ----------------------------------------
async function loadStaffTabs() {
  try {
    const all = await fetchAllRecords('employees');
    allStaffList = all
      .filter(s => s.is_active !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    renderStaffTabs();
    renderListTabs();
    updateNoStaffWarning();
  } catch (err) {
    console.error('従業員読み込みエラー:', err);
  }
}

function renderStaffTabs() {
  const container = document.getElementById('staff-tabs');
  if (!container) return;

  if (allStaffList.length === 0) {
    container.innerHTML = `<span class="staff-tab-empty">従業員未登録</span>`;
    selectedStaff = null;
    updateBanner();
    return;
  }

  container.innerHTML = allStaffList.map((s, i) => {
    const color = s.color || '#1a73e8';
    const initial = s.name ? s.name.charAt(0) : '?';
    const isActive = selectedStaff ? selectedStaff.id === s.id : i === 0;
    return `
      <button
        class="staff-tab${isActive ? ' active' : ''}"
        data-id="${s.id}"
        data-name="${s.name}"
        data-color="${color}"
        style="--staff-color:${color};"
        onclick="selectStaffTab(this)"
      >
        <span class="staff-tab-avatar" style="background:${color};">${initial}</span>
        <span class="staff-tab-name">${s.name}</span>
      </button>`;
  }).join('');

  // ログインユーザーを初期選択（セッションと一致する従業員）
  const session = Auth.getSession();
  if (session) {
    const matched = allStaffList.find(s => s.id === session.id);
    if (matched) {
      selectedStaff = { id: matched.id, name: matched.name, color: matched.color || '#1a73e8' };
    } else if (!selectedStaff && allStaffList.length > 0) {
      // セッションに一致しない場合は先頭（管理者は全員選択可）
      const first = allStaffList[0];
      selectedStaff = { id: first.id, name: first.name, color: first.color || '#1a73e8' };
    }
  } else if (!selectedStaff && allStaffList.length > 0) {
    const first = allStaffList[0];
    selectedStaff = { id: first.id, name: first.name, color: first.color || '#1a73e8' };
  }
  updateBanner();
}

function renderListTabs() {
  const bar = document.getElementById('list-tab-bar');
  if (!bar) return;

  // 全員向け: 全員タブ＋各スタッフタブ
  const staffTabsHTML = allStaffList.map(s => {
    const color = s.color || '#1a73e8';
    const initial = s.name ? s.name.charAt(0) : '?';
    return `
      <button class="list-tab" data-filter="${s.name}"
        onclick="switchListTab(this, '${s.name}')"
        style="--staff-color:${color};">
        <span class="list-tab-avatar" style="background:${color};">${initial}</span>
        ${s.name}
      </button>`;
  }).join('');

  bar.innerHTML = `
    <button class="list-tab active" data-filter="all" onclick="switchListTab(this, 'all')">
      <i class="fas fa-users"></i> 全員
    </button>
    ${staffTabsHTML}`;
}

function updateNoStaffWarning() {
  const el = document.getElementById('no-staff-warning');
  if (!el) return;
  el.style.display = allStaffList.length === 0 ? 'flex' : 'none';
}

// ----------------------------------------
// 従業員タブ選択
// ----------------------------------------
function selectStaffTab(btn) {
  // 全スタッフが全員分のタブを選択可能
  document.querySelectorAll('#staff-tabs .staff-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  selectedStaff = {
    id: btn.dataset.id,
    name: btn.dataset.name,
    color: btn.dataset.color,
  };
  updateBanner();
  const listTabBtn = document.querySelector(`#list-tab-bar .list-tab[data-filter="${selectedStaff.name}"]`);
  if (listTabBtn) switchListTab(listTabBtn, selectedStaff.name);
}

// ----------------------------------------
// 担当者バナー更新
// ----------------------------------------
function updateBanner() {
  const banner = document.getElementById('selected-staff-banner');
  const avatarEl = document.getElementById('banner-avatar');
  const nameEl = document.getElementById('banner-name');

  if (!banner) return;

  if (!selectedStaff) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';
  const color = selectedStaff.color || '#1a73e8';
  avatarEl.textContent = selectedStaff.name ? selectedStaff.name.charAt(0) : '?';
  avatarEl.style.background = color;
  nameEl.textContent = selectedStaff.name;
  banner.style.setProperty('--banner-color', color);

  // 本日の担当者売上
  updateBannerAmount();
}

function updateBannerAmount() {
  if (!selectedStaff) return;
  const amountEl = document.getElementById('banner-amount');
  if (!amountEl) return;
  const staffSales = todaySalesCache.filter(s => s.staff_name === selectedStaff.name);
  const totalSum = staffSales.reduce((sum, s) => sum + getSaleTotal(s), 0);
  amountEl.textContent = formatCurrency(totalSum);
}

// ----------------------------------------
// 売上登録
// ----------------------------------------
async function submitSale() {
  const amountEl = document.getElementById('input-amount');
  const amount = parseFloat(amountEl.value);

  if (!amount || amount <= 0) {
    showToast('金額を入力してください', 'error');
    amountEl.focus();
    return;
  }
  if (!selectedStaff) {
    showToast('担当者を選択してください', 'error');
    document.getElementById('staff-tabs')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> 登録中…';

  const now = new Date();
  const isTaxCut = document.getElementById('tax-cut-checkbox')?.checked || false;

  let subtotal, tax, total;
  if (isTaxCut) {
    // TAX CUT: 消費税なし、入力金額をそのまま計上
    subtotal = Math.round(amount);
    tax      = 0;
    total    = subtotal;
  } else {
    // 通常: 入力金額を税抜小計として10%消費税を加算
    const taxInfo = calcTax(amount);
    subtotal = taxInfo.subtotal;
    tax      = taxInfo.tax;
    total    = taxInfo.total;
  }

  const payload = {
    date: currentBusinessDate || today(),   // 設定された営業日を使用
    time: formatTime(now),
    amount: subtotal,           // 小計（税抜）
    subtotal: subtotal,         // 小計（税抜）
    tax: tax,                   // 消費税額（TAX CUT時は0）
    total: total,               // 税込合計（TAX CUT時はsubtotalと同値）
    tax_cut: isTaxCut,          // TAX CUTフラグ
    payment_method: selectedPayment,
    category: document.getElementById('input-category').value.trim(),
    note: document.getElementById('input-note').value.trim(),
    staff_name: selectedStaff.name,
  };

  try {
    await apiFetch('tables/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const toastMsg = isTaxCut
      ? `${selectedStaff.name}：${formatCurrency(total)}（税抜・TAX CUT）を登録しました`
      : `${selectedStaff.name}：${formatCurrency(total)}（税込）を登録しました`;
    showToast(toastMsg, 'success');
    resetForm();
    loadTodaySales();

  } catch (err) {
    console.error(err);
    showToast('登録に失敗しました', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> 売上を登録';
  }
}

function resetForm() {
  document.getElementById('input-amount').value = '';
  document.getElementById('input-category').value = '';
  document.getElementById('input-note').value = '';
  selectedPayment = '現金';
  document.querySelectorAll('#payment-btns .pay-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === '現金');
  });
  // TAX CUT はリセット後もプレビューを非表示にする（チェック状態は維持）
  const taxPreview = document.getElementById('tax-preview');
  const cutPreview = document.getElementById('taxcut-preview');
  if (taxPreview) taxPreview.style.display = 'none';
  if (cutPreview) cutPreview.style.display = 'none';
  document.getElementById('input-amount').focus();
}

// ----------------------------------------
// 本日の売上一覧読み込み
// ----------------------------------------
async function loadTodaySales() {
  const listEl = document.getElementById('sales-list');
  showLoading(listEl);

  try {
    // 営業日を再取得（他の端末で変更された場合に追従）
    currentBusinessDate = await getBusinessDate();
    updateBusinessDateBanner();
    // 日付バッジも更新
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.textContent = formatDateDisplay(currentBusinessDate || today());

    const all = await fetchAllRecords('sales');
    const bizDate = currentBusinessDate || today();
    todaySalesCache = all
      .filter(s => s.date === bizDate)
      .sort((a, b) => b.time.localeCompare(a.time));

    updateTodayBar(todaySalesCache);
    updateBannerAmount();
    renderFilteredList();

  } catch (err) {
    console.error(err);
    document.getElementById('sales-list').innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>読み込みエラー</p></div>`;
  }
}

function updateTodayBar(sales) {
  const subtotalSum = sales.reduce((sum, s) => sum + (s.subtotal || s.amount || 0), 0);
  const totalSum    = sales.reduce((sum, s) => sum + getSaleTotal(s), 0);
  document.getElementById('today-total').textContent = formatCurrency(totalSum);
  document.getElementById('today-count').textContent = `${sales.length}件`;
  document.getElementById('today-last').textContent = sales.length > 0 ? sales[0].time : '--:--';
  // 小計も表示できる要素があれば更新
  const subtotalEl = document.getElementById('today-subtotal');
  if (subtotalEl) subtotalEl.textContent = `小計 ${formatCurrency(subtotalSum)}`;
  // サマリーバーの日付ラベルを営業日に更新
  const barDateEl = document.getElementById('today-bar-date');
  if (barDateEl) barDateEl.textContent = formatDateDisplay(currentBusinessDate || today());
}

// ----------------------------------------
// 一覧タブ切り替え
// ----------------------------------------
function switchListTab(btn, filter) {
  document.querySelectorAll('#list-tab-bar .list-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentListFilter = filter;
  renderFilteredList();
}

function renderFilteredList() {
  const listEl = document.getElementById('sales-list');

  // スタッフは常に自分の売上のみ（管理者ブロックを兼ねてフィルター確定）
  const staffFilter = Auth.getStaffFilter();
  const effectiveFilter = staffFilter || currentListFilter;

  const filtered = effectiveFilter === 'all'
    ? todaySalesCache
    : todaySalesCache.filter(s => s.staff_name === effectiveFilter);

  renderSalesList(listEl, filtered);
}

function renderSalesList(container, sales) {
  if (sales.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-receipt"></i>
        <p>まだ売上がありません</p>
      </div>`;
    return;
  }
  // 削除ボタンは管理者のみ表示
  const canDelete = Auth.isAdmin();
  container.innerHTML = sales.map(s => buildSaleItemHTML(s, canDelete)).join('');
}

// ----------------------------------------
// 削除（管理者のみ）
// ----------------------------------------
function confirmDelete(id) {
  if (!Auth.isAdmin()) {
    showToast('削除は管理者のみ行えます', 'error');
    return;
  }
  deleteTargetId = id;
  document.getElementById('modal-overlay').classList.add('show');
  document.getElementById('btn-confirm-delete').onclick = () => executeDelete(id);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  deleteTargetId = null;
}

async function executeDelete(id) {
  closeModal();
  try {
    await apiFetch(`tables/sales/${id}`, { method: 'DELETE' });
    showToast('削除しました', '');
    const el = document.querySelector(`.sale-item[data-id="${id}"]`);
    if (el) {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(30px)';
      setTimeout(() => loadTodaySales(), 280);
    } else {
      loadTodaySales();
    }
  } catch (err) {
    console.error(err);
    showToast('削除に失敗しました', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
});
