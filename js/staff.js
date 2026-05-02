/* ===========================
   従業員管理ページ (staff.html)
   管理者専用ページ
   =========================== */

const PRESET_COLORS = [
  '#1a73e8', '#34a853', '#ea4335', '#fbbc04',
  '#9c27b0', '#ff6d00', '#00bcd4', '#e91e63',
  '#607d8b', '#795548',
];

let selectedColor = PRESET_COLORS[0];
let editTargetId = null;
let editSelectedColor = PRESET_COLORS[0];
let editSelectedRole = 'staff';
let deleteTargetId = null;

// ---- 初期化 ----
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireLogin()) return;
  if (!Auth.isAdmin()) {
    sessionStorage.setItem('auth_error', '従業員管理は管理者のみ操作できます');
    location.replace('index.html');
    return;
  }
  Auth.renderUserBadge();
  Auth.applyPermissions();

  renderColorPicker('color-picker-row', (c) => { selectedColor = c; });
  initForm();
  loadStaffList();
  initBusinessDateSetting();
});

// ---- カラーピッカー描画 ----
function renderColorPicker(containerId, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = PRESET_COLORS.map((color, i) => `
    <button type="button"
      class="color-dot${i === 0 ? ' active' : ''}"
      data-color="${color}"
      style="background:${color};"
      onclick="selectColor(this,'${containerId}','${color}')"
      aria-label="${color}"></button>`
  ).join('');
  onSelect(PRESET_COLORS[0]);
}

function selectColor(btn, containerId, color) {
  document.querySelectorAll(`#${containerId} .color-dot`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (containerId === 'color-picker-row') selectedColor = color;
  else if (containerId === 'edit-color-picker-row') editSelectedColor = color;
}

// ---- フォーム ----
function initForm() {
  document.getElementById('staff-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addStaff();
  });

  // role トグル（追加フォーム）
  document.querySelectorAll('#role-toggle-row .role-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#role-toggle-row .role-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function getSelectedRole() {
  const active = document.querySelector('#role-toggle-row .role-toggle-btn.active');
  return active ? active.dataset.role : 'staff';
}

// ---- 従業員追加 ----
async function addStaff() {
  const nameInput = document.getElementById('staff-name-input');
  const pinInput = document.getElementById('staff-pin-input');
  const name = nameInput.value.trim();
  const pin = pinInput ? pinInput.value.trim() : '';

  if (!name) { showToast('名前を入力してください', 'error'); nameInput.focus(); return; }
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    showToast('PINは4桁の数字で入力してください', 'error');
    pinInput?.focus();
    return;
  }

  const btn = document.getElementById('btn-add-staff');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> 追加中…';

  try {
    const all = await fetchAllRecords('employees');
    if (all.find(e => e.name === name && e.is_active !== false)) {
      showToast('同じ名前の従業員が既に存在します', 'error');
      return;
    }
    const role = getSelectedRole();
    await apiFetch('tables/employees', {
      method: 'POST',
      body: JSON.stringify({
        name,
        color: selectedColor,
        is_active: true,
        sort_order: all.length,
        role,
        pin,
      }),
    });
    showToast(`${name} を追加しました`, 'success');
    nameInput.value = '';
    if (pinInput) pinInput.value = '';
    selectedColor = PRESET_COLORS[0];
    renderColorPicker('color-picker-row', (c) => { selectedColor = c; });
    // roleトグルをstaffに戻す
    document.querySelectorAll('#role-toggle-row .role-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.role === 'staff');
    });
    loadStaffList();
  } catch (err) {
    console.error(err);
    showToast('追加に失敗しました', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus"></i> 追加する';
  }
}

