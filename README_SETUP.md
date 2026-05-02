# Venom売上管理システム - セットアップガイド

## 🔴 重要: データベース接続が必要です

このシステムは **バックエンドAPI** を使用してデータを管理します。
現在、従業員データが読み込めないのは **APIサーバーが起動していない** ためです。

## 📋 問題の原因

システムは以下のAPIエンドポイントにアクセスしようとしています：

```javascript
// js/utils.js の apiFetch 関数
async function fetchAllRecords(tableName) {
  const res = await apiFetch(`tables/${tableName}?page=${page}&limit=${limit}`);
  // ...
}
```

必要なAPIエンドポイント：
- `GET /tables/employees` - 従業員データ
- `GET /tables/sales` - 売上データ
- `GET /tables/daily_register` - レジ締めデータ
- `GET /tables/app_settings` - 営業日設定
- `POST /tables/employees` - 従業員追加
- `PUT /tables/employees/{id}` - 従業員更新
- `DELETE /tables/employees/{id}` - 従業員削除

## ✅ 解決方法

### オプション1: バックエンドAPIサーバーを用意する

Node.js + Express または Python + Flask などでAPIサーバーを構築：

```javascript
// 例: Express.js での簡易実装
const express = require('express');
const app = express();

// メモリ内データストア（本番ではデータベース使用）
let employees = [];
let sales = [];
let dailyRegister = [];
let appSettings = [];

app.get('/tables/employees', (req, res) => {
  res.json({ data: employees, total: employees.length });
});

app.post('/tables/employees', (req, res) => {
  const newEmployee = { id: Date.now(), ...req.body };
  employees.push(newEmployee);
  res.json(newEmployee);
});

// 他のエンドポイントも同様に実装...

app.listen(3000);
```

### オプション2: LocalStorageに切り替える（簡易版）

APIなしでブラウザのLocalStorageを使う場合は、`js/utils.js` の書き換えが必要：

```javascript
// APIの代わりにLocalStorageを使う実装例
async function fetchAllRecords(tableName) {
  const data = localStorage.getItem(tableName);
  return data ? JSON.parse(data) : [];
}

async function apiFetch(url, options = {}) {
  const [, , tableName, id] = url.split('/');
  const method = options.method || 'GET';
  
  if (method === 'GET') {
    return {
      data: await fetchAllRecords(tableName),
      total: (await fetchAllRecords(tableName)).length
    };
  }
  
  if (method === 'POST') {
    const all = await fetchAllRecords(tableName);
    const newRecord = { id: Date.now(), ...JSON.parse(options.body) };
    all.push(newRecord);
    localStorage.setItem(tableName, JSON.stringify(all));
    return newRecord;
  }
  
  // PUT, DELETE も同様に実装...
}
```

### オプション3: モックデータで動作確認

開発中の動作確認用に、初期データを直接LocalStorageに入れる：

```javascript
// ブラウザのコンソールで実行
localStorage.setItem('employees', JSON.stringify([
  { id: 1, name: 'スタッフA', pin: '1234', role: 'admin', color: '#dc143c', is_active: true },
  { id: 2, name: 'スタッフB', pin: '5678', role: 'staff', color: '#1a73e8', is_active: true },
  { id: 3, name: 'スタッフC', pin: '9012', role: 'staff', color: '#34a853', is_active: true }
]));

localStorage.setItem('sales', JSON.stringify([]));
localStorage.setItem('daily_register', JSON.stringify([]));
localStorage.setItem('app_settings', JSON.stringify([
  { key: 'business_date', value: new Date().toISOString().split('T')[0] }
]));
```

その後、ページをリロードしてください。

## 🎯 推奨: 本番環境構成

1. **フロントエンド** (このZIPファイル)
   - 静的ファイルとしてホスティング (Netlify, Vercel, GitHub Pages など)

2. **バックエンドAPI**
   - Node.js / Python / PHP などで実装
   - データベース: SQLite / PostgreSQL / MySQL

3. **CORS設定**
   - APIサーバーでCORSヘッダーを適切に設定

## 📞 次のステップ

1. どの方法で実装するか決定
2. APIサーバー構築 または LocalStorage版に書き換え
3. 動作確認してから本番運用

---

**注意**: 現状のままではAPIエンドポイントが存在しないため、すべてのデータ読み込み・保存操作が失敗します。
