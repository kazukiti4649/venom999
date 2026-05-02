/* ===========================
   認証・権限管理モジュール (auth.js)
   全ページで読み込む
   =========================== */

const Auth = (() => {
  const SESSION_KEY = 'regi_session';

  /* ---------- セッション ---------- */

  /** セッションを保存 */
  function setSession(employee) {
    const session = {
      id: employee.id,
      name: employee.name,
      color: employee.color || '#1a73e8',
      role: employee.role || 'staff',
      loginAt: Date.now(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  /** セッションを取得（なければ null） */
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** セッションを破棄してログイン画面へ */
  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    location.href = 'login.html';
  }

  /* ---------- 権限チェック ---------- */

  /** 管理者かどうか */
  function isAdmin() {
    const s = getSession();
    return s && s.role === 'admin';
  }

  /** 現在のユーザーの role を返す */
  function getRole() {
    const s = getSession();
    return s ? s.role : null;
  }

  /* ---------- ページガード ---------- */

  /**
   * ログイン必須ガード
   * 未ログインなら login.html へリダイレクト
   */
  function requireLogin() {
    if (!getSession()) {
      location.replace('login.html');
      return false;
    }
    return true;
  }

  /**
   * 管理者必須ガード
   * 管理者でなければ index.html へリダイレクト＋エラートースト
   */
  function requireAdmin() {
    if (!requireLogin()) return false;
    if (!isAdmin()) {
      // 権限なしフラグをセットしてリダイレクト
      sessionStorage.setItem('auth_error', 'この操作は管理者のみ行えます');
      location.replace('index.html');
      return false;
    }
    return true;
  }

  /**
   * 自分の名前でフィルターして閲覧を許可するガード
   * ログイン必須。管理者はそのまま true、スタッフも true（表示内容はJS側で絞り込む）
   */
  function requireLoginForView() {
    return requireLogin();
  }

  /**
   * 現在ログイン中のスタッフ名を返す（管理者は null）
   * スタッフは自分の名前のみ閲覧可能とするために使用
   */
  function getStaffFilter() {
    const s = getSession();
    if (!s) return null;
    // 管理者はフィルターなし（null = 全件表示）
    if (s.role === 'admin') return null;
    // スタッフは自分の名前のみ
    return s.name;
  }

  /* ---------- UI ヘルパー ---------- */

  /**
   * ヘッダーにログインユーザー情報とログアウトボタンを挿入
   * header-inner の中に追加する
   */
  function renderUserBadge() {
    const session = getSession();
    if (!session) return;

    const inner = document.querySelector('.header-inner');
    if (!inner) return;

    // 既存があれば再描画しない
    if (inner.querySelector('.header-user-badge')) return;

    const isAdminUser = session.role === 'admin';
    const initial = session.name.charAt(0);
    const color = session.color;

    const badge = document.createElement('div');
    badge.className = 'header-user-badge';
    badge.innerHTML = `
      <div class="header-user-avatar" style="background:${color};" title="${session.name}">${initial}</div>
      <div class="header-user-info">
        <span class="header-user-name">${session.name}</span>
        ${isAdminUser
          ? '<span class="role-badge admin"><i class="fas fa-shield-alt"></i> 管理者</span>'
          : '<span class="role-badge staff"><i class="fas fa-user"></i> スタッフ</span>'}
      </div>
      <button class="btn-logout" onclick="Auth.logout()" title="ログアウト">
        <i class="fas fa-sign-out-alt"></i>
      </button>`;

    inner.appendChild(badge);
  }

  /**
   * 管理者専用要素を表示/非表示に切り替える
   * data-admin-only 属性を持つ要素を管理者以外には隠す
   * data-staff-only 属性を持つ要素は管理者には隠す
   */
  function applyPermissions() {
    const admin = isAdmin();

    document.querySelectorAll('[data-admin-only]').forEach(el => {
      el.style.display = admin ? '' : 'none';
    });
    document.querySelectorAll('[data-staff-only]').forEach(el => {
      el.style.display = admin ? 'none' : '';
    });
  }

  /**
   * auth_error フラグがあれば Toast で表示してクリア
   */
  function showAuthError() {
    const msg = sessionStorage.getItem('auth_error');
    if (msg) {
      sessionStorage.removeItem('auth_error');
      setTimeout(() => showToast(msg, 'error', 3000), 400);
    }
  }

  /* ---------- ログイン処理 ---------- */

  /**
   * PIN認証を実行
   * @param {object} employee - employees テーブルのレコード
   * @param {string} inputPin - ユーザーが入力した4桁PIN
   * @returns {{ ok: boolean, session?: object }}
   */
  function login(employee, inputPin) {
    if (!employee.pin || employee.pin.toString() !== inputPin.toString()) {
      return { ok: false };
    }
    const session = setSession(employee);
    return { ok: true, session };
  }

  /* ---------- 公開API ---------- */
  return {
    getSession,
    setSession,
    logout,
    isAdmin,
    getRole,
    requireLogin,
    requireAdmin,
    requireLoginForView,
    getStaffFilter,
    renderUserBadge,
    applyPermissions,
    showAuthError,
    login,
  };
})();


/* ===========================
   ログインページ専用ロジック
   =========================== */

let loginEmployees = [];      // 全従業員キャッシュ
let selectedEmployee = null;  // 選択中の従業員
let pinInput = '';            // 入力中のPIN

async function initLoginPage() {
  try {
    const all = await fetchAllRecords('employees');
    loginEmployees = all
      .filter(e => e.is_active !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    renderStaffSelectList();
  } catch (err) {
    console.error(err);
    document.getElementById('staff-select-list').innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>従業員データを読み込めませんでした</p></div>`;
  }

  initKeypad();
  document.getElementById('btn-back')?.addEventListener('click', backToSelect);
}

/** 担当者選択リストを描画 */
function renderStaffSelectList() {
  const container = document.getElementById('staff-select-list');
  if (!container) return;

  if (loginEmployees.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <p>従業員が登録されていません</p>
      </div>`;
    return;
  }

  container.innerHTML = loginEmployees.map(emp => {
    const color = emp.color || '#1a73e8';
    const initial = emp.name.charAt(0);
    const isAdmin = emp.role === 'admin';
    return `
      <button class="staff-select-btn" onclick="selectStaffForLogin('${emp.id}')"
        style="--staff-color:${color};">
        <div class="staff-select-avatar" style="background:${color};">${initial}</div>
        <div class="staff-select-info">
          <span class="staff-select-name">${emp.name}</span>
          ${isAdmin
            ? '<span class="role-badge admin"><i class="fas fa-shield-alt"></i> 管理者</span>'
            : '<span class="role-badge staff"><i class="fas fa-user"></i> スタッフ</span>'}
        </div>
        <i class="fas fa-chevron-right staff-select-arrow"></i>
      </button>`;
  }).join('');
}

/** 担当者を選択してPIN入力ステップへ */
function selectStaffForLogin(id) {
  selectedEmployee = loginEmployees.find(e => e.id === id);
  if (!selectedEmployee) return;

  pinInput = '';
  updatePinDots();
  clearPinError();

  // ユーザー表示を更新
  const color = selectedEmployee.color || '#1a73e8';
  const initial = selectedEmployee.name.charAt(0);
  const isAdminUser = selectedEmployee.role === 'admin';

  document.getElementById('pin-avatar').textContent = initial;
  document.getElementById('pin-avatar').style.background = color;
  document.getElementById('pin-name').textContent = selectedEmployee.name;
  document.getElementById('pin-role').innerHTML = isAdminUser
    ? '<span class="role-badge admin"><i class="fas fa-shield-alt"></i> 管理者</span>'
    : '<span class="role-badge staff"><i class="fas fa-user"></i> スタッフ</span>';

  // ステップ切替
  document.getElementById('step-select').style.display = 'none';
  document.getElementById('step-pin').style.display = '';
}

/** 担当者選択へ戻る */
function backToSelect() {
  pinInput = '';
  selectedEmployee = null;
  updatePinDots();
  clearPinError();
  document.getElementById('step-pin').style.display = 'none';
  document.getElementById('step-select').style.display = '';
}

/** テンキー初期化 */
function initKeypad() {
  document.querySelectorAll('.key-btn[data-num]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (pinInput.length >= 4) return;
      pinInput += btn.dataset.num;
      updatePinDots();
      if (pinInput.length === 4) {
        setTimeout(attemptLogin, 160); // アニメーション後に認証
      }
    });
  });

  document.getElementById('key-del')?.addEventListener('click', () => {
    pinInput = pinInput.slice(0, -1);
    updatePinDots();
    clearPinError();
  });

  document.getElementById('key-clear')?.addEventListener('click', () => {
    pinInput = '';
    updatePinDots();
    clearPinError();
  });
}

/** PINドットの表示を更新 */
function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (!dot) continue;
    dot.classList.toggle('filled', i < pinInput.length);
    dot.classList.toggle('current', i === pinInput.length && pinInput.length < 4);
  }
}

function clearPinError() {
  const el = document.getElementById('pin-error');
  if (el) { el.textContent = ''; el.classList.remove('show'); }
}

function showPinError(msg) {
  const el = document.getElementById('pin-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');

  // PIN ドットをシェイク
  const dots = document.getElementById('pin-dots');
  dots.classList.remove('shake');
  void dots.offsetWidth; // reflow
  dots.classList.add('shake');

  // リセット
  setTimeout(() => {
    pinInput = '';
    updatePinDots();
  }, 600);
}

/** ログイン試行 */
async function attemptLogin() {
  if (!selectedEmployee) return;

  const result = Auth.login(selectedEmployee, pinInput);

  if (result.ok) {
    // 成功: ログイン先へ
    const dest = sessionStorage.getItem('auth_redirect') || 'index.html';
    sessionStorage.removeItem('auth_redirect');
    location.replace(dest);
  } else {
    showPinError('PINコードが違います');
  }
}