// ---- 従業員一覧読み込み ----
async function loadStaffList() {
  const listEl = document.getElementById('staff-list');
  showLoading(listEl);

  try {
    const all = await fetchAllRecords('employees');
    const active = all
      .filter(e => e.is_active !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const countBadge = document.getElementById('staff-count-badge');
    if (countBadge) countBadge.textContent = `${active.length}人`;

    // 管理者・スタッフ人数バッジ
    const adminCount = active.filter(e => e.role === 'admin').length;
    const staffCount = active.filter(e => e.role !== 'admin').length;
    const roleStatEl = document.getElementById('role-stat');
    if (roleStatEl) {
      roleStatEl.innerHTML =
        `<span class="role-badge admin"><i class="fas fa-shield-alt"></i> 管理者 ${adminCount}名</span>` +
        `<span class="role-badge staff"><i class="fas fa-user"></i> スタッフ ${staffCount}名</span>`;
    }

    if (active.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><i class="fas fa-user-plus"></i><p>従業員を追加してください</p></div>`;
      return;
    }

    listEl.innerHTML = active.map(emp => {
      const initial = (emp.name || '?').charAt(0);
      const color = emp.color || '#1a73e8';
      const isAdmin = emp.role === 'admin';
      const roleBadgeHtml = isAdmin
        ? `<span class="role-badge admin"><i class="fas fa-shield-alt"></i> 管理者</span>`
        : `<span class="role-badge staff"><i class="fas fa-user"></i> スタッフ</span>`;
      const pinStr = emp.pin ? '●'.repeat(emp.pin.toString().length) : '----';
      const toggleTitle = isAdmin ? 'スタッフに変更' : '管理者に昇格';
      const toggleIcon = isAdmin ? 'fa-user-minus' : 'fa-user-shield';
      const toggleClass = isAdmin ? 'btn-staff-role admin-to-staff' : 'btn-staff-role staff-to-admin';

      return `
        <div class="staff-item" data-id="${emp.id}">
          <div class="staff-item-avatar" style="background:${color};">${initial}</div>
          <div class="staff-item-body">
            <div class="staff-item-name">${emp.name}</div>
            <div class="staff-item-meta">
              ${roleBadgeHtml}
              <span class="pin-hint"><i class="fas fa-lock" style="font-size:10px;"></i> ${pinStr}</span>
            </div>
          </div>
          <div class="staff-item-actions">
            <button class="${toggleClass}" title="${toggleTitle}"
              onclick="toggleRole('${emp.id}','${emp.role || 'staff'}','${emp.name}')">
              <i class="fas ${toggleIcon}"></i>
            </button>
            <button class="btn-staff-edit" title="編集"
              onclick="openEditModal('${emp.id}','${emp.name}','${color}','${emp.role || 'staff'}','${emp.pin || ''}')">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn-staff-delete" title="削除"
              onclick="confirmDeleteStaff('${emp.id}','${emp.name}')">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>読み込みエラー</p></div>`;
  }
}

// ---- 権限切替 ----
async function toggleRole(id, currentRole, name) {
  const newRole = currentRole === 'admin' ? 'staff' : 'admin';
  const label = newRole === 'admin' ? '管理者に昇格' : 'スタッフに変更';
  if (!confirm(`${name} を${label}しますか？`)) return;
  try {
    await apiFetch(`tables/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole }),
    });
    showToast(`${name} を${label}しました`, 'success');
    loadStaffList();
  } catch (err) {
    console.error(err);
    showToast('権限変更に失敗しました', 'error');
  }
}

// ---- 編集モーダル ----
function openEditModal(id, name, color, role, pin) {
  editTargetId = id;
  editSelectedColor = color;
  editSelectedRole = role || 'staff';

  document.getElementById('edit-staff-name').value = name;
  document.getElementById('edit-staff-pin').value = pin || '';

  // カラーピッカー
  document.getElementById('edit-color-picker-row').innerHTML = PRESET_COLORS.map(c => `
    <button type="button"
      class="color-dot${c === color ? ' active' : ''}"
      data-color="${c}" style="background:${c};"
      onclick="selectColor(this,'edit-color-picker-row','${c}')"
      aria-label="${c}"></button>`
  ).join('');

  // roleトグル
  document.querySelectorAll('#edit-role-toggle-row .role-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.role === editSelectedRole);
    b.onclick = () => {
      document.querySelectorAll('#edit-role-toggle-row .role-toggle-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      editSelectedRole = b.dataset.role;
    };
  });

  document.getElementById('edit-modal-overlay').classList.add('show');
  document.getElementById('btn-confirm-edit').onclick = () => saveEditStaff();
}

function closeEditModal() {
  document.getElementById('edit-modal-overlay').classList.remove('show');
  editTargetId = null;
}

async function saveEditStaff() {
  const name = document.getElementById('edit-staff-name').value.trim();
  const pin = document.getElementById('edit-staff-pin').value.trim();

  if (!name) { showToast('名前を入力してください', 'error'); return; }
  if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
    showToast('PINは4桁の数字で入力してください', 'error');
    return;
  }

  const btn = document.getElementById('btn-confirm-edit');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';

  const payload = { name, color: editSelectedColor, role: editSelectedRole };
  if (pin) payload.pin = pin;

  try {
    await apiFetch(`tables/employees/${editTargetId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    showToast('更新しました', 'success');
    closeEditModal();
    loadStaffList();
  } catch (err) {
    console.error(err);
    showToast('更新に失敗しました', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '保存';
  }
}

// ---- 削除確認 ----
function confirmDeleteStaff(id, name) {
  deleteTargetId = id;
  const textEl = document.getElementById('modal-staff-name');
  if (textEl) textEl.innerHTML =
    `<strong>${name}</strong> を削除しますか？<br><small style="color:var(--gray-600);">過去の売上データは残ります。</small>`;
  document.getElementById('modal-overlay').classList.add('show');
  document.getElementById('btn-confirm-delete').onclick = () => executeDeleteStaff(id);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  deleteTargetId = null;
}

async function executeDeleteStaff(id) {
  closeModal();
  try {
    await apiFetch(`tables/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });
    showToast('削除しました', '');
    loadStaffList();
  } catch (err) {
    console.error(err);
    showToast('削除に失敗しました', 'error');
  }
}

// モーダル外クリックで閉じる
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('edit-modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'edit-modal-overlay') closeEditModal();
  });
});

// ============================================================
// 営業日設定
// ============================================================

// app_settings テーブルの business_date レコードIDをキャッシュ
let bizDateRecordId = null;

async function initBusinessDateSetting() {
  // 現在の設定を読み込んで表示
  await loadBusinessDate();

  // 日付ピッカーに今日の日付を初期表示
  const input = document.getElementById('biz-date-input');
  if (input && !input.value) {
    input.value = today();
  }

  // ボタンイベント
  document.getElementById('btn-save-biz-date')?.addEventListener('click', saveBusinessDate);
  document.getElementById('btn-reset-biz-date')?.addEventListener('click', resetBusinessDate);
}

async function loadBusinessDate() {
  const labelEl = document.getElementById('biz-date-label');
  const badgeEl = document.getElementById('biz-date-badge');
  const infoEl  = document.getElementById('biz-date-info');
  const infoText = document.getElementById('biz-date-info-text');
  const input   = document.getElementById('biz-date-input');

  try {
    const all = await fetchAllRecords('app_settings');
    const rec = all.find(r => r.key === 'business_date');

    if (rec && rec.value) {
      bizDateRecordId = rec.id;
      const displayDate = formatDateDisplay(rec.value);

      if (labelEl) labelEl.textContent = `営業日: ${displayDate}`;
      if (badgeEl) badgeEl.className = 'biz-date-badge active';
      if (input)   input.value = rec.value;

      // 設定情報を表示
      if (infoEl)  infoEl.style.display = 'flex';
      if (infoText) {
        const updater = rec.updated_by ? ` （設定者: ${rec.updated_by}）` : '';
        infoText.textContent = `現在の営業日は ${displayDate} に設定されています${updater}。この日付が売上入力・日次集計に反映されます。`;
      }
    } else {
      bizDateRecordId = rec ? rec.id : null;
      if (labelEl) labelEl.textContent = `本日（実日付）`;
      if (badgeEl) badgeEl.className = 'biz-date-badge';
      if (infoEl)  infoEl.style.display = 'none';
    }
  } catch (err) {
    console.error('営業日読み込みエラー:', err);
    if (labelEl) labelEl.textContent = '取得エラー';
  }
}

async function saveBusinessDate() {
  const input = document.getElementById('biz-date-input');
  const dateValue = input?.value;

  if (!dateValue) {
    showToast('日付を選択してください', 'error');
    input?.focus();
    return;
  }

  const btn = document.getElementById('btn-save-biz-date');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> 設定中…';

  const session = Auth.getSession();
  const updatedBy = session ? session.name : '管理者';

  const payload = {
    key: 'business_date',
    value: dateValue,
    updated_by: updatedBy,
    description: '管理者が設定した営業日（売上入力・集計に反映）',
  };

  try {
    if (bizDateRecordId) {
      await apiFetch(`tables/app_settings/${bizDateRecordId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      const created = await apiFetch('tables/app_settings', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      bizDateRecordId = created.id;
    }

    showToast(`営業日を ${formatDateDisplay(dateValue)} に設定しました`, 'success');
    await loadBusinessDate();

  } catch (err) {
    console.error(err);
    showToast('設定の保存に失敗しました', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> 設定する';
  }
}

async function resetBusinessDate() {
  if (!confirm('営業日の設定を解除して実日付（今日）に戻しますか？')) return;

  const btn = document.getElementById('btn-reset-biz-date');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> 解除中…';

  try {
    if (bizDateRecordId) {
      await apiFetch(`tables/app_settings/${bizDateRecordId}`, {
        method: 'PUT',
        body: JSON.stringify({
          key: 'business_date',
          value: '',
          updated_by: Auth.getSession()?.name || '管理者',
          description: '営業日設定解除（実日付を使用）',
        }),
      });
    }

    // ピッカーを今日に戻す
    const input = document.getElementById('biz-date-input');
    if (input) input.value = today();

    showToast('営業日設定を解除しました（実日付を使用）', 'success');
    await loadBusinessDate();

  } catch (err) {
    console.error(err);
    showToast('解除に失敗しました', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-undo"></i> 設定を解除（実日付に戻す）';
  }
}
